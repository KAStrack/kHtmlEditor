import { uuid } from '../util/Uuid';

/**
 * Cache of pasted/dropped/inserted images awaiting upload, keyed by blob URI and by base64 so
 * identical images share one entry. `BlobInfo` uses function accessors like TinyMCE.
 */
export interface BlobInfoData {
  id?: string;
  name?: string;
  filename?: string;
  blob: Blob;
  base64: string;
  blobUri?: string;
  uri?: string;
}

export interface BlobInfo {
  id: () => string;
  name: () => string;
  filename: () => string;
  blob: () => Blob;
  base64: () => string;
  blobUri: () => string;
  uri: () => string | undefined;
}

export interface BlobCache {
  create: (o: string | BlobInfoData, blob?: Blob, base64?: string, name?: string, filename?: string) => BlobInfo;
  add: (blobInfo: BlobInfo) => void;
  get: (id: string) => BlobInfo | undefined;
  getByUri: (blobUri: string) => BlobInfo | undefined;
  getByData: (base64: string, type: string) => BlobInfo | undefined;
  findFirst: (predicate: (blobInfo: BlobInfo) => boolean) => BlobInfo | undefined;
  removeByUri: (blobUri: string) => void;
  destroy: () => void;
}

const mimeToExt = (mime: string): string => {
  const mimes: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/png': 'png',
    'image/apng': 'apng',
    'image/avif': 'avif',
    'image/svg+xml': 'svg',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/ogg': 'ogv',
    'video/quicktime': 'mov',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/webm': 'weba',
  };
  return mimes[mime.toLowerCase()] || 'dat';
};

export const createBlobInfo = (o: string | BlobInfoData, blob?: Blob, base64?: string, name?: string, filename?: string): BlobInfo => {
  const data: BlobInfoData = typeof o === 'string' ? { id: o, blob: blob as Blob, base64: base64 as string, name, filename } : o;
  const id = data.id || uuid('blobid');
  const mime = data.blob.type;
  const resolvedName = data.name || id;
  const resolvedFilename = data.filename || resolvedName + '.' + mimeToExt(mime);
  let blobUri = data.blobUri;
  return {
    id: () => id,
    name: () => resolvedName,
    filename: () => resolvedFilename,
    blob: () => data.blob,
    base64: () => data.base64,
    blobUri: () => {
      if (!blobUri) {
        blobUri = URL.createObjectURL(data.blob);
      }
      return blobUri;
    },
    uri: () => data.uri,
  };
};

export const createBlobCache = (): BlobCache => {
  let cache: BlobInfo[] = [];

  const add = (blobInfo: BlobInfo) => {
    if (!get(blobInfo.id())) {
      cache.push(blobInfo);
    }
  };
  const findFirst = (predicate: (b: BlobInfo) => boolean) => cache.find(predicate);
  const get = (id: string) => findFirst((b) => b.id() === id);
  const getByUri = (blobUri: string) => findFirst((b) => b.blobUri() === blobUri);
  const getByData = (base64: string, type: string) => findFirst((b) => b.base64() === base64 && b.blob().type === type);
  const removeByUri = (blobUri: string) => {
    cache = cache.filter((b) => {
      if (b.blobUri() === blobUri) {
        URL.revokeObjectURL(b.blobUri());
        return false;
      }
      return true;
    });
  };
  const destroy = () => {
    cache.forEach((b) => URL.revokeObjectURL(b.blobUri()));
    cache = [];
  };
  return { create: createBlobInfo, add, get, getByUri, getByData, findFirst, removeByUri, destroy };
};
