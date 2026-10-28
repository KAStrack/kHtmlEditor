import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';
import * as NodeType from '../../dom/NodeType';

/**
 * Autolink plugin: converts a URL or email typed before Space, Enter or a closing bracket into a
 * link (`autolink_pattern`, `link_default_protocol`).
 */
const DEFAULT_PATTERN = /^(https?:\/\/|ssh:\/\/|ftp:\/\/|file:\/|www\.|(?:mailto:)?[A-Z0-9._%+-]+@(?!.*@))(.+)$/i;
const PUNCTUATION_END = /[.,;:!?)\]}>"']+$/;

const registerOptions = (editor: Editor) => {
  editor.options.register('autolink_pattern', { processor: 'regexp', default: DEFAULT_PATTERN });
  if (!editor.options.isRegistered('link_default_protocol')) {
    editor.options.register('link_default_protocol', { processor: 'string', default: 'https' });
  }
};

const isWhitespace = (ch: string) => /[\s ﻿]/.test(ch);

/** Scans back from the caret to the previous whitespace and returns the candidate word range. */
const findWordBeforeCaret = (editor: Editor, skipChars: number): { node: Text; start: number; end: number; text: string } | null => {
  const rng = editor.selection.getRng();
  if (!rng.collapsed || !NodeType.isText(rng.startContainer)) {
    return null;
  }
  const node = rng.startContainer as Text;
  let end = rng.startOffset - skipChars;
  if (end <= 0) {
    return null;
  }
  // Allow closing punctuation right before the trigger.
  let text = node.data.slice(0, end);
  const trailing = PUNCTUATION_END.exec(text);
  if (trailing) {
    end -= trailing[0].length;
    text = text.slice(0, end);
  }
  let start = end;
  while (start > 0 && !isWhitespace(text.charAt(start - 1))) {
    start--;
  }
  if (start === end) {
    return null;
  }
  // Strip an opening bracket/quote.
  let word = text.slice(start, end);
  const lead = /^[(\[{<"']+/.exec(word);
  if (lead) {
    start += lead[0].length;
    word = word.slice(lead[0].length);
  }
  return word ? { node, start, end, text: word } : null;
};

const convert = (editor: Editor, skipChars: number): boolean => {
  if (editor.readonly || editor.dom.getParent(editor.selection.getStart(), 'a')) {
    return false;
  }
  const word = findWordBeforeCaret(editor, skipChars);
  if (!word) {
    return false;
  }
  const pattern = editor.options.get('autolink_pattern') as RegExp;
  const match = pattern.exec(word.text);
  if (!match) {
    return false;
  }
  if (editor.dom.getParent(word.node, 'a,code,pre')) {
    return false;
  }
  const protocol = (editor.options.get('link_default_protocol') as string) || 'https';
  let href = word.text;
  if (/^www\./i.test(href)) {
    href = protocol + '://' + href;
  } else if (/^[A-Z0-9._%+-]+@/i.test(href) && !/^mailto:/i.test(href)) {
    href = 'mailto:' + href;
  }
  const caretOffset = editor.selection.getRng().startOffset;
  editor.undoManager.transact(() => {
    const rng = editor.dom.createRng();
    rng.setStart(word.node, word.start);
    rng.setEnd(word.node, word.end);
    editor.selection.setRng(rng);
    editor.formatter.apply('link', { href });
  });
  // Put the caret back where it was: the text after the word now follows the new anchor.
  const anchor = editor.dom.getParent(editor.selection.getStart(), 'a') as HTMLElement | null;
  const after = caretOffset - word.end;
  const rng = editor.dom.createRng();
  if (anchor && NodeType.isText(anchor.nextSibling) && after > 0) {
    const next = anchor.nextSibling as Text;
    rng.setStart(next, Math.min(after, next.data.length));
  } else if (anchor) {
    rng.setStartAfter(anchor);
  } else {
    rng.setStart(word.node, Math.min(caretOffset, word.node.data.length));
  }
  rng.collapse(true);
  editor.selection.setRng(rng);
  editor.nodeChanged();
  return true;
};

const register = (editor: Editor): void => {
  registerOptions(editor);
  editor.on('keydown', (e) => {
    if (e.keyCode === 13 && !e.isDefaultPrevented()) {
      convert(editor, 0);
    }
  });
  editor.on('keyup', (e) => {
    if (e.keyCode === 32) {
      convert(editor, 1);
    }
  });
  editor.on('keypress', (e) => {
    if (e.key === ')' || e.key === ']' || e.key === '}') {
      // The bracket has not been inserted yet; the URL ends at the caret.
      convert(editor, 0);
    }
  });
};

PluginManager.add('autolink', register);
export default register;
