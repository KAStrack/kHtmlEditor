import type { Editor } from '../core/Editor';
import type { DOMUtils } from '../dom/DOMUtils';
import type { Format, FormatVars, RangeLikeObject } from './Formatter';
import * as NodeType from '../dom/NodeType';
import { isString, isNullable, isNonNullable, isFunction } from '../util/Type';

export type InlineFormat = Format & { inline: string };
export type BlockFormat = Format & { block: string };
export type SelectorFormat = Format & { selector: string };

export const isInlineFormat = (format: Format): format is InlineFormat => isString(format.inline);
export const isBlockFormat = (format: Format): format is BlockFormat => isString(format.block);
export const isSelectorFormat = (format: Format): format is SelectorFormat => isString(format.selector);
export const isMixedFormat = (format: Format): boolean => isSelectorFormat(format) && isInlineFormat(format) && format.mixed !== false;
export const shouldExpandToSelector = (format: Format): boolean => isSelectorFormat(format) && format.expand !== false && !isInlineFormat(format);

export const isNode = (node: unknown): node is Node => !!node && typeof (node as Node).nodeType === 'number';
export const isElementNode = (node: Node | null | undefined): node is HTMLElement => NodeType.isElement(node) && !NodeType.isBookmarkNode(node) && !isCaretNode(node) && !NodeType.isBogusAll(node);
export const isCaretNode = (node: Node | null | undefined): boolean => NodeType.isElement(node) && node.id === '_mce_caret';

export const isWhiteSpaceNode = (node: Node | null | undefined, allowSpaces: boolean = false): boolean => {
  if (isNonNullable(node) && NodeType.isText(node)) {
    const data = allowSpaces ? node.data.replace(/ /g, ' ') : node.data;
    return NodeType.isWhitespaceText(data);
  }
  return false;
};

export const isEmptyTextNode = (node: Node | null | undefined): boolean => isNonNullable(node) && NodeType.isText(node) && node.length === 0;

export const isTextBlock = (schema: { getTextBlockElements: () => Record<string, {}> }, node: Node | null | undefined): node is HTMLElement => NodeType.isElement(node) && !!schema.getTextBlockElements()[node.nodeName.toLowerCase()];

export const isValid = (editor: Editor, parent: string, child: string): boolean => editor.schema.isValidChild(parent, child);

/** Case-insensitive name equality for nodes/strings. */
export const isEq = (str1: Node | string | null | undefined, str2: Node | string | null | undefined): boolean => {
  const a = str1 ? (isString(str1) ? str1 : str1.nodeName) : '';
  const b = str2 ? (isString(str2) ? str2 : str2.nodeName) : '';
  return a.toLowerCase() === b.toLowerCase();
};

const hexColorRegExp = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const toHex2 = (n: number): string => n.toString(16).padStart(2, '0');

/** Normalises rgb()/rgba() colours to hex so comparisons between DOM and format values work. */
export const rgbaToHexString = (color: string): string => {
  const m = /^\s*rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)\s*$/i.exec(color);
  if (m) {
    const alpha = m[4] === undefined ? 1 : parseFloat(m[4]);
    if (alpha === 1) {
      return '#' + toHex2(+m[1]) + toHex2(+m[2]) + toHex2(+m[3]);
    }
    return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
  }
  if (hexColorRegExp.test(color.trim())) {
    const h = color.trim().toLowerCase();
    if (h.length === 4) {
      return '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    }
    return h;
  }
  return color;
};

