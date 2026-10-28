import type { Editor } from '../core/Editor';
import * as NodeType from '../dom/NodeType';
import * as CaretUtils from '../dom/CaretUtils';

/**
 * Markdown-like text patterns (`text_patterns` option): block patterns such as `# ` → h1 and
 * `* ` → bullet list, inline patterns such as `**bold**`, and replacements such as `---` → hr.
 */
export interface TextPattern {
  start: string;
  end?: string;
  format?: string;
  cmd?: string;
  value?: any;
  replacement?: string;
}

const getPatterns = (editor: Editor, text: string, block: HTMLElement): TextPattern[] => {
  const base = (editor.options.get('text_patterns') as TextPattern[]) || [];
  const lookup = editor.options.get('text_patterns_lookup') as ((ctx: { text: string; block: HTMLElement }) => TextPattern[]) | undefined;
  const extra = lookup ? lookup({ text, block }) : [];
  return [...base, ...(extra || [])];
};

const textBeforeCaret = (editor: Editor, block: HTMLElement): { text: string; textNode: Text | null; offset: number } => {
  const rng = editor.selection.getRng();
  const r = editor.dom.createRng();
  r.setStart(block, 0);
  r.setEnd(rng.startContainer, rng.startOffset);
  const text = r.toString().replace(/﻿/g, '');
  return { text, textNode: NodeType.isText(rng.startContainer) ? rng.startContainer : null, offset: rng.startOffset };
};

/** Finds a text node + offset for a character index within a block (ignoring ZWSP). */
const resolveTextPosition = (block: HTMLElement, index: number): { node: Text; offset: number } | null => {
  const walker = block.ownerDocument.createTreeWalker(block, 4);
  let remaining = index;
  let node = walker.nextNode() as Text | null;
  let last: Text | null = null;
  while (node) {
    const len = node.data.replace(/﻿/g, '').length;
    if (remaining <= len) {
      // Account for ZWSP characters before the offset.
      let real = 0;
      let logical = 0;
      while (logical < remaining && real < node.data.length) {
        if (node.data[real] !== '﻿') {
          logical++;
        }
        real++;
      }
      return { node, offset: real };
    }
    remaining -= len;
    last = node;
    node = walker.nextNode() as Text | null;
  }
  return last ? { node: last, offset: last.data.length } : null;
};

const applyBlockPattern = (editor: Editor, block: HTMLElement, pattern: TextPattern, consumedLength: number): void => {
  const dom = editor.dom;
  // Remove the pattern text from the start of the block.
  const start = resolveTextPosition(block, 0);
  const end = resolveTextPosition(block, consumedLength);
  if (start && end) {
    const r = dom.createRng();
    r.setStart(start.node, start.offset);
    r.setEnd(end.node, end.offset);
    r.deleteContents();
  }
  if (!block.textContent?.replace(/﻿/g, '').length && !block.querySelector('br')) {
    CaretUtils.padBlock(editor, block);
  }
  CaretUtils.moveCaretToStart(editor, block);
  if (pattern.replacement !== undefined) {
    editor.insertContent(pattern.replacement);
    return;
  }
  if (pattern.format) {
    editor.formatter.apply(pattern.format);
  }
  if (pattern.cmd) {
    editor.execCommand(pattern.cmd, false, pattern.value);
  }
};

const applyInlinePattern = (editor: Editor, block: HTMLElement, pattern: TextPattern, startIndex: number, endIndex: number): boolean => {
  const dom = editor.dom;
  const contentStart = startIndex + pattern.start.length;
  const contentEnd = endIndex;
  if (contentEnd <= contentStart) {
    return false;
  }
  const endPos = resolveTextPosition(block, contentEnd + (pattern.end as string).length);
  const endContentPos = resolveTextPosition(block, contentEnd);
  const startContentPos = resolveTextPosition(block, contentStart);
  const startPos = resolveTextPosition(block, startIndex);
  if (!endPos || !endContentPos || !startContentPos || !startPos) {
    return false;
  }
  // Remove end marker first so earlier offsets stay valid.
  let r = dom.createRng();
  r.setStart(endContentPos.node, endContentPos.offset);
  r.setEnd(endPos.node, endPos.offset);
  r.deleteContents();
  r = dom.createRng();
  r.setStart(startPos.node, startPos.offset);
  r.setEnd(startContentPos.node, startContentPos.offset);
  r.deleteContents();
  // Select the content and format it.
  const s2 = resolveTextPosition(block, startIndex);
  const e2 = resolveTextPosition(block, startIndex + (contentEnd - contentStart));
  if (!s2 || !e2) {
    return false;
  }
  const sel = dom.createRng();
  sel.setStart(s2.node, s2.offset);
  sel.setEnd(e2.node, e2.offset);
  editor.selection.setRng(sel);
  if (pattern.format) {
    editor.formatter.apply(pattern.format);
  }
  if (pattern.cmd) {
    editor.execCommand(pattern.cmd, false, pattern.value);
  }
  // Collapse after the formatted text, outside the format.
  const after = editor.selection.getRng();
  after.collapse(false);
  editor.selection.setRng(after);
  if (pattern.format) {
    // Leave the format so typed text is plain again.
    editor.formatter.remove(pattern.format, undefined, undefined, true);
  }
  return true;
};

