import type { Editor } from '../core/Editor';
import * as NodeType from '../dom/NodeType';

/**
 * Inline boundaries: when the caret sits at the edge of a link/code element it can be either
 * inside or outside. Left/Right at the edge toggles, typed text follows the chosen side, and the
 * element is highlighted while the caret is inside it (`data-mce-selected="inline-boundary"`).
 */
export const setupInlineBoundaries = (editor: Editor): void => {
  if (editor.options.get('inline_boundaries') === false) {
    return;
  }
  const selector = () => editor.options.get('inline_boundaries_selector') as string;

  const closestBoundary = (node: Node | null): HTMLElement | null => editor.dom.getParent(node, (n) => NodeType.isElement(n) && editor.dom.is(n, selector()), editor.getBody()) as HTMLElement | null;

  const clearHighlights = () => {
    editor.getBody().querySelectorAll('[data-mce-selected="inline-boundary"]').forEach((el) => el.removeAttribute('data-mce-selected'));
  };

  const isAtEnd = (el: HTMLElement, rng: Range): boolean => {
    const r = editor.dom.createRng();
    r.setStart(rng.startContainer, rng.startOffset);
    r.setEnd(el, el.childNodes.length);
    return r.toString().replace(/﻿/g, '').length === 0;
  };
  const isAtStart = (el: HTMLElement, rng: Range): boolean => {
    const r = editor.dom.createRng();
    r.setStart(el, 0);
    r.setEnd(rng.startContainer, rng.startOffset);
    return r.toString().replace(/﻿/g, '').length === 0;
  };

  /** Ensures a text node exists right after/before the element and places the caret in it. */
  const moveOutside = (el: HTMLElement, after: boolean) => {
    const doc = editor.getDoc();
    let text = (after ? el.nextSibling : el.previousSibling) as Node | null;
    if (!text || !NodeType.isText(text)) {
      text = doc.createTextNode(NodeType.ZWSP);
      el.parentNode?.insertBefore(text, after ? el.nextSibling : el);
    } else if (after && text.data.charAt(0) !== NodeType.ZWSP && text.data.length === 0) {
      text.data = NodeType.ZWSP;
    }
    const rng = editor.dom.createRng();
    const t = text as Text;
    if (after) {
      const off = t.data.charAt(0) === NodeType.ZWSP ? 1 : 0;
      rng.setStart(t, off);
    } else {
      rng.setStart(t, t.data.length);
    }
    rng.collapse(true);
    editor.selection.setRng(rng);
  };

  const moveInside = (el: HTMLElement, atEnd: boolean) => {
    const pos = atEnd ? editor.selection.lastEditablePosition(el) : editor.selection.firstEditablePosition(el);
    const rng = editor.dom.createRng();
    rng.setStart(pos.node, pos.offset);
    rng.collapse(true);
    editor.selection.setRng(rng);
  };

  /** Removes ZWSP caret helpers that no longer hold the caret. */
  const cleanupZwsp = (rng: Range) => {
    const body = editor.getBody();
    const walker = editor.getDoc().createTreeWalker(body, 4);
    const nodes: Text[] = [];
    let t = walker.nextNode() as Text | null;
    while (t) {
      if (t.data.indexOf(NodeType.ZWSP) !== -1 && t !== rng.startContainer) {
        nodes.push(t);
      }
      t = walker.nextNode() as Text | null;
    }
    for (const node of nodes) {
      const cleaned = node.data.replace(/\uFEFF/g, '');
      if (cleaned.length === 0) {
        node.parentNode?.removeChild(node);
      } else {
        node.data = cleaned;
      }
    }
  };

  let updating = false;
  const update = () => {
    if (editor.removed || updating || editor.composing) {
      return;
    }
    updating = true;
    try {
      clearHighlights();
      const rng = editor.selection.getRng();
      if (!rng.collapsed || !editor.getBody().contains(rng.startContainer)) {
        return;
      }
      cleanupZwsp(rng);
      const el = closestBoundary(rng.startContainer);
      if (!el) {
        return;
      }
      el.setAttribute('data-mce-selected', 'inline-boundary');
      // Browsers push typed text outside a link at its end; a ZWSP anchor inside keeps it in.
      if (isAtEnd(el, rng)) {
        const last = el.lastChild;
        // Caret *before* the trailing ZWSP: Blink then treats the position as inside the link.
        if (!(last && NodeType.isText(last) && last.data.endsWith(NodeType.ZWSP) && rng.startContainer === last && rng.startOffset === last.data.length - 1)) {
          const zwsp = editor.getDoc().createTextNode(NodeType.ZWSP);
          el.appendChild(zwsp);
          const r = editor.dom.createRng();
          r.setStart(zwsp, 0);
          r.collapse(true);
          editor.selection.setRng(r);
        }
      } else if (isAtStart(el, rng)) {
        const first = el.firstChild;
        if (!(first && NodeType.isText(first) && first.data.startsWith(NodeType.ZWSP) && rng.startContainer === first)) {
          const zwsp = editor.getDoc().createTextNode(NodeType.ZWSP);
          el.insertBefore(zwsp, el.firstChild);
          const r = editor.dom.createRng();
          r.setStart(zwsp, 1);
          r.collapse(true);
          editor.selection.setRng(r);
        }
      }
    } finally {
      updating = false;
    }
  };

  editor.on('NodeChange SelectionChange', update);
  editor.on('keydown', (e) => {
    if (e.isDefaultPrevented() || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) {
      return;
    }
    const rng = editor.selection.getRng();
    if (!rng.collapsed) {
      return;
    }
    if (e.keyCode === 39) {
      // ArrowRight: inside at end → step outside; outside just before element → step inside.
      const el = closestBoundary(rng.startContainer);
      if (el && isAtEnd(el, rng)) {
        e.preventDefault();
        moveOutside(el, true);
        update();
        return;
      }
      const next = nextElementAt(rng);
      if (next && editor.dom.is(next, selector())) {
        e.preventDefault();
        moveInside(next, false);
        update();
      }
    } else if (e.keyCode === 37) {
      const el = closestBoundary(rng.startContainer);
      if (el && isAtStart(el, rng)) {
        e.preventDefault();
        moveOutside(el, false);
        update();
        return;
      }
      const prev = prevElementAt(rng);
      if (prev && editor.dom.is(prev, selector())) {
        e.preventDefault();
        moveInside(prev, true);
        update();
      }
    }
  });

  const nextElementAt = (rng: Range): HTMLElement | null => {
    const c = rng.startContainer;
    if (NodeType.isText(c)) {
      if (rng.startOffset < c.data.replace(/﻿$/, '').length) {
        return null;
      }
      const sib = c.nextSibling;
      return NodeType.isElement(sib) ? sib : null;
    }
    const n = c.childNodes[rng.startOffset];
    return NodeType.isElement(n) ? n : null;
  };
  const prevElementAt = (rng: Range): HTMLElement | null => {
    const c = rng.startContainer;
    if (NodeType.isText(c)) {
      if (rng.startOffset > (c.data.charAt(0) === NodeType.ZWSP ? 1 : 0)) {
        return null;
      }
      const sib = c.previousSibling;
      return NodeType.isElement(sib) ? sib : null;
    }
    const n = c.childNodes[rng.startOffset - 1];
    return NodeType.isElement(n) ? n : null;
  };
};
