import type { Editor } from '../core/Editor';
import type { DOMUtils } from '../dom/DOMUtils';
import type { Format, FormatVars } from './Formatter';
import * as NodeType from '../dom/NodeType';
import * as FormatUtils from './FormatUtils';
import * as MatchFormat from './MatchFormat';
import { removeNodeFormat } from './RemoveFormat';
import { Tools } from '../util/Tools';

/** Merging of wrappers with children/parents/siblings after a format is applied (port of TinyMCE). */

const each = Tools.each;

const isElementNode = (node: Node | null | undefined): node is HTMLElement => FormatUtils.isElementNode(node);

const findElementSibling = (node: Node, siblingName: 'nextSibling' | 'previousSibling'): Node => {
  for (let sibling: Node | null = node; sibling; sibling = sibling[siblingName]) {
    if (NodeType.isText(sibling) && sibling.data.length !== 0) {
      return node;
    }
    if (NodeType.isElement(sibling) && !NodeType.isBookmarkNode(sibling)) {
      return sibling;
    }
  }
  return node;
};

/** Compares two elements for name/attribute/style equality (ignoring editor internals). */
export const compareElements = (dom: DOMUtils, node1: Element, node2: Element): boolean => {
  if (node1.nodeName !== node2.nodeName || node1.namespaceURI !== node2.namespaceURI) {
    return false;
  }
  const getAttribs = (node: Element): Record<string, string> => {
    const attribs: Record<string, string> = {};
    const attrs = node.attributes;
    for (let i = 0; i < attrs.length; i++) {
      const name = attrs[i].name;
      if (name.indexOf('_') !== 0 && name !== 'style' && name.indexOf('data-mce-') !== 0) {
        attribs[name] = attrs[i].value;
      }
    }
    return attribs;
  };
  const compareObjects = (obj1: Record<string, string>, obj2: Record<string, string>): boolean => {
    for (const name of Object.keys(obj1)) {
      const value = obj2[name];
      if (value === undefined || obj1[name] !== value) {
        return false;
      }
    }
    for (const name of Object.keys(obj2)) {
      if (obj1[name] === undefined) {
        return false;
      }
    }
    return true;
  };
  if (!compareObjects(getAttribs(node1), getAttribs(node2))) {
    return false;
  }
  return compareObjects(dom.parseStyle(dom.getAttrib(node1, 'style')), dom.parseStyle(dom.getAttrib(node2, 'style')));
};

const mergeSiblingsNodes = (editor: Editor, prev: Node | undefined, next: Node | undefined): Node | undefined => {
  const dom = editor.dom;
  if (prev && next && NodeType.isElement(prev) && NodeType.isElement(next) && dom.isEditable(prev) && dom.isEditable(next)) {
    const prevSibling = findElementSibling(prev, 'previousSibling');
    const nextSibling = findElementSibling(next, 'nextSibling');
    if (NodeType.isElement(prevSibling) && NodeType.isElement(nextSibling) && compareElements(dom, prevSibling, nextSibling)) {
      for (let sibling = prevSibling.nextSibling; sibling && sibling !== nextSibling; ) {
        const tmpSibling = sibling;
        sibling = sibling.nextSibling;
        prevSibling.appendChild(tmpSibling);
      }
      while (nextSibling.firstChild) {
        prevSibling.appendChild(nextSibling.firstChild);
      }
      dom.remove(nextSibling);
      return prevSibling;
    }
  }
  return next;
};

export const mergeSiblings = (editor: Editor, format: Format, vars: FormatVars | undefined, node: Node | undefined): void => {
  if (node && format.merge_siblings !== false) {
    const newNode = mergeSiblingsNodes(editor, FormatUtils.getNonWhiteSpaceSibling(node), node) ?? node;
    mergeSiblingsNodes(editor, newNode, FormatUtils.getNonWhiteSpaceSibling(newNode, true));
  }
  void vars;
};

