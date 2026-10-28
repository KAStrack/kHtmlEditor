import type { Editor } from '../core/Editor';
import type { DOMUtils } from '../dom/DOMUtils';
import * as NodeType from '../dom/NodeType';
import { TreeWalker } from '../dom/TreeWalker';
import { isString } from '../util/Type';
import * as Bookmarks from './Bookmark';
import type { Bookmark } from './Bookmark';

/**
 * Selection API (`editor.selection`) wrapping the iframe's native Selection/Range with
 * TinyMCE-compatible methods and a cached range so toolbar interactions never lose it.
 */

export interface SelectionContentArgs {
  format?: 'html' | 'text' | 'tree' | 'raw';
  contextual?: boolean;
  [key: string]: any;
}

export class EditorSelection {
  readonly dom: DOMUtils;
  readonly win: Window;
  readonly editor: Editor;
  private lastRng: Range | null = null;
  private explicitRange: Range | null = null;
  private selectorChangedData: Array<{ selector: string; callbacks: Array<(state: boolean, args: { node: Node | null; selector: string; parents: Node[] }) => void>; state: boolean }> = [];

  constructor(dom: DOMUtils, win: Window, editor: Editor) {
    this.dom = dom;
    this.win = win;
    this.editor = editor;
    const doc = win.document;
    const update = () => {
      if (!editor.removed) {
        const rng = this.getNativeRng();
        if (rng && this.isInRoot(rng)) {
          this.lastRng = rng.cloneRange();
        }
      }
    };
    dom.bind(doc, 'selectionchange', update);
    dom.bind(doc, 'mouseup keyup', update);
    editor.on('NodeChange', () => this.runSelectorChanged());
  }

  private getRootNode(): HTMLElement {
    return this.editor.getBody();
  }

  private isInRoot(rng: Range): boolean {
    const root = this.getRootNode();
    return !!root && root.contains(rng.startContainer) && root.contains(rng.endContainer);
  }

  getSel(): Selection | null {
    return this.win.getSelection ? this.win.getSelection() : null;
  }

  private getNativeRng(): Range | null {
    const sel = this.getSel();
    if (sel && sel.rangeCount > 0) {
      try {
        return sel.getRangeAt(0);
      } catch {
        return null;
      }
    }
    return null;
  }

  /** Returns the current range. Falls back to the last known range when the editor lacks focus. */
  getRng(): Range {
    const root = this.getRootNode();
    const doc = this.win.document;
    if (this.explicitRange) {
      const r = this.explicitRange;
      this.explicitRange = null;
      return r;
    }
    const native = this.getNativeRng();
    if (native && this.isInRoot(native)) {
      return native;
    }
    if (this.lastRng && root.contains(this.lastRng.startContainer) && root.contains(this.lastRng.endContainer)) {
      return this.lastRng.cloneRange();
    }
    const rng = doc.createRange();
    const firstBlock = root.firstChild;
    if (firstBlock) {
      rng.setStart(firstBlock, 0);
    } else {
      rng.setStart(root, 0);
    }
    rng.collapse(true);
    return rng;
  }

  setRng(rng: Range, forward?: boolean): void {
    if (!rng || !rng.startContainer) {
      return;
    }
    const sel = this.getSel();
    const evt = this.editor.dispatch('SetSelectionRange', { range: rng, forward });
    const range = evt.range;
    if (sel) {
      try {
        sel.removeAllRanges();
        if (forward === false && sel.extend) {
          sel.addRange(range.cloneRange());
          const r = range;
          sel.collapse(r.endContainer, r.endOffset);
          sel.extend(r.startContainer, r.startOffset);
        } else {
          sel.addRange(range);
        }
      } catch {
        /* ignore invalid ranges */
      }
      // Browsers may normalise the range; keep what was actually applied.
      const applied = this.getNativeRng();
      const selected: Range = applied ? applied.cloneRange() : range;
      this.lastRng = selected.cloneRange();
    } else {
      this.lastRng = range.cloneRange();
    }
    this.editor.dispatch('AfterSetSelectionRange', { range, forward });
  }

  /** Lets the next getRng() return a range without touching the native selection. */
  setExplicitRange(rng: Range | null): void {
    this.explicitRange = rng;
  }

