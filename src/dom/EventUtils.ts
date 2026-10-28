/**
 * Minimal DOM event binding helper with bookkeeping so that everything bound through it can be
 * removed on editor destroy. Native events are dispatched to callbacks untouched.
 */
type Handler = (e: any) => void;

interface Binding {
  target: EventTarget;
  name: string;
  handler: Handler;
  listener: EventListener;
  options?: AddEventListenerOptions | boolean;
}

export class EventUtils {
  private bindings: Binding[] = [];

  bind<K extends keyof HTMLElementEventMap>(target: EventTarget, name: K | string, handler: Handler, scope?: any, options?: AddEventListenerOptions | boolean): Handler {
    const names = name.split(' ');
    for (const n of names) {
      if (!n) {
        continue;
      }
      const listener: EventListener = (e) => handler.call(scope ?? target, e);
      target.addEventListener(n, listener, options);
      this.bindings.push({ target, name: n, handler, listener, options });
    }
    return handler;
  }

  unbind(target: EventTarget, name?: string, handler?: Handler): void {
    const names = name ? name.split(' ').filter((n) => n.length > 0) : null;
    this.bindings = this.bindings.filter((b) => {
      if (b.target !== target) {
        return true;
      }
      if (names && !names.includes(b.name)) {
        return true;
      }
      if (handler && b.handler !== handler) {
        return true;
      }
      b.target.removeEventListener(b.name, b.listener, b.options);
      return false;
    });
  }

  dispatch(target: EventTarget, name: string, detail?: any): boolean {
    const evt = new CustomEvent(name, { bubbles: true, cancelable: true, detail });
    return target.dispatchEvent(evt);
  }

  clean(target?: EventTarget): void {
    if (target) {
      this.unbind(target);
    } else {
      this.bindings.forEach((b) => b.target.removeEventListener(b.name, b.listener, b.options));
      this.bindings = [];
    }
  }

  destroy(): void {
    this.clean();
  }
}

export const sharedEvents = new EventUtils();
