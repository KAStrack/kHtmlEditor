import type { Editor } from '../../core/Editor';
import * as NodeType from '../../dom/NodeType';

/**
 * Flat "entry" model of a list (port of TinyMCE's lists plugin approach): every list item becomes
 * an entry with a depth, its own content nodes and the attributes of its item and parent list.
 * Indent/outdent mutate depths; `composeList` rebuilds the nested DOM from the entries.
 */
export type ListType = 'ul' | 'ol' | 'dl';

export interface Entry {
  depth: number;
  dirty: boolean;
  content: Node[];
  itemAttributes: Record<string, string>;
  listAttributes: Record<string, string>;
  listType: ListType;
  isSelected: boolean;
  isInPreviousLi?: boolean;
  /** Content fragments (non-li children of a list, e.g. comments) carried along. */
  isFragment?: boolean;
}

const attrsOf = (el: Element): Record<string, string> => {
  const out: Record<string, string> = {};
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i];
    if (a.name !== 'data-mce-selected') {
      out[a.name] = a.value;
    }
  }
  return out;
};

const isListNode = (n: Node | null): n is HTMLElement => NodeType.isElement(n) && /^(UL|OL|DL)$/.test(n.nodeName);
const isItemNode = (n: Node | null): n is HTMLElement => NodeType.isElement(n) && /^(LI|DT|DD)$/.test(n.nodeName);

const listTypeOf = (list: Element): ListType => list.nodeName.toLowerCase() as ListType;

/** Parses a list element into entries (depth first). */
export const parseLists = (lists: Element[], selectedItems: Set<Element>): Entry[] => {
  const entries: Entry[] = [];
  const parseItem = (item: Element, depth: number, list: Element) => {
    const content: Node[] = [];
    const nested: Element[] = [];
    Array.from(item.childNodes).forEach((child) => {
      if (isListNode(child)) {
        nested.push(child);
      } else {
        content.push(child);
      }
    });
    entries.push({
      depth,
      dirty: false,
      content,
      itemAttributes: attrsOf(item),
      listAttributes: attrsOf(list),
      listType: listTypeOf(list),
      isSelected: selectedItems.has(item),
    });
    nested.forEach((l) => parseList(l, depth + 1));
  };
  const parseList = (list: Element, depth: number) => {
    Array.from(list.childNodes).forEach((child) => {
      if (isItemNode(child)) {
        parseItem(child, depth, list);
      } else if (isListNode(child)) {
        // A list directly inside a list (invalid but common): treat as nested under previous entry.
        parseList(child, depth + 1);
      } else if (!(NodeType.isText(child) && NodeType.isWhitespaceText(child.data))) {
        // Keep stray content as a fragment at this depth.
        entries.push({ depth, dirty: false, content: [child], itemAttributes: {}, listAttributes: attrsOf(list), listType: listTypeOf(list), isSelected: false, isFragment: true });
      }
    });
  };
  lists.forEach((l) => parseList(l, 1));
  return entries;
};

/** Normalises depths so no entry is deeper than the previous entry + 1. */
export const normalizeEntries = (entries: Entry[]): Entry[] => {
  entries.forEach((entry, index) => {
    const prev = entries[index - 1];
    if (prev && entry.depth > prev.depth + 1) {
      entry.depth = prev.depth + 1;
    } else if (!prev && entry.depth > 1) {
      entry.depth = 1;
    }
  });
  return entries;
};

