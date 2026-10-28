import type { Editor } from '../core/Editor';
import * as NodeType from '../dom/NodeType';
import * as CaretUtils from '../dom/CaretUtils';
import { isEmptyDom } from '../dom/DOMUtils';
import { forceBlocks, ensureRootBlock } from './ForceBlocks';

/**
 * Enter key handling (port of TinyMCE's InsertNewLine/InsertBlock/InsertBr behaviour).
 */
export interface NewLineEvent {
  shiftKey?: boolean;
}

const isCaretInsideBlock = (editor: Editor, rng: Range): HTMLElement | null => CaretUtils.getTextBlock(editor, rng.startContainer);

const hasRightSideContent = (editor: Editor, rng: Range, block: HTMLElement): boolean => !CaretUtils.isAtEndOfBlock(editor, rng, block);

/** Inserts a `<br>`; a second real br is added when the first would be the last thing in the block. */
export const insertBr = (editor: Editor): void => {
  const dom = editor.dom;
  const selection = editor.selection;
  let rng = selection.getRng();
  if (!rng.collapsed) {
    rng.deleteContents();
    rng = selection.getRng();
  }
  const block = isCaretInsideBlock(editor, rng) ?? editor.getBody();
  // Remove a bogus padding br, it will be replaced by a real one.
  CaretUtils.unpadBlock(block);
  rng = selection.getRng();
  const brElm = dom.create('br');
  rng.insertNode(brElm);
  const afterRng = dom.createRng();
  afterRng.setStartAfter(brElm);
  afterRng.collapse(true);
  if (!hasRightSideContent(editor, afterRng, block)) {
    const extraBr = dom.create('br');
    dom.insertAfter(extraBr, brElm);
  }
  const caret = dom.createRng();
  caret.setStartAfter(brElm);
  caret.collapse(true);
  selection.setRng(caret);
  selection.scrollIntoView(brElm);
};

const trimLeadingLineBreaks = (node: Node): void => {
  let current: Node | null = node;
  while (current) {
    const first: Node | null = current.firstChild;
    if (first && NodeType.isBr(first) && first.nextSibling && !NodeType.isBr(first.nextSibling)) {
      // A leading br in the new block would render as an empty line; TinyMCE removes it.
      current.removeChild(first);
      break;
    }
    current = first;
  }
};

const removeIds = (root: Element): void => {
  root.removeAttribute('id');
  root.querySelectorAll('[id]').forEach((el) => {
    if (!NodeType.isBookmarkNode(el)) {
      el.removeAttribute('id');
    }
  });
};

/** Creates a new block, cloning inline formatting around the caret when keep_styles is on. */
const createNewBlock = (editor: Editor, parentBlock: HTMLElement, rng: Range, name?: string): { block: HTMLElement; caretNode: HTMLElement } => {
  const dom = editor.dom;
  const textInlineElements = editor.schema.getTextInlineElements();
  const body = editor.getBody();
  let block: HTMLElement;
  if (name || parentBlock.nodeName === 'TABLE' || parentBlock.nodeName === 'HR') {
    block = dom.create(name || (editor.options.get('forced_root_block') as string));
  } else {
    block = parentBlock.cloneNode(false) as HTMLElement;
  }
  let caretNode: HTMLElement = block;
  if (editor.options.get('keep_styles') !== false) {
    let node: Node | null = rng.startContainer;
    if (NodeType.isElement(node) && node.childNodes[rng.startOffset]) {
      node = node.childNodes[rng.startOffset];
    }
    let clonedChain: HTMLElement | null = null;
    while (node && node !== parentBlock && node !== body) {
      if (NodeType.isElement(node) && textInlineElements[node.nodeName.toLowerCase()] && !NodeType.isBookmarkNode(node) && !NodeType.isCaretContainer(node)) {
        const clone = node.cloneNode(false) as HTMLElement;
        clone.removeAttribute('id');
        if (clonedChain) {
          clone.appendChild(clonedChain);
        } else {
          caretNode = clone;
        }
        clonedChain = clone;
      }
      node = node.parentNode;
    }
    if (clonedChain) {
      block.appendChild(clonedChain);
    }
  }
  caretNode.innerHTML = '<br data-mce-bogus="1">';
  return { block, caretNode };
};

const moveToCaretPosition = (editor: Editor, root: HTMLElement): void => {
  CaretUtils.moveCaretToStart(editor, root);
};

const canSplitBlock = (editor: Editor, node: HTMLElement | null): boolean =>
  !!node && NodeType.isElement(node) && editor.dom.isBlock(node) && !/^(TD|TH|CAPTION|FORM)$/.test(node.nodeName) && !/^(fixed|absolute)/i.test(node.style.position) && editor.dom.getContentEditable(node) !== 'true';

