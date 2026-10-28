import type { Editor } from '../core/Editor';
import * as NodeType from './NodeType';
import { TreeWalker } from './TreeWalker';

/**
 * Caret and block geometry helpers shared by the key handlers.
 */

export const getBlock = (editor: Editor, node: Node | null): HTMLElement | null => {
  const body = editor.getBody();
  if (!node || node === body) {
    return null;
  }
  return editor.dom.getParent(node, (n) => NodeType.isElement(n) && editor.dom.isBlock(n), body) as HTMLElement | null;
};

/** Closest block that holds text directly (p, h1, li, td, div, pre…), skipping list/table containers. */
export const getTextBlock = (editor: Editor, node: Node | null): HTMLElement | null => {
  let block = getBlock(editor, node);
  while (block && /^(UL|OL|TABLE|TBODY|THEAD|TFOOT|TR|DL|BLOCKQUOTE|FIGURE|DETAILS|SECTION|ARTICLE|ASIDE|HEADER|FOOTER|NAV|MAIN)$/.test(block.nodeName)) {
    // These contain other blocks; the caret is really in a child block or in an inline run.
    const child = findChildBlockContaining(block, node);
    if (!child) {
      return block;
    }
    block = child;
  }
  return block;
};

const findChildBlockContaining = (block: HTMLElement, node: Node | null): HTMLElement | null => {
  for (let c = block.firstChild; c; c = c.nextSibling) {
    if (NodeType.isElement(c) && node && (c === node || c.contains(node))) {
      return c;
    }
  }
  return null;
};

const isContentNode = (editor: Editor, node: Node): boolean => {
  if (NodeType.isText(node)) {
    return NodeType.removeZwsp(node.data).length > 0;
  }
  if (NodeType.isElement(node)) {
    if (NodeType.isBogus(node) || NodeType.isBookmarkNode(node)) {
      return false;
    }
    const name = node.nodeName.toLowerCase();
    return !!editor.schema.getNonEmptyElements()[name] || NodeType.isContentEditableFalse(node) || name === 'br';
  }
  return false;
};

const rangeHasContent = (editor: Editor, rng: Range): boolean => {
  if (rng.collapsed) {
    return false;
  }
  const frag = rng.cloneContents();
  const walker = frag.ownerDocument!.createTreeWalker(frag, 0xffffffff);
  let n: Node | null = walker.nextNode();
  while (n) {
    if (isContentNode(editor, n)) {
      return true;
    }
    n = walker.nextNode();
  }
  return false;
};

export const isAtStartOfBlock = (editor: Editor, rng: Range, block: HTMLElement): boolean => {
  const r = editor.dom.createRng();
  r.setStart(block, 0);
  r.setEnd(rng.startContainer, rng.startOffset);
  return !rangeHasContent(editor, r);
};

export const isAtEndOfBlock = (editor: Editor, rng: Range, block: HTMLElement): boolean => {
  const r = editor.dom.createRng();
  r.setStart(rng.endContainer, rng.endOffset);
  r.setEnd(block, block.childNodes.length);
  if (!rangeHasContent(editor, r)) {
    return true;
  }
  // A single trailing br (bogus or not) does not count as content after the caret.
  const frag = r.cloneContents();
  const walker = frag.ownerDocument!.createTreeWalker(frag, 0xffffffff);
  let brs = 0;
  let n: Node | null = walker.nextNode();
  while (n) {
    if (isContentNode(editor, n)) {
      if (NodeType.isBr(n)) {
        brs++;
      } else {
        return false;
      }
    }
    n = walker.nextNode();
  }
  return brs <= 1;
};

/** Finds the closest preceding block (deepest) that is not an ancestor of `block`. */
export const findPreviousBlock = (editor: Editor, block: HTMLElement): HTMLElement | null => {
  const body = editor.getBody();
  const walker = new TreeWalker(block, body);
  let node = walker.prev2();
  while (node && node !== body) {
    if (NodeType.isElement(node) && !node.contains(block)) {
      if (editor.dom.isBlock(node) || NodeType.isContentEditableFalse(node)) {
        // Descend to the deepest last block.
        return deepestLastBlock(editor, node as HTMLElement);
      }
    } else if (NodeType.isText(node)) {
      const parentBlock = getBlock(editor, node);
      if (parentBlock && !parentBlock.contains(block)) {
        return parentBlock;
      }
      if (!parentBlock) {
        return null;
      }
    }
    node = walker.prev2();
  }
  return null;
};

