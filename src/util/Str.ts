export const trim = (s: string): string => s.replace(/^[\s﻿\xA0]+|[\s﻿\xA0]+$/g, '');
export const isEmpty = (s: string): boolean => s.length === 0;
export const isNotEmpty = (s: string): boolean => s.length > 0;
export const startsWith = (s: string, prefix: string): boolean => s.startsWith(prefix);
export const endsWith = (s: string, suffix: string): boolean => s.endsWith(suffix);
export const contains = (s: string, sub: string): boolean => s.indexOf(sub) !== -1;
export const capitalize = (s: string): string => (s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const repeat = (s: string, n: number): string => (n > 0 ? s.repeat(n) : '');
export const removePrefix = (s: string, prefix: string): string => (s.startsWith(prefix) ? s.slice(prefix.length) : s);
export const removeSuffix = (s: string, suffix: string): string => (s.endsWith(suffix) ? s.slice(0, -suffix.length) : s);

/**
 * Splits a string by a delimiter and trims every value, dropping empties.
 * Mirrors TinyMCE's `Tools.explode`: the default delimiter is `,`.
 */
export const explode = (s: string | string[] | undefined | null, delim: string | RegExp = ','): string[] => {
  if (s === undefined || s === null) {
    return [];
  }
  if (Array.isArray(s)) {
    return s.map((x) => String(x));
  }
  if (s === '') {
    return [];
  }
  return s
    .split(delim)
    .map((x) => trim(x))
    .filter((x) => x.length > 0);
};

/** Splits on whitespace, dropping empty values. */
export const words = (s: string): string[] => trim(s).split(/\s+/).filter((x) => x.length > 0);

export const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Converts a wildcard pattern (`*` any, `+` one or more, `?` zero or one) into a RegExp. */
export const wildcardToRegExp = (pattern: string): RegExp =>
  new RegExp('^' + pattern.replace(/[.\\^$|()[\]{}]/g, '\\$&').replace(/\*/g, '.*').replace(/\+/g, '.+').replace(/\?/g, '.?') + '$');

export const toHex = (n: number, width: number = 2): string => {
  let h = n.toString(16);
  while (h.length < width) {
    h = '0' + h;
  }
  return h;
};

export const padLeft = (s: string, width: number, ch: string = ' '): string => {
  let r = s;
  while (r.length < width) {
    r = ch + r;
  }
  return r;
};

export const camelCaseToDash = (s: string): string => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
export const dashToCamelCase = (s: string): string => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
