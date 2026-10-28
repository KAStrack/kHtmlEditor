import type { Editor } from '../core/Editor';
import type { BlobCache, BlobInfo } from './BlobCache';
import { uuid } from '../util/Uuid';

/**
 * Finds images (and media sources) that still point at `data:` or unknown `blob:` URIs, adds them
 * to the blob cache and rewrites the element to the cache's blob URI so they can be uploaded.
 */
export interface BlobInfoImagePair {
  image: HTMLElement;
  blobInfo: BlobInfo;
  kind: 'image' | 'media';
}

export const parseDataUri = (uri: string): { type: string; data: string; base64: boolean } | null => {
  const m = /^data:([^;,]+)?((?:;[^;,]+)*?)(;base64)?,([\s\S]*)$/i.exec(uri);
  if (!m) {
    return null;
  }
  return { type: (m[1] || 'text/plain').toLowerCase(), data: m[4], base64: !!m[3] };
};

export const dataUriToBlob = (uri: string): Blob | null => {
  const parsed = parseDataUri(uri);
  if (!parsed) {
    return null;
  }
  try {
    if (parsed.base64) {
      const binary = atob(parsed.data.replace(/\s+/g, ''));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Blob([bytes], { type: parsed.type });
    }
    return new Blob([decodeURIComponent(parsed.data)], { type: parsed.type });
  } catch {
    return null;
  }
};

export const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export const blobToDataUri = (blob: Blob): Promise<string> => blobToBase64(blob).then((b64) => 'data:' + blob.type + ';base64,' + b64);

/** Adds a blob to the cache (reusing an identical entry) and resolves the BlobInfo. */
export const cacheBlob = (blobCache: BlobCache, blob: Blob, name?: string, filename?: string): Promise<BlobInfo> =>
  blobToBase64(blob).then((base64) => {
    const existing = blobCache.getByData(base64, blob.type);
    if (existing) {
      return existing;
    }
    const info = blobCache.create({ id: uuid('blobid'), blob, base64, name, filename });
    blobCache.add(info);
    return info;
  });

const isMediaSource = (el: Element): boolean => /^(VIDEO|AUDIO|SOURCE)$/.test(el.nodeName);

const fetchBlob = (uri: string): Promise<Blob | null> =>
  fetch(uri)
    .then((r) => (r.ok ? r.blob() : null))
    .catch(() => null);

const resolveBlobInfo = (editor: Editor, blobCache: BlobCache, el: HTMLElement, src: string): Promise<BlobInfo | null> => {
  if (src.startsWith('blob:')) {
    const cached = blobCache.getByUri(src);
    if (cached) {
      return Promise.resolve(cached);
    }
    return fetchBlob(src).then((blob) => (blob ? cacheBlob(blobCache, blob) : null));
  }
  if (src.startsWith('data:')) {
    if (el.nodeName === 'IMG') {
      const filter = editor.options.get('images_dataimg_filter') as (img: HTMLImageElement) => boolean;
      if (filter && !filter(el as HTMLImageElement)) {
        return Promise.resolve(null);
      }
    }
    const parsed = parseDataUri(src);
    if (!parsed) {
      return Promise.resolve(null);
    }
    const base64 = parsed.base64 ? parsed.data.replace(/\s+/g, '') : null;
    if (base64) {
      const existing = blobCache.getByData(base64, parsed.type);
      if (existing) {
        return Promise.resolve(existing);
      }
    }
    const blob = dataUriToBlob(src);
    if (!blob) {
      return Promise.resolve(null);
    }
    const reuse = editor.options.get('images_reuse_filename') as boolean;
    const filename = reuse ? el.getAttribute('data-mce-filename') ?? undefined : undefined;
    return cacheBlob(blobCache, blob, undefined, filename);
  }
  return Promise.resolve(null);
};

const isCandidate = (el: HTMLElement): boolean => {
  if (el.hasAttribute('data-mce-bogus') || el.hasAttribute('data-mce-placeholder')) {
    return false;
  }
  const src = el.getAttribute('src') || '';
  return src.startsWith('data:') || src.startsWith('blob:');
};

export const scanForBlobs = (editor: Editor, blobCache: BlobCache): Promise<BlobInfoImagePair[]> => {
  const body = editor.getBody();
  if (!body) {
    return Promise.resolve([]);
  }
  const candidates = Array.from(body.querySelectorAll<HTMLElement>('img[src],video[src],audio[src],video source[src],audio source[src]')).filter(isCandidate);
  return Promise.all(
    candidates.map((el) => {
      const src = el.getAttribute('src') as string;
      return resolveBlobInfo(editor, blobCache, el, src).then((blobInfo) => {
        if (!blobInfo) {
          return null;
        }
        const uri = blobInfo.blobUri();
        if (el.getAttribute('src') !== uri) {
          el.setAttribute('src', uri);
        }
        el.setAttribute('data-mce-src', uri);
        return { image: el, blobInfo, kind: isMediaSource(el) ? 'media' : 'image' } as BlobInfoImagePair;
      });
    }),
  ).then((pairs) => pairs.filter((p): p is BlobInfoImagePair => p !== null));
};
