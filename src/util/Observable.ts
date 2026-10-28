import { EventDispatcher, EditorEvent } from './EventDispatcher';

/**
 * Mixin that gives an object TinyMCE's observable surface (`on/off/once/dispatch/fire/hasEventListeners`).
 * Events bubble to `parent()` (editor → editor manager) unless `bubble === false`.
 */
export interface ObservableHost {
  removed?: boolean;
  _eventDispatcher?: EventDispatcher;
  toggleNativeEvent?: (name: string, state: boolean) => void;
  parent?: () => ObservableHost | undefined;
}

const getDispatcher = (host: ObservableHost): EventDispatcher => {
  if (!host._eventDispatcher) {
    host._eventDispatcher = new EventDispatcher({
      scope: host,
      toggleEvent: (name, state) => {
        if (EventDispatcher.isNative(name) && host.toggleNativeEvent) {
          host.toggleNativeEvent(name, state);
        }
      },
    });
  }
  return host._eventDispatcher;
};

export abstract class Observable implements ObservableHost {
  removed?: boolean;
  _eventDispatcher?: EventDispatcher;
  toggleNativeEvent?: (name: string, state: boolean) => void;
  parent?: () => ObservableHost | undefined;

  dispatch<T = any>(name: string, args?: T, bubble?: boolean): EditorEvent<T> {
    // Removed editors only fire remove/detach.
    if (this.removed && name !== 'remove' && name !== 'detach') {
      return getDispatcher(this).dispatch(name, args) as EditorEvent<T>;
    }
    const event = getDispatcher(this).dispatch<T>(name, args);
    if (bubble !== false && this.parent) {
      let p = this.parent();
      while (p && !event.isPropagationStopped()) {
        if ((p as any).dispatch) {
          (p as any).dispatch(name, event, false);
        }
        p = p.parent ? p.parent() : undefined;
      }
    }
    return event;
  }

  /** @deprecated use dispatch */
  fire<T = any>(name: string, args?: T, bubble?: boolean): EditorEvent<T> {
    return this.dispatch(name, args, bubble);
  }

  on<T = any>(name: string, callback: (event: EditorEvent<T>) => void, prepend?: boolean): this {
    getDispatcher(this).on(name, callback, prepend);
    return this;
  }

  off<T = any>(name?: string, callback?: (event: EditorEvent<T>) => void): this {
    getDispatcher(this).off(name, callback);
    return this;
  }

  once<T = any>(name: string, callback: (event: EditorEvent<T>) => void, prepend?: boolean): this {
    getDispatcher(this).once(name, callback, prepend);
    return this;
  }

  hasEventListeners(name: string): boolean {
    return getDispatcher(this).has(name);
  }
}
