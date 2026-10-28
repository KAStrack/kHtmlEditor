import type { Editor } from '../core/Editor';
import type { DOMUtils } from '../dom/DOMUtils';
import type { Format, FormatVars, RangeLikeObject } from './Formatter';
import * as NodeType from '../dom/NodeType';
import { TreeWalker } from '../dom/TreeWalker';
import * as FormatUtils from './FormatUtils';
import * as MatchFormat from './MatchFormat';
import * as RangeWalk from './RangeWalk';
import { expandRng } from './ExpandRange';
import { isArray, isNullable } from '../util/Type';
import { mergeSiblings } from './MergeFormats';
import { removeCaretFormat } from './CaretFormat';

/** Format removal (port of TinyMCE's RemoveFormat). */

const isEq = FormatUtils.isEq;

const removeNode = (ed: Editor, node: Node, format: Format): void => {
  const parentNode = node.parentNode;
  let rootBlockElm: Element | null = null;
  const dom = ed.dom;
  const forcedRootBlock = ed.options.get('forced_root_block') as string;
  const forcedRootBlockAttrs = ed.options.get('forced_root_block_attrs') as Record<string, string>;

  if (FormatUtils.isBlockFormat(format)) {
    if (parentNode === dom.getRoot()) {
      if (!format.list_block || !isEq(node, format.list_block)) {
        Array.from(node.childNodes).forEach((child) => {
          if (FormatUtils.isValid(ed, forcedRootBlock, child.nodeName.toLowerCase())) {
            if (!rootBlockElm) {
              rootBlockElm = dom.create(forcedRootBlock, forcedRootBlockAttrs);
              child.parentNode?.insertBefore(rootBlockElm, child);
              rootBlockElm.appendChild(child);
            } else {
              rootBlockElm.appendChild(child);
            }
          } else {
            rootBlockElm = null;
          }
        });
      }
    }
  }
  if (FormatUtils.isMixedFormat(format) && !isEq(format.inline, node)) {
    return;
  }
  dom.remove(node, true);
};

const removeStyles = (dom: DOMUtils, elm: Element, format: Format, vars: FormatVars | undefined, compareNode: Element | null): void => {
  let stylesModified = false;
  const styles = format.styles as Record<string, string> | string[] | undefined;
  if (styles) {
    if (isArray(styles)) {
      for (const name of styles) {
        dom.setStyle(elm, name, '');
        stylesModified = true;
      }
    } else {
      for (const name of Object.keys(styles)) {
        const value = FormatUtils.normalizeStyleValue(FormatUtils.replaceVars(styles[name], vars), name);
        if (format.remove_similar || !compareNode || isEq(FormatUtils.getStyle(dom, compareNode, name), value)) {
          dom.setStyle(elm, name, '');
        }
        stylesModified = true;
      }
    }
  }
  if (stylesModified && dom.getAttrib(elm, 'style') === '') {
    elm.removeAttribute('style');
    elm.removeAttribute('data-mce-style');
  }
};

const removeAttrs = (dom: DOMUtils, elm: Element, format: Format, vars: FormatVars | undefined, compareNode: Element | null): void => {
  const attributes = format.attributes as Record<string, any> | string[] | undefined;
  if (!attributes) {
    return;
  }
  const names: string[] = isArray(attributes) ? (attributes as string[]) : Object.keys(attributes);
  for (const rawName of names) {
    const name = rawName;
    let value: string | null = isArray(attributes) ? null : FormatUtils.replaceVars(attributes[name], vars);
    const cmp = isArray(attributes) ? null : compareNode;
    if (format.remove_similar || !cmp || isEq(dom.getAttrib(cmp, name), value)) {
      if (name === 'class') {
        value = dom.getAttrib(elm, name);
        if (value) {
          let valueOut = '';
          value.split(/\s+/).forEach((cls) => {
            if (/mce-\w+/.test(cls)) {
              valueOut += (valueOut ? ' ' : '') + cls;
            }
          });
          if (valueOut) {
            dom.setAttrib(elm, name, valueOut);
            continue;
          }
        }
      }
      if (name === 'style') {
        elm.removeAttribute('data-mce-style');
      }
      if (name === 'href' || name === 'src') {
        elm.removeAttribute('data-mce-' + name);
      }
      elm.removeAttribute(name);
    }
  }
};

const removeClasses = (dom: DOMUtils, elm: Element, format: Format, vars: FormatVars | undefined, compareNode: Element | null): void => {
  const classes = format.classes;
  if (classes) {
    const list: string[] = isArray(classes) ? (classes as string[]) : [classes as string];
    for (const cls of list) {
      const value = FormatUtils.replaceVars(cls, vars) as string;
      if (!compareNode || dom.hasClass(compareNode, value)) {
        dom.removeClass(elm, value);
      }
    }
  }
};

/**
 * Removes the format from a single element. Returns true when the element itself was removed.
 */
