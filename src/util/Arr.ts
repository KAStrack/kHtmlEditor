/** Small array helpers (TinyMCE-flavoured names where it helps porting behaviour). */

export const each = <T>(xs: ArrayLike<T>, f: (x: T, i: number) => void): void => {
  for (let i = 0; i < xs.length; i++) {
    f(xs[i], i);
  }
};

export const eachReverse = <T>(xs: ArrayLike<T>, f: (x: T, i: number) => void): void => {
  for (let i = xs.length - 1; i >= 0; i--) {
    f(xs[i], i);
  }
};

export const map = <T, U>(xs: ArrayLike<T>, f: (x: T, i: number) => U): U[] => {
  const r: U[] = new Array(xs.length);
  for (let i = 0; i < xs.length; i++) {
    r[i] = f(xs[i], i);
  }
  return r;
};

export const filter = <T>(xs: ArrayLike<T>, pred: (x: T, i: number) => boolean): T[] => {
  const r: T[] = [];
  for (let i = 0; i < xs.length; i++) {
    if (pred(xs[i], i)) {
      r.push(xs[i]);
    }
  }
  return r;
};

export const find = <T>(xs: ArrayLike<T>, pred: (x: T, i: number) => boolean): T | undefined => {
  for (let i = 0; i < xs.length; i++) {
    if (pred(xs[i], i)) {
      return xs[i];
    }
  }
  return undefined;
};

export const findIndex = <T>(xs: ArrayLike<T>, pred: (x: T, i: number) => boolean): number => {
  for (let i = 0; i < xs.length; i++) {
    if (pred(xs[i], i)) {
      return i;
    }
  }
  return -1;
};

export const exists = <T>(xs: ArrayLike<T>, pred: (x: T, i: number) => boolean): boolean => findIndex(xs, pred) !== -1;
export const forall = <T>(xs: ArrayLike<T>, pred: (x: T, i: number) => boolean): boolean => {
  for (let i = 0; i < xs.length; i++) {
    if (!pred(xs[i], i)) {
      return false;
    }
  }
  return true;
};

export const contains = <T>(xs: ArrayLike<T>, x: T): boolean => indexOf(xs, x) !== -1;
export const indexOf = <T>(xs: ArrayLike<T>, x: T): number => {
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] === x) {
      return i;
    }
  }
  return -1;
};

export const from = <T>(xs: ArrayLike<T> | Iterable<T>): T[] => Array.from(xs);
export const last = <T>(xs: ArrayLike<T>): T | undefined => (xs.length > 0 ? xs[xs.length - 1] : undefined);
export const head = <T>(xs: ArrayLike<T>): T | undefined => (xs.length > 0 ? xs[0] : undefined);
export const flatten = <T>(xss: ArrayLike<ArrayLike<T>>): T[] => {
  const r: T[] = [];
  for (let i = 0; i < xss.length; i++) {
    const xs = xss[i];
    for (let j = 0; j < xs.length; j++) {
      r.push(xs[j]);
    }
  }
  return r;
};
export const bind = <T, U>(xs: ArrayLike<T>, f: (x: T, i: number) => U[]): U[] => flatten(map(xs, f));
export const reverse = <T>(xs: ArrayLike<T>): T[] => from(xs).reverse();
export const unique = <T>(xs: ArrayLike<T>): T[] => from(new Set(from(xs)));
export const partition = <T>(xs: ArrayLike<T>, pred: (x: T) => boolean): { pass: T[]; fail: T[] } => {
  const pass: T[] = [];
  const fail: T[] = [];
  each(xs, (x) => (pred(x) ? pass : fail).push(x));
  return { pass, fail };
};
export const range = <T>(n: number, f: (i: number) => T): T[] => {
  const r: T[] = [];
  for (let i = 0; i < n; i++) {
    r.push(f(i));
  }
  return r;
};
export const difference = <T>(a: ArrayLike<T>, b: ArrayLike<T>): T[] => filter(a, (x) => !contains(b, x));
export const sort = <T>(xs: ArrayLike<T>, cmp?: (a: T, b: T) => number): T[] => from(xs).sort(cmp);
export const foldl = <T, A>(xs: ArrayLike<T>, f: (acc: A, x: T, i: number) => A, acc: A): A => {
  let a = acc;
  for (let i = 0; i < xs.length; i++) {
    a = f(a, xs[i], i);
  }
  return a;
};
export const foldr = <T, A>(xs: ArrayLike<T>, f: (acc: A, x: T, i: number) => A, acc: A): A => {
  let a = acc;
  for (let i = xs.length - 1; i >= 0; i--) {
    a = f(a, xs[i], i);
  }
  return a;
};
export const groupBy = <T>(xs: ArrayLike<T>, key: (x: T) => string): Record<string, T[]> => {
  const r: Record<string, T[]> = {};
  each(xs, (x) => {
    const k = key(x);
    (r[k] = r[k] || []).push(x);
  });
  return r;
};
