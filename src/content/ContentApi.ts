import type { Editor } from '../core/Editor';
import * as NodeType from '../dom/NodeType';
import { isString } from '../util/Type';

/**
 * getContent / setContent / insertContent / resetContent implementations.
 */
export interface GetContentArgs {
  format?: 'html' | 'raw' | 'text' | 'tree';
  get?: boolean;
  getInner?: boolean;
  no_events?: boolean;
  source_view?: boolean;
  [key: string]: any;
}

export interface SetContentArgs {
  format?: 'html' | 'raw';
  set?: boolean;
  content?: string;
  no_events?: boolean;
  no_selection?: boolean;
  initial?: boolean;
  [key: string]: any;
}

const trimEmptyContents = (editor: Editor, html: string): string => {
  const blockName = editor.options.get('forced_root_block') as string;
  const emptyRegExp = new RegExp(`^(<${blockName}[^>]*>(&nbsp;|&#160;|\\s| |<br \\/>|<br>|)<\\/${blockName}>[\r\n]*|<br \\/>[\r\n]*|<br>[\r\n]*)$`, 'i');
  return html.replace(emptyRegExp, '');
};

export const getContent = (editor: Editor, args: GetContentArgs = {}): any => {
  const format = args.format ?? 'html';
  const defaultedArgs: GetContentArgs = { ...args, format, get: true, getInner: true };
  const body = editor.getBody();
  if (!body) {
    return format === 'tree' ? editor.dom.doc.createDocumentFragment() : '';
  }
  const updatedArgs = args.no_events ? defaultedArgs : editor.dispatch('BeforeGetContent', defaultedArgs);
  let content: any;
  if (updatedArgs.format === 'raw') {
    content = NodeType.removeZwsp(body.innerHTML);
  } else if (updatedArgs.format === 'text') {
    content = NodeType.removeZwsp(getTextContent(body));
  } else if (updatedArgs.format === 'tree') {
    content = editor.serializer.filterClone(body, updatedArgs);
  } else {
    content = trimEmptyContents(editor, editor.serializer.serialize(body, updatedArgs));
  }
  if (updatedArgs.format !== 'text' && updatedArgs.format !== 'tree' && isString(content)) {
    content = content.replace(/^\s+|\s+$/g, '');
  }
  const result = { ...updatedArgs, content };
  if (args.no_events) {
    return content;
  }
  const evt = editor.dispatch('GetContent', result);
  return evt.content;
};

const getTextContent = (body: HTMLElement): string => {
  const innerText = (body as any).innerText as string | undefined;
  if (typeof innerText === 'string') {
    return innerText;
  }
  return body.textContent ?? '';
};

const setEditorHtml = (editor: Editor, html: string, args: SetContentArgs): void => {
  const body = editor.getBody();
  const forcedRootBlock = editor.options.get('forced_root_block') as string;
  const dom = editor.dom;
  const isEmpty = /^\s*$/.test(html) || /^<br\s*\/?>\s*$/i.test(html);
  if (isEmpty) {
    // Empty editor keeps one padded root block so the caret has somewhere to live.
    body.innerHTML = '';
    const block = dom.create(forcedRootBlock, editor.options.get('forced_root_block_attrs') as Record<string, string>);
    block.appendChild(dom.create('br', { 'data-mce-bogus': '1' }));
    body.appendChild(block);
    return;
  }
  if (args.format === 'raw') {
    body.innerHTML = html;
    return;
  }
  const fragment = editor.parser.parse(html, { ...args, isRootContent: true, insert: false, set: true });
  const adopted = dom.doc.adoptNode(fragment);
  body.innerHTML = '';
  body.appendChild(adopted);
  if (!body.firstChild) {
    setEditorHtml(editor, '', args);
  }
};

export const setContent = (editor: Editor, content: string | Node, args: SetContentArgs = {}): string => {
  const body = editor.getBody();
  const html = isString(content) ? content : (content as HTMLElement).innerHTML ?? '';
  const defaultedArgs: SetContentArgs = { format: 'html', ...args, set: true, content: html };
  const updatedArgs = args.no_events ? defaultedArgs : editor.dispatch('BeforeSetContent', defaultedArgs);
  if (updatedArgs.isDefaultPrevented && (updatedArgs as any).isDefaultPrevented()) {
    editor.dispatch('SetContent', updatedArgs);
    return updatedArgs.content ?? '';
  }
  if (!body) {
    return updatedArgs.content ?? '';
  }
  setEditorHtml(editor, updatedArgs.content ?? '', updatedArgs);
  if (!updatedArgs.no_selection) {
    moveSelectionToStart(editor);
  }
  if (!args.no_events) {
    editor.dispatch('SetContent', updatedArgs);
  }
  return updatedArgs.content ?? '';
};

const moveSelectionToStart = (editor: Editor): void => {
  if (!editor.selection) {
    return;
  }
  const body = editor.getBody();
  const first = editor.selection.firstEditablePosition(body);
  const rng = editor.dom.createRng();
  rng.setStart(first.node, first.offset);
  rng.collapse(true);
  if (editor.hasFocus()) {
    editor.selection.setRng(rng);
  } else {
    editor.selection.setExplicitRange(null);
    // Remember as last range so that focus() lands at the start.
    (editor.selection as any).lastRng = rng;
  }
};

export const resetContent = (editor: Editor, initialContent?: string): void => {
  if (initialContent === undefined) {
    setContent(editor, editor.startContent, { format: 'raw' });
  } else {
    setContent(editor, initialContent);
  }
  editor.undoManager.reset();
  editor.setDirty(false);
  editor.nodeChanged();
};
