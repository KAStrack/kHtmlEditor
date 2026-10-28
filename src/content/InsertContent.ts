import type { Editor } from '../core/Editor';
import * as NodeType from '../dom/NodeType';
import { isEmptyDom } from '../dom/DOMUtils';

/**
 * Inserts HTML at the caret (`editor.insertContent` / `mceInsertContent`), splitting the current
 * block when block level content is inserted and merging lists into lists.
 */
export interface InsertContentDetails {
  paste?: boolean;
  merge?: boolean;
  no_events?: boolean;
  [key: string]: any;
}

const isBlockFragment = (editor: Editor, frag: DocumentFragment): boolean => {
  for (let c = frag.firstChild; c; c = c.nextSibling) {
    if (NodeType.isElement(c) && editor.dom.isBlock(c)) {
      return true;
    }
  }
  return false;
};

const isListFragment = (frag: DocumentFragment): boolean => {
  let el: Node | null = frag.firstChild;
  while (el && NodeType.isText(el) && /^\s*$/.test(el.data)) {
    el = el.nextSibling;
  }
  if (!el || !NodeType.isList(el)) {
    return false;
  }
  for (let c: Node | null = el.nextSibling; c; c = c.nextSibling) {
    if (!(NodeType.isText(c) && /^\s*$/.test(c.data))) {
      return false;
    }
  }
  return true;
};

const placeCaretAfter = (editor: Editor, node: Node): void => {
  const dom = editor.dom;
  const rng = dom.createRng();
  if (NodeType.isElement(node) && dom.isBlock(node) && !NodeType.isTable(node) && !NodeType.isHr(node)) {
    const pos = editor.selection.lastEditablePosition(node);
    rng.setStart(pos.node, pos.offset);
  } else if (NodeType.isText(node)) {
    rng.setStart(node, node.data.length);
  } else {
    rng.setStartAfter(node);
  }
  rng.collapse(true);
  editor.selection.setRng(rng);
};

const removeEmptyBlock = (editor: Editor, block: Element | null): void => {
  if (block && block !== editor.getBody() && isEmptyDom(editor.schema, block) && !NodeType.isTableCell(block)) {
    editor.dom.remove(block);
  }
};

const insertListIntoList = (editor: Editor, frag: DocumentFragment, rng: Range): Node | null => {
  const dom = editor.dom;
  const li = dom.getParent(rng.startContainer, 'li', editor.getBody());
  if (!li) {
    return null;
  }
  const list = frag.querySelector('ul,ol') as HTMLElement;
  const items = Array.from(list.children).filter((c) => c.nodeName === 'LI');
  if (items.length === 0) {
    return null;
  }
  const liEmpty = isEmptyDom(editor.schema, li);
  let ref: Node = li;
  for (const item of items) {
    li.parentNode?.insertBefore(item, ref.nextSibling);
    ref = item;
  }
  if (liEmpty) {
    dom.remove(li);
  } else {
    // Merge the first inserted item into the current item when the caret was at its end.
    const marker = dom.create('span', { 'data-mce-type': 'bookmark' });
    rng.insertNode(marker);
    const atEnd = !marker.nextSibling || (marker.nextSibling && NodeType.isBr(marker.nextSibling) && !marker.nextSibling.nextSibling);
    dom.remove(marker);
    if (atEnd) {
      const first = items[0];
      while (first.firstChild) {
        li.appendChild(first.firstChild);
      }
      dom.remove(first);
      if (items.length === 1) {
        return li;
      }
    }
  }
  return ref;
};

/** Character directly before/after the caret within its block, or null at the block edge. */
const charAround = (editor: Editor, rng: Range, before: boolean): string | null => {
  const block = editor.dom.getParent(rng.startContainer, (n) => NodeType.isElement(n) && editor.dom.isBlock(n), editor.getBody()) ?? editor.getBody();
  const container = before ? rng.startContainer : rng.endContainer;
  const offset = before ? rng.startOffset : rng.endOffset;
  if (NodeType.isText(container)) {
    if (before && offset > 0) {
      return container.data.charAt(offset - 1);
    }
    if (!before && offset < container.data.length) {
      return container.data.charAt(offset);
    }
  }
  const walker = editor.getDoc().createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  walker.currentNode = NodeType.isText(container) ? container : container.childNodes[before ? Math.max(0, offset - 1) : offset] ?? container;
  let node: Node | null = walker.currentNode;
  // When the caret container is an element, start from the neighbouring child.
  if (!NodeType.isText(container)) {
    const child = container.childNodes[before ? offset - 1 : offset];
    if (!child) {
      node = before ? walker.previousNode() : walker.nextNode();
    } else {
      walker.currentNode = child;
      node = child;
      if (NodeType.isText(child)) {
        return before ? child.data.charAt(child.data.length - 1) || null : child.data.charAt(0) || null;
      }
      if (NodeType.isBr(child) || editor.dom.isBlock(child)) {
        return null;
      }
    }
  }
  while (node) {
    node = before ? walker.previousNode() : walker.nextNode();
    if (!node) {
      return null;
    }
    if (NodeType.isBr(node) || (NodeType.isElement(node) && editor.dom.isBlock(node))) {
      return null;
    }
    if (NodeType.isText(node) && node.data.length) {
      return before ? node.data.charAt(node.data.length - 1) : node.data.charAt(0);
    }
  }
  return null;
};

