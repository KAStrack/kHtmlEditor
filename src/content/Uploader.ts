import type { BlobInfo } from './BlobCache';
import type { NotificationApi } from '../core/NotificationManager';
import { isString, isObject, isFunction } from '../util/Type';

/**
 * Uploads cached blobs to the server. The default handler speaks TinyMCE's contract: multipart
 * POST with a `file` field, JSON response `{ "location": "<url>" }`. Hosts may replace it with an
 * `images_upload_handler(blobInfo, progress) => Promise<string>`.
 */
export interface UploadFailure {
  message: string;
  remove?: boolean;
}

export interface UploadResult {
  url: string;
  blobInfo: BlobInfo;
  status: boolean;
  error?: UploadFailure;
}

export type ProgressFn = (percent: number) => void;
export type UploadHandler = (blobInfo: BlobInfo, progress: ProgressFn) => Promise<string>;

export interface UploaderSettings {
  url: string;
  basePath: string;
  credentials: boolean;
  handler?: UploadHandler;
}

export interface Uploader {
  upload: (blobInfos: BlobInfo[], openNotification?: () => NotificationApi) => Promise<UploadResult[]>;
  hasHandler: () => boolean;
}

const pathJoin = (base: string, path: string): string => {
  if (!base || /^(https?:)?\/\//.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  return base.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
};

export const defaultHandler = (settings: UploaderSettings): UploadHandler => (blobInfo, progress) =>
  new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', settings.url);
    xhr.withCredentials = settings.credentials;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        progress((e.loaded / e.total) * 100);
      }
    };
    xhr.onerror = () => reject('Image upload failed due to a XHR Transport error. Code: ' + xhr.status);
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject('HTTP Error: ' + xhr.status);
        return;
      }
      let json: any = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        json = null;
      }
      if (!json || !isString(json.location)) {
        reject('Invalid JSON: ' + xhr.responseText);
        return;
      }
      resolve(pathJoin(settings.basePath, json.location));
    };
    const formData = new FormData();
    formData.append('file', blobInfo.blob(), blobInfo.filename());
    xhr.send(formData);
  });

const normalizeError = (err: unknown): UploadFailure => {
  if (isString(err)) {
    return { message: err, remove: false };
  }
  if (isObject(err) && isString((err as any).message)) {
    return { message: (err as any).message, remove: !!(err as any).remove };
  }
  if (err instanceof Error) {
    return { message: err.message, remove: false };
  }
  return { message: 'Unknown upload error', remove: false };
};

export const createUploader = (settings: UploaderSettings): Uploader => {
  const pending = new Map<string, Promise<UploadResult>>();
  const handler: UploadHandler | null = isFunction(settings.handler) ? settings.handler : settings.url ? defaultHandler(settings) : null;

  const uploadBlob = (blobInfo: BlobInfo, progress: ProgressFn): Promise<UploadResult> => {
    const key = blobInfo.blobUri();
    const existing = pending.get(key);
    if (existing) {
      return existing;
    }
    const promise = Promise.resolve()
      .then(() => (handler as UploadHandler)(blobInfo, progress))
      .then(
        (url) => {
          if (!isString(url)) {
            throw new Error('Upload handler must resolve with a URL string');
          }
          return { url, blobInfo, status: true } as UploadResult;
        },
        (err) => ({ url: '', blobInfo, status: false, error: normalizeError(err) }) as UploadResult,
      )
      .then((result) => {
        pending.delete(key);
        return result;
      });
    pending.set(key, promise);
    return promise;
  };

  const upload = (blobInfos: BlobInfo[], openNotification?: () => NotificationApi): Promise<UploadResult[]> => {
    if (!handler || blobInfos.length === 0) {
      return Promise.resolve([]);
    }
    const notification = openNotification ? openNotification() : null;
    const percents = blobInfos.map(() => 0);
    const report = (index: number) => (percent: number) => {
      percents[index] = Math.max(0, Math.min(100, percent));
      if (notification) {
        notification.progressBar.value(Math.round(percents.reduce((a, b) => a + b, 0) / percents.length));
      }
    };
    return Promise.all(blobInfos.map((b, i) => uploadBlob(b, report(i)))).then((results) => {
      if (notification) {
        notification.close();
      }
      return results;
    });
  };

  return { upload, hasHandler: () => !!handler };
};