export const findNextBlock = (editor: Editor, block: HTMLElement): HTMLElement | null => {
  const body = editor.getBody();
  let node: Node | null = block;
  // Move to the next node in document order that is not inside block.
  while (node && node !== body) {
    if (node.nextSibling) {
      node = node.nextSibling;
      break;
    }
    node = node.parentNode;
  }
  if (!node || node === body) {
    return null;
  }
  while (node) {
    if (NodeType.isElement(node)) {
      const el: HTMLElement = node;
      if (el.getAttribute('contenteditable') === 'false') {
        return el;
      }
      if (editor.dom.isBlock(el)) {
        return deepestFirstBlock(editor, el);
      }
      if (el.firstChild) {
        node = el.firstChild;
        continue;
      }
    } else if (NodeType.isText(node) && NodeType.removeZwsp(node.data).length) {
      return getBlock(editor, node);
    }
    while (node && !node.nextSibling && node.parentNode !== body) {
      node = node.parentNode;
    }
    node = node ? node.nextSibling : null;
  }
  return null;
};

export const deepestLastBlock = (editor: Editor, block: HTMLElement): HTMLElement => {
  let current = block;
  while (true) {
    let found: HTMLElement | null = null;
    for (let c = current.lastChild; c; c = c.previousSibling) {
      if (NodeType.isElement(c) && editor.dom.isBlock(c)) {
        found = c;
        break;
      }
      if (NodeType.isText(c) && NodeType.removeZwsp(c.data).trim().length) {
        break;
      }
    }
    if (!found || NodeType.isContentEditableFalse(found)) {
      return found ?? current;
    }
    current = found;
  }
};

export const deepestFirstBlock = (editor: Editor, block: HTMLElement): HTMLElement => {
  let current = block;
  while (true) {
    let found: HTMLElement | null = null;
    for (let c = current.firstChild; c; c = c.nextSibling) {
      if (NodeType.isElement(c) && editor.dom.isBlock(c)) {
        found = c;
        break;
      }
      if (NodeType.isText(c) && NodeType.removeZwsp(c.data).trim().length) {
        break;
      }
    }
    if (!found || NodeType.isContentEditableFalse(found)) {
      return found ?? current;
    }
    current = found;
  }
};

/** Places the caret at the first text position of a block (before a leading br when empty). */
export const moveCaretToStart = (editor: Editor, block: HTMLElement): void => {
  const pos = editor.selection.firstEditablePosition(block);
  const rng = editor.dom.createRng();
  rng.setStart(pos.node, pos.offset);
  rng.collapse(true);
  editor.selection.setRng(rng);
  editor.selection.scrollIntoView(block);
};

export const moveCaretToEnd = (editor: Editor, block: HTMLElement): void => {
  const pos = editor.selection.lastEditablePosition(block);
  const rng = editor.dom.createRng();
  rng.setStart(pos.node, pos.offset);
  rng.collapse(true);
  editor.selection.setRng(rng);
  editor.selection.scrollIntoView(block);
};

/** Fills an empty block with a bogus br so it stays visible and focusable. */
export const padBlock = (editor: Editor, block: HTMLElement): void => {
  if (!block.querySelector('br[data-mce-bogus]')) {
    block.appendChild(editor.dom.create('br', { 'data-mce-bogus': '1' }));
  }
};

/** Removes bogus padding brs from a block that has real content. */
export const unpadBlock = (block: HTMLElement): void => {
  block.querySelectorAll('br[data-mce-bogus]').forEach((br) => {
    const parent = br.parentNode;
    if (parent) {
      parent.removeChild(br);
    }
  });
};

export const removeEmptyAncestors = (editor: Editor, node: Node | null): void => {
  const body = editor.getBody();
  let current = node;
  while (current && current !== body && NodeType.isElement(current)) {
    const parent: Node | null = current.parentNode;
    if (!current.firstChild || (current.childNodes.length === 1 && NodeType.isText(current.firstChild) && current.firstChild.data.length === 0)) {
      if (!NodeType.isTableCell(current) && !NodeType.isTableRow(current) && !NodeType.isTable(current)) {
        parent?.removeChild(current);
        current = parent;
        continue;
      }
    }
    break;
  }
};