  getStart(real?: boolean): Element {
    const rng = this.getRng();
    return this.getEndpoint(rng.startContainer, rng.startOffset, true, real);
  }

  getEnd(real?: boolean): Element {
    const rng = this.getRng();
    return this.getEndpoint(rng.endContainer, rng.endOffset, false, real);
  }

  private getEndpoint(container: Node, offset: number, start: boolean, real?: boolean): Element {
    let node: Node | null = container;
    if (NodeType.isElement(node) && node.hasChildNodes()) {
      const child = node.childNodes[start ? offset : Math.max(0, offset - 1)];
      if (child) {
        node = child;
      }
    }
    if (!real && NodeType.isText(node) && node.parentNode) {
      node = node.parentNode;
    }
    while (node && !NodeType.isElement(node)) {
      node = node.parentNode;
    }
    return (node as Element) || this.getRootNode();
  }

  /** The common ancestor element of the selection (TinyMCE semantics incl. single element selection). */
  getNode(): HTMLElement {
    const rng = this.getRng();
    const root = this.getRootNode();
    let startContainer = rng.startContainer;
    let endContainer = rng.endContainer;
    const startOffset = rng.startOffset;
    const endOffset = rng.endOffset;
    let node: Node | null = rng.commonAncestorContainer;

    if (!rng.collapsed) {
      if (startContainer === endContainer) {
        if (endOffset - startOffset < 2 && startContainer.hasChildNodes()) {
          node = startContainer.childNodes[startOffset] || node;
        }
      }
      // Selection like <p>[<img>]</p> → the image.
      if (NodeType.isText(startContainer) && NodeType.isText(endContainer)) {
        if (startContainer.data.length === startOffset) {
          startContainer = this.skipEmptyTextNodes(startContainer.nextSibling, true) || startContainer;
        } else {
          startContainer = startContainer.parentNode as Node;
        }
        if (endOffset === 0) {
          endContainer = this.skipEmptyTextNodes(endContainer.previousSibling, false) || endContainer;
        } else {
          endContainer = endContainer.parentNode as Node;
        }
        if (startContainer && startContainer === endContainer) {
          node = startContainer;
        }
      }
    }
    if (node && NodeType.isText(node)) {
      node = node.parentNode;
    }
    if (!node || !root.contains(node)) {
      return root;
    }
    return node as HTMLElement;
  }

  private skipEmptyTextNodes(node: Node | null, forwards: boolean): Node | null {
    const orig = node;
    while (node && NodeType.isText(node) && node.length === 0) {
      node = forwards ? node.nextSibling : node.previousSibling;
    }
    return node || orig;
  }

  isCollapsed(): boolean {
    const rng = this.getRng();
    return !rng || rng.collapsed;
  }

  isForward(): boolean {
    const sel = this.getSel();
    const anchorNode = sel?.anchorNode;
    const focusNode = sel?.focusNode;
    if (!sel || !anchorNode || !focusNode || sel.isCollapsed) {
      return true;
    }
    const rng = this.dom.createRng();
    try {
      rng.setStart(anchorNode, sel.anchorOffset);
      rng.setEnd(focusNode, sel.focusOffset);
      return !rng.collapsed;
    } catch {
      return true;
    }
  }

  isEditable(): boolean {
    const rng = this.getRng();
    return this.dom.isEditable(rng.commonAncestorContainer);
  }

  collapse(toStart?: boolean): void {
    const rng = this.getRng();
    rng.collapse(!!toStart);
    this.setRng(rng);
  }

  select(node: Node, content?: boolean): Node {
    const rng = this.dom.createRng();
    if (content) {
      rng.selectNodeContents(node);
    } else {
      rng.selectNode(node);
    }
    const evt = this.editor.dispatch('BeforeObjectSelected'.toLowerCase() === 'x' ? 'noop' : 'SetSelectionRange', { range: rng, forward: true });
    void evt;
    this.setRng(rng);
    return node;
  }

  setCursorLocation(node?: Node, offset?: number): void {
    const rng = this.dom.createRng();
    if (node === undefined) {
      const root = this.getRootNode();
      const first = this.firstEditablePosition(root);
      rng.setStart(first.node, first.offset);
      rng.collapse(true);
    } else {
      rng.setStart(node, offset ?? 0);
      rng.setEnd(node, offset ?? 0);
    }
    this.setRng(rng);
    this.scrollIntoView(rng.startContainer as HTMLElement);
  }