export const removeNodeFormat = (ed: Editor, format: Format, vars: FormatVars | undefined, node: Node, compareNode?: Node | null): boolean => {
  const dom = ed.dom;
  const elm = node as Element;
  if (!NodeType.isElement(elm)) {
    return false;
  }
  const cmp = compareNode && NodeType.isElement(compareNode) ? compareNode : null;

  // Only nodes that carry this format are touched.
  if (!MatchFormat.matchName(dom, elm, format)) {
    return false;
  }
  if (!format.ceFalseOverride && dom.getContentEditableParent(elm) === 'false') {
    return false;
  }

  if (format.remove !== 'all') {
    removeStyles(dom, elm, format, vars, cmp);
    removeAttrs(dom, elm, format, vars, cmp);
    removeClasses(dom, elm, format, vars, cmp);
    if (format.remove === 'empty') {
      const attrs = elm.attributes;
      for (let i = 0; i < attrs.length; i++) {
        const attrName = attrs[i].name;
        if (attrName.indexOf('_') !== 0 && attrName.indexOf('data-mce-') !== 0) {
          return false;
        }
      }
      removeNode(ed, elm, format);
      return true;
    }
    return false;
  }

  if (format.preserve_attributes) {
    // Keep listed attributes by converting the element into a span.
    const preserved = format.preserve_attributes.filter((a) => elm.hasAttribute(a));
    if (preserved.length > 0) {
      const span = dom.create('span');
      preserved.forEach((a) => span.setAttribute(a, elm.getAttribute(a) as string));
      dom.replace(span, elm, true);
      return true;
    }
  }
  removeNode(ed, elm, format);
  return true;
};

const findFormatRoot = (editor: Editor, container: Node, name: string, vars: FormatVars | undefined, similar: boolean | undefined): Element | undefined => {
  let formatRoot: Element | undefined;
  FormatUtils.getParents(editor.dom, container.parentNode)
    .reverse()
    .forEach((parent) => {
      if (!formatRoot && parent.id !== '_start' && parent.id !== '_end') {
        const format = MatchFormat.matchNode(editor, parent, name, vars, similar);
        if (format && format.split !== false) {
          formatRoot = parent;
        }
      }
    });
  return formatRoot;
};

const wrapAndSplit = (editor: Editor, formatList: Format[], formatRoot: Element | undefined, container: Node, target: Node, split: boolean, format: Format, vars?: FormatVars): Node => {
  let lastClone: Element | null = null;
  let firstClone: Element | null = null;
  const dom = editor.dom;
  if (formatRoot) {
    const formatRootParent = formatRoot.parentNode;
    for (let parent: Node | null = container.parentNode; parent && parent !== formatRootParent; parent = parent.parentNode) {
      let clone: Element | null = parent.cloneNode(false) as Element;
      for (const fmt of formatList) {
        if (removeNodeFormat(editor, fmt, vars, clone, clone)) {
          clone = null;
          break;
        }
      }
      if (clone) {
        if (lastClone) {
          clone.appendChild(lastClone);
        }
        if (!firstClone) {
          firstClone = clone;
        }
        lastClone = clone;
      }
    }
    if (split && (!format.mixed || !dom.isBlock(formatRoot))) {
      container = dom.split(formatRoot, container) as Node;
    }
    if (lastClone && firstClone) {
      target.parentNode?.insertBefore(lastClone, target);
      (firstClone as Element).appendChild(target);
      if (FormatUtils.isInlineFormat(format)) {
        mergeSiblings(editor, format, vars, lastClone);
      }
    }
  }
  return container;
};

const wrap = (dom: DOMUtils, node: Node, name: string, attrs: Record<string, string>): Element => {
  const wrapper = dom.create(name, attrs);
  node.parentNode?.insertBefore(wrapper, node);
  wrapper.appendChild(node);
  return wrapper;
};

const unwrap = (dom: DOMUtils, id: string): Node => {
  const el = dom.get(id) as Element;
  const first = el.firstChild as Node;
  dom.remove(el, true);
  return first;
};

const getContainer = (ed: Editor, rng: RangeLikeObject, start?: boolean): Node => {
  let container = start ? rng.startContainer : rng.endContainer;
  let offset = start ? rng.startOffset : rng.endOffset;
  if (NodeType.isElement(container)) {
    const lastIdx = container.childNodes.length - 1;
    if (!start && offset) {
      offset--;
    }
    container = container.childNodes[offset > lastIdx ? lastIdx : offset] || container;
  }
  if (NodeType.isText(container) && start && offset >= container.data.length) {
    container = new TreeWalker(container, ed.getBody()).next() || container;
  }
  return container;
};

