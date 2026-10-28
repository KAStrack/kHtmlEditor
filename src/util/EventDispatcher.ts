import { isFunction } from './Type';

export interface NativeEventMap {
  [key: string]: any;
}

export interface EventInfo {
  type: string;
  target: any;
  preventDefault: () => void;
  isDefaultPrevented: () => boolean;
  stopPropagation: () => void;
  isPropagationStopped: () => boolean;
  stopImmediatePropagation: () => void;
  isImmediatePropagationStopped: () => boolean;
}

export type EditorEvent<T> = T & EventInfo;

export interface EventDispatcherSettings {
  scope?: any;
  /** Called with (name, state) whenever the first listener for an event is added or the last removed. */
  toggleEvent?: (name: string, state: boolean) => void;
  /** Called before dispatching; returning `false` cancels the dispatch. */
  beforeFire?: (args: EditorEvent<any>) => void | boolean;
}

interface Binding {
  func: (e: EditorEvent<any>) => void;
  removed: boolean;
}

/** Properties that must not be copied from native events (deprecated or clashing). */
const nativeSkip = new Set(['keyLocation', 'layerX', 'layerY', 'returnValue', 'webkitMovementX', 'webkitMovementY', 'keyIdentifier', 'mozPressure', 'cancelBubble', 'srcElement']);

/** Duck-typed: events from an iframe are not `instanceof` the host window's Event. */
const isNativeEvent = (e: unknown): e is Event =>
  !!e && typeof e === 'object' && typeof (e as Event).type === 'string' && typeof (e as Event).preventDefault === 'function' && typeof (e as Event).stopPropagation === 'function' && 'defaultPrevented' in (e as Event) && 'timeStamp' in (e as Event);

/** Builds the editor event object. Native events are copied so that listeners can mutate properties safely. */
export const normalize = <T extends object>(type: string, args: T | undefined, target: any): EditorEvent<T> => {
  let event: any;
  let original: Event | null = null;
  if (isNativeEvent(args)) {
    original = args;
    event = {};
    // eslint-disable-next-line guard-for-in
    for (const name in args) {
      if (!nativeSkip.has(name)) {
        const v = (args as any)[name];
        if (!isFunction(v)) {
          event[name] = v;
        }
      }
    }
    // Expose the real event for callers that need the live object (dataTransfer/clipboardData are live).
    event.originalEvent = original;
    event.dataTransfer = (args as any).dataTransfer;
    event.clipboardData = (args as any).clipboardData;
  } else {
    event = args ? { ...(args as any) } : {};
  }

  event.type = type;
  if (event.target === undefined || event.target === null) {
    event.target = target;
  }

  let defaultPrevented = original ? original.defaultPrevented : false;
  let propagationStopped = false;
  let immediateStopped = false;

  event.preventDefault = () => {
    defaultPrevented = true;
    if (original) {
      original.preventDefault();
    }
  };
  event.isDefaultPrevented = () => defaultPrevented || (original ? original.defaultPrevented : false);
  event.stopPropagation = () => {
    propagationStopped = true;
    if (original) {
      original.stopPropagation();
    }
  };
  event.isPropagationStopped = () => propagationStopped;
  event.stopImmediatePropagation = () => {
    immediateStopped = true;
    propagationStopped = true;
    if (original) {
      original.stopImmediatePropagation();
    }
  };
  event.isImmediatePropagationStopped = () => immediateStopped;
  return event as EditorEvent<T>;
};

export class EventDispatcher<T extends NativeEventMap = NativeEventMap> {
  private readonly bindings: Record<string, Binding[]> = {};
  private readonly scope: any;
  private readonly toggleEvent: (name: string, state: boolean) => void;
  private readonly beforeFire?: (args: EditorEvent<any>) => void | boolean;

  constructor(settings: EventDispatcherSettings = {}) {
    this.scope = settings.scope ?? this;
    this.toggleEvent = settings.toggleEvent ?? (() => {});
    this.beforeFire = settings.beforeFire;
  }

  static isNative(name: string): boolean {
    return nativeEvents.has(name.toLowerCase());
  }

