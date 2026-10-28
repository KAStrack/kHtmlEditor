import type { Editor } from '../core/Editor';
import * as NodeType from '../dom/NodeType';
import * as CaretUtils from '../dom/CaretUtils';
import { isEmptyDom } from '../dom/DOMUtils';
import { ensureRootBlock, forceBlocks } from './ForceBlocks';

/**
 * Post-input fix-ups that keep the DOM in the shape the editor expects after the browser handled
 * a native edit: padded empty blocks, no stray bogus brs, no empty inline leftovers, no inline
 * content directly in the body.
 */

const keepEmptyInline = (node: HTMLElement): boolean =>
  NodeType.isBookmarkNode(node) || NodeType.isCaretContainer(node) || node.hasAttribute('data-mce-bogus') || node.hasAttribute('id') || node.hasAttribute('name') || NodeType.isNamedAnchor(node) || node.nodeName === 'BR';

const isCaretInside = (editor: Editor, node: Node): boolean => {
  const rng = editor.selection.getRng();
  return node === rng.startContainer || node.contains(rng.startContainer);
};

const removeEmptyInlines = (editor: Editor, block: HTMLElement): void => {
  const inlines = Array.from(block.querySelectorAll('*')) as HTMLElement[];
  for (let i = inlines.length - 1; i >= 0; i--) {
    const el = inlines[i];
    if (!el.parentNode || editor.dom.isBlock(el) || keepEmptyInline(el)) {
      continue;
    }
    if (editor.schema.getNonEmptyElements()[el.nodeName.toLowerCase()]) {
      continue;
    }
    if (!el.firstChild || (el.childNodes.length === 1 && NodeType.isText(el.firstChild) && el.firstChild.data.length === 0)) {
      if (!isCaretInside(editor, el)) {
        el.parentNode.removeChild(el);
      }
    }
  }
};

/** Strips the font/colour spans WebKit and Blink insert when deleting across formatting boundaries. */
const removeBrowserStyleSpans = (editor: Editor, block: HTMLElement): void => {
  const spans = Array.from(block.querySelectorAll('span[style]')) as HTMLElement[];
  for (const span of spans) {
    if (span.hasAttribute('data-mce-style') || span.attributes.length !== 1) {
      continue;
    }
    const style = span.getAttribute('style') || '';
    // Browser generated spans carry computed values (rgb colours, px sizes, font stacks) and no other attributes.
    if (/caret-color|-webkit-|font-variant-ligatures|text-decoration-thickness|orphans|widows|white-space: normal/.test(style) || /^(?:\s*(?:color: rgb\([^)]*\)|font-family: [^;]+|font-size: [\d.]+px|font-weight: (?:400|normal)|font-style: normal|text-decoration(?:-[a-z]+)?: [^;]+|background-color: rgb\([^)]*\)|line-height: [^;]+|letter-spacing: [^;]+);?\s*)+$/.test(style) && !editor.hasFocus()) {
      editor.dom.remove(span, true);
    }
  }
};

const fixBogusBrs = (editor: Editor, block: HTMLElement): void => {
  const bogus = Array.from(block.querySelectorAll('br[data-mce-bogus]')) as HTMLElement[];
  const empty = isEmptyDom(editor.schema, block);
  if (empty) {
    if (bogus.length === 0 && !block.querySelector('br')) {
      CaretUtils.padBlock(editor, block);
    } else if (bogus.length > 1) {
      bogus.slice(1).forEach((br) => br.parentNode?.removeChild(br));
    }
    return;
  }
  for (const br of bogus) {
    // A bogus br that is no longer the last thing in its block has become a real line break.
    const atEnd = !br.nextSibling || (NodeType.isText(br.nextSibling) && br.nextSibling.data.length === 0 && !br.nextSibling.nextSibling);
    if (atEnd && block.textContent && NodeType.removeZwsp(block.textContent).length > 0) {
      br.parentNode?.removeChild(br);
    } else if (!atEnd) {
      br.removeAttribute('data-mce-bogus');
    }
  }
};

export const normalizeAfterInput = (editor: Editor): void => {
  if (editor.composing || editor.removed) {
    return;
  }
  const body = editor.getBody();
  if (!body) {
    return;
  }
  if (ensureRootBlock(editor)) {
    return;
  }
  forceBlocks(editor);
  // Root level blocks left completely empty by native deletion need their padding back.
  for (let c = body.firstChild; c; c = c.nextSibling) {
    if (NodeType.isElement(c) && !c.firstChild && editor.dom.isBlock(c) && !editor.schema.getVoidElements()[c.nodeName.toLowerCase()] && !NodeType.isTable(c)) {
      CaretUtils.padBlock(editor, c);
    }
  }
  const rng = editor.selection.getRng();
  if (!body.contains(rng.startContainer)) {
    return;
  }
  const block = CaretUtils.getTextBlock(editor, rng.startContainer) ?? body;
  if (block === body) {
    return;
  }
  fixBogusBrs(editor, block);
  removeEmptyInlines(editor, block);
  removeBrowserStyleSpans(editor, block);
  normalizeNbsps(editor, rng);
};

/** A non-breaking space between two visible characters is a regular space (TinyMCE behaviour). */
const normalizeNbsps = (editor: Editor, rng: Range): void => {
  const node = rng.startContainer;
  if (!NodeType.isText(node) || node.data.indexOf('\u00a0') === -1) {
    return;
  }
  let replaced = node.data.replace(/(\S)\u00a0(?=\S)/g, (_m, before: string) => before + ' ');
  // An nbsp at the start of a text node that follows visible inline content (e.g. </strong>) and is
  // itself followed by text behaves like a middle space too.
  const prev = node.previousSibling;
  const prevHasContent = !!prev && (NodeType.isElement(prev) ? !NodeType.isBr(prev) && (prev.textContent || '').replace(/\uFEFF/g, '').length > 0 && !/\s$/.test(prev.textContent || '') : NodeType.isText(prev) && /\S$/.test(prev.data));
  if (prevHasContent) {
    replaced = replaced.replace(/^(\uFEFF*)\u00a0(?=\S)/, '$1 ');
  }
  if (replaced !== node.data) {
    const offset = rng.startOffset;
    node.data = replaced;
    const r = editor.dom.createRng();
    r.setStart(node, Math.min(offset, node.data.length));
    r.collapse(true);
    editor.selection.setRng(r);
  }
};
