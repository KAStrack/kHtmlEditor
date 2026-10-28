import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';
import { isString, isFunction, isArray } from '../../util/Type';

/**
 * Import CSS plugin: turns class selectors from the content stylesheets into entries of the
 * Formats menu (`importcss_*` options).
 */
interface Group {
  title: string;
  filter?: string | RegExp | ((selector: string) => boolean);
  selectors?: Record<string, boolean>;
  items?: any[];
}

const compileFilter = (filter: unknown): ((value: string) => boolean) => {
  if (isString(filter)) {
    return (value) => value.indexOf(filter) !== -1;
  }
  if (filter instanceof RegExp) {
    return (value) => filter.test(value);
  }
  if (isFunction(filter)) {
    return filter as (value: string) => boolean;
  }
  return () => true;
};

const defaultConvertSelectorToFormat = (editor: Editor, selectorText: string): Record<string, any> | null => {
  const selector = /^(?:([a-z0-9\-_]+))?(\.[a-z0-9_\-.]+)$/i.exec(selectorText);
  if (!selector) {
    return null;
  }
  const elementName = selector[1];
  const classes = selector[2].slice(1).split('.').join(' ');
  const inlineSelectorElements: Record<string, boolean> = { a: true, abbr: true, b: true, bdo: true, br: true, cite: true, code: true, del: true, dfn: true, em: true, i: true, ins: true, kbd: true, label: true, q: true, s: true, samp: true, small: true, span: true, strike: true, strong: true, sub: true, sup: true, u: true, var: true };
  const exclusive = editor.options.get('importcss_exclusive') !== false;
  let format: Record<string, any>;
  if (elementName && elementName !== '*') {
    if (editor.schema.getTextBlockElements()[elementName]) {
      format = { block: elementName };
    } else if (editor.schema.getBlockElements()[elementName] || inlineSelectorElements[elementName.toLowerCase()]) {
      format = { selector: elementName };
    } else {
      format = { inline: 'span' };
    }
  } else {
    format = { inline: 'span' };
  }
  if (exclusive) {
    format.classes = classes;
  } else {
    format.classes = classes;
    if (!format.selector && elementName) {
      format.selector = elementName;
    }
  }
  if (elementName && elementName !== '*' && exclusive) {
    format.selector = format.block ? undefined : elementName;
    if (format.block) {
      format.exact = false;
    }
  }
  return { title: selectorText, ...format };
};

const collectSelectors = (editor: Editor): string[] => {
  const doc = editor.getDoc();
  const fileFilter = compileFilter(editor.options.get('importcss_file_filter'));
  const selectorFilter = compileFilter(editor.options.get('importcss_selector_filter'));
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (sheet: CSSStyleSheet | null, depth: number) => {
    if (!sheet || depth > 5) {
      return;
    }
    const href = sheet.href || '';
    if (href && !fileFilter(href)) {
      return;
    }
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      return; // cross-origin
    }
    Array.from(rules).forEach((rule) => {
      if ((rule as CSSImportRule).styleSheet) {
        visit((rule as CSSImportRule).styleSheet, depth + 1);
      } else if ((rule as CSSGroupingRule).cssRules && !(rule as CSSStyleRule).selectorText) {
        Array.from((rule as CSSGroupingRule).cssRules).forEach((r) => {
          const sel = (r as CSSStyleRule).selectorText;
          if (sel) {
            sel.split(',').forEach((s) => push(s.trim()));
          }
        });
      } else if ((rule as CSSStyleRule).selectorText) {
        (rule as CSSStyleRule).selectorText.split(',').forEach((s) => push(s.trim()));
      }
    });
  };
  const push = (selector: string) => {
    if (!selector || seen.has(selector) || /^\.(mce-|khe-|tox-)/.test(selector) || !/^(?:[a-z0-9\-_]+)?\.[a-z0-9_\-.]+$/i.test(selector) || !selectorFilter(selector)) {
      return;
    }
    seen.add(selector);
    out.push(selector);
  };
  Array.from(doc.styleSheets).forEach((s) => visit(s as CSSStyleSheet, 0));
  return out;
};

const register = (editor: Editor): Record<string, any> => {
  const r = editor.options.register;
  r('importcss_merge_classes', { processor: 'boolean', default: true });
  r('importcss_exclusive', { processor: 'boolean', default: true });
  r('importcss_selector_converter', { processor: 'function' });
  r('importcss_selector_filter', { processor: (v: unknown) => ({ valid: true, value: v }) });
  r('importcss_file_filter', { processor: (v: unknown) => ({ valid: true, value: v }) });
  r('importcss_groups', { processor: 'object[]' });
  r('importcss_append', { processor: 'boolean', default: false });

  const build = (): void => {
    const converter = (editor.options.get('importcss_selector_converter') as ((selector: string, group?: Group) => any) | undefined) ?? ((selector: string) => defaultConvertSelectorToFormat(editor, selector));
    const groupsOpt = editor.options.get('importcss_groups') as Group[] | undefined;
    const groups: Group[] | null = isArray(groupsOpt) && groupsOpt.length ? groupsOpt.map((g) => ({ ...g, items: [], selectors: {} })) : null;
    const selectors = collectSelectors(editor);
    const formats: any[] = [];
    const register = (selector: string, group?: Group) => {
      const format = converter.call(editor, selector, group);
      if (!format) {
        return null;
      }
      const name = 'importcss_' + selector.replace(/[^a-z0-9]/gi, '_');
      const { title, ...rest } = format;
      editor.formatter.register(name, rest as any);
      return { title: title || selector, format: name };
    };
    selectors.forEach((selector) => {
      if (groups) {
        groups.forEach((group) => {
          if (compileFilter(group.filter)(selector) && !group.selectors![selector]) {
            group.selectors![selector] = true;
            const item = register(selector, group);
            if (item) {
              group.items!.push(item);
            }
          }
        });
      } else {
        const item = register(selector);
        if (item) {
          formats.push(item);
        }
      }
    });
    const result = groups ? groups.filter((g) => g.items!.length).map((g) => ({ title: g.title, items: g.items })) : formats;
    if (!result.length) {
      return;
    }
    const existing = (editor.options.get('style_formats') as any[] | undefined) || [];
    const append = editor.options.get('importcss_append') as boolean;
    editor.options.set('style_formats', append && existing.length ? [...existing, ...result] : result);
    editor.dispatch('StyleFormatsChanged');
  };

  editor.on('init', build);
  return { convertSelectorToFormat: (selector: string) => defaultConvertSelectorToFormat(editor, selector), rebuild: build };
};

PluginManager.add('importcss', register);
export default register;
