import type { Editor } from '../core/Editor';
import type { FormatVars, Format } from './Formatter';
import * as NodeType from '../dom/NodeType';
import * as MatchFormat from './MatchFormat';
import { expandRng } from './ExpandRange';
import { splitRange } from './RangeWalk';
import { isEmptyDom } from '../dom/DOMUtils';

/**
 * Applying/removing formats at a collapsed caret uses a temporary caret container
 * `<span id="_mce_caret" data-mce-bogus="1" data-mce-type="format-caret">` holding a ZWSP so that
 * typed text continues in (or out of) the format (port of TinyMCE's CaretFormat).
 */

const ZWSP = NodeType.ZWSP;
export const CARET_ID = '_mce_caret';

export const isCaretNode = (node: Node | null | undefined): node is HTMLElement => NodeType.isElement(node) && node.id === CARET_ID;

export const getParentCaretContainer = (body: Node, node: Node | null): HTMLElement | null => {
  let n: Node | null = node;
  while (n && n !== body) {
    if (isCaretNode(n)) {
      return n;
    }
    n = n.parentNode;
  }
  return null;
};

const createCaretContainer = (doc: Document, fill: boolean): HTMLElement => {
  const span = doc.createElement('span');
  span.id = CARET_ID;
  span.setAttribute('data-mce-bogus', '1');
  span.setAttribute('data-mce-type', 'format-caret');
  if (fill) {
    span.appendChild(doc.createTextNode(ZWSP));
  }
  return span;
};

const findFirstTextNode = (node: Node | null): Text | null => {
  if (!node) {
    return null;
  }
  const walker = node.ownerDocument!.createTreeWalker(node, 4);
  const first = NodeType.isText(node) ? node : (walker.nextNode() as Text | null);
  return first;
};

const trimZwspFromCaretContainer = (caretContainerNode: HTMLElement): Text | null => {
  const textNode = findFirstTextNode(caretContainerNode);
  if (textNode && textNode.data.charAt(0) === ZWSP) {
    textNode.deleteData(0, 1);
  }
  return textNode;
};

const isCaretContainerEmpty = (node: HTMLElement): boolean => {
  const text = node.textContent ?? '';
  return text.replace(/﻿/g, '').length === 0;
};

const fillWithPaddingBr = (editor: Editor, block: HTMLElement): void => {
  block.innerHTML = '';
  block.appendChild(editor.dom.create('br', { 'data-mce-bogus': '1' }));
};

const removeCaretContainerNode = (editor: Editor, node: HTMLElement, moveCaret: boolean = true): void => {
  const dom = editor.dom;
  const selection = editor.selection;
  if (isCaretContainerEmpty(node)) {
    const block = dom.getParent(node, (n) => NodeType.isElement(n) && dom.isBlock(n), editor.getBody()) as HTMLElement | null;
    const parent = node.parentNode;
    const nextSibling = node.nextSibling;
    const prevSibling = node.previousSibling;
    dom.remove(node);
    if (moveCaret && parent) {
      const rng = dom.createRng();
      if (prevSibling && NodeType.isText(prevSibling)) {
        rng.setStart(prevSibling, prevSibling.data.length);
      } else if (nextSibling && NodeType.isText(nextSibling)) {
        rng.setStart(nextSibling, 0);
      } else {
        rng.setStart(parent, dom.nodeIndex(nextSibling) || parent.childNodes.length);
      }
      rng.collapse(true);
      selection.setRng(rng);
    }
    if (block && isEmptyDom(editor.schema, block) && !block.querySelector('br')) {
      fillWithPaddingBr(editor, block);
      if (moveCaret) {
        selection.setCursorLocation(block, 0);
      }
    }
  } else {
    const rng = selection.getRng();
    const block = dom.getParent(node, (n) => NodeType.isElement(n) && dom.isBlock(n)) as HTMLElement | null;
    const startContainer = rng.startContainer;
    const startOffset = rng.startOffset;
    const endContainer = rng.endContainer;
    const endOffset = rng.endOffset;
    const textNode = trimZwspFromCaretContainer(node);
    dom.remove(node, true);
    if (textNode) {
      if (startContainer === textNode && startOffset > 0) {
        rng.setStart(textNode, startOffset - 1);
      }
      if (endContainer === textNode && endOffset > 0) {
        rng.setEnd(textNode, endOffset - 1);
      }
    }
    if (block && isEmptyDom(editor.schema, block)) {
      fillWithPaddingBr(editor, block);
    }
    selection.setRng(rng);
  }
};

export const removeCaretContainer = (editor: Editor, node: HTMLElement | null, moveCaret: boolean = true): void => {
  const dom = editor.dom;
  const selection = editor.selection;
  if (!node) {
    // Only stray containers (the caret is not inside one) are removed.
    const parent = getParentCaretContainer(editor.getBody(), selection.getStart());
    if (!parent) {
      let el: HTMLElement | null;
      while ((el = dom.get(CARET_ID) as HTMLElement | null) && editor.getBody().contains(el)) {
        removeCaretContainerNode(editor, el, false);
      }
    }
  } else {
    removeCaretContainerNode(editor, node, moveCaret);
  }
};

