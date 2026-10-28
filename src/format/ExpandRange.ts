import type { Editor } from '../core/Editor';
import type { DOMUtils } from '../dom/DOMUtils';
import type { Format, RangeLikeObject } from './Formatter';
import * as NodeType from '../dom/NodeType';
import * as FormatUtils from './FormatUtils';

/**
 * Expands a range before applying/removing formats: word expansion for collapsed ranges, sharp
 * boundaries moved up the tree, selector/block expansion (port of TinyMCE's ExpandRange).
 */

const isBookmarkNode = NodeType.isBookmarkNode;

const findParentContentEditable = (dom: DOMUtils, node: Node): Node => {
  let parent: Node | null = node;
  while (parent) {
    if (NodeType.isElement(parent) && dom.getContentEditable(parent)) {
      return dom.getContentEditable(parent) === 'false' ? parent : node;
    }
    parent = parent.parentNode;
  }
  return node;
};

const isWordBoundary = (chr: string): boolean => /[\s ​﻿]/.test(chr);

interface TextPoint {
  container: Text;
  offset: number;
}

/** Walks text nodes within the block to find the edge of the current word. */
const findWordEndPoint = (dom: DOMUtils, body: HTMLElement, container: Node, offset: number, start: boolean, includeTrailingSpaces: boolean): { container: Node; offset: number } => {
  const rootNode = (dom.getParent(container, (n) => NodeType.isElement(n) && dom.isBlock(n)) as HTMLElement | null) || body;
  const walker = dom.doc.createTreeWalker(rootNode, 4);
  const texts: Text[] = [];
  let t = walker.nextNode() as Text | null;
  while (t) {
    texts.push(t);
    t = walker.nextNode() as Text | null;
  }
  let startText: Text | null = NodeType.isText(container) ? container : null;
  let startOffset = offset;
  if (!startText) {
    // Element container: use the adjacent text node.
    const child = container.childNodes[start ? Math.max(0, offset - 1) : offset];
    if (child && NodeType.isText(child)) {
      startText = child;
      startOffset = start ? child.data.length : 0;
    } else {
      return { container, offset };
    }
  }
  let idx = texts.indexOf(startText);
  if (idx === -1) {
    return { container, offset };
  }
  let lastText: TextPoint = { container: startText, offset: startOffset };
  let seenContent = false;
  if (start) {
    let text = startText;
    let pos = startOffset;
    while (true) {
      for (let i = pos - 1; i >= 0; i--) {
        if (isWordBoundary(text.data.charAt(i))) {
          if (includeTrailingSpaces && !seenContent) {
            // Skip the spaces first, then stop at the next boundary.
            continue;
          }
          return { container: text, offset: i + 1 };
        }
        seenContent = true;
      }
      lastText = { container: text, offset: 0 };
      idx--;
      if (idx < 0 || isBookmarkNode(texts[idx].parentNode)) {
        break;
      }
      text = texts[idx];
      pos = text.data.length;
    }
    return lastText;
  }
  let text = startText;
  let pos = startOffset;
  while (true) {
    for (let i = pos; i < text.data.length; i++) {
      if (isWordBoundary(text.data.charAt(i))) {
        if (includeTrailingSpaces && !seenContent) {
          continue;
        }
        return { container: text, offset: i };
      }
      seenContent = true;
    }
    lastText = { container: text, offset: text.data.length };
    idx++;
    if (idx >= texts.length || isBookmarkNode(texts[idx].parentNode)) {
      break;
    }
    text = texts[idx];
    pos = 0;
  }
  return lastText;
};

const findParentContainer = (dom: DOMUtils, formatList: Format[], container: Node, offset: number, start: boolean): Node => {
  let parent: Node = container;
  const siblingName = start ? 'previousSibling' : 'nextSibling';
  const root = dom.getRoot();
  const format = formatList[0];

  if (NodeType.isText(container) && (start ? offset > 0 : offset < container.data.length)) {
    return container;
  }
  while (true) {
    if (!format.block_expand && dom.isBlock(parent)) {
      return parent;
    }
    for (let sibling = parent[siblingName]; sibling; sibling = sibling[siblingName]) {
      const allowSpaces = NodeType.isText(sibling) && !FormatUtils.isWhiteSpaceNode(sibling, false);
      if (!isBookmarkNode(sibling) && !FormatUtils.isWhiteSpaceNode(sibling, allowSpaces) && !FormatUtils.isEmptyTextNode(sibling)) {
        return parent;
      }
    }
    if (parent === root || parent.parentNode === root || !parent.parentNode) {
      container = parent;
      break;
    }
    parent = parent.parentNode;
  }
  return container;
};

const findSelectorEndPoint = (dom: DOMUtils, formatList: Format[], rng: RangeLikeObject, container: Node, siblingName: 'previousSibling' | 'nextSibling'): Node => {
  if (NodeType.isText(container) && container.data.length === 0 && container[siblingName]) {
    container = container[siblingName] as Node;
  }
  const parents = FormatUtils.getParents(dom, container);
  const collapsed = rng.startContainer === rng.endContainer && rng.startOffset === rng.endOffset;
  for (let i = 0; i < parents.length; i++) {
    for (let y = 0; y < formatList.length; y++) {
      const curFormat = formatList[y];
      if (curFormat.collapsed !== undefined && curFormat.collapsed !== collapsed) {
        continue;
      }
      if (FormatUtils.isSelectorFormat(curFormat) && dom.is(parents[i], curFormat.selector)) {
        return parents[i];
      }
    }
  }
  return container;
};