export const normalizeStyleValue = (value: unknown, name: string): string | null => {
  if (isNullable(value)) {
    return null;
  }
  let strValue = String(value);
  if (name === 'color' || name === 'backgroundColor' || name === 'background-color') {
    strValue = rgbaToHexString(strValue);
  }
  if ((name === 'fontWeight' || name === 'font-weight') && strValue === '700') {
    strValue = 'bold';
  }
  if (name === 'fontFamily' || name === 'font-family') {
    strValue = strValue.replace(/['"]/g, '').replace(/,\s+/g, ',');
  }
  return strValue;
};

export const getStyle = (dom: DOMUtils, node: Element, name: string): string | null => {
  const style = dom.getStyle(node, name);
  return normalizeStyleValue(style, name);
};

export const getTextDecoration = (dom: DOMUtils, node: Node | null): string | undefined => {
  let decoration: string | undefined;
  dom.getParent(node, (n) => {
    if (NodeType.isElement(n)) {
      decoration = dom.getStyle(n, 'text-decoration');
      return !!decoration && decoration !== 'none';
    }
    return false;
  });
  return decoration;
};

export const getParents = (dom: DOMUtils, node: Node | null, selector?: string): Element[] => dom.getParents(node, selector, dom.getRoot()) as Element[];

export const isVariableFormatName = (editor: Editor, formatName: string): boolean => {
  const hasVariableValues = (format: Format) => {
    const isVariableValue = (val: unknown): boolean => isString(val) && val.length > 1 && val.indexOf('%') === 0;
    const check = (items: Record<string, any> | undefined) => !!items && Object.keys(items).some((k) => isVariableValue(items[k]) || isFunction(items[k]));
    return check(format.styles) || check(format.attributes) || (Array.isArray(format.classes) ? format.classes.some(isVariableValue) : isVariableValue(format.classes));
  };
  const list = editor.formatter.get(formatName) as Format[] | undefined;
  return !!list && list.some(hasVariableValues);
};

/** Replaces `%value`-style variables in a format value. */
export const replaceVars = (value: string | ((vars?: FormatVars) => string | null) | undefined | null, vars?: FormatVars | null): string | null => {
  if (isFunction(value)) {
    return value(vars ?? undefined);
  }
  if (isNullable(value)) {
    return null;
  }
  let result = String(value);
  if (vars) {
    result = result.replace(/%(\w+)/g, (_str, name: string) => {
      const v = vars[name];
      return v === null || v === undefined ? '' : String(v);
    });
  }
  return result;
};

/** Compares two formats on their defining properties. */
export const areSimilarFormats = (editor: Editor, formatName: string, otherFormatName: string): boolean => {
  const validKeys = ['inline', 'block', 'selector', 'attributes', 'styles', 'classes'];
  const filterObj = (format: Format): Record<string, any> => {
    const out: Record<string, any> = {};
    for (const k of Object.keys(format)) {
      if (validKeys.includes(k)) {
        out[k] = format[k];
      }
    }
    return out;
  };
  const a = (editor.formatter.get(formatName) as Format[] | undefined) ?? [];
  const b = (editor.formatter.get(otherFormatName) as Format[] | undefined) ?? [];
  return a.some((fa) => b.some((fb) => JSON.stringify(filterObj(fa)) === JSON.stringify(filterObj(fb))));
};

export const isFormatPartOfElement = (editor: Editor, node: Element, name: string): boolean => !!node && editor.formatter.matchNode(node, name) !== undefined;

export const getNonWhiteSpaceSibling = (node: Node | null | undefined, next?: boolean, inc?: boolean): Node | undefined => {
  if (node) {
    const nextName = next ? 'nextSibling' : 'previousSibling';
    for (let n: Node | null = inc ? node : node[nextName]; n; n = n[nextName]) {
      if (NodeType.isElement(n) || !isWhiteSpaceNode(n)) {
        return n;
      }
    }
  }
  return undefined;
};

export const isRangeLike = (obj: unknown): obj is RangeLikeObject => !!obj && typeof obj === 'object' && 'startContainer' in (obj as any) && 'endContainer' in (obj as any);

/** Moves a collapsed start into the following text node when it sits at the end of a formatted node. */
export const moveStart = (dom: DOMUtils, selection: Editor['selection'], rng: Range): void => {
  const offset = rng.startOffset;
  let container: Node = rng.startContainer;
  if (rng.startContainer === rng.endContainer) {
    if (NodeType.isElement(container) && container.childNodes[offset] && NodeType.isText(container.childNodes[offset]) && !container.childNodes[offset].data.length) {
      return;
    }
    if (offset > 0 && offset < rng.endOffset) {
      return;
    }
  }
  if (NodeType.isElement(container)) {
    const nodes = container.childNodes;
    if (offset < nodes.length) {
      container = nodes[offset];
      const walker = dom.doc.createTreeWalker(container, 4);
      const first = walker.nextNode();
      if (first) {
        container = first;
      }
    } else {
      container = nodes[nodes.length - 1];
      const walker = dom.doc.createTreeWalker(container, 4);
      let last: Node | null = null;
      let cur = walker.nextNode();
      while (cur) {
        last = cur;
        cur = walker.nextNode();
      }
      if (last) {
        container = last;
      }
    }
    if (NodeType.isText(container)) {
      const r = dom.createRng();
      r.setStart(container, 0);
      r.setEnd(container, 0);
      if (rng.collapsed) {
        selection.setRng(r);
      }
    }
  }
};

export const preserveSelection = (editor: Editor, action: () => void, shouldMoveStart?: (startNode: Node) => boolean): void => {
  const selection = editor.selection;
  const rng = selection.getRng();
  const bookmark = selection.getBookmark(1);
  action();
  selection.moveToBookmark(bookmark);
  const newRng = selection.getRng();
  if (shouldMoveStart && shouldMoveStart(selection.getStart())) {
    moveStart(editor.dom, selection, newRng);
  }
  void rng;
};

/** Table cells marked as selected by the table plugin. */
export const getCellsFromEditor = (editor: Editor): HTMLElement[] => editor.dom.select('td[data-mce-selected],th[data-mce-selected]', editor.getBody());

export const getNode = (container: Node, offset: number): Node => {
  const children = container.childNodes;
  if (children.length === 0) {
    return container;
  }
  return children[Math.max(0, Math.min(offset, children.length - 1))];
};

export type { Format, FormatVars };
export const isFunctionValue = isFunction;