  /** First caret position inside a block: inside the first text node, or before the first element. */
  firstEditablePosition(root: Node): { node: Node; offset: number } {
    let node: Node | null = root.firstChild;
    while (node) {
      if (NodeType.isText(node)) {
        return { node, offset: 0 };
      }
      if (NodeType.isElement(node)) {
        const el: HTMLElement = node;
        const name = el.nodeName.toLowerCase();
        if (name === 'br' || el.getAttribute('contenteditable') === 'false' || this.dom.schema.getVoidElements()[name]) {
          return { node: el.parentNode as Node, offset: this.dom.nodeIndex(el) };
        }
        if (el.firstChild) {
          node = el.firstChild;
          continue;
        }
        return { node: el, offset: 0 };
      }
      node = node.nextSibling;
    }
    return { node: root, offset: 0 };
  }

  lastEditablePosition(root: Node): { node: Node; offset: number } {
    let node: Node | null = root.lastChild;
    while (node) {
      if (NodeType.isText(node)) {
        return { node, offset: node.data.length };
      }
      if (NodeType.isElement(node)) {
        const el: HTMLElement = node;
        const name = el.nodeName.toLowerCase();
        if (name === 'br' && el.hasAttribute('data-mce-bogus')) {
          return { node: el.parentNode as Node, offset: this.dom.nodeIndex(el) };
        }
        if (name === 'br' || el.getAttribute('contenteditable') === 'false' || this.dom.schema.getVoidElements()[name]) {
          return { node: el.parentNode as Node, offset: this.dom.nodeIndex(el) + 1 };
        }
        if (el.lastChild) {
          node = el.lastChild;
          continue;
        }
        return { node: el, offset: 0 };
      }
      node = node.previousSibling;
    }
    return { node: root, offset: root.childNodes.length };
  }

  getContent(args: SelectionContentArgs = {}): any {
    const rng = this.getRng();
    const format = args.format ?? 'html';
    const evtArgs = { ...args, format, selection: true, contextual: args.contextual };
    const e = this.editor.dispatch('BeforeGetContent', evtArgs);
    if (e.isDefaultPrevented()) {
      this.editor.dispatch('GetContent', e);
      return (e as any).content;
    }
    let content: any;
    if (format === 'text') {
      content = rng.collapsed ? '' : rng.toString();
    } else {
      const frag = rng.cloneContents();
      if (format === 'tree') {
        content = frag;
      } else if (format === 'raw') {
        const div = this.dom.doc.createElement('div');
        div.appendChild(frag);
        content = div.innerHTML;
      } else {
        const container = this.dom.create('body');
        container.appendChild(frag);
        // Serialise with contextual wrapping of ancestors when requested.
        let node: Node = container;
        if (args.contextual) {
          const parents = this.dom.getParents(rng.commonAncestorContainer, (n) => NodeType.isElement(n) && !this.dom.isBlock(n), this.getRootNode()) as Element[];
          let wrapper: Element | null = null;
          for (const p of parents) {
            const clone = p.cloneNode(false) as Element;
            if (wrapper) {
              clone.appendChild(wrapper);
            } else {
              while (container.firstChild) {
                clone.appendChild(container.firstChild);
              }
            }
            wrapper = clone;
          }
          if (wrapper) {
            container.appendChild(wrapper);
          }
          node = container;
        }
        content = this.editor.serializer.serialize(node, { ...evtArgs, getInner: true });
      }
    }
    (e as any).content = content;
    this.editor.dispatch('GetContent', e);
    return (e as any).content;
  }

