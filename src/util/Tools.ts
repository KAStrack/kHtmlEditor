import * as Type from './Type';
import { trim, explode } from './Str';
import { extend as objExtend } from './Obj';

/**
 * TinyMCE-compatible utility bag (`tinymce.util.Tools`). Kept for plugins written against TinyMCE;
 * internal code uses the typed helpers in Arr/Obj/Str instead.
 */

const is = (obj: unknown, type?: string): boolean => {
  if (!type) {
    return obj !== undefined;
  }
  if (type === 'array' && Array.isArray(obj)) {
    return true;
  }
  return typeof obj === type;
};

const each = (o: any, cb: (value: any, key: any, obj?: any) => boolean | void, scope?: any): boolean => {
  if (!o) {
    return false;
  }
  const s = scope ?? o;
  if (o.length !== undefined && !Type.isString(o)) {
    for (let n = 0, l = o.length; n < l; n++) {
      if (cb.call(s, o[n], n, o) === false) {
        return false;
      }
    }
  } else {
    for (const n in o) {
      if (Object.prototype.hasOwnProperty.call(o, n)) {
        if (cb.call(s, o[n], n, o) === false) {
          return false;
        }
      }
    }
  }
  return true;
};

const map = <T, U>(array: ArrayLike<T> | undefined | null, cb: (item: T, index: number) => U): U[] => {
  const out: U[] = [];
  each(array, (item, index) => {
    out.push(cb(item, index));
  });
  return out;
};

const grep = <T>(a: ArrayLike<T> | undefined | null, f?: (item: T, index: number) => boolean): T[] => {
  const o: T[] = [];
  each(a, (v, index) => {
    if (!f || f(v, index)) {
      o.push(v);
    }
  });
  return o;
};

const inArray = <T>(a: ArrayLike<T> | undefined | null, v: T): number => {
  if (a) {
    for (let i = 0, l = a.length; i < l; i++) {
      if (a[i] === v) {
        return i;
      }
    }
  }
  return -1;
};

const makeMap = (items: string | string[] | undefined | null, delim: string | RegExp = /[,\s]/, map: Record<string, any> = {}): Record<string, any> => {
  const list = Type.isString(items) ? items.split(delim) : items ?? [];
  let i = list.length;
  while (i--) {
    map[list[i]] = {};
  }
  return map;
};

const toArray = <T>(obj: ArrayLike<T> | Iterable<T> | undefined | null): T[] => {
  if (!obj) {
    return [];
  }
  if (Array.isArray(obj)) {
    return obj;
  }
  const arr: T[] = [];
  const o = obj as ArrayLike<T>;
  for (let i = 0, l = o.length; i < l; i++) {
    arr[i] = o[i];
  }
  return arr;
};

const walk = (o: any, f: (item: any) => boolean | void, n?: string, s?: any): void => {
  const scope = s ?? o;
  if (o) {
    const items = n ? o[n] : o;
    if (items) {
      each(items, (item) => {
        if (f.call(scope, item) === false) {
          return false;
        }
        walk(item, f, n, scope);
        return undefined;
      });
    }
  }
};

const resolve = (n: string, o: any = (typeof window !== 'undefined' ? window : {})): any => {
  const parts = n.split('.');
  let cur = o;
  for (let i = 0; i < parts.length; i++) {
    cur = cur[parts[i]];
    if (!cur) {
      break;
    }
  }
  return cur;
};

const hasOwn = (obj: any, prop: string): boolean => Object.prototype.hasOwnProperty.call(obj, prop);

const extend = (target: any, ...sources: any[]): any => objExtend(target, ...sources);

const _addCacheSuffix = (url: string): string => url;

export const Tools = {
  trim,
  isArray: Type.isArray,
  is,
  toArray,
  makeMap,
  each,
  map,
  grep,
  inArray,
  hasOwn,
  extend,
  walk,
  resolve,
  explode,
  _addCacheSuffix,
};
