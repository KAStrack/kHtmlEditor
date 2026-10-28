import type { DOMUtils } from '../dom/DOMUtils';
import * as NodeType from '../dom/NodeType';

/**
 * Selection bookmarks. Four kinds:
 *  - range bookmark   : clones the live Range (same tick, no DOM mutation)
 *  - path bookmark    : index paths relative to the root, survives serialisation (undo levels)
 *  - id bookmark      : marker spans inserted in the DOM, survives arbitrary rewrites
 *  - node bookmark    : a single selected node (images, tables…)
 */
export interface RangeBookmark {
  rng: Range;
}
export interface PathBookmark {
  start: number[];
  end?: number[];
  isFakeCaret?: boolean;
  forward?: boolean;
}
export interface IdBookmark {
  id: string;
  keep?: boolean;
  forward?: boolean;
}
export interface IndexBookmark {
  name: string;
  index: number;
}
export type Bookmark = RangeBookmark | PathBookmark | IdBookmark | IndexBookmark;

export const isRangeBookmark = (b: Bookmark): b is RangeBookmark => Object.prototype.hasOwnProperty.call(b, 'rng');
export const isPathBookmark = (b: Bookmark): b is PathBookmark => Object.prototype.hasOwnProperty.call(b, 'start');
export const isIdBookmark = (b: Bookmark): b is IdBookmark => Object.prototype.hasOwnProperty.call(b, 'id');
export const isIndexBookmark = (b: Bookmark): b is IndexBookmark => Object.prototype.hasOwnProperty.call(b, 'name');

const skipNode = (n: Node): boolean => NodeType.isBogus(n) || NodeType.isBookmarkNode(n) || NodeType.isZwspText(n);

/** Computes the path (child indexes) from root to the position, normalising adjacent text nodes. */
const getPoint = (root: Node, container: Node, offset: number, normalized: boolean): number[] => {
  const point: number[] = [];
  let node: Node | null = container;
  let off = offset;

  if (NodeType.isText(node)) {
    // Merge offsets of preceding text siblings (as the serialiser would normalise them).
    let prev = node.previousSibling;
    while (normalized && prev && NodeType.isText(prev)) {
      off += prev.data.length;
      prev = prev.previousSibling;
    }
    point.push(off);
  } else {
    // Element container: offset is a child index; count only non-skipped children, merging text runs.
    let idx = 0;
    const children = node.childNodes;
    let lastWasText = false;
    for (let i = 0; i < off && i < children.length; i++) {
      const child = children[i];
      if (skipNode(child)) {
        continue;
      }
      if (normalized && NodeType.isText(child) && lastWasText) {
        continue;
      }
      idx++;
      lastWasText = NodeType.isText(child);
    }
    point.push(idx);
  }

  for (; node && node !== root; node = node.parentNode) {
    let idx = 0;
    let lastWasText = false;
    for (let s: Node | null = node.previousSibling; s; s = s.previousSibling) {
      if (skipNode(s)) {
        continue;
      }
      if (normalized && NodeType.isText(s) && lastWasText) {
        continue;
      }
      // Normalised text merging: a text sibling of a text node collapses.
      if (normalized && NodeType.isText(s) && NodeType.isText(node) && s.nextSibling === node) {
        continue;
      }
      idx++;
      lastWasText = NodeType.isText(s);
    }
    point.push(idx);
  }
  return point;
};

export const getPathBookmark = (root: Node, rng: Range, normalized: boolean = true): PathBookmark => {
  const forward = true;
  return {
    start: getPoint(root, rng.startContainer, rng.startOffset, normalized),
    end: getPoint(root, rng.endContainer, rng.endOffset, normalized),
    forward,
  };
};

/** Resolves a path back to a (container, offset). Tolerates missing nodes by clamping. */
const resolvePoint = (root: Node, point: number[]): { node: Node; offset: number } | null => {
  let node: Node = root;
  const path = point.slice();
  const offset = path.shift() as number;
  for (let i = path.length - 1; i >= 0; i--) {
    const wanted = path[i];
    let idx = 0;
    let found: Node | null = null;
    let lastWasText = false;
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (skipNode(c)) {
        continue;
      }
      if (NodeType.isText(c) && lastWasText) {
        continue;
      }
      if (idx === wanted) {
        found = c;
        break;
      }
      idx++;
      lastWasText = NodeType.isText(c);
    }
    if (!found) {
      return null;
    }
    node = found;
  }
  if (NodeType.isText(node)) {
    // Offset may span merged text siblings.
    let off = offset;
    let cur: Node | null = node;
    while (cur && NodeType.isText(cur) && off > cur.data.length) {
      const next: Node | null = cur.nextSibling;
      if (next && NodeType.isText(next)) {
        off -= cur.data.length;
        cur = next;
      } else {
        off = cur.data.length;
        break;
      }
    }
    return { node: cur as Node, offset: Math.max(0, Math.min(off, (cur as Text).data.length)) };
  }
  // Element: map normalised child index back to a real child index.
  let idx = 0;
  let realIndex = 0;
  let lastWasText = false;
  for (let c = node.firstChild; c; c = c.nextSibling, realIndex++) {
    if (skipNode(c)) {
      continue;
    }
    if (NodeType.isText(c) && lastWasText) {
      continue;
    }
    if (idx === offset) {
      return { node, offset: realIndex };
    }
    idx++;
    lastWasText = NodeType.isText(c);
  }
  return { node, offset: node.childNodes.length };
};