const clearChildStyles = (dom: DOMUtils, format: Format, node: Node): void => {
  if (format.clear_child_styles) {
    const selector = format.links ? '*:not(a)' : '*';
    dom.select(selector, node).forEach((childNode) => {
      if (isElementNode(childNode) && dom.isEditable(childNode)) {
        for (const name of Object.keys(format.styles || {})) {
          dom.setStyle(childNode, name, '');
        }
      }
    });
  }
};

export const mergeWithChildren = (editor: Editor, formatList: Format[], vars: FormatVars | undefined, node: Node): void => {
  for (const format of formatList) {
    if (FormatUtils.isInlineFormat(format)) {
      editor.dom.select(format.inline, node).forEach((child) => {
        if (isElementNode(child)) {
          removeNodeFormat(editor, format, vars, child, format.exact ? child : null);
        }
      });
    }
    clearChildStyles(editor.dom, format, node);
  }
};

export const mergeWithParents = (editor: Editor, format: Format, name: string, vars: FormatVars | undefined, node: Node): void => {
  if (MatchFormat.matchNode(editor, node.parentNode, name, vars)) {
    if (removeNodeFormat(editor, format, vars, node)) {
      return;
    }
  }
  if (format.merge_with_parents) {
    for (const parent of FormatUtils.getParents(editor.dom, node.parentNode)) {
      if (MatchFormat.matchNode(editor, parent, name, vars)) {
        if (removeNodeFormat(editor, format, vars, node)) {
          return;
        }
      }
    }
  }
};

const processChildElements = (node: Node, filter: (n: Element) => boolean, process: (n: Element) => void): void => {
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (isElementNode(child) && filter(child)) {
      process(child);
    }
    processChildElements(child, filter, process);
  }
};

const hasStyle = (dom: DOMUtils, name: string) => (node: Element): boolean => !!(node && dom.getStyle(node, name));
const applyStyle = (dom: DOMUtils, name: string, value: string | null) => (node: Element): void => {
  dom.setStyle(node, name, value);
  if (node.getAttribute('style') === '') {
    node.removeAttribute('style');
  }
};

export const mergeBackgroundColorAndFontSize = (dom: DOMUtils, format: Format, vars: FormatVars | undefined, node: Node): void => {
  if (format.styles && format.styles.backgroundColor) {
    processChildElements(node, hasStyle(dom, 'fontSize'), applyStyle(dom, 'backgroundColor', FormatUtils.replaceVars(format.styles.backgroundColor, vars)));
  }
};

export const mergeTextDecorationsAndColor = (dom: DOMUtils, format: Format, vars: FormatVars | undefined, node: Node): void => {
  const processTextDecorationsAndColor = (n: Node) => {
    if (NodeType.isElement(n) && NodeType.isElement(n.parentNode) && dom.isEditable(n)) {
      const parentTextDecoration = FormatUtils.getTextDecoration(dom, n.parentNode);
      if (dom.getStyle(n, 'color') && parentTextDecoration) {
        dom.setStyle(n, 'text-decoration', parentTextDecoration);
      } else if (dom.getStyle(n, 'text-decoration') === parentTextDecoration) {
        dom.setStyle(n, 'text-decoration', null);
      }
    }
  };
  if (format.styles && (format.styles.color || format.styles.textDecoration)) {
    Tools.walk(node, processTextDecorationsAndColor, 'childNodes');
    processTextDecorationsAndColor(node);
  }
  void vars;
};

export const mergeSubSup = (dom: DOMUtils, format: Format, vars: FormatVars | undefined, node: Node): void => {
  if (FormatUtils.isInlineFormat(format) && (format.inline === 'sub' || format.inline === 'sup')) {
    processChildElements(node, hasStyle(dom, 'fontSize'), applyStyle(dom, 'fontSize', ''));
    dom.remove(dom.select(format.inline === 'sup' ? 'sub' : 'sup', node), true);
  }
  void vars;
};

export { each };
