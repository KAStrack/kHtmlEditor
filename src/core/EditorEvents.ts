import type { Editor } from './Editor';
import { EventDispatcher } from '../util/EventDispatcher';

/**
 * Binds native DOM events of the content document to editor events on demand (when a listener is
 * added via `editor.on('click')`) and forwards them with the same lower-case name.
 */
const customEventRootDelegates: Record<string, boolean> = {};

export const setupNativeEvents = (editor: Editor): { bindPending: () => void; unbindAll: () => void } => {
  const delegates: Record<string, (e: Event) => void> = {};
  const pending: Record<string, boolean> = {};
  let bound = false;

  const getEventTarget = (eventName: string): EventTarget | null => {
    if (eventName === 'resize' || eventName === 'scroll') {
      return editor.getWin();
    }
    return editor.getDoc();
  };

  const bindEvent = (eventName: string) => {
    if (delegates[eventName] || !editor.getDoc()) {
      pending[eventName] = true;
      return;
    }
    const target = getEventTarget(eventName);
    if (!target) {
      pending[eventName] = true;
      return;
    }
    const delegate = (e: Event) => {
      if (!editor.removed) {
        editor.dispatch(eventName, e);
      }
    };
    delegates[eventName] = delegate;
    target.addEventListener(eventName, delegate, eventName === 'focus' || eventName === 'blur' ? true : false);
    delete pending[eventName];
  };

  const unbindEvent = (eventName: string) => {
    const delegate = delegates[eventName];
    if (delegate) {
      const target = getEventTarget(eventName);
      target?.removeEventListener(eventName, delegate, eventName === 'focus' || eventName === 'blur' ? true : false);
      delete delegates[eventName];
    }
    delete pending[eventName];
  };

  editor.toggleNativeEvent = (name: string, state: boolean) => {
    if (name === 'focus' || name === 'blur') {
      // Focus handling is done by EditorFocus (focusin/focusout on the body).
      return;
    }
    if (!EventDispatcher.isNative(name)) {
      return;
    }
    if (state) {
      if (bound) {
        bindEvent(name);
      } else {
        pending[name] = true;
      }
    } else {
      unbindEvent(name);
    }
  };

  void customEventRootDelegates;

  return {
    bindPending: () => {
      bound = true;
      // Listeners registered before this bridge existed (e.g. in the constructor) are bound now too.
      const dispatcher = editor._eventDispatcher;
      if (dispatcher) {
        for (const name of dispatcher.getBoundNames()) {
          if (EventDispatcher.isNative(name) && name !== 'focus' && name !== 'blur') {
            pending[name] = true;
          }
        }
      }
      for (const name of Object.keys(pending)) {
        bindEvent(name);
      }
    },
    unbindAll: () => {
      for (const name of Object.keys(delegates)) {
        unbindEvent(name);
      }
      bound = false;
    },
  };
};
