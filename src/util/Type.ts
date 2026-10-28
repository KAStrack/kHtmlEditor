/** Runtime type predicates shared across the code base. */

export const isString = (v: unknown): v is string => typeof v === 'string';
export const isNumber = (v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v);
export const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';
// eslint-disable-next-line @typescript-eslint/ban-types
export const isFunction = (v: unknown): v is Function => typeof v === 'function';
export const isArray = <T = unknown>(v: unknown): v is T[] => Array.isArray(v);
export const isNull = (v: unknown): v is null => v === null;
export const isUndefined = (v: unknown): v is undefined => v === undefined;
export const isNullable = (v: unknown): v is null | undefined => v === null || v === undefined;
export const isNonNullable = <T>(v: T | null | undefined): v is NonNullable<T> => v !== null && v !== undefined;
export const isRegExp = (v: unknown): v is RegExp => Object.prototype.toString.call(v) === '[object RegExp]';
export const isPlainObject = (v: unknown): v is Record<string, any> => {
  if (v === null || typeof v !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(v);
  return proto === null || proto === Object.prototype;
};
/** Object (not array, not null) – includes class instances. */
export const isObject = (v: unknown): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v);
export const isArrayOf = <T>(v: unknown, pred: (x: unknown) => x is T): v is T[] => Array.isArray(v) && v.every(pred);
export const isPromiseLike = <T = unknown>(v: unknown): v is PromiseLike<T> => isObject(v) && isFunction((v as any).then);
