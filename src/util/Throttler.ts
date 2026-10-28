export interface Throttler<A extends any[]> {
  cancel: () => void;
  throttle: (...args: A) => void;
}

/** Runs on the first call and ignores further calls for `rate` ms. */
export const first = <A extends any[]>(fn: (...args: A) => void, rate: number): Throttler<A> => {
  let timer: number | null = null;
  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const throttle = (...args: A) => {
    if (timer === null) {
      timer = setTimeout(() => {
        timer = null;
        fn(...args);
      }, rate) as unknown as number;
    }
  };
  return { cancel, throttle };
};

/** Debounce: runs with the last arguments `rate` ms after the last call. */
export const last = <A extends any[]>(fn: (...args: A) => void, rate: number): Throttler<A> => {
  let timer: number | null = null;
  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const throttle = (...args: A) => {
    cancel();
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, rate) as unknown as number;
  };
  return { cancel, throttle };
};

/** Collapses many calls within one animation frame into a single call with the latest args. */
export const raf = <A extends any[]>(fn: (...args: A) => void): Throttler<A> => {
  let id: number | null = null;
  let lastArgs: A | null = null;
  const cancel = () => {
    if (id !== null) {
      cancelAnimationFrame(id);
      id = null;
      lastArgs = null;
    }
  };
  const throttle = (...args: A) => {
    lastArgs = args;
    if (id === null) {
      id = requestAnimationFrame(() => {
        id = null;
        const a = lastArgs as A;
        lastArgs = null;
        fn(...a);
      });
    }
  };
  return { cancel, throttle };
};
