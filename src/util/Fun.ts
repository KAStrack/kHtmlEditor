export const noop = (..._args: any[]): void => {};
export const identity = <T>(x: T): T => x;
export const constant = <T>(x: T) => (): T => x;
export const never = constant<false>(false);
export const always = constant<true>(true);
export const not = <T extends any[]>(f: (...args: T) => boolean) => (...args: T): boolean => !f(...args);
export const compose = <A, B, C>(f: (b: B) => C, g: (a: A) => B) => (a: A): C => f(g(a));
export const die = (msg: string) => (): never => {
  throw new Error(msg);
};
export const tryCatch = <T>(f: () => T, fallback: T): T => {
  try {
    return f();
  } catch {
    return fallback;
  }
};