export const applyCaretFormat = (editor: Editor, name: string, vars?: FormatVars): void => {
  const selection = editor.selection;
  const body = editor.getBody();
  const selectionRng = selection.getRng();
  let offset = selectionRng.startOffset;
  const container = selectionRng.startContainer;
  const text = NodeType.isText(container) ? container.data : null;
  let caretContainer = getParentCaretContainer(body, selection.getStart());

  const wordcharRegex = /[^\s ­​﻿]/;
  if (text && offset > 0 && offset < text.length && wordcharRegex.test(text.charAt(offset)) && wordcharRegex.test(text.charAt(offset - 1))) {
    // Caret inside a word: format the whole word.
    const bookmark = selection.getBookmark();
    selectionRng.collapse(true);
    let rng = expandRng(editor, selectionRng, editor.formatter.get(name) as Format[]);
    rng = splitRange(rng);
    editor.formatter.apply(name, vars, rng);
    selection.moveToBookmark(bookmark);
  } else {
    let textNode = caretContainer ? findFirstTextNode(caretContainer) : null;
    if (!caretContainer || textNode?.data !== ZWSP) {
      caretContainer = createCaretContainer(editor.getDoc(), true);
      textNode = caretContainer.firstChild as Text;
      selectionRng.insertNode(caretContainer);
      offset = 1;
      editor.formatter.apply(name, vars, caretContainer);
    } else {
      editor.formatter.apply(name, vars, caretContainer);
    }
    selection.setCursorLocation(textNode as Text, offset);
  }
};

export const removeCaretFormat = (editor: Editor, name: string, vars?: FormatVars, similar?: boolean): void => {
  const dom = editor.dom;
  const selection = editor.selection;
  let hasContentAfter = false;
  const rng = selection.getRng();
  const container = rng.startContainer;
  const offset = rng.startOffset;
  let node: Node | null = container;

  if (NodeType.isText(container)) {
    if (offset !== container.data.length) {
      hasContentAfter = true;
    }
    node = node.parentNode;
  }

  const parents: Node[] = [];
  let formatNode: Node | undefined;
  while (node) {
    if (MatchFormat.matchNode(editor, node, name, vars, similar)) {
      formatNode = node;
      break;
    }
    if (node.nextSibling) {
      hasContentAfter = true;
    }
    parents.push(node);
    node = node.parentNode;
  }
  if (!formatNode) {
    return;
  }

  if (hasContentAfter) {
    const bookmark = selection.getBookmark();
    rng.collapse(true);
    let expandedRng = expandRng(editor, rng, editor.formatter.get(name) as Format[], true);
    expandedRng = splitRange(expandedRng);
    editor.formatter.remove(name, vars, expandedRng, similar);
    selection.moveToBookmark(bookmark);
  } else {
    const caretContainer = getParentCaretContainer(editor.getBody(), formatNode);
    const parentsAfter = caretContainer ? (dom.getParents(formatNode.parentNode, () => true, caretContainer) as Element[]) : [];
    const newCaretContainer = createCaretContainer(editor.getDoc(), false);
    const insertAfter = caretContainer ?? formatNode;
    insertAfter.parentNode?.insertBefore(newCaretContainer, insertAfter.nextSibling);

    // Rebuild the inline chain (minus the removed format) inside the new caret container.
    const chain = [...parents.filter((p) => NodeType.isElement(p) && !isCaretNode(p)), ...parentsAfter].filter((p) => p !== formatNode) as Element[];
    let innermost: HTMLElement = newCaretContainer;
    for (let i = chain.length - 1; i >= 0; i--) {
      const clone = chain[i].cloneNode(false) as HTMLElement;
      clone.removeAttribute('id');
      innermost.appendChild(clone);
      innermost = clone;
    }
    const textNode = editor.getDoc().createTextNode(ZWSP);
    innermost.appendChild(textNode);
    selection.setCursorLocation(textNode, 1);

    if (NodeType.isElement(formatNode) && isEmptyDom(editor.schema, formatNode, undefined, { includeZwsp: true })) {
      dom.remove(formatNode, true);
    }
  }
};

/** Keeps caret containers tidy as the user types or moves away. */
export const setupCaretFormat = (editor: Editor): void => {
  editor.on('mouseup keydown', (e) => {
    disableCaretContainer(editor, e.keyCode);
  });
  editor.on('input', () => {
    // Once text has been typed into the container, unwrap it so the format elements stay.
    const node = getParentCaretContainer(editor.getBody(), editor.selection.getStart());
    if (node && !isCaretContainerEmpty(node)) {
      removeCaretContainerNode(editor, node, true);
    }
  });
};

const disableCaretContainer = (editor: Editor, keyCode: number): void => {
  const selection = editor.selection;
  const body = editor.getBody();
  removeCaretContainer(editor, null, false);
  if ((keyCode === 8 || keyCode === 46) && selection.isCollapsed() && selection.getStart().innerHTML === ZWSP) {
    removeCaretContainer(editor, getParentCaretContainer(body, selection.getStart()));
  }
  if (keyCode === 37 || keyCode === 39) {
    removeCaretContainer(editor, getParentCaretContainer(body, selection.getStart()));
  }
};
