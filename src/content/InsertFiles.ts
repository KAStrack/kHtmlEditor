import type { Editor } from '../core/Editor';
import { cacheBlob } from './BlobScanner';
import * as Options from '../core/EditorOptions';
import { encodeRaw } from '../html/Entities';

/**
 * Inserts image/media files (from paste, drop, the quick image button or the upload tabs) as
 * cached blobs so the upload pipeline can post them.
 */
const extension = (file: File): string => {
  const m = /\.([a-z0-9]+)$/i.exec(file.name || '');
  if (m) {
    return m[1].toLowerCase();
  }
  const t = file.type.split('/')[1] || '';
  return t === 'jpeg' ? 'jpg' : t;
};

export const isImageFile = (editor: Editor, file: File): boolean => file.type.startsWith('image/') && Options.getImageFileTypes(editor).includes(extension(file));
export const isMediaFile = (editor: Editor, file: File): boolean => /^(video|audio)\//.test(file.type) && Options.getMediaFileTypes(editor).includes(extension(file));
export const isAcceptedFile = (editor: Editor, file: File): boolean => isImageFile(editor, file) || isMediaFile(editor, file);

export const fileToHtml = (editor: Editor, file: File): Promise<string> => {
  const blobCache = editor.editorUpload.blobCache;
  const name = (file.name || '').replace(/\.[^.]+$/, '') || undefined;
  return cacheBlob(blobCache, file, name, file.name || undefined).then((info) => {
    const uri = info.blobUri();
    if (file.type.startsWith('video/')) {
      return `<video controls="controls" width="300" height="150"><source src="${uri}" type="${encodeRaw(file.type, true)}"></video>`;
    }
    if (file.type.startsWith('audio/')) {
      return `<audio controls="controls"><source src="${uri}" type="${encodeRaw(file.type, true)}"></audio>`;
    }
    return `<img src="${uri}" alt="${encodeRaw(name ?? '', true)}">`;
  });
};

export const insertFiles = (editor: Editor, files: File[]): Promise<boolean> => {
  const accepted = files.filter((f) => isAcceptedFile(editor, f));
  if (accepted.length === 0) {
    return Promise.resolve(false);
  }
  return Promise.all(accepted.map((f) => fileToHtml(editor, f))).then((parts) => {
    if (editor.removed) {
      return false;
    }
    editor.undoManager.transact(() => {
      editor.insertContent(parts.join(''), { paste: true });
    });
    return true;
  });
};

/** Reads a File into a `data:` URI (used by dialog upload tabs). */
export const readFileAsDataUri = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
