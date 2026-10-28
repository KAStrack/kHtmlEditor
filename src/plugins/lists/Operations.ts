import type { Editor } from '../../core/Editor';
import * as NodeType from '../../dom/NodeType';
import * as CaretUtils from '../../dom/CaretUtils';
import { isEmptyDom } from '../../dom/DOMUtils';
import { parseLists, normalizeEntries, composeList, getRootList, getClosestList, getClosestItem, getSelectedListItems, isListNode, isItemNode, ListType, Entry } from './Entries';

/** List operations: toggle, change type, indent, outdent, update attributes. */

const textBlockSelector = 'p,h1,h2,h3,h4,h5,h6,div,address,pre,blockquote';

const withBookmark = (editor: Editor, action: () => void): void => {
  const bookmark = editor.selection.getBookmark(1);
  action();
  editor.selection.moveToBookmark(bookmark);
  editor.nodeChanged();
};

/** Rebuilds the root lists containing the selection from a transformed entry list. */
const transformSelectedLists = (editor: Editor, transform: (entries: Entry[]) => Entry[]): boolean => {
  const items = getSelectedListItems(editor);
  if (items.length === 0) {
    return false;
  }
  const rootLists: HTMLElement[] = [];
  items.forEach((item) => {
    const root = getRootList(editor, item);
    if (root && !rootLists.includes(root)) {
      rootLists.push(root);
    }
  });
  withBookmark(editor, () => {
    for (const root of rootLists) {
      const entries = parseLists([root], new Set(items));
      const transformed = normalizeEntries(transform(entries));
      const nodes = composeList(editor, transformed);
      const parent = root.parentNode as Node;
      nodes.forEach((n) => parent.insertBefore(n, root));
      parent.removeChild(root);
      mergeAdjacentLists(editor, nodes);
    }
  });
  return true;
};

/** Merges sibling lists of the same type produced by composition. */
const mergeAdjacentLists = (editor: Editor, nodes: Node[]): void => {
  for (const node of nodes) {
    if (!isListNode(node) || !node.parentNode) {
      continue;
    }
    const prev = node.previousSibling;
    if (prev && isListNode(prev) && prev.nodeName === node.nodeName && sameAttrs(prev, node)) {
      while (node.firstChild) {
        prev.appendChild(node.firstChild);
      }
      node.parentNode.removeChild(node);
      continue;
    }
    const next = node.nextSibling;
    if (next && isListNode(next) && next.nodeName === node.nodeName && sameAttrs(next, node)) {
      while (next.firstChild) {
        node.appendChild(next.firstChild);
      }
      next.parentNode?.removeChild(next);
    }
  }
  void editor;
};

const sameAttrs = (a: Element, b: Element): boolean => {
  const style = (el: Element) => (el.getAttribute('style') || '').replace(/\s/g, '');
  return a.getAttribute('class') === b.getAttribute('class') && style(a) === style(b) && a.getAttribute('start') === b.getAttribute('start');
};

export const indentSelection = (editor: Editor): boolean =>
  transformSelectedLists(editor, (entries) => {
    entries.forEach((e, i) => {
      if (e.isSelected) {
        const prev = entries[i - 1];
        // Cannot indent the first item of a level beyond its predecessor's depth + 1.
        if (prev && e.depth <= prev.depth) {
          e.depth++;
          e.dirty = true;
        } else if (prev && prev.isSelected && prev.dirty) {
          e.depth++;
          e.dirty = true;
        }
      }
    });
    return entries;
  });

export const outdentSelection = (editor: Editor): boolean =>
  transformSelectedLists(editor, (entries) => {
    entries.forEach((e, i) => {
      if (e.isSelected) {
        e.depth--;
        e.dirty = true;
        // Following unselected deeper entries move with their parent.
        for (let j = i + 1; j < entries.length && entries[j].depth > e.depth + 1 && !entries[j].isSelected; j++) {
          entries[j].depth--;
        }
      }
    });
    return entries;
  });

/** Removes the selected items from their list (converting them to paragraphs). */
export const removeList = (editor: Editor): boolean =>
  transformSelectedLists(editor, (entries) => {
    entries.forEach((e) => {
      if (e.isSelected) {
        e.depth = 0;
      }
    });
    // Entries that follow an outdented one at depth>0 stay nested lists under... keep depth, composeList handles.
    return entries;
  });

const switchListType = (editor: Editor, listType: ListType, detail?: Record<string, string>): boolean =>
  transformSelectedLists(editor, (entries) => {
    const selectedDepths = new Set(entries.filter((e) => e.isSelected).map((e) => e.depth));
    entries.forEach((e) => {
      // Change the type of the whole list level(s) that hold selected items.
      if (selectedDepths.has(e.depth)) {
        e.listType = listType;
        e.listAttributes = { ...(detail || {}) };
      }
    });
    return entries;
  });

