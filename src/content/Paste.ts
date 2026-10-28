import type { Editor } from '../core/Editor';
import { isFunction } from '../util/Type';
import * as PasteUtils from './PasteUtils';
import { getFiles } from './PasteUtils';
import { filterWordContent } from './WordFilter';
import { filterBrowserContent } from './PasteFilters';
import { insertFiles } from './InsertFiles';
import { setupDragDrop } from './DragDrop';
import * as CaretUtils from '../dom/CaretUtils';
import * as NodeType from '../dom/NodeType';

/**
 * Clipboard handling (TinyMCE core paste): HTML/plain text pasting with Word, Google Docs and
 * browser clean-up, image file pasting through the blob cache, smart paste of URLs, internal
 * copy/cut marking, `paste_preprocess`/`paste_postprocess`, PastePreProcess/PastePostProcess
 * events and the `mceTogglePlainTextPaste`/`mceInsertClipboardContent` commands.
 */
export interface PasteApi {
  pasteHtml: (html: string, internal: boolean) => void;
  pasteText: (text: string) => void;
  pasteFiles: (files: File[]) => Promise<boolean>;
  isPlainTextMode: () => boolean;
}

const getClipboardItems = (dt: DataTransfer): Record<string, string> => {
  const items: Record<string, string> = {};
  const types = dt.types ? Array.from(dt.types) : [];
  types.forEach((t) => {
    if (t === 'text/html' || t === 'text/plain' || t === 'text/rtf' || t === 'text/uri-list' || t === 'x-tinymce/html') {
      try {
        const v = dt.getData(t);
        if (v) {
          items[t] = v;
        }
      } catch {
        /* ignore */
      }
    }
  });
  if (!items['text/plain']) {
    try {
      const v = dt.getData('text/plain') || dt.getData('Text');
      if (v) {
        items['text/plain'] = v;
      }
    } catch {
      /* ignore */
    }
  }
  if (!items['text/html']) {
    try {
      const v = dt.getData('text/html');
      if (v) {
        items['text/html'] = v;
      }
    } catch {
      /* ignore */
    }
  }
  return items;
};

/** Deletes the current selection and keeps the surrounding block padded. */
export const deleteSelection = (editor: Editor): void => {
  const rng = editor.selection.getRng();
  if (rng.collapsed) {
    const obj = editor.selection.getSelectedObject();
    if (obj) {
      editor.dom.remove(obj);
    }
    return;
  }
  const startBlock = CaretUtils.getTextBlock(editor, rng.startContainer);
  const endBlock = CaretUtils.getTextBlock(editor, rng.endContainer);
  rng.deleteContents();
  if (startBlock && endBlock && startBlock !== endBlock && startBlock.isConnected && endBlock.isConnected) {
    // Merge the remains of the end block into the start block.
    while (endBlock.firstChild) {
      startBlock.appendChild(endBlock.firstChild);
    }
    editor.dom.remove(endBlock);
  }
  const block = startBlock && startBlock.isConnected ? startBlock : CaretUtils.getTextBlock(editor, rng.startContainer);
  if (block && !block.firstChild) {
    CaretUtils.padBlock(editor, block);
    CaretUtils.moveCaretToStart(editor, block);
  } else {
    rng.collapse(true);
    editor.selection.setRng(rng);
  }
  if (!editor.getBody().firstChild) {
    editor.setContent('');
  }
};