const findBlockEndPoint = (editor: Editor, formatList: Format[], container: Node, siblingName: 'previousSibling' | 'nextSibling'): Node => {
  let node: Node | null = container;
  const dom = editor.dom;
  const root = dom.getRoot();
  const format = formatList[0];

  if (!format.wrapper && FormatUtils.isBlockFormat(format)) {
    node = dom.getParent(container, format.block, root);
  } else {
    node = null;
  }
  if (!node) {
    const scopeRoot = dom.getParent(container, 'LI,TD,TH') ?? root;
    node = dom.getParent(NodeType.isText(container) ? container.parentNode : container, (n) => n !== root && FormatUtils.isTextBlock(editor.schema, n), scopeRoot);
  }
  if (node && FormatUtils.isBlockFormat(format) && format.wrapper) {
    node = (dom.getParents(node, 'ul,ol').reverse()[0] as Node | undefined) || node;
  }
  if (!node) {
    node = container;
    while (node && node[siblingName] && !dom.isBlock(node[siblingName])) {
      node = node[siblingName] as Node;
      if (FormatUtils.isEq(node, 'br')) {
        break;
      }
    }
  }
  return node || container;
};

export const expandRng = (editor: Editor, rng: RangeLikeObject, formatList: Format[], includeTrailingSpace: boolean = false): RangeLikeObject => {
  let { startContainer, startOffset, endContainer, endOffset } = rng;
  const dom = editor.dom;
  const format = formatList[0];
  const collapsed = startContainer === endContainer && startOffset === endOffset;

  if (NodeType.isElement(startContainer) && startContainer.hasChildNodes()) {
    startContainer = FormatUtils.getNode(startContainer, startOffset);
    if (NodeType.isText(startContainer)) {
      startOffset = 0;
    }
  }
  if (NodeType.isElement(endContainer) && endContainer.hasChildNodes()) {
    endContainer = FormatUtils.getNode(endContainer, collapsed ? endOffset : endOffset - 1);
    if (NodeType.isText(endContainer)) {
      endOffset = endContainer.data.length;
    }
  }

  startContainer = findParentContentEditable(dom, startContainer);
  endContainer = findParentContentEditable(dom, endContainer);

  if (isBookmarkNode(startContainer.parentNode) || isBookmarkNode(startContainer)) {
    startContainer = isBookmarkNode(startContainer) ? startContainer : (startContainer.parentNode as Node);
    startContainer = (collapsed ? startContainer.previousSibling : startContainer.nextSibling) || startContainer;
    if (NodeType.isText(startContainer)) {
      startOffset = collapsed ? startContainer.data.length : 0;
    }
  }
  if (isBookmarkNode(endContainer.parentNode) || isBookmarkNode(endContainer)) {
    endContainer = isBookmarkNode(endContainer) ? endContainer : (endContainer.parentNode as Node);
    endContainer = (collapsed ? endContainer.nextSibling : endContainer.previousSibling) || endContainer;
    if (NodeType.isText(endContainer)) {
      endOffset = collapsed ? 0 : endContainer.data.length;
    }
  }

  if (collapsed) {
    const startPoint = findWordEndPoint(dom, editor.getBody(), startContainer, startOffset, true, includeTrailingSpace);
    startContainer = startPoint.container;
    startOffset = startPoint.offset;
    const endPoint = findWordEndPoint(dom, editor.getBody(), endContainer, endOffset, false, includeTrailingSpace);
    endContainer = endPoint.container;
    endOffset = endPoint.offset;
  }

  if (FormatUtils.isInlineFormat(format) || format.block_expand) {
    if (!FormatUtils.isInlineFormat(format) || (NodeType.isText(startContainer) && startOffset === 0)) {
      startContainer = findParentContainer(dom, formatList, startContainer, startOffset, true);
    }
    if (!FormatUtils.isInlineFormat(format) || (NodeType.isText(endContainer) && endOffset === endContainer.data.length)) {
      endContainer = findParentContainer(dom, formatList, endContainer, endOffset, false);
    }
  }

  if (FormatUtils.shouldExpandToSelector(format)) {
    startContainer = findSelectorEndPoint(dom, formatList, rng, startContainer, 'previousSibling');
    endContainer = findSelectorEndPoint(dom, formatList, rng, endContainer, 'nextSibling');
  }

  if (FormatUtils.isBlockFormat(format) || (FormatUtils.isSelectorFormat(format) && !FormatUtils.isInlineFormat(format))) {
    startContainer = findBlockEndPoint(editor, formatList, startContainer, 'previousSibling');
    endContainer = findBlockEndPoint(editor, formatList, endContainer, 'nextSibling');
    if (FormatUtils.isBlockFormat(format)) {
      if (!dom.isBlock(startContainer)) {
        startContainer = findParentContainer(dom, formatList, startContainer, startOffset, true);
      }
      if (!dom.isBlock(endContainer)) {
        endContainer = findParentContainer(dom, formatList, endContainer, endOffset, false);
      }
    }
  }

  if (NodeType.isElement(startContainer) && startContainer.parentNode) {
    startOffset = dom.nodeIndex(startContainer);
    startContainer = startContainer.parentNode;
  }
  if (NodeType.isElement(endContainer) && endContainer.parentNode) {
    endOffset = dom.nodeIndex(endContainer) + 1;
    endContainer = endContainer.parentNode;
  }
  return { startContainer, startOffset, endContainer, endOffset };
};