  setContent(content: string, args: Record<string, any> = {}): void {
    const rng = this.getRng();
    const editor = this.editor;
    const evtArgs = { ...args, format: 'html', set: true, selection: true, content };
    const e = editor.dispatch('BeforeSetContent', evtArgs);
    if (e.isDefaultPrevented()) {
      editor.dispatch('SetContent', e);
      return;
    }
    const html = (e as any).content as string;
    if (!rng.collapsed) {
      rng.deleteContents();
    }
    const frag = editor.parser.parse(html, { context: NodeType.name(this.getNode()), insert: true, selection: true });
    const doc = this.dom.doc;
    const adopted = doc.adoptNode(frag);
    const last = adopted.lastChild;
    rng.insertNode(adopted);
    if (last) {
      const after = doc.createRange();
      after.setStartAfter(last);
      after.collapse(true);
      this.setRng(after);
    }
    editor.dispatch('SetContent', e);
  }

  getBookmark(type?: number, normalized?: boolean): Bookmark {
    const rng = this.getRng();
    const root = this.getRootNode();
    if (type === 2) {
      // Path bookmark (used by undo levels); handles fake-selected objects.
      const selected = this.getSelectedObject();
      if (selected) {
        const idx = Bookmarks.getIndexBookmark(root, selected);
        if (idx) {
          return idx;
        }
      }
      return Bookmarks.getPathBookmark(root, rng, normalized !== false);
    }
    if (type === 3) {
      return { rng: rng.cloneRange() };
    }
    const selected = this.getSelectedObject();
    if (selected) {
      const idx = Bookmarks.getIndexBookmark(root, selected);
      if (idx) {
        return idx;
      }
    }
    return Bookmarks.getIdBookmark(this.dom, rng, type === 1 ? false : !!type);
  }

  moveToBookmark(bookmark: Bookmark | null | undefined): void {
    if (!bookmark) {
      return;
    }
    const root = this.getRootNode();
    let rng: Range | null = null;
    if (Bookmarks.isRangeBookmark(bookmark)) {
      rng = bookmark.rng;
    } else if (Bookmarks.isPathBookmark(bookmark)) {
      rng = Bookmarks.resolvePathBookmark(root, bookmark);
    } else if (Bookmarks.isIdBookmark(bookmark)) {
      rng = Bookmarks.resolveIdBookmark(root, bookmark);
    } else if (Bookmarks.isIndexBookmark(bookmark)) {
      rng = Bookmarks.resolveIndexBookmark(root, bookmark);
    }
    if (rng) {
      this.setRng(rng, bookmark && (bookmark as any).forward !== false);
    }
  }

  /** Returns the node when the selection is a fake/object selection (img, table, hr…). */
  getSelectedObject(): Element | null {
    const rng = this.getRng();
    if (rng.collapsed) {
      return null;
    }
    const sc = rng.startContainer;
    if (sc === rng.endContainer && NodeType.isElement(sc) && rng.endOffset - rng.startOffset === 1) {
      const node = sc.childNodes[rng.startOffset];
      if (node && NodeType.isElement(node) && (NodeType.isImg(node) || NodeType.isHr(node) || NodeType.isTable(node) || NodeType.isMedia(node) || NodeType.isContentEditableFalse(node) || NodeType.isFigure(node))) {
        return node;
      }
    }
    const marked = this.getRootNode().querySelector('[data-mce-selected]:not([data-mce-selected="inline-boundary"])');
    return marked;
  }

  /** Returns the list of blocks touched by the selection. */
  getSelectedBlocks(startElm?: Node, endElm?: Node): Element[] {
    const root = this.getRootNode();
    const rng = this.getRng();
    const dom = this.dom;
    const blocks: Element[] = [];
    const start = startElm || this.getStart();
    const end = endElm || this.getEnd();
    const findBlock = (n: Node): Element | null => dom.getParent(n, (x) => NodeType.isElement(x) && dom.isBlock(x), root) as Element | null;
    const startBlock = findBlock(start) || (NodeType.isElement(start) && dom.isBlock(start) ? start : null);
    const endBlock = findBlock(end) || (NodeType.isElement(end) && dom.isBlock(end) ? end : null);
    if (startBlock && startBlock !== root) {
      blocks.push(startBlock);
    }
    if (startBlock && endBlock && startBlock !== endBlock) {
      const walker = new TreeWalker(startBlock, root);
      let node = walker.next();
      while (node && node !== endBlock) {
        if (NodeType.isElement(node) && dom.isBlock(node) && !node.contains(endBlock) && rng.intersectsNode(node)) {
          blocks.push(node);
        }
        node = walker.next();
      }
      if (endBlock !== root) {
        blocks.push(endBlock);
      }
    }
    return blocks;
  }

