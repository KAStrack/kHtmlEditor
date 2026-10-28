import type { Editor } from '../core/Editor';
import type { DOMUtils } from '../dom/DOMUtils';
import type { Format, FormatVars } from './Formatter';
import * as NodeType from '../dom/NodeType';
import * as FormatUtils from './FormatUtils';
import { isFunction, isNullable, isArray } from '../util/Type';

/** Format matching (port of TinyMCE's MatchFormat). */

const isEq = FormatUtils.isEq;

const matchesUnInheritedFormatSelector = (ed: Editor, node: Node, name: string): boolean => {
  const formatList = ed.formatter.get(name) as Format[] | undefined;
  if (formatList) {
    for (const format of formatList) {
      if (FormatUtils.isSelectorFormat(format) && format.inherit === false && NodeType.isElement(node) && ed.dom.is(node, format.selector)) {
        return true;
      }
    }
  }
  return false;
};

const matchParents = (editor: Editor, node: Node, name: string, vars?: FormatVars, similar?: boolean): boolean => {
  const root = editor.dom.getRoot();
  if (node === root) {
    return false;
  }
  const matchedNode = editor.dom.getParent(node, (elm) => {
    if (matchesUnInheritedFormatSelector(editor, elm, name)) {
      return true;
    }
    return elm.parentNode === root || !!matchNode(editor, elm, name, vars, true);
  });
  return !!matchNode(editor, matchedNode, name, vars, similar);
};

export const matchName = (dom: DOMUtils, node: Node, format: Format): boolean => {
  if (FormatUtils.isInlineFormat(format) && isEq(node, format.inline)) {
    return true;
  }
  if (FormatUtils.isBlockFormat(format) && isEq(node, format.block)) {
    return true;
  }
  if (FormatUtils.isSelectorFormat(format)) {
    return NodeType.isElement(node) && dom.is(node, format.selector);
  }
  return false;
};

const matchItems = (dom: DOMUtils, node: Element, format: Format, itemName: 'attributes' | 'styles', similar?: boolean, vars?: FormatVars): boolean => {
  const items = format[itemName] as Record<string, any> | string[] | undefined;
  const matchAttributes = itemName === 'attributes';
  if (isFunction(format.onmatch)) {
    return format.onmatch(node, format, itemName);
  }
  if (items) {
    if (!isArray(items)) {
      for (const key of Object.keys(items)) {
        const value = matchAttributes ? dom.getAttrib(node, key) : FormatUtils.getStyle(dom, node, key);
        const expectedValue = FormatUtils.replaceVars(items[key], vars);
        const isEmptyValue = isNullable(value) || value === '';
        if (isEmptyValue && isNullable(expectedValue)) {
          continue;
        }
        if (similar && isEmptyValue && !format.exact) {
          return false;
        }
        if ((!similar || format.exact) && !isEq(value, FormatUtils.normalizeStyleValue(expectedValue, key))) {
          return false;
        }
      }
    } else {
      for (const item of items as string[]) {
        if (matchAttributes ? dom.getAttrib(node, item) : FormatUtils.getStyle(dom, node, item)) {
          return true;
        }
      }
    }
  }
  return true;
};

export const matchNode = (ed: Editor, node: Node | null | undefined, name: string, vars?: FormatVars, similar?: boolean): Format | undefined => {
  const formatList = ed.formatter.get(name) as Format[] | undefined;
  const dom = ed.dom;
  if (formatList && NodeType.isElement(node)) {
    for (const format of formatList) {
      if (matchName(dom, node, format) && matchItems(dom, node, format, 'attributes', similar, vars) && matchItems(dom, node, format, 'styles', similar, vars)) {
        const classes = format.classes;
        if (classes) {
          const list = isArray(classes) ? classes : [classes];
          for (const cls of list) {
            if (!dom.hasClass(node, FormatUtils.replaceVars(cls, vars) as string)) {
              return undefined;
            }
          }
        }
        return format;
      }
    }
  }
  return undefined;
};

export const match = (editor: Editor, name: string, vars?: FormatVars, node?: Node, similar?: boolean): boolean => {
  if (node) {
    return matchParents(editor, node, name, vars, similar);
  }
  node = editor.selection.getNode();
  if (matchParents(editor, node, name, vars, similar)) {
    return true;
  }
  const startNode = editor.selection.getStart();
  if (startNode !== node) {
    if (matchParents(editor, startNode, name, vars, similar)) {
      return true;
    }
  }
  return false;
};

export const matchAll = (editor: Editor, names: string[], vars?: FormatVars): string[] => {
  const matchedFormatNames: string[] = [];
  const checkedMap: Record<string, boolean> = {};
  const startElement = editor.selection.getStart();
  editor.dom.getParent(
    startElement,
    (node) => {
      for (const name of names) {
        if (!checkedMap[name] && matchNode(editor, node, name, vars)) {
          checkedMap[name] = true;
          matchedFormatNames.push(name);
        }
      }
      return false;
    },
    editor.dom.getRoot(),
  );
  return matchedFormatNames;
};

export const closest = (editor: Editor, names: string[]): string | null => {
  const body = editor.getBody();
  let node: Node | null = editor.selection.getStart(true);
  while (node && node !== body) {
    for (const name of names) {
      if (matchNode(editor, node, name, {}, false)) {
        return name;
      }
    }
    node = node.parentNode;
  }
  return null;
};

export const canApply = (editor: Editor, name: string): boolean => {
  const formatList = editor.formatter.get(name) as Format[] | undefined;
  const dom = editor.dom;
  if (formatList && editor.selection.isEditable()) {
    const startNode = editor.selection.getStart();
    const parents = FormatUtils.getParents(dom, startNode);
    for (let x = formatList.length - 1; x >= 0; x--) {
      const format = formatList[x];
      if (!FormatUtils.isSelectorFormat(format)) {
        return true;
      }
      for (let i = parents.length - 1; i >= 0; i--) {
        if (dom.is(parents[i], format.selector)) {
          return true;
        }
      }
    }
  }
  return false;
};

export const matchAllOnNode = (editor: Editor, node: Node, formatNames: string[]): string[] => formatNames.filter((name) => !!matchNode(editor, node, name));