export const setupPaste = (editor: Editor): PasteApi => {
  let plainTextMode = !!editor.options.get('paste_as_text');

  const preProcess = (html: string, internal: boolean) => {
    const args = { content: html, internal, wordContent: !internal && PasteUtils.isWordContent(html) } as any;
    const userPre = editor.options.get('paste_preprocess');
    if (isFunction(userPre)) {
      userPre(editor, args);
    }
    const evt = editor.dispatch('PastePreProcess', args);
    return evt;
  };

  const postProcess = (html: string, internal: boolean): string | null => {
    const body = PasteUtils.parseInert(html);
    const args = { node: body as HTMLElement, internal } as any;
    const userPost = editor.options.get('paste_postprocess');
    if (isFunction(userPost)) {
      userPost(editor, args);
    }
    const evt = editor.dispatch('PastePostProcess', args);
    if (evt.isDefaultPrevented()) {
      return null;
    }
    return (evt.node as HTMLElement).innerHTML;
  };

  const smartPaste = (html: string): boolean => {
    if (!editor.options.get('smart_paste')) {
      return false;
    }
    const text = PasteUtils.innerText(html).trim();
    if (!text || !PasteUtils.isAbsoluteUrl(text) || /<(img|table|ul|ol|a|video|audio|iframe)\b/i.test(html)) {
      return false;
    }
    if (PasteUtils.isImageUrl(editor, text)) {
      editor.insertContent(`<img src="${text.replace(/"/g, '&quot;')}">`, { paste: true });
      return true;
    }
    if (!editor.selection.isCollapsed() && !editor.selection.getSelectedObject()) {
      editor.execCommand('mceInsertLink', false, text);
      return true;
    }
    editor.insertContent(`<a href="${text.replace(/"/g, '&quot;')}">${PasteUtils.innerText(html).trim().replace(/</g, '&lt;')}</a>`, { paste: true });
    return true;
  };

  const pasteHtml = (rawHtml: string, internal: boolean): void => {
    if (editor.readonly) {
      return;
    }
    let html = PasteUtils.unmarkInternal(PasteUtils.trimHtml(rawHtml));
    const pre = preProcess(html, internal);
    if (pre.isDefaultPrevented()) {
      return;
    }
    html = pre.content;
    if (!internal) {
      if (pre.wordContent) {
        html = filterWordContent(html);
      }
      html = filterBrowserContent(editor, html, internal, !!pre.wordContent);
    }
    const processed = postProcess(html, internal);
    if (processed === null) {
      return;
    }
    editor.undoManager.transact(() => {
      if (!smartPaste(processed)) {
        editor.insertContent(processed, { paste: true, merge: !!editor.options.get('paste_merge_formats') });
      }
    });
    editor.nodeChanged();
  };

  const pasteText = (text: string): void => {
    pasteHtml(PasteUtils.convertPlainTextToHtml(editor, text), false);
  };

  const pasteFiles = (files: File[]): Promise<boolean> => insertFiles(editor, files);

  editor.editorCommands.addCommands({
    mceTogglePlainTextPaste: () => {
      plainTextMode = !plainTextMode;
      editor.dispatch('PastePlainTextToggle', { state: plainTextMode });
    },
    mceInsertClipboardContent: (_cmd, _ui, value) => {
      if (!value) {
        return;
      }
      if (value.html) {
        pasteHtml(value.html, !!value.internal);
      } else if (value.text) {
        pasteText(value.text);
      }
    },
  });
  editor.editorCommands.addCommands({ mceTogglePlainTextPaste: () => plainTextMode }, 'state');

  editor.on('paste', (e) => {
    if (e.isDefaultPrevented()) {
      return;
    }
    const dt: DataTransfer | null = e.clipboardData ?? null;
    if (!dt) {
      // No clipboard access: let the browser paste and record an undo level.
      setTimeout(() => editor.undoManager.add(), 0);
      return;
    }
    e.preventDefault();
    const items = getClipboardItems(dt);
    const html = items['text/html'];
    const text = items['text/plain'];
    const internal = (!!html && PasteUtils.isMarkedInternal(html)) || !!items['x-tinymce/html'];
    const files = getFiles(dt).filter((f) => /^(image|video|audio)\//.test(f.type));
    const hasUsefulHtml = !!html && PasteUtils.innerText(html).trim().length > 0 || (!!html && /<(img|table|hr|video|audio|iframe)\b/i.test(html));

    if (files.length && editor.options.get('paste_data_images') && !hasUsefulHtml) {
      void pasteFiles(files);
      return;
    }
    if (plainTextMode) {
      if (text) {
        pasteText(text);
      } else if (html) {
        pasteText(PasteUtils.innerText(html));
      }
      return;
    }
    if (html && hasUsefulHtml) {
      pasteHtml(html, internal);
    } else if (text) {
      pasteText(text);
    } else if (files.length && editor.options.get('paste_data_images')) {
      void pasteFiles(files);
    }
  });

  const writeClipboard = (e: any): boolean => {
    const dt: DataTransfer | null = e.clipboardData ?? null;
    if (!dt) {
      return false;
    }
    const obj = editor.selection.getSelectedObject();
    if (editor.selection.isCollapsed() && !obj) {
      return false;
    }
    const html = editor.selection.getContent({ contextual: true }) as string;
    const text = obj && !editor.selection.getContent({ format: 'text' }) ? '' : (editor.selection.getContent({ format: 'text' }) as string);
    if (!html && !text) {
      return false;
    }
    e.preventDefault();
    try {
      dt.clearData();
      dt.setData('text/html', PasteUtils.markInternal(html));
      dt.setData('text/plain', text);
    } catch {
      return false;
    }
    return true;
  };

  editor.on('copy', (e) => {
    if (!e.isDefaultPrevented()) {
      writeClipboard(e);
    }
  });
  editor.on('cut', (e) => {
    if (e.isDefaultPrevented() || editor.readonly) {
      return;
    }
    if (writeClipboard(e)) {
      // Delete after the event so the clipboard write completes first.
      setTimeout(() => {
        editor.undoManager.transact(() => deleteSelection(editor));
        editor.nodeChanged();
      }, 0);
    }
  });

  const api: PasteApi = { pasteHtml, pasteText, pasteFiles, isPlainTextMode: () => plainTextMode };
  setupDragDrop(editor, api);
  return api;
};

export const isPasteable = (node: Node | null): boolean => !!node && !NodeType.isContentEditableFalse(node);
