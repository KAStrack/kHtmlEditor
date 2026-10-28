import { isPlainObject } from './Type';

export const keys = Object.keys;
export const has = <T extends object>(obj: T, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(obj, key);

export const each = <T>(obj: Record<string, T>, f: (value: T, key: string) => void): void => {
  const ks = Object.keys(obj);
  for (let i = 0; i < ks.length; i++) {
    f(obj[ks[i]], ks[i]);
  }
};

export const map = <T, U>(obj: Record<string, T>, f: (value: T, key: string) => U): Record<string, U> => {
  const r: Record<string, U> = {};
  each(obj, (v, k) => {
    r[k] = f(v, k);
  });
  return r;
};

export const filter = <T>(obj: Record<string, T>, pred: (value: T, key: string) => boolean): Record<string, T> => {
  const r: Record<string, T> = {};
  each(obj, (v, k) => {
    if (pred(v, k)) {
      r[k] = v;
    }
  });
  return r;
};

export const values = <T>(obj: Record<string, T>): T[] => Object.keys(obj).map((k) => obj[k]);
export const isEmpty = (obj: object): boolean => Object.keys(obj).length === 0;
export const size = (obj: object): number => Object.keys(obj).length;
export const get = <T>(obj: Record<string, T>, key: string): T | undefined => (has(obj, key) ? obj[key] : undefined);

/** Shallow merge of own enumerable properties (later wins); `undefined` values are skipped like TinyMCE's Tools.extend. */
export const extend = <T extends object>(target: T, ...sources: Array<object | undefined | null>): T => {
  for (const src of sources) {
    if (src) {
      for (const k of Object.keys(src)) {
        const v = (src as any)[k];
        if (v !== undefined) {
          (target as any)[k] = v;
        }
      }
    }
  }
  return target;
};

/** Deep merge for plain objects; arrays and other values are replaced, not merged. */
export const deepMerge = <T extends object>(target: T, ...sources: Array<object | undefined | null>): T => {
  for (const src of sources) {
    if (!src) {
      continue;
    }
    for (const k of Object.keys(src)) {
      const sv = (src as any)[k];
      const tv = (target as any)[k];
      if (isPlainObject(sv) && isPlainObject(tv)) {
        (target as any)[k] = deepMerge({ ...tv }, sv);
      } else if (sv !== undefined) {
        (target as any)[k] = sv;
      }
    }
  }
  return target;
};

export const mapToObject = <T>(ks: ArrayLike<string>, f: (key: string, i: number) => T): Record<string, T> => {
  const r: Record<string, T> = {};
  for (let i = 0; i < ks.length; i++) {
    r[ks[i]] = f(ks[i], i);
  }
  return r;
};
