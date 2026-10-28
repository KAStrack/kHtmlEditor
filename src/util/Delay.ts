interface Removable {
  removed: boolean;
}

const raf = (cb: () => void): number => {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(cb);
  }
  return setTimeout(cb, 0) as unknown as number;
};

const cancelRaf = (id: number): void => {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(id);
  } else {
    clearTimeout(id);
  }
};

export const Delay = {
  setTimeout: (cb: () => void, time: number = 0): number => setTimeout(cb, time) as unknown as number,
  clearTimeout: (id: number): void => clearTimeout(id),
  setInterval: (cb: () => void, time: number = 0): number => setInterval(cb, time) as unknown as number,
  clearInterval: (id: number): void => clearInterval(id),
  requestAnimationFrame: raf,
  cancelAnimationFrame: cancelRaf,

  /** Timeout that is skipped if the editor is removed before it fires. */
  setEditorTimeout: (editor: Removable, cb: () => void, time: number = 0): number =>
    setTimeout(() => {
      if (!editor.removed) {
        cb();
      }
    }, time) as unknown as number,

  setEditorInterval: (editor: Removable, cb: () => void, time: number = 0): number => {
    const id = setInterval(() => {
      if (!editor.removed) {
        cb();
      } else {
        clearInterval(id);
      }
    }, time);
    return id as unknown as number;
  },
};