export const resolvePathBookmark = (root: Node, bookmark: PathBookmark): Range | null => {
  const doc = root.ownerDocument as Document;
  const start = resolvePoint(root, bookmark.start);
  if (!start) {
    return null;
  }
  const end = bookmark.end ? resolvePoint(root, bookmark.end) : start;
  const rng = doc.createRange();
  try {
    rng.setStart(start.node, start.offset);
    rng.setEnd((end ?? start).node, (end ?? start).offset);
  } catch {
    return null;
  }
  return rng;
};

const createBookmarkSpan = (dom: DOMUtils, id: string, filled: boolean): HTMLElement => {
  const attrs = { 'data-mce-type': 'bookmark', id, style: 'overflow:hidden;line-height:0px' };
  return filled ? dom.create('span', attrs, '&#xFEFF;') : dom.create('span', attrs);
};

export const getIdBookmark = (dom: DOMUtils, rng: Range, filled: boolean = false): IdBookmark => {
  const id = dom.uniqueId('mce_');
  const collapsed = rng.collapsed;
  const range = rng.cloneRange();
  const doc = dom.doc;

  if (!collapsed) {
    const endRng = range.cloneRange();
    endRng.collapse(false);
    const endSpan = createBookmarkSpan(dom, id + '_end', filled);
    insertAt(doc, endRng, endSpan);
  }
  const startRng = range.cloneRange();
  startRng.collapse(true);
  const startSpan = createBookmarkSpan(dom, id + '_start', filled);
  insertAt(doc, startRng, startSpan);
  return { id, keep: false, forward: true };
};

const insertAt = (doc: Document, rng: Range, node: Node): void => {
  const container = rng.startContainer;
  const offset = rng.startOffset;
  if (NodeType.isText(container)) {
    const text = container;
    if (offset === 0) {
      text.parentNode?.insertBefore(node, text);
    } else if (offset >= text.data.length) {
      text.parentNode?.insertBefore(node, text.nextSibling);
    } else {
      const after = text.splitText(offset);
      after.parentNode?.insertBefore(node, after);
    }
  } else {
    const ref = container.childNodes[offset] || null;
    container.insertBefore(node, ref);
  }
  void doc;
};

const removeAndKeepRange = (root: Node, id: string): { start?: { node: Node; offset: number }; end?: { node: Node; offset: number } } => {
  const result: { start?: { node: Node; offset: number }; end?: { node: Node; offset: number } } = {};
  const resolve = (suffix: string) => {
    const el = (root as Element).querySelector ? (root as Element).querySelector('#' + cssEscape(id + suffix)) : null;
    if (!el) {
      return undefined;
    }
    const parent = el.parentNode as Node;
    let index = 0;
    for (let c = parent.firstChild; c && c !== el; c = c.nextSibling) {
      index++;
    }
    parent.removeChild(el);
    // Merge split text nodes around the marker, pointing into the merged text.
    const before = parent.childNodes[index - 1];
    const after = parent.childNodes[index];
    if (before && after && NodeType.isText(before) && NodeType.isText(after)) {
      const offset = before.data.length;
      before.data += after.data;
      parent.removeChild(after);
      return { node: before as Node, offset };
    }
    if (before && NodeType.isText(before)) {
      return { node: before as Node, offset: before.data.length };
    }
    if (after && NodeType.isText(after)) {
      return { node: after as Node, offset: 0 };
    }
    return { node: parent, offset: index };
  };
  result.start = resolve('_start');
  result.end = resolve('_end');
  return result;
};

const cssEscape = (s: string): string => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/([^\w-])/g, '\\$1'));

export const resolveIdBookmark = (root: Node, bookmark: IdBookmark): Range | null => {
  const doc = root.ownerDocument as Document;
  const points = removeAndKeepRange(root, bookmark.id);
  if (!points.start) {
    return null;
  }
  const rng = doc.createRange();
  rng.setStart(points.start.node, points.start.offset);
  const end = points.end ?? points.start;
  rng.setEnd(end.node, end.offset);
  return rng;
};

export const getIndexBookmark = (root: Node, node: Node): IndexBookmark | null => {
  const name = node.nodeName;
  const all = (root as Element).getElementsByTagName(name);
  for (let i = 0; i < all.length; i++) {
    if (all[i] === node) {
      return { name, index: i };
    }
  }
  return null;
};

export const resolveIndexBookmark = (root: Node, bookmark: IndexBookmark): Range | null => {
  const all = (root as Element).getElementsByTagName(bookmark.name);
  const node = all[bookmark.index];
  if (!node) {
    return null;
  }
  const rng = (root.ownerDocument as Document).createRange();
  rng.selectNode(node);
  return rng;
};