/** Runs inline patterns on the text before the caret. Returns true when something changed. */
const runInlinePatterns = (editor: Editor, block: HTMLElement, patterns: TextPattern[]): boolean => {
  const { text } = textBeforeCaret(editor, block);
  const inline = patterns.filter((p) => p.end && (p.format || p.cmd)).sort((a, b) => (b.end as string).length - (a.end as string).length);
  for (const pattern of inline) {
    const end = pattern.end as string;
    if (!text.endsWith(end)) {
      continue;
    }
    const endIndex = text.length - end.length;
    const startIndex = text.lastIndexOf(pattern.start, endIndex - 1);
    if (startIndex === -1 || startIndex + pattern.start.length > endIndex) {
      continue;
    }
    // The character before the start marker must not be part of a longer marker.
    const content = text.slice(startIndex + pattern.start.length, endIndex);
    if (!content.trim().length || content.startsWith(pattern.start.charAt(0)) && pattern.start.length === 1 && content.length > 1 && content.charAt(0) === pattern.start) {
      continue;
    }
    return applyInlinePattern(editor, block, pattern, startIndex, endIndex);
  }
  return false;
};

const startOf = (pattern: TextPattern): string => pattern.start.replace(/\s+$/, '');

/**
 * Block patterns. On space the whole text before the caret must equal the pattern start; on Enter
 * the text only needs to begin with it (the rest stays as the block content).
 */
const runBlockPatterns = (editor: Editor, block: HTMLElement, patterns: TextPattern[], onEnter: boolean): { applied: boolean; consumeKey: boolean } => {
  const { text } = textBeforeCaret(editor, block);
  const blockPatterns = patterns.filter((p) => !p.end && (p.format || p.cmd || p.replacement !== undefined)).sort((a, b) => startOf(b).length - startOf(a).length);
  for (const pattern of blockPatterns) {
    const start = startOf(pattern);
    if (!start) {
      continue;
    }
    const matches = onEnter ? text.startsWith(start) && (text.length > start.length || pattern.replacement !== undefined) : text === start;
    if (!matches) {
      continue;
    }
    // Replacement patterns (e.g. "--") must not swallow longer ones ("---") typed later; on space they
    // only match when the text is exactly the start.
    applyBlockPattern(editor, block, pattern, start.length);
    const consumeKey = pattern.replacement === undefined ? !onEnter : onEnter;
    return { applied: true, consumeKey };
  }
  return { applied: false, consumeKey: false };
};

export const setupTextPatterns = (editor: Editor): void => {
  const handle = (onEnter: boolean): { applied: boolean; consumeKey: boolean } => {
    const none = { applied: false, consumeKey: false };
    if (editor.readonly || editor.composing) {
      return none;
    }
    const rng = editor.selection.getRng();
    if (!rng.collapsed) {
      return none;
    }
    const block = CaretUtils.getTextBlock(editor, rng.startContainer);
    if (!block || block.nodeName === 'PRE') {
      return none;
    }
    const { text } = textBeforeCaret(editor, block);
    const patterns = getPatterns(editor, text, block);
    if (patterns.length === 0) {
      return none;
    }
    let result = none;
    editor.undoManager.transact(() => {
      const inlineApplied = runInlinePatterns(editor, block, patterns);
      const blockResult = runBlockPatterns(editor, block, patterns, onEnter);
      result = { applied: inlineApplied || blockResult.applied, consumeKey: blockResult.consumeKey };
    });
    return result;
  };

  editor.on(
    'keydown',
    (e) => {
      if (e.isDefaultPrevented() || e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      if (e.keyCode === 32) {
        const result = handle(false);
        if (result.consumeKey) {
          e.preventDefault();
        }
      } else if (e.keyCode === 13 && !e.shiftKey) {
        const result = handle(true);
        if (result.consumeKey) {
          e.preventDefault();
        }
      }
    },
    true,
  );
};