  dispatch<K extends keyof T>(name: K, args?: T[K]): EditorEvent<T[K]>;
  dispatch<U = any>(name: string, args?: U): EditorEvent<U>;
  dispatch(name: string, args?: any): EditorEvent<any> {
    const lower = name.toLowerCase();
    const event = normalize(lower, args, this.scope);
    if (this.beforeFire && this.beforeFire(event) === false) {
      return event;
    }
    const handlers = this.bindings[lower];
    if (handlers) {
      // Copy so that handlers removing themselves don't skip others.
      const list = handlers.slice();
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b.removed) {
          continue;
        }
        if (event.isImmediatePropagationStopped()) {
          break;
        }
        b.func.call(this.scope, event);
      }
    }
    return event;
  }

  /** Alias kept for TinyMCE compatibility. */
  fire<U = any>(name: string, args?: U): EditorEvent<U> {
    return this.dispatch(name, args);
  }

  on<K extends keyof T>(name: K, callback: (event: EditorEvent<T[K]>) => void, prepend?: boolean): this;
  on<U = any>(name: string, callback: (event: EditorEvent<U>) => void, prepend?: boolean): this;
  on(name: string, callback: ((event: EditorEvent<any>) => void) | false, prepend?: boolean): this {
    if (callback === false) {
      callback = () => {};
    }
    if (!isFunction(callback)) {
      return this;
    }
    const names = name.toLowerCase().split(' ');
    for (const n of names) {
      if (!n) {
        continue;
      }
      let handlers = this.bindings[n];
      if (!handlers) {
        handlers = this.bindings[n] = [];
        this.toggleEvent(n, true);
      }
      const binding: Binding = { func: callback as (e: EditorEvent<any>) => void, removed: false };
      if (prepend) {
        handlers.unshift(binding);
      } else {
        handlers.push(binding);
      }
    }
    return this;
  }

  off(name?: string, callback?: (event: EditorEvent<any>) => void): this {
    if (name === undefined) {
      for (const n of Object.keys(this.bindings)) {
        this.off(n);
      }
      return this;
    }
    const names = name.toLowerCase().split(' ');
    for (const n of names) {
      const handlers = this.bindings[n];
      if (!handlers) {
        continue;
      }
      if (callback) {
        const remaining = handlers.filter((b) => {
          if (b.func === callback) {
            b.removed = true;
            return false;
          }
          return true;
        });
        if (remaining.length === 0) {
          delete this.bindings[n];
          this.toggleEvent(n, false);
        } else {
          this.bindings[n] = remaining;
        }
      } else {
        handlers.forEach((b) => (b.removed = true));
        delete this.bindings[n];
        this.toggleEvent(n, false);
      }
    }
    return this;
  }

  once<K extends keyof T>(name: K, callback: (event: EditorEvent<T[K]>) => void, prepend?: boolean): this;
  once<U = any>(name: string, callback: (event: EditorEvent<U>) => void, prepend?: boolean): this;
  once(name: string, callback: (event: EditorEvent<any>) => void, prepend?: boolean): this {
    const wrapper = (e: EditorEvent<any>) => {
      this.off(name, wrapper);
      callback.call(this.scope, e);
    };
    return this.on(name, wrapper, prepend);
  }

  has(name: string): boolean {
    const handlers = this.bindings[name.toLowerCase()];
    return !!handlers && handlers.length > 0;
  }

  /** Names of all events that currently have listeners. */
  getBoundNames(): string[] {
    return Object.keys(this.bindings).filter((n) => this.bindings[n].length > 0);
  }
}

const nativeEvents = new Set(
  (
    'focus blur focusin focusout click dblclick mousedown mouseup mousemove mouseover beforepaste paste cut copy selectionchange ' +
    'mouseout mouseenter mouseleave wheel keydown keypress keyup input beforeinput contextmenu dragstart dragend dragover ' +
    'draggesture dragdrop drop drag submit compositionstart compositionend compositionupdate touchstart touchmove touchend touchcancel'
  ).split(' '),
);
