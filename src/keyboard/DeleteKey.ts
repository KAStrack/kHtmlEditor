import type { Editor } from '../core/Editor';
import * as NodeType from '../dom/NodeType';
import * as CaretUtils from '../dom/CaretUtils';
import { isEmptyDom } from '../dom/DOMUtils';
import { ensureRootBlock } from './ForceBlocks';

/**
 * Backspace/Delete handling for structural cases (block boundaries, lists, tables, non-editable
 * elements). Character deletion inside a text run is left to the browser.
 */

const isStructural = (node: Node | null): node is HTMLElement => !!node && NodeType.isElement(node) && (NodeType.isTable(node) || NodeType.isHr(node) || NodeType.isContentEditableFalse(node) || NodeType.isMedia(node) || NodeType.isFigure(node));

/** Range.deleteContents leaves empty text nodes behind; drop them so emptiness checks are reliable. */
const removeEmptyTextNodes = (root: Node): void => {
  const walker = root.ownerDocument!.createTreeWalker(root, 4);
  const empty: Text[] = [];
  let t = walker.nextNode() as Text | null;
  while (t) {
    if (t.data.length === 0) {
      empty.push(t);
    }
    t = walker.nextNode() as Text | null;
  }
  empty.forEach((n) => n.parentNode?.removeChild(n));
};

const removeBlockAndAncestors = (editor: Editor, block: HTMLElement): void => {
  const parent = block.parentNode;
  editor.dom.remove(block);
  CaretUtils.removeEmptyAncestors(editor, parent);
};

/** Moves the children of `from` to the end of `to`, returning the junction position. */
const mergeBlocks = (editor: Editor, to: HTMLElement, from: HTMLElement): { node: Node; offset: number } => {
  const dom = editor.dom;
  removeEmptyTextNodes(to);
  removeEmptyTextNodes(from);
  CaretUtils.unpadBlock(to);
  CaretUtils.unpadBlock(from);
  // A trailing real br in the target would create an empty line; keep TinyMCE's behaviour of dropping it.
  const last = to.lastChild;
  if (last && NodeType.isBr(last) && to.childNodes.length > 1) {
    dom.remove(last);
  }
  const junction = editor.selection.lastEditablePosition(to);
  // Nested lists of a list item stay at the end; merge text before them.
  let insertBefore: Node | null = null;
  if (NodeType.isListItem(to)) {
    for (let c = to.firstChild; c; c = c.nextSibling) {
      if (NodeType.isList(c)) {
        insertBefore = c;
        break;
      }
    }
  }
  let movedFirst: Node | null = null;
  while (from.firstChild) {
    const child = from.firstChild;
    if (!movedFirst) {
      movedFirst = child;
    }
    if (insertBefore) {
      to.insertBefore(child, insertBefore);
    } else {
      to.appendChild(child);
    }
  }
  removeBlockAndAncestors(editor, from);
  if (!to.firstChild || isEmptyDom(editor.schema, to, undefined, { includeNbsp: false })) {
    if (!to.querySelector('br')) {
      CaretUtils.padBlock(editor, to);
    }
    return editor.selection.firstEditablePosition(to);
  }
  // Merge adjacent text nodes around the junction while keeping the caret position.
  if (NodeType.isText(junction.node) && junction.node.nextSibling && NodeType.isText(junction.node.nextSibling)) {
    const t = junction.node;
    const next = t.nextSibling as Text;
    t.data += next.data;
    next.parentNode?.removeChild(next);
  }
  return junction;
};

const setCaret = (editor: Editor, pos: { node: Node; offset: number }): void => {
  const rng = editor.dom.createRng();
  rng.setStart(pos.node, pos.offset);
  rng.collapse(true);
  editor.selection.setRng(rng);
  editor.selection.scrollIntoView();
};

