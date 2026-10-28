import type { Editor } from '../core/Editor';
import * as NodeType from '../dom/NodeType';
import { isString, isObject } from '../util/Type';

/** Formatting commands (Bold, FormatBlock, FontName, Justify*, Indent, link…) built on the formatter. */

const alignStates = ['alignleft', 'aligncenter', 'alignright', 'alignjustify'];

const toggleFormat = (editor: Editor, name: string, value?: any) => {
  editor.formatter.toggle(name, value ? { value } : undefined);
  editor.nodeChanged();
};

const toggleAlign = (editor: Editor, align: string) => {
  const name = 'align' + align.toLowerCase();
  alignStates.forEach((n) => {
    if (n !== name && editor.formatter.match(n)) {
      editor.formatter.remove(n);
    }
  });
  if (name !== 'alignnone') {
    editor.formatter.toggle(name);
  }
  editor.nodeChanged();
};

const normalizeFontName = (value: string): string => value.replace(/[\'\"]/g, '').replace(/,\s+/g, ',');

const fontNameAction = (editor: Editor, value: string) => {
  const font = value.replace(/^'|'$/g, '');
  if (!font || font === 'default') {
    editor.formatter.remove('fontname', { value: null }, undefined, true);
  } else {
    editor.formatter.apply('fontname', { value: font });
  }
  editor.nodeChanged();
};

const fontSizeAction = (editor: Editor, value: string) => {
  if (!value || value === 'default') {
    editor.formatter.remove('fontsize', { value: null }, undefined, true);
  } else {
    editor.formatter.apply('fontsize', { value });
  }
  editor.nodeChanged();
};

const lineHeightAction = (editor: Editor, value: string) => {
  if (!value || value === 'default') {
    editor.formatter.remove('lineheight', { value: null }, undefined, true);
  } else {
    editor.formatter.apply('lineheight', { value });
  }
  editor.nodeChanged();
};

const parseIndent = (value: string | undefined | null): number => (value ? parseInt(value, 10) || 0 : 0);

const getIndentStyleName = (editor: Editor, useMargin: boolean, element: HTMLElement): string => {
  const indentStyleName = useMargin || NodeType.isTableCell(element) ? 'margin' : 'padding';
  const suffix = editor.dom.getStyle(element, 'direction', true) === 'rtl' ? '-right' : '-left';
  return indentStyleName + suffix;
};

const isListComponent = (el: Element): boolean => NodeType.isList(el) || NodeType.isListItem(el);
const parentIsListComponent = (editor: Editor, el: Element): boolean => !!editor.dom.getParent(el, (n) => NodeType.isElement(n) && isListComponent(n), editor.getBody());

const getBlocksToIndent = (editor: Editor): HTMLElement[] =>
  editor.selection.getSelectedBlocks().filter((el) => !isListComponent(el) && !parentIsListComponent(editor, el) && editor.dom.isEditable(el)) as HTMLElement[];

const handleIndent = (editor: Editor, command: 'indent' | 'outdent') => {
  const dom = editor.dom;
  const indentation = editor.options.get('indentation') as string;
  const indentUnit = /[a-z%]+$/i.exec(indentation)?.[0] ?? 'px';
  const indentValue = parseInt(indentation, 10) || 40;
  const useMargin = editor.options.get('indent_use_margin') as boolean;
  if (editor.queryCommandState('InsertUnorderedList') || editor.queryCommandState('InsertOrderedList')) {
    return;
  }
  const blocks = getBlocksToIndent(editor);
  blocks.forEach((block) => {
    const styleName = getIndentStyleName(editor, useMargin, block);
    const current = parseIndent(dom.getStyle(block, styleName));
    if (command === 'outdent') {
      const value = Math.max(0, current - indentValue);
      dom.setStyle(block, styleName, value ? value + indentUnit : '');
    } else {
      dom.setStyle(block, styleName, current + indentValue + indentUnit);
    }
    if (!block.getAttribute('style')) {
      block.removeAttribute('style');
      block.removeAttribute('data-mce-style');
    }
  });
  editor.nodeChanged();
};

const canOutdent = (editor: Editor): boolean => {
  const useMargin = editor.options.get('indent_use_margin') as boolean;
  return getBlocksToIndent(editor).some((block) => parseIndent(editor.dom.getStyle(block, getIndentStyleName(editor, useMargin, block))) > 0);
};

export const registerFormatCommands = (editor: Editor): void => {
  const commands = editor.editorCommands;
  const dom = editor.dom;
  const selection = editor.selection;

  commands.addCommands({
    'Bold,Italic,Underline,Strikethrough,Superscript,Subscript': (command: string) => {
      toggleFormat(editor, command.toLowerCase());
    },
    'ForeColor,HiliteColor': (command: string, _ui, value) => {
      const name = command.toLowerCase() === 'forecolor' ? 'forecolor' : 'hilitecolor';
      if (!value || value === 'default') {
        editor.formatter.remove(name, { value: null }, undefined, true);
      } else {
        editor.formatter.apply(name, { value });
      }
      editor.nodeChanged();
    },
    FontName: (_cmd, _ui, value) => fontNameAction(editor, value),
    FontSize: (_cmd, _ui, value) => fontSizeAction(editor, value),
    LineHeight: (_cmd, _ui, value) => lineHeightAction(editor, value),
    Lang: (_cmd, _ui, lang) => {
      if (!lang || lang === 'default' || (isObject(lang) && !lang.code)) {
        editor.formatter.remove('lang', { value: null }, undefined, true);
      } else {
        const code = isString(lang) ? lang : lang.code;
        const customValue = isString(lang) ? null : (lang.customCode ?? null);
        editor.formatter.toggle('lang', { value: code, customValue });
      }
      editor.nodeChanged();
    },
    RemoveFormat: (command: string) => {
      editor.formatter.remove(command.toLowerCase());
      editor.nodeChanged();
    },
    mceBlockQuote: () => {
      toggleFormat(editor, 'blockquote');
    },
    FormatBlock: (_cmd, _ui, value) => {
      toggleFormat(editor, value || 'p');
    },
    mceToggleFormat: (_cmd, _ui, value) => {
      toggleFormat(editor, value);
    },
    mceApplyTextcolor: (_cmd, _ui, value) => {
      // value is "format" with the colour in args? TinyMCE passes (format, value) through two commands.
      const [format, color] = isObject(value) ? [value.format, value.value] : [value, undefined];
      editor.formatter.apply(format, { value: color });
      editor.nodeChanged();
    },
    mceRemoveTextcolor: (_cmd, _ui, value) => {
      editor.formatter.remove(value, { value: null }, undefined, true);
      editor.nodeChanged();
    },
    'JustifyLeft,JustifyCenter,JustifyRight,JustifyFull,JustifyNone': (command: string) => {
      toggleAlign(editor, command.substring(7));
    },
    'Indent,Outdent': (command: string) => {
      handleIndent(editor, command.toLowerCase() as 'indent' | 'outdent');
    },
    InsertHorizontalRule: () => {
      editor.execCommand('mceInsertContent', false, '<hr>');
    },
    mceInsertLink: (_cmd, _ui, value) => {
      let attrs = isString(value) ? { href: value } : { ...(value as Record<string, string>) };
      const anchor = dom.getParent(selection.getNode(), 'a');
      if (attrs.href) {
        attrs.href = attrs.href.replace(/ /g, '%20');
      }
      if (!anchor || !attrs.href) {
        editor.formatter.remove('link');
      }
      if (attrs.href) {
        editor.formatter.apply('link', attrs, anchor ?? undefined);
      }
      attrs = {} as any;
    },
    unlink: () => {
      if (selection.isCollapsed()) {
        const elm = dom.getParent(selection.getStart(), 'a');
        if (elm) {
          dom.remove(elm, true);
        }
        return;
      }
      editor.formatter.remove('link');
    },
  });

  const isFormatMatch = (name: string) => editor.formatter.match(name);

  commands.addCommands(
    {
      'JustifyLeft,JustifyCenter,JustifyRight,JustifyFull': (command: string) => {
        const name = 'align' + command.substring(7).toLowerCase();
        if (name === 'alignfull') {
          return isFormatMatch('alignjustify');
        }
        const selected = selection.isCollapsed() ? [selection.getNode()] : selection.getSelectedBlocks();
        return selected.some((n) => !!editor.formatter.matchNode(n, name)) || isFormatMatch(name);
      },
      'Bold,Italic,Underline,Strikethrough,Superscript,Subscript': (command: string) => isFormatMatch(command.toLowerCase()),
      mceBlockQuote: () => isFormatMatch('blockquote'),
      Outdent: () => canOutdent(editor),
    },
    'state',
  );

  const getFontProp = (propName: string, cssName: string): string => {
    const node = selection.getStart();
    const body = editor.getBody();
    let elm: Node | null = node;
    while (elm && elm !== body.parentNode) {
      if (NodeType.isElement(elm)) {
        const inline = dom.getStyle(elm, cssName);
        if (inline) {
          return inline;
        }
      }
      elm = elm.parentNode;
    }
    const el = NodeType.isElement(node) ? node : body;
    return editor.getWin().getComputedStyle(el).getPropertyValue(propName) || '';
  };

  commands.addCommands(
    {
      FontName: () => normalizeFontName(getFontProp('font-family', 'font-family')),
      FontSize: () => getFontProp('font-size', 'font-size'),
      LineHeight: () => getFontProp('line-height', 'line-height'),
      FormatBlock: () => {
        const block = dom.getParent(selection.getStart(), (n) => NodeType.isElement(n) && dom.isBlock(n) && !/^(TD|TH|LI|UL|OL|TABLE|TBODY|TR)$/.test(n.nodeName), editor.getBody());
        return block ? block.nodeName.toLowerCase() : '';
      },
      Lang: () => {
        const elm = dom.getParent(selection.getStart(), (n) => NodeType.isElement(n) && !!n.getAttribute('lang'), editor.getBody()) as HTMLElement | null;
        return elm ? elm.getAttribute('lang') || '' : '';
      },
    },
    'value',
  );

  // Default shortcuts.
  editor.addShortcut('meta+b', 'Bold', 'Bold');
  editor.addShortcut('meta+i', 'Italic', 'Italic');
  editor.addShortcut('meta+u', 'Underline', 'Underline');
  for (let i = 1; i <= 6; i++) {
    editor.addShortcut('access+' + i, '', ['FormatBlock', false, 'h' + i] as any);
  }
  editor.addShortcut('access+7', '', ['FormatBlock', false, 'p'] as any);
  editor.addShortcut('access+8', '', ['FormatBlock', false, 'div'] as any);
  editor.addShortcut('access+9', '', ['FormatBlock', false, 'address'] as any);
};