export const removeFormatInternal = (ed: Editor, name: string, vars?: FormatVars, node?: Node | Range | RangeLikeObject, similar?: boolean): void => {
  const formatList = ed.formatter.get(name) as Format[] | undefined;
  if (!formatList) {
    return;
  }
  const format = formatList[0];
  const dom = ed.dom;
  const selection = ed.selection;

  const splitToFormatRoot = (container: Node): Node => {
    const formatRoot = findFormatRoot(ed, container, name, vars, similar);
    return wrapAndSplit(ed, formatList, formatRoot, container, container, true, format, vars);
  };

  const isRemoveBookmarkNode = (n: Node | null): boolean => NodeType.isBookmarkNode(n) && NodeType.isElement(n) && (n.id === '_start' || n.id === '_end');

  const process = (n: Node): void => {
    const children = Array.from(n.childNodes);
    // Process current node: the first format in the list that removes it wins.
    let removed = false;
    if (dom.getContentEditableParent(n) !== 'false') {
      for (const fmt of formatList) {
        if (removeNodeFormat(ed, fmt, vars, n, n)) {
          removed = true;
          break;
        }
      }
    }
    // Process the children.
    if (format.deep && children.length) {
      for (const child of children) {
        if (!isRemoveBookmarkNode(child)) {
          process(child);
        }
      }
    }
    void removed;
    // A span whose only purpose was a text-decoration already provided by a parent is dropped.
    if (NodeType.isElement(n) && n.parentNode) {
      for (const decoration of ['underline', 'line-through', 'overline']) {
        if (FormatUtils.getStyle(dom, n, 'text-decoration') === decoration && FormatUtils.getTextDecoration(dom, n.parentNode) === decoration) {
          removeNodeFormat(ed, { deep: false, exact: true, inline: 'span', styles: { textDecoration: decoration } }, undefined, n);
        }
      }
    }
  };

  const removeRngStyle = (rng: RangeLikeObject): void => {
    let expandedRng = expandRng(ed, rng, formatList, true);
    if (format.split) {
      expandedRng = RangeWalk.splitRange(expandedRng);
      let startContainer = getContainer(ed, expandedRng, true);
      let endContainer = getContainer(ed, expandedRng);
      if (startContainer !== endContainer) {
        if (/^(TR|TH|TD)$/.test(startContainer.nodeName) && startContainer.firstChild) {
          if (startContainer.nodeName === 'TR') {
            startContainer = startContainer.firstChild.firstChild || startContainer;
          } else {
            startContainer = startContainer.firstChild || startContainer;
          }
        }
        const commonAncestor = (rng as any).commonAncestorContainer as Node | undefined;
        if (commonAncestor && /^T(HEAD|BODY|FOOT|R)$/.test(commonAncestor.nodeName) && NodeType.isTableCell(endContainer) && endContainer.firstChild) {
          endContainer = endContainer.firstChild || endContainer;
        }
        if (dom.isChildOf(startContainer, endContainer) && startContainer !== endContainer && !dom.isBlock(endContainer) && !NodeType.isTableCell(startContainer) && !NodeType.isTableCell(endContainer)) {
          startContainer = wrap(dom, startContainer, 'span', { id: '_start', 'data-mce-type': 'bookmark' });
          splitToFormatRoot(startContainer);
          startContainer = unwrap(dom, '_start');
        } else {
          startContainer = wrap(dom, startContainer, 'span', { id: '_start', 'data-mce-type': 'bookmark' });
          endContainer = wrap(dom, endContainer, 'span', { id: '_end', 'data-mce-type': 'bookmark' });
          splitToFormatRoot(startContainer);
          splitToFormatRoot(endContainer);
          startContainer = unwrap(dom, '_start');
          endContainer = unwrap(dom, '_end');
        }
      } else {
        startContainer = endContainer = splitToFormatRoot(startContainer);
      }
      expandedRng.startContainer = startContainer.parentNode ? startContainer.parentNode : startContainer;
      expandedRng.startOffset = dom.nodeIndex(startContainer);
      expandedRng.endContainer = endContainer.parentNode ? endContainer.parentNode : endContainer;
      expandedRng.endOffset = dom.nodeIndex(endContainer) + 1;
    }
    RangeWalk.walk(dom, expandedRng, (nodes) => {
      nodes.forEach((n) => process(n));
    });
  };

  if (node) {
    if (FormatUtils.isNode(node)) {
      const rng = dom.createRng();
      rng.setStartBefore(node);
      rng.setEndAfter(node);
      removeRngStyle(rng);
    } else {
      removeRngStyle(node as RangeLikeObject);
    }
    ed.nodeChanged();
    return;
  }

  if (!selection.isCollapsed() || !FormatUtils.isInlineFormat(format) || FormatUtils.getCellsFromEditor(ed).length) {
    FormatUtils.preserveSelection(
      ed,
      () => removeRngStyle(selection.getRng()),
      (startNode) => FormatUtils.isInlineFormat(format) && MatchFormat.match(ed, name, vars, startNode),
    );
    ed.nodeChanged();
  } else {
    removeCaretFormat(ed, name, vars, similar);
  }
  void isNullable;
};