  normalize(): Range {
    const rng = this.getRng();
    return rng;
  }

  scrollIntoView(elm?: HTMLElement, alignToTop?: boolean): void {
    const editor = this.editor;
    const target = elm ?? (this.getNode() as HTMLElement);
    if (!target || !target.getBoundingClientRect) {
      return;
    }
    const win = this.win;
    const rect = target.getBoundingClientRect();
    const viewHeight = win.innerHeight || win.document.documentElement.clientHeight;
    if (rect.top < 0 || rect.bottom > viewHeight) {
      const evt = editor.dispatch('ScrollIntoView', { elm: target, alignToTop });
      if (!evt.isDefaultPrevented()) {
        try {
          target.scrollIntoView({ block: alignToTop ? 'start' : 'nearest' });
        } catch {
          target.scrollIntoView(!!alignToTop);
        }
        editor.dispatch('AfterScrollIntoView', { elm: target, alignToTop });
      }
    }
  }

  placeCaretAt(clientX: number, clientY: number): void {
    const doc = this.win.document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null; caretRangeFromPoint?: (x: number, y: number) => Range | null };
    let rng: Range | null = null;
    if (doc.caretPositionFromPoint) {
      const pos = doc.caretPositionFromPoint(clientX, clientY);
      if (pos) {
        rng = doc.createRange();
        rng.setStart(pos.offsetNode, pos.offset);
        rng.collapse(true);
      }
    } else if (doc.caretRangeFromPoint) {
      rng = doc.caretRangeFromPoint(clientX, clientY);
    }
    if (rng) {
      this.setRng(rng);
    }
  }

  getBoundingClientRect(): DOMRect {
    const rng = this.getRng();
    return rng.collapsed ? (this.getNode() as HTMLElement).getBoundingClientRect() : rng.getBoundingClientRect();
  }

  selectorChanged(selector: string, callback: (state: boolean, args: { node: Node | null; selector: string; parents: Node[] }) => void): this {
    this.selectorChangedWithUnbind(selector, callback);
    return this;
  }

  selectorChangedWithUnbind(selector: string, callback: (state: boolean, args: { node: Node | null; selector: string; parents: Node[] }) => void): { unbind: () => void } {
    let entry = this.selectorChangedData.find((d) => d.selector === selector);
    if (!entry) {
      entry = { selector, callbacks: [], state: false };
      this.selectorChangedData.push(entry);
    }
    entry.callbacks.push(callback);
    const unbind = () => {
      if (entry) {
        entry.callbacks = entry.callbacks.filter((cb) => cb !== callback);
      }
    };
    return { unbind };
  }

  private runSelectorChanged(): void {
    if (this.selectorChangedData.length === 0 || this.editor.removed) {
      return;
    }
    const root = this.getRootNode();
    const node = this.getStart();
    const parents = this.dom.getParents(node, () => true, root);
    for (const entry of this.selectorChangedData) {
      const matched = parents.filter((p) => this.dom.is(p, entry.selector));
      const state = matched.length > 0;
      if (state !== entry.state || state) {
        if (state !== entry.state) {
          entry.state = state;
          entry.callbacks.forEach((cb) => cb(state, { node: matched[0] ?? null, selector: entry.selector, parents }));
        }
      }
    }
  }

  expand(_options?: { type: 'word' }): void {
    const rng = this.getRng();
    if (!rng.collapsed || !NodeType.isText(rng.startContainer)) {
      return;
    }
    const text = rng.startContainer;
    const data = text.data;
    let start = rng.startOffset;
    let end = rng.startOffset;
    const isWordChar = (c: string) => /[\wÀ-￿'’-]/.test(c);
    while (start > 0 && isWordChar(data[start - 1])) {
      start--;
    }
    while (end < data.length && isWordChar(data[end])) {
      end++;
    }
    const r = this.dom.createRng();
    r.setStart(text, start);
    r.setEnd(text, end);
    this.setRng(r);
  }

  getLastRng(): Range | null {
    return this.lastRng;
  }

  destroy(): void {
    this.lastRng = null;
    this.selectorChangedData = [];
  }
}

export const isStringContent = isString;