/** Backspace at the start of a list item: merge into the previous item or leave the list. */
const backspaceInListItem = (editor: Editor, li: HTMLElement): boolean => {
  const dom = editor.dom;
  const list = li.parentNode as HTMLElement;
  const prevLi = li.previousElementSibling as HTMLElement | null;
  if (prevLi && NodeType.isListItem(prevLi)) {
    // Merge into the deepest last item of the previous item (nested lists).
    const target = CaretUtils.deepestLastBlock(editor, prevLi);
    const pos = mergeBlocks(editor, target, li);
    setCaret(editor, pos);
    return true;
  }
  // First item: outdent to a paragraph before the list (or into the parent item when nested).
  const parentLi = list.parentNode && NodeType.isListItem(list.parentNode) ? (list.parentNode as HTMLElement) : null;
  if (parentLi) {
    const pos = mergeBlocks(editor, parentLi, li);
    if (!list.firstChild) {
      dom.remove(list);
    }
    setCaret(editor, pos);
    return true;
  }
  const p = dom.create(editor.options.get('forced_root_block') as string);
  while (li.firstChild) {
    if (NodeType.isList(li.firstChild)) {
      break;
    }
    p.appendChild(li.firstChild);
  }
  if (!p.firstChild) {
    CaretUtils.padBlock(editor, p);
  }
  list.parentNode?.insertBefore(p, list);
  if (li.firstChild) {
    // Remaining nested list becomes the start of the list.
    const nested = li.firstChild as HTMLElement;
    while (nested.firstChild) {
      list.insertBefore(nested.firstChild, li);
    }
  }
  dom.remove(li);
  if (!list.firstChild) {
    dom.remove(list);
  }
  CaretUtils.moveCaretToStart(editor, p);
  return true;
};

const resolveBoundaryBlock = (editor: Editor, container: Node, offset: number, start: boolean): HTMLElement | null => {
  const body = editor.getBody();
  const block = CaretUtils.getTextBlock(editor, container);
  if (block) {
    return block;
  }
  if (container === body || (NodeType.isElement(container) && editor.dom.isBlock(container) && !CaretUtils.getTextBlock(editor, container))) {
    const idx = start ? offset : offset - 1;
    const child = container.childNodes[Math.max(0, Math.min(idx, container.childNodes.length - 1))];
    if (child && NodeType.isElement(child) && editor.dom.isBlock(child)) {
      return start ? CaretUtils.deepestFirstBlock(editor, child as HTMLElement) : CaretUtils.deepestLastBlock(editor, child as HTMLElement);
    }
  }
  return null;
};

const deleteSelectionAcrossBlocks = (editor: Editor, rng: Range): boolean => {
  const startBlock = resolveBoundaryBlock(editor, rng.startContainer, rng.startOffset, true);
  const endBlock = resolveBoundaryBlock(editor, rng.endContainer, rng.endOffset, false);
  if (!startBlock || !endBlock || startBlock === endBlock) {
    return false;
  }
  const startCell = editor.dom.getParent(startBlock, 'td,th', editor.getBody());
  const endCell = editor.dom.getParent(endBlock, 'td,th', editor.getBody());
  if (startCell !== endCell) {
    // Selection spans table cells: clear the cell contents but keep the structure.
    const cells = editor.dom.select('td,th', editor.getBody()).filter((cell) => rng.intersectsNode(cell));
    if (cells.length === 0) {
      return false;
    }
    cells.forEach((cell) => {
      cell.innerHTML = '<br data-mce-bogus="1">';
    });
    CaretUtils.moveCaretToStart(editor, cells[0] as HTMLElement);
    return true;
  }
  rng.deleteContents();
  removeEmptyTextNodes(startBlock);
  removeEmptyTextNodes(endBlock);
  const body = editor.getBody();
  // The end block (or what is left of it) merges into the start block.
  if (endBlock.parentNode && startBlock.parentNode && endBlock !== startBlock && !startBlock.contains(endBlock) && !endBlock.contains(startBlock)) {
    const target = CaretUtils.deepestLastBlock(editor, startBlock);
    const pos = mergeBlocks(editor, target, endBlock);
    setCaret(editor, pos);
  } else if (startBlock.parentNode && body.contains(startBlock)) {
    if (isEmptyDom(editor.schema, startBlock, undefined, { includeNbsp: true })) {
      startBlock.innerHTML = '';
      CaretUtils.padBlock(editor, startBlock);
    }
    CaretUtils.moveCaretToEnd(editor, startBlock);
  } else if (endBlock.parentNode && body.contains(endBlock)) {
    if (isEmptyDom(editor.schema, endBlock, undefined, { includeNbsp: true })) {
      endBlock.innerHTML = '';
      CaretUtils.padBlock(editor, endBlock);
    }
    CaretUtils.moveCaretToStart(editor, endBlock);
  } else {
    // Everything was removed: restore the padded root block.
    ensureRootBlock(editor);
    const first = body.firstChild as HTMLElement | null;
    if (first) {
      CaretUtils.moveCaretToStart(editor, first);
    }
  }
  return true;
};