const shouldEndContainer = (editor: Editor, container: HTMLElement | null): boolean => {
  const setting = editor.options.get('end_container_on_empty_block') as boolean | string;
  if (!container) {
    return false;
  }
  if (typeof setting === 'string') {
    return setting.split(/[ ,]+/).map((s) => s.trim().toUpperCase()).includes(container.nodeName);
  }
  return !!setting;
};

/** Enter inside a list item. */
const handleListItem = (editor: Editor, li: HTMLElement, rng: Range): void => {
  const dom = editor.dom;
  const list = li.parentNode as HTMLElement;
  if (isEmptyDom(editor.schema, li, undefined, { includeNbsp: true })) {
    const parentLi = list.parentNode && NodeType.isListItem(list.parentNode) ? (list.parentNode as HTMLElement) : null;
    if (parentLi) {
      // Nested empty item: outdent to the parent list.
      const after = li.nextSibling;
      list.removeChild(li);
      parentLi.parentNode?.insertBefore(li, parentLi.nextSibling);
      if (after) {
        // Trailing siblings stay in a nested list inside the moved item.
        const newList = list.cloneNode(false) as HTMLElement;
        while (after.parentNode === list) {
          const n = list.childNodes[Array.prototype.indexOf.call(list.childNodes, after)];
          if (!n) {
            break;
          }
          newList.appendChild(n);
        }
        if (newList.firstChild) {
          li.appendChild(newList);
        }
      }
      if (!list.firstChild) {
        dom.remove(list);
      }
      moveToCaretPosition(editor, li);
      return;
    }
    // Top level empty item: leave the list, inserting a paragraph after it (splitting if needed).
    const p = dom.create(editor.options.get('forced_root_block') as string, editor.options.get('forced_root_block_attrs') as Record<string, string>);
    CaretUtils.padBlock(editor, p);
    if (li.nextSibling) {
      const newList = dom.split(list, li) as HTMLElement | undefined;
      if (newList) {
        newList.parentNode?.replaceChild(p, newList);
      } else {
        dom.insertAfter(p, list);
      }
    } else {
      dom.insertAfter(p, list);
      dom.remove(li);
    }
    if (!list.firstChild) {
      dom.remove(list);
    }
    moveToCaretPosition(editor, p);
    return;
  }
  splitBlock(editor, li, rng);
};

/** Splits `parentBlock` at the caret: everything after the caret goes into a new block. */
const splitBlock = (editor: Editor, parentBlock: HTMLElement, rng: Range): void => {
  const dom = editor.dom;
  const schema = editor.schema;
  const atStart = CaretUtils.isAtStartOfBlock(editor, rng, parentBlock);
  const atEnd = CaretUtils.isAtEndOfBlock(editor, rng, parentBlock);
  const containerBlock = parentBlock.parentNode === editor.getBody() ? null : (CaretUtils.getBlock(editor, parentBlock.parentNode) as HTMLElement | null);
  const parentName = parentBlock.nodeName;
  let newBlock: HTMLElement;

  if (atEnd || (atStart && atEnd)) {
    if (/^(H[1-6]|PRE|FIGURE)$/.test(parentName) && containerBlock?.nodeName !== 'HGROUP') {
      newBlock = createNewBlock(editor, parentBlock, rng, editor.options.get('forced_root_block')).block;
    } else {
      newBlock = createNewBlock(editor, parentBlock, rng).block;
    }
    if (containerBlock && shouldEndContainer(editor, containerBlock) && canSplitBlock(editor, containerBlock) && isEmptyDom(schema, parentBlock, undefined, { includeNbsp: true })) {
      // Enter in an empty block at the end of a blockquote exits the blockquote.
      newBlock = dom.split(containerBlock, parentBlock) as HTMLElement;
      newBlock = dom.create(editor.options.get('forced_root_block') as string);
      CaretUtils.padBlock(editor, newBlock);
      parentBlock.parentNode?.replaceChild(newBlock, parentBlock);
      // Remove now-empty halves of the container.
      const body = editor.getBody();
      const prev = newBlock.previousSibling;
      const next = newBlock.nextSibling;
      if (prev && NodeType.isElement(prev) && prev !== body && isEmptyDom(schema, prev)) {
        dom.remove(prev);
      }
      if (next && NodeType.isElement(next) && next !== body && isEmptyDom(schema, next)) {
        dom.remove(next);
      }
    } else {
      dom.insertAfter(newBlock, parentBlock);
    }
    removeIds(newBlock);
    moveToCaretPosition(editor, newBlock);
  } else if (atStart) {
    newBlock = createNewBlock(editor, parentBlock, rng).block;
    parentBlock.parentNode?.insertBefore(newBlock, parentBlock);
    removeIds(newBlock);
    moveToCaretPosition(editor, parentBlock);
  } else {
    const tmpRng = rng.cloneRange();
    tmpRng.setEndAfter(parentBlock);
    const fragment = tmpRng.extractContents();
    trimLeadingLineBreaks(fragment);
    newBlock = fragment.firstChild as HTMLElement;
    dom.insertAfter(fragment, parentBlock);
    // Empty inline wrappers left on the left side of the new block are dropped.
    trimInlineElementsOnLeftSideOfBlock(editor, newBlock);
    if (isEmptyDom(schema, parentBlock)) {
      parentBlock.innerHTML = '';
      CaretUtils.padBlock(editor, parentBlock);
    } else {
      // Keep a trailing br so the line renders.
      const last = parentBlock.lastChild;
      if (last && NodeType.isBr(last) && !NodeType.isBogus(last)) {
        const extra = dom.create('br', { 'data-mce-bogus': '1' });
        parentBlock.appendChild(extra);
      }
    }
    newBlock.normalize();
    removeIds(newBlock);
    if (isEmptyDom(schema, newBlock)) {
      newBlock.innerHTML = '';
      CaretUtils.padBlock(editor, newBlock);
    }
    moveToCaretPosition(editor, newBlock);
  }
};

