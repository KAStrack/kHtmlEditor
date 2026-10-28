/** Tiny DOM helpers for building UI without a framework. */

export type Child = Node | string | null | undefined | false;

export interface Attrs {
  [key: string]: string | number | boolean | null | undefined | ((e: any) => void);
}

export const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Array<Child | Child[]>): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  for (const key of Object.keys(attrs)) {
    const value = attrs[key];
    if (value === null || value === undefined || value === false) {
      continue;
    }
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'class' || key === 'className') {
      el.className = String(value);
    } else if (key === 'style' && typeof value === 'string') {
      el.style.cssText = value;
    } else if (key === 'html') {
      el.innerHTML = String(value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
};

export const append = (el: Node, children: Array<Child | Child[]>): void => {
  for (const child of children) {
    if (Array.isArray(child)) {
      append(el, child);
    } else if (child === null || child === undefined || child === false) {
      continue;
    } else if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else {
      el.appendChild(child);
    }
  }
};

export const empty = (el: Element): void => {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
};

export const svgEl = (markup: string, className: string = 'khe-icon'): HTMLElement => {
  const span = document.createElement('span');
  span.className = className;
  span.innerHTML = markup;
  return span;
};

export const on = <K extends keyof HTMLElementEventMap>(el: EventTarget, name: K | string, handler: (e: any) => void, options?: AddEventListenerOptions | boolean): (() => void) => {
  el.addEventListener(name, handler as EventListener, options);
  return () => el.removeEventListener(name, handler as EventListener, options);
};

export const isDescendant = (root: Node | null, node: Node | null): boolean => !!root && !!node && (root === node || root.contains(node));

export const focusable = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);

let idCounter = 0;
export const uniqueId = (prefix: string = 'khe'): string => `${prefix}-${(idCounter++).toString(36)}`;

export const isMobile = (): boolean => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 640px), (pointer: coarse) and (max-width: 900px)').matches;