/** Returns true when the key was handled (caller prevents the default action). */
export const handleDelete = (editor: Editor, forward: boolean): boolean => {
  const selection = editor.selection;
  const rng = selection.getRng();
  const body = editor.getBody();
  if (!body.contains(rng.startContainer)) {
    return false;
  }
  if (!rng.collapsed) {
    return deleteSelectionAcrossBlocks(editor, rng);
  }
  const block = CaretUtils.getTextBlock(editor, rng.startContainer);
  if (!block) {
    return false;
  }
  if (editor.dom.getContentEditable(block) === 'false') {
    return true;
  }

  if (!forward) {
    if (!CaretUtils.isAtStartOfBlock(editor, rng, block)) {
      return false;
    }
    if (block.nodeName === 'LI') {
      return backspaceInListItem(editor, block);
    }
    if (/^(TD|TH)$/.test(block.nodeName)) {
      return true;
    }
    const prev = CaretUtils.findPreviousBlock(editor, block);
    if (!prev) {
      // First block in the document: a heading/other block becomes a paragraph, otherwise nothing.
      return isEmptyDom(editor.schema, block, undefined, { includeNbsp: true }) && block.nodeName !== 'P' ? false : true;
    }
    const prevEl: HTMLElement = prev;
    if (prevEl.nodeName === 'TABLE' || editor.dom.getParent(prevEl, 'table', body)) {
      if (isEmptyDom(editor.schema, block, undefined, { includeNbsp: true }) && block.parentNode === body) {
        removeBlockAndAncestors(editor, block);
      }
      const cells = prevEl.nodeName === 'TABLE' ? (prevEl.querySelectorAll('td,th') as NodeListOf<HTMLElement>) : null;
      const target = cells && cells.length ? cells[cells.length - 1] : prevEl;
      CaretUtils.moveCaretToEnd(editor, target);
      return true;
    }
    if (isStructural(prevEl)) {
      editor.dom.remove(prevEl);
      return true;
    }
    if (isEmptyDom(editor.schema, block, undefined, { includeNbsp: true })) {
      removeBlockAndAncestors(editor, block);
      CaretUtils.moveCaretToEnd(editor, prev);
      return true;
    }
    const pos = mergeBlocks(editor, prevEl, block);
    setCaret(editor, pos);
    return true;
  }

  // Forward delete.
  if (!CaretUtils.isAtEndOfBlock(editor, rng, block)) {
    return false;
  }
  if (/^(TD|TH)$/.test(block.nodeName)) {
    return true;
  }
  const next = CaretUtils.findNextBlock(editor, block);
  if (!next) {
    return true;
  }
  const nextEl: HTMLElement = next;
  if (nextEl.nodeName === 'TABLE' || editor.dom.getParent(nextEl, 'table', body)) {
    if (isEmptyDom(editor.schema, block, undefined, { includeNbsp: true }) && block.parentNode === body) {
      removeBlockAndAncestors(editor, block);
    }
    const cells = nextEl.nodeName === 'TABLE' ? (nextEl.querySelectorAll('td,th') as NodeListOf<HTMLElement>) : null;
    CaretUtils.moveCaretToStart(editor, cells && cells.length ? cells[0] : nextEl);
    return true;
  }
  if (isStructural(nextEl)) {
    editor.dom.remove(nextEl);
    return true;
  }
  if (isEmptyDom(editor.schema, next, undefined, { includeNbsp: true })) {
    removeBlockAndAncestors(editor, next);
    return true;
  }
  if (isEmptyDom(editor.schema, block, undefined, { includeNbsp: true })) {
    removeBlockAndAncestors(editor, block);
    CaretUtils.moveCaretToStart(editor, next);
    return true;
  }
  const pos = mergeBlocks(editor, block, nextEl);
  setCaret(editor, pos);
  return true;
};

export const afterDelete = (editor: Editor): void => {
  ensureRootBlock(editor);
};