const trimInlineElementsOnLeftSideOfBlock = (editor: Editor, block: HTMLElement): void => {
  const nonEmpty = editor.schema.getNonEmptyElements();
  let node: Node | null = block;
  const firstChilds: Node[] = [];
  while ((node = node.firstChild)) {
    if (editor.dom.isBlock(node)) {
      return;
    }
    if (NodeType.isElement(node) && !nonEmpty[node.nodeName.toLowerCase()]) {
      firstChilds.push(node);
    }
  }
  let i = firstChilds.length;
  while (i--) {
    const child = firstChilds[i];
    if (!child.hasChildNodes() || (child.firstChild === child.lastChild && NodeType.isText(child.firstChild) && child.firstChild.data === '')) {
      editor.dom.remove(child);
    } else {
      // Also remove a leading bookmark-less empty text.
      break;
    }
  }
};

const isInPre = (block: HTMLElement | null): boolean => !!block && block.nodeName === 'PRE';

export const insertNewLine = (editor: Editor, evt: NewLineEvent = {}): void => {
  const dom = editor.dom;
  const selection = editor.selection;
  ensureRootBlock(editor);
  forceBlocks(editor);
  let rng = selection.getRng();
  if (!rng.collapsed) {
    editor.execCommand('Delete');
    rng = selection.getRng();
  }
  const body = editor.getBody();
  if (!body.contains(rng.startContainer)) {
    return;
  }
  const parentBlock = isCaretInsideBlock(editor, rng);
  const behavior = editor.options.get('newline_behavior') as string;
  let shift = !!evt.shiftKey;
  if (behavior === 'invert') {
    shift = !shift;
  }
  if (behavior === 'linebreak' || shift) {
    insertBr(editor);
    return;
  }
  if (!parentBlock) {
    insertBr(editor);
    return;
  }
  const noNewline = editor.options.get('no_newline_selector') as string;
  if (noNewline && dom.is(parentBlock, noNewline)) {
    return;
  }
  const brSelector = editor.options.get('br_newline_selector') as string;
  if (brSelector && dom.is(parentBlock, brSelector)) {
    insertBr(editor);
    return;
  }
  if (isInPre(parentBlock) && editor.options.get('br_in_pre') !== false) {
    insertBr(editor);
    return;
  }
  const parentBlockName = parentBlock.nodeName;
  if (/^(TD|TH|CAPTION)$/.test(parentBlockName)) {
    // Wrap the cell content into root blocks, then split.
    const blockName = editor.options.get('forced_root_block') as string;
    const bookmark = selection.getBookmark(1);
    const wrapper = dom.create(blockName);
    while (parentBlock.firstChild) {
      wrapper.appendChild(parentBlock.firstChild);
    }
    parentBlock.appendChild(wrapper);
    selection.moveToBookmark(bookmark);
    rng = selection.getRng();
    splitBlock(editor, wrapper, rng);
    return;
  }
  if (parentBlockName === 'LI') {
    handleListItem(editor, parentBlock, rng);
    editor.dispatch('NewBlock', { newBlock: CaretUtils.getTextBlock(editor, selection.getRng().startContainer) });
    return;
  }
  if (dom.getContentEditable(parentBlock) === 'false') {
    return;
  }
  splitBlock(editor, parentBlock, rng);
  editor.dispatch('NewBlock', { newBlock: CaretUtils.getTextBlock(editor, selection.getRng().startContainer) });
};
