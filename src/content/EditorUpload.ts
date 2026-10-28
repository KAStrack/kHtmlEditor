import type { Editor } from '../core/Editor';
import type { BlobCache, BlobInfo } from './BlobCache';
import { setEditorUploadFactory } from '../core/Init';
import { createUploader, UploadResult } from './Uploader';
import { scanForBlobs, BlobInfoImagePair } from './BlobScanner';
import * as Options from '../core/EditorOptions';
import { escapeRegExp } from '../util/Str';

/**
 * `editor.editorUpload` / `editor.uploadImages()`: scans the content for cached blobs, uploads
 * them (images via `images_upload_*`, media via `media_upload_*` falling back to the image
 * options), swaps the blob URIs for the returned URLs in the document and in the undo stack, and
 * replaces blob URIs with base64 data on `getContent()` when `images_replace_blob_uris` is on.
 */
export interface UploadImageResult {
  element: HTMLElement;
  status: boolean;
  blobInfo: BlobInfo;
  uploadUri: string;
  removed: boolean;
}

setEditorUploadFactory((editor: Editor, blobCache: BlobCache) => {
  const uploaded = new Map<string, string>();
  let destroyed = false;

  const imageUploader = () =>
    createUploader({
      url: Options.getImagesUploadUrl(editor),
      basePath: Options.getImagesUploadBasePath(editor),
      credentials: Options.getImagesUploadCredentials(editor),
      handler: Options.getImagesUploadHandler(editor),
    });
  const mediaUploader = () =>
    createUploader({
      url: Options.getMediaUploadUrl(editor) || Options.getImagesUploadUrl(editor),
      basePath: Options.getImagesUploadBasePath(editor),
      credentials: Options.getImagesUploadCredentials(editor),
      handler: editor.options.get('media_upload_handler') || Options.getImagesUploadHandler(editor),
    });

  const openNotification = () =>
    editor.notificationManager.open({ text: editor.translate('Image uploading...'), type: 'info', timeout: -1, progressBar: true });

  const replaceUrlInUndoStack = (target: string, replacement: string) => {
    const re = new RegExp('(src|data-mce-src)="' + escapeRegExp(target) + '"', 'g');
    const swap = (s: string) => s.replace(re, (_m, attr) => (attr === 'src' ? 'src="' + replacement + '"' : ''));
    editor.undoManager.data.forEach((level) => {
      if (level.type === 'fragmented' && level.fragments) {
        level.fragments = level.fragments.map(swap);
      } else {
        level.content = swap(level.content);
      }
    });
  };

  const applyResult = (pair: BlobInfoImagePair, result: UploadResult): UploadImageResult => {
    const el = pair.image;
    const blobUri = pair.blobInfo.blobUri();
    if (result.status) {
      uploaded.set(blobUri, result.url);
      if (el.isConnected) {
        el.setAttribute('src', result.url);
        el.removeAttribute('data-mce-src');
        if (el.nodeName === 'SOURCE' && el.parentElement && el.parentElement.getAttribute('src') === blobUri) {
          el.parentElement.setAttribute('src', result.url);
        }
      }
      replaceUrlInUndoStack(blobUri, result.url);
      return { element: el, status: true, blobInfo: pair.blobInfo, uploadUri: result.url, removed: false };
    }
    const error = result.error ?? { message: 'Unknown upload error' };
    editor.notificationManager.open({ text: editor.translate(error.message), type: 'error' });
    let removed = false;
    if (error.remove && el.isConnected) {
      const target = el.nodeName === 'SOURCE' && el.parentElement ? el.parentElement : el;
      const figure = target.parentElement && target.parentElement.nodeName === 'FIGURE' ? target.parentElement : null;
      editor.dom.remove(figure ?? target);
      removed = true;
    }
    return { element: el, status: false, blobInfo: pair.blobInfo, uploadUri: '', removed };
  };

  const uploadImages = (): Promise<UploadImageResult[]> => {
    if (destroyed || editor.removed) {
      return Promise.resolve([]);
    }
    return scanForBlobs(editor, blobCache).then((pairs) => {
      // Blobs already uploaded earlier in this session are swapped straight away.
      const todo: BlobInfoImagePair[] = [];
      pairs.forEach((p) => {
        const url = uploaded.get(p.blobInfo.blobUri());
        if (url) {
          p.image.setAttribute('src', url);
          p.image.removeAttribute('data-mce-src');
        } else {
          todo.push(p);
        }
      });
      if (todo.length === 0) {
        return [];
      }
      const images = todo.filter((p) => p.kind === 'image');
      const media = todo.filter((p) => p.kind === 'media');
      const imgUp = imageUploader();
      const medUp = mediaUploader();
      if (!imgUp.hasHandler() && !medUp.hasHandler()) {
        return [];
      }
      const unique = (list: BlobInfoImagePair[]) => Array.from(new Map(list.map((p) => [p.blobInfo.blobUri(), p.blobInfo])).values());
      let notificationOpened = false;
      const openOnce = () => {
        notificationOpened = true;
        return openNotification();
      };
      void notificationOpened;
      return Promise.all([imgUp.upload(unique(images), openOnce), medUp.upload(unique(media), openOnce)]).then(([imgResults, medResults]) => {
        if (editor.removed) {
          return [];
        }
        const byUri = new Map<string, UploadResult>();
        [...imgResults, ...medResults].forEach((r) => byUri.set(r.blobInfo.blobUri(), r));
        const out: UploadImageResult[] = [];
        todo.forEach((p) => {
          const r = byUri.get(p.blobInfo.blobUri());
          if (r) {
            out.push(applyResult(p, r));
          }
        });
        if (out.some((r) => r.status || r.removed)) {
          editor.dispatch('UploadImages', { results: out });
        }
        return out;
      });
    });
  };

  const uploadImagesAuto = (): Promise<UploadImageResult[]> => (Options.isAutomaticUploadsEnabled(editor) ? uploadImages() : Promise.resolve([]));

  const scanForImages = (): Promise<BlobInfoImagePair[]> => (destroyed ? Promise.resolve([]) : scanForBlobs(editor, blobCache));

  editor.on('SetContent', () => {
    if (Options.isAutomaticUploadsEnabled(editor)) {
      void uploadImagesAuto();
    } else {
      void scanForImages();
    }
  });

  // getContent(): blob URIs become base64 data URIs (TinyMCE images_replace_blob_uris).
  editor.serializer.addNodeFilter('img,source,video,audio', (nodes) => {
    if (!Options.shouldReplaceBlobUris(editor)) {
      return;
    }
    nodes.forEach((node) => {
      const el = node as Element;
      const src = el.getAttribute('data-mce-src') || el.getAttribute('src') || '';
      if (!src.startsWith('blob:')) {
        return;
      }
      const done = uploaded.get(src);
      if (done) {
        el.setAttribute('src', done);
        el.removeAttribute('data-mce-src');
        return;
      }
      const info = blobCache.getByUri(src);
      if (info) {
        el.setAttribute('src', 'data:' + info.blob().type + ';base64,' + info.base64());
        el.removeAttribute('data-mce-src');
      }
    });
  });

  return {
    blobCache,
    uploadImages,
    uploadImagesAuto,
    scanForImages,
    destroy: () => {
      destroyed = true;
      uploaded.clear();
    },
  };
});

export {};