/**
 * The parser collapses leading/trailing spaces of inserted content; put them back as a space, or
 * as a non-breaking space where a plain one would collapse (TinyMCE trimOrPadLeftRight).
 */
const restoreEdgeSpaces = (editor: Editor, rng: Range, value: string, frag: DocumentFragment): void => {
  const doc = editor.getDoc();
  const isWs = (ch: string | null) => ch === null || /[\s\u00a0]/.test(ch);
  if (/^ /.test(value) && !/^\s*$/.test(value)) {
    const first = frag.firstChild;
    if (!(NodeType.isText(first) && /^[\s\u00a0]/.test(first.data))) {
      frag.insertBefore(doc.createTextNode(isWs(charAround(editor, rng, true)) ? '\u00a0' : ' '), frag.firstChild);
    }
  }
  if (/ $/.test(value) && !/^\s*$/.test(value)) {
    const last = frag.lastChild;
    if (!(NodeType.isText(last) && /[\s\u00a0]$/.test(last.data))) {
      frag.appendChild(doc.createTextNode(isWs(charAround(editor, rng, false)) ? '\u00a0' : ' '));
    }
  }
};

export const insertHtmlAtCaret = (editor: Editor, value: string, details: InsertContentDetails): void => {
  const dom = editor.dom;
  const selection = editor.selection;
  const body = editor.getBody();

  let rng = selection.getRng();
  if (!rng.collapsed) {
    rng.deleteContents();
    rng = selection.getRng();
  }
  if (!body.contains(rng.startContainer)) {
    const pos = selection.lastEditablePosition(body);
    rng = dom.createRng();
    rng.setStart(pos.node, pos.offset);
    rng.collapse(true);
  }

  // Parse in the context of the closest block so inline content stays inline.
  const contextNode = selection.getNode();
  const contextName = contextNode === body ? 'body' : contextNode.nodeName.toLowerCase();
  const args = { context: contextName === 'body' ? undefined : contextName, insert: true, selection: true, paste: details.paste } as any;
  let frag = editor.parser.parse(value, args);
  if (args.invalid) {
    // Content is not valid in this context: parse at root level and insert as blocks.
    frag = editor.parser.parse(value, { insert: true, selection: true, paste: details.paste });
  }
  frag = dom.doc.adoptNode(frag);
  if (!frag.firstChild) {
    return;
  }
  restoreEdgeSpaces(editor, rng, value, frag);

  // Lists pasted into lists merge their items.
  if (isListFragment(frag)) {
    const last = insertListIntoList(editor, frag, rng);
    if (last) {
      placeCaretAfter(editor, last);
      return;
    }
  }

  const parentBlock = dom.getParent(rng.startContainer, (n) => NodeType.isElement(n) && dom.isBlock(n) && !NodeType.isTableCell(n) && !NodeType.isListItem(n), body) as HTMLElement | null;
  const blockFragment = isBlockFragment(editor, frag);

  if (!blockFragment || !parentBlock) {
    // Inline insertion: drop a bogus br that the caret sits in front of.
    const lastNode = frag.lastChild as Node;
    const container = rng.startContainer;
    if (NodeType.isElement(container)) {
      const next = container.childNodes[rng.startOffset];
      if (next && NodeType.isBr(next) && next.hasAttribute('data-mce-bogus')) {
        dom.remove(next);
      }
    }
    rng.insertNode(frag);
    if (NodeType.isText(lastNode) && lastNode.parentNode) {
      lastNode.parentNode.normalize();
      // After normalize, lastNode may have merged; find position via a marker-free approach.
    }
    placeCaretAfter(editor, lastNode.parentNode ? lastNode : rng.endContainer);
    return;
  }

  // Block insertion: split the parent block at the caret and insert between the halves.
  const marker = dom.create('span', { 'data-mce-type': 'bookmark', id: '_khe_insert_marker' });
  rng.insertNode(marker);
  const wasEmpty = isEmptyDom(editor.schema, parentBlock, undefined, { isContent: (n) => n === marker ? false : false });
  let before: Element | null = null;
  let after: Element | null = null;
  if (wasEmpty) {
    parentBlock.parentNode?.insertBefore(marker, parentBlock);
    dom.remove(parentBlock);
  } else {
    dom.split(parentBlock, marker);
    before = marker.previousSibling as Element | null;
    after = marker.nextSibling as Element | null;
  }
  const lastNode = frag.lastChild as Node;
  marker.parentNode?.replaceChild(frag, marker);
  removeEmptyBlock(editor, before && NodeType.isElement(before) && dom.isBlock(before) ? before : null);
  removeEmptyBlock(editor, after && NodeType.isElement(after) && dom.isBlock(after) ? after : null);
  placeCaretAfter(editor, lastNode);
};

export const insertContent = (editor: Editor, value: string, details: InsertContentDetails = {}): void => {
  const args = { ...details, content: value, format: 'html', set: true, selection: true, paste: details.paste };
  const evt = details.no_events ? (args as any) : editor.dispatch('BeforeSetContent', args);
  if (evt.isDefaultPrevented && evt.isDefaultPrevented()) {
    editor.dispatch('SetContent', evt);
    return;
  }
  insertHtmlAtCaret(editor, evt.content, details);
  if (!details.no_events) {
    editor.dispatch('SetContent', evt);
  }
  editor.addVisual();
  editor.nodeChanged();
};