/** Rebuilds nested list elements from entries. Returns the root-level nodes. */
export const composeList = (editor: Editor, entries: Entry[]): Node[] => {
  const dom = editor.dom;
  const roots: Node[] = [];
  const stack: Array<{ list: HTMLElement; item: HTMLElement | null; depth: number; listType: ListType }> = [];

  const createList = (entry: Entry): HTMLElement => {
    const list = dom.create(entry.listType);
    Object.keys(entry.listAttributes).forEach((k) => list.setAttribute(k, entry.listAttributes[k]));
    return list;
  };
  const createItem = (entry: Entry): HTMLElement => {
    const item = dom.create(entry.listType === 'dl' ? 'dd' : 'li');
    Object.keys(entry.itemAttributes).forEach((k) => item.setAttribute(k, entry.itemAttributes[k]));
    entry.content.forEach((n) => item.appendChild(n));
    if (!item.firstChild) {
      item.appendChild(dom.create('br', { 'data-mce-bogus': '1' }));
    }
    return item;
  };

  for (const entry of entries) {
    if (entry.depth === 0) {
      // Outdented out of the list entirely: becomes a block at the root.
      stack.length = 0;
      const block = dom.create(editor.options.get('forced_root_block') as string);
      entry.content.forEach((n) => block.appendChild(n));
      if (!block.firstChild) {
        block.appendChild(dom.create('br', { 'data-mce-bogus': '1' }));
      }
      roots.push(block);
      continue;
    }
    // Pop deeper levels.
    while (stack.length && stack[stack.length - 1].depth > entry.depth) {
      stack.pop();
    }
    const top = stack[stack.length - 1];
    if (!top || top.depth < entry.depth) {
      // New (nested) list.
      const list = createList(entry);
      if (top && top.item) {
        top.item.appendChild(list);
      } else if (top && !top.item) {
        top.list.appendChild(list);
      } else {
        roots.push(list);
      }
      stack.push({ list, item: null, depth: entry.depth, listType: entry.listType });
    } else if (top.listType !== entry.listType && !entry.isFragment) {
      // Same depth but a different list type: start a sibling list.
      stack.pop();
      const parent = stack[stack.length - 1];
      const list = createList(entry);
      if (parent && parent.item) {
        parent.item.appendChild(list);
      } else {
        roots.push(list);
      }
      stack.push({ list, item: null, depth: entry.depth, listType: entry.listType });
    }
    const current = stack[stack.length - 1];
    if (entry.isFragment) {
      entry.content.forEach((n) => current.list.appendChild(n));
      continue;
    }
    const item = createItem(entry);
    current.list.appendChild(item);
    current.item = item;
  }
  return roots;
};

/** Returns the outermost list containing the node, or null. */
export const getRootList = (editor: Editor, node: Node | null): HTMLElement | null => {
  const body = editor.getBody();
  let found: HTMLElement | null = null;
  let cur: Node | null = node;
  while (cur && cur !== body) {
    if (isListNode(cur)) {
      found = cur;
    }
    if (NodeType.isElement(cur) && NodeType.isTableCell(cur)) {
      break;
    }
    cur = cur.parentNode;
  }
  return found;
};

export const getClosestList = (editor: Editor, node: Node | null): HTMLElement | null => editor.dom.getParent(node, (n) => isListNode(n), editor.getBody()) as HTMLElement | null;
export const getClosestItem = (editor: Editor, node: Node | null): HTMLElement | null => editor.dom.getParent(node, (n) => isItemNode(n), editor.getBody()) as HTMLElement | null;

/** All list items touched by the current selection. */
export const getSelectedListItems = (editor: Editor): HTMLElement[] => {
  const rng = editor.selection.getRng();
  const body = editor.getBody();
  const startItem = getClosestItem(editor, rng.startContainer);
  const endItem = getClosestItem(editor, rng.endContainer);
  if (!startItem || !endItem) {
    return [];
  }
  if (startItem === endItem) {
    return [startItem];
  }
  const items: HTMLElement[] = [];
  const walker = editor.getDoc().createTreeWalker(body, 1);
  let node = walker.nextNode() as HTMLElement | null;
  let inRange = false;
  while (node) {
    if (node === startItem) {
      inRange = true;
    }
    if (inRange && isItemNode(node) && rng.intersectsNode(node)) {
      items.push(node);
    }
    if (node === endItem) {
      break;
    }
    node = walker.nextNode() as HTMLElement | null;
  }
  return items;
};

export { isListNode, isItemNode };
