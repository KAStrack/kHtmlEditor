import type { Editor } from '../../core/Editor';
import * as NodeType from '../../dom/NodeType';

/**
 * Finds text across the text nodes of each block and wraps matches in bogus marker spans
 * (`span.mce-match-marker[data-mce-index]`), the way TinyMCE's searchreplace does.
 */
export const MARKER_CLASS = 'mce-match-marker';
export const SELECTED_CLASS = 'mce-match-marker-selected';

interface Run {
  node: Text;
  start: number;
  end: number;
}

const isBlockBoundary = (editor: Editor, node: Node): boolean => NodeType.isElement(node) && (editor.dom.isBlock(node) || /^(BR|TD|TH|LI|CAPTION|FIGCAPTION)$/.test((node as Element).nodeName));

/** Groups text nodes into runs separated by block boundaries. */
const collectRuns = (editor: Editor, root: Node, rng: Range | null): Run[][] => {
  const doc = editor.getDoc();
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => {
      if (NodeType.isElement(n) && (n.hasAttribute('data-mce-bogus') && n.getAttribute('data-mce-bogus') === 'all')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const groups: Run[][] = [];
  let current: Run[] = [];
  let pos = 0;
  const flush = () => {
    if (current.length) {
      groups.push(current);
    }
    current = [];
    pos = 0;
  };
  let node: Node | null = walker.nextNode();
  while (node) {
    if (isBlockBoundary(editor, node)) {
      flush();
    } else if (NodeType.isText(node) && node.data.length) {
      if (!rng || rng.intersectsNode(node)) {
        current.push({ node, start: pos, end: pos + node.data.length });
      } else if (current.length) {
        flush();
      }
      pos += node.data.length;
    }
    node = walker.nextNode();
  }
  flush();
  return groups;
};

const buildRegex = (text: string, matchCase: boolean, wholeWord: boolean): RegExp => {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = wholeWord ? `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])` : escaped;
  return new RegExp(pattern, 'g' + (matchCase ? '' : 'i') + 'u');
};

export const findAndMark = (editor: Editor, text: string, matchCase: boolean, wholeWord: boolean, inSelection: boolean): number => {
  if (!text) {
    return 0;
  }
  const doc = editor.getDoc();
  const rng = inSelection && !editor.selection.isCollapsed() ? editor.selection.getRng().cloneRange() : null;
  const groups = collectRuns(editor, editor.getBody(), rng);
  const re = buildRegex(text, matchCase, wholeWord);
  let index = 0;
  groups.forEach((runs) => {
    const str = runs.map((r) => r.node.data).join('');
    const matches: Array<{ start: number; end: number }> = [];
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(str))) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      matches.push({ start: m.index, end: m.index + m[0].length });
    }
    if (!matches.length) {
      return;
    }
    // Clip to the selection range when searching in the selection.
    const clipped = rng
      ? matches.filter((mt) => {
          const startRun = runs.find((r) => mt.start >= r.start && mt.start < r.end);
          const endRun = runs.find((r) => mt.end > r.start && mt.end <= r.end);
          if (!startRun || !endRun) {
            return false;
          }
          const a = doc.createRange();
          a.setStart(startRun.node, mt.start - startRun.start);
          a.setEnd(endRun.node, mt.end - endRun.start);
          return rng.compareBoundaryPoints(Range.START_TO_START, a) <= 0 && rng.compareBoundaryPoints(Range.END_TO_END, a) >= 0;
        })
      : matches;
    // Wrap from the end so earlier offsets stay valid.
    for (let i = clipped.length - 1; i >= 0; i--) {
      const mt = clipped[i];
      const matchIndex = index + i;
      for (let r = runs.length - 1; r >= 0; r--) {
        const run = runs[r];
        const s = Math.max(mt.start, run.start) - run.start;
        const e = Math.min(mt.end, run.end) - run.start;
        if (e <= s) {
          continue;
        }
        let target = run.node;
        if (e < target.data.length) {
          target.splitText(e);
        }
        if (s > 0) {
          target = target.splitText(s);
        }
        const span = doc.createElement('span');
        span.className = MARKER_CLASS;
        span.setAttribute('data-mce-bogus', '1');
        span.setAttribute('data-mce-index', String(matchIndex));
        target.parentNode?.insertBefore(span, target);
        span.appendChild(target);
      }
    }
    index += clipped.length;
  });
  return index;
};

export const markers = (editor: Editor, index?: number): HTMLElement[] =>
  Array.from(editor.getBody().querySelectorAll<HTMLElement>('span.' + MARKER_CLASS + (index === undefined ? '' : `[data-mce-index="${index}"]`)));

export const unwrapMarkers = (editor: Editor, index?: number): void => {
  markers(editor, index).forEach((span) => {
    const parent = span.parentNode;
    if (!parent) {
      return;
    }
    while (span.firstChild) {
      parent.insertBefore(span.firstChild, span);
    }
    parent.removeChild(span);
  });
};

export const markerCount = (editor: Editor): number => {
  const indexes = new Set<string>();
  markers(editor).forEach((m) => indexes.add(m.getAttribute('data-mce-index') || ''));
  return indexes.size;
};

/** Replaces the text of match `index` and removes its markers. */
export const replaceMatch = (editor: Editor, index: number, text: string): boolean => {
  const spans = markers(editor, index);
  if (!spans.length) {
    return false;
  }
  const doc = editor.getDoc();
  spans.forEach((span, i) => {
    const parent = span.parentNode;
    if (!parent) {
      return;
    }
    if (i === 0) {
      if (text) {
        parent.insertBefore(doc.createTextNode(text), span);
      }
    }
    parent.removeChild(span);
  });
  return true;
};

/** Re-numbers the remaining markers so indexes stay contiguous after a replace. */
export const renumber = (editor: Editor): number => {
  const all = markers(editor);
  const map = new Map<string, number>();
  let next = 0;
  all.forEach((m) => {
    const key = m.getAttribute('data-mce-index') || '';
    if (!map.has(key)) {
      map.set(key, next++);
    }
    m.setAttribute('data-mce-index', String(map.get(key)));
  });
  return next;
};