const getSelectedBlocksForList = (editor: Editor): HTMLElement[] => {
  const blocks = editor.selection.getSelectedBlocks().filter((b) => editor.dom.is(b, textBlockSelector) || NodeType.isTableCell(b) || b === editor.getBody()) as HTMLElement[];
  if (blocks.length === 0) {
    const block = CaretUtils.getTextBlock(editor, editor.selection.getStart());
    return block ? [block] : [];
  }
  // Skip blocks that contain other selected blocks (e.g. blockquote wrappers) and cells.
  return blocks.filter((b) => !blocks.some((o) => o !== b && b.contains(o)));
};

/** Wraps the selected blocks into a new list (merging consecutive siblings into one list). */
const applyList = (editor: Editor, listType: ListType, detail?: Record<string, string>): void => {
  const dom = editor.dom;
  const blocks = getSelectedBlocksForList(editor);
  if (blocks.length === 0) {
    return;
  }
  withBookmark(editor, () => {
    let currentList: HTMLElement | null = null;
    let lastBlock: HTMLElement | null = null;
    for (const rawBlock of blocks) {
      const block: HTMLElement = rawBlock;
      if (/^(TD|TH)$/.test(block.nodeName) || block === editor.getBody()) {
        // Wrap the cell/body inline content in a list item.
        const li = dom.create('li');
        while (block.firstChild) {
          li.appendChild(block.firstChild);
        }
        const list = dom.create(listType, detail ?? null);
        list.appendChild(li);
        block.appendChild(list);
        continue;
      }
      const li = dom.create('li');
      // Headings keep their formatting inside the item? TinyMCE converts the block to a plain li.
      while (block.firstChild) {
        li.appendChild(block.firstChild);
      }
      if (block.hasAttribute('style') && block.nodeName === 'P') {
        li.setAttribute('style', block.getAttribute('style') as string);
      }
      const continuous = currentList && lastBlock && block.previousSibling === lastBlock && block.parentNode === lastBlock.parentNode;
      if (continuous && currentList) {
        currentList.appendChild(li);
        dom.remove(block);
      } else {
        const list = dom.create(listType, detail ?? null);
        list.appendChild(li);
        block.parentNode?.replaceChild(list, block);
        currentList = list;
        // Merge with an adjacent list of the same type before it.
        const prev = list.previousSibling;
        if (prev && isListNode(prev) && prev.nodeName === list.nodeName && !detail) {
          while (list.firstChild) {
            prev.appendChild(list.firstChild);
          }
          list.remove();
          currentList = prev as HTMLElement;
        }
        lastBlock = currentList;
        continue;
      }
      lastBlock = currentList;
    }
    if (currentList) {
      const next = currentList.nextSibling;
      if (next && isListNode(next) && next.nodeName === currentList.nodeName && !detail) {
        while (next.firstChild) {
          currentList.appendChild(next.firstChild);
        }
        next.remove();
      }
    }
  });
};

export const toggleList = (editor: Editor, listType: ListType, detail?: Record<string, string>): void => {
  const start = editor.selection.getStart();
  const list = getClosestList(editor, start);
  if (list) {
    if (list.nodeName.toLowerCase() === listType) {
      if (detail) {
        updateList(editor, detail);
      } else {
        removeList(editor);
      }
    } else {
      switchListType(editor, listType, detail);
    }
  } else {
    applyList(editor, listType, detail);
  }
  editor.undoManager.add();
};

/** Updates attributes/styles on the closest list (list-style-type, start…). */
export const updateList = (editor: Editor, detail: Record<string, any>): void => {
  const list = getClosestList(editor, editor.selection.getStart());
  if (!list) {
    return;
  }
  const dom = editor.dom;
  Object.keys(detail).forEach((key) => {
    const value = detail[key];
    if (key === 'list-style-type' || key === 'listStyleType') {
      if (!value || value === 'default') {
        dom.setStyle(list, 'list-style-type', '');
      } else {
        dom.setStyle(list, 'list-style-type', String(value));
      }
    } else if (key === 'list-attributes' && typeof value === 'object') {
      Object.keys(value).forEach((k) => dom.setAttrib(list, k, value[k]));
    } else if (key === 'list-item-attributes' && typeof value === 'object') {
      Array.from(list.children).forEach((li) => Object.keys(value).forEach((k) => dom.setAttrib(li, k, value[k])));
    } else {
      dom.setAttrib(list, key, value === null || value === undefined ? null : String(value));
    }
  });
  if (!list.getAttribute('style')) {
    list.removeAttribute('style');
    list.removeAttribute('data-mce-style');
  }
  editor.nodeChanged();
};

export const isInList = (editor: Editor, listType?: ListType): boolean => {
  const list = getClosestList(editor, editor.selection.getStart());
  return !!list && (!listType || list.nodeName.toLowerCase() === listType);
};

export const canIndent = (editor: Editor): boolean => {
  const item = getClosestItem(editor, editor.selection.getStart());
  if (!item) {
    return false;
  }
  return !!item.previousElementSibling && isItemNode(item.previousElementSibling);
};

export const canOutdent = (editor: Editor): boolean => !!getClosestItem(editor, editor.selection.getStart());

export const isEmptyItem = (editor: Editor, item: HTMLElement): boolean => isEmptyDom(editor.schema, item, undefined, { includeNbsp: true });
