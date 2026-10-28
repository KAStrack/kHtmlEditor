import { Schema, createSchema } from '../html/Schema';
import { createStyles, Styles, StyleMap } from '../html/StyleParser';
import { Entities } from '../html/Entities';
import { EventUtils } from './EventUtils';
import { TreeWalker } from './TreeWalker';
import * as NodeType from './NodeType';
import { isString, isArray, isFunction, isObject, isNullable, isNonNullable } from '../util/Type';
import { Tools } from '../util/Tools';
import { uuid } from '../util/Uuid';

/**
 * DOM utility class bound to a document (`editor.dom`). API mirrors TinyMCE's DOMUtils so that
 * plugins written against it keep working.
 */

export type RunArguments<T extends Node = Node> = string | T | Array<string | T> | null;
export type Target = Node | Window;
export interface DOMUtilsSettings {
  schema?: Schema;
  url_converter?: (url: string, name: string, elm?: string | Element) => string;
  url_converter_scope?: any;
  ownEvents?: boolean;
  keep_values?: boolean;
  update_styles?: boolean;
  root_element?: HTMLElement | null;
  collect?: boolean;
  onSetAttrib?: (e: SetAttribEvent) => void;
  contentCssCors?: boolean;
  referrerPolicy?: ReferrerPolicy;
  force_hex_color?: 'always' | 'rgb_only' | 'off';
}

export interface SetAttribEvent {
  attrElm: Element;
  attrName: string;
  attrValue: string | boolean | number | null;
}

export interface GeomRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AttrHooks {
  style: { set: (elm: Element, value: string | StyleMap | null) => void; get: (elm: Element) => string };
  href: { set: (elm: Element, value: string | null, name: string) => void; get: (elm: Element, name: string) => string | null };
  src: { set: (elm: Element, value: string | null, name: string) => void; get: (elm: Element, name: string) => string | null };
  [key: string]: { set: (elm: Element, value: any, name: string) => void; get?: (elm: Element, name: string) => string | null } | undefined;
}

const numericalCssMap = Tools.makeMap('fill-opacity font-weight line-height opacity orphans widows z-index zoom', ' ');

const isBlockLike = (schema: Schema, node: Node | string | null | undefined): boolean => {
  if (isString(node)) {
    return schema.isBlock(node.toLowerCase());
  }
  return NodeType.isElement(node) && schema.isBlock(node.nodeName.toLowerCase());
};

export class DOMUtils {
  readonly doc: Document;
  readonly win: Window;
  readonly settings: DOMUtilsSettings;
  readonly schema: Schema;
  readonly styles: Styles;
  readonly events: EventUtils;
  readonly root: HTMLElement | null;
  readonly boxModel = true;
  readonly stdMode = true;
  counter = 0;
  files: Record<string, boolean> = {};
  private readonly attrHooks: AttrHooks;
  private readonly keepValues: boolean;
  private readonly updateStyles: boolean;

  constructor(doc: Document, settings: DOMUtilsSettings = {}) {
    this.doc = doc;
    this.win = doc.defaultView as Window;
    this.settings = settings;
    this.schema = settings.schema ?? createSchema({});
    this.keepValues = !!settings.keep_values;
    this.updateStyles = settings.update_styles !== false;
    this.styles = createStyles(
      {
        url_converter: settings.url_converter,
        url_converter_scope: settings.url_converter_scope,
      },
      this.schema,
    );
    this.events = new EventUtils();
    this.root = settings.root_element ?? null;
    this.attrHooks = this.setupAttrHooks();
  }

  private setupAttrHooks(): AttrHooks {
    const self = this;
    const keepValues = this.keepValues;
    const hooks: AttrHooks = {
      style: {
        set: (elm, value) => {
          if (value !== null && isObject(value)) {
            self.setStyles(elm as HTMLElement, value);
            return;
          }
          if (keepValues) {
            if (value === null || value === '') {
              elm.removeAttribute('data-mce-style');
            } else {
              elm.setAttribute('data-mce-style', value);
            }
          }
          if (value === null || value === '') {
            elm.removeAttribute('style');
          } else {
            (elm as HTMLElement).style.cssText = value;
          }
        },
        get: (elm) => {
          const value = elm.getAttribute('data-mce-style') || elm.getAttribute('style');
          return self.styles.serialize(self.styles.parse(value), elm.nodeName.toLowerCase());
        },
      },
      href: {
        set: (elm, value, name) => {
          if (keepValues) {
            if (value === null || value === '') {
              elm.removeAttribute('data-mce-' + name);
            } else {
              const converted = self.settings.url_converter ? self.settings.url_converter.call(self.settings.url_converter_scope ?? self, value, name, elm) : value;
              elm.setAttribute('data-mce-' + name, converted);
            }
          }
          if (value === null || value === '') {
            elm.removeAttribute(name);
          } else {
            elm.setAttribute(name, value);
          }
        },
        get: (elm, name) => elm.getAttribute('data-mce-' + name) || elm.getAttribute(name),
      },
      src: undefined as any,
    };
    hooks.src = hooks.href;
    return hooks;
  }

  isBlock(node: Node | string | null | undefined): boolean {
    return isBlockLike(this.schema, node);
  }

  clone<T extends Node>(node: T, deep: boolean): T {
    return node.cloneNode(deep) as T;
  }

  getRoot(): HTMLElement {
    return this.root ?? this.doc.body;
  }

  getViewPort(argWin?: Window): GeomRect {
    const win = argWin ?? this.win;
    const doc = win.document;
    const el = doc.documentElement;
    return { x: win.pageXOffset || el.scrollLeft, y: win.pageYOffset || el.scrollTop, w: win.innerWidth || el.clientWidth, h: win.innerHeight || el.clientHeight };
  }

  getRect(elm: string | HTMLElement): GeomRect {
    const el = this.get(elm);
    if (!el) {
      return { x: 0, y: 0, w: 0, h: 0 };
    }
    const pos = this.getPos(el);
    const size = this.getSize(el);
    return { x: pos.x, y: pos.y, w: size.w, h: size.h };
  }

  getSize(elm: string | HTMLElement): { w: number; h: number } {
    const el = this.get(elm);
    if (!el) {
      return { w: 0, h: 0 };
    }
    let w = this.getStyle(el, 'width');
    let h = this.getStyle(el, 'height');
    if (!w || w.indexOf('px') === -1) {
      w = '0';
    }
    if (!h || h.indexOf('px') === -1) {
      h = '0';
    }
    return { w: parseInt(w, 10) || el.offsetWidth || el.clientWidth, h: parseInt(h, 10) || el.offsetHeight || el.clientHeight };
  }

  getParent<K extends keyof HTMLElementTagNameMap>(node: string | Node | null, selector: K, root?: Node): HTMLElementTagNameMap[K] | null;
  getParent<T extends Node>(node: string | Node | null, selector: (node: Node) => node is T, root?: Node): T | null;
  getParent(node: string | Node | null, selector?: string | ((node: Node) => boolean), root?: Node): Node | null;
  getParent(node: string | Node | null, selector?: string | ((node: Node) => boolean), root?: Node): Node | null {
    const parents = this.getParents(node, selector, root, false);
    return parents.length > 0 ? parents[0] : null;
  }

  getParents<K extends keyof HTMLElementTagNameMap>(node: string | Node | null, selector: K, root?: Node, collect?: boolean): Array<HTMLElementTagNameMap[K]>;
  getParents<T extends Node>(node: string | Node | null, selector: (node: Node) => node is T, root?: Node, collect?: boolean): T[];
  getParents(node: string | Node | null, selector?: string | ((node: Node) => boolean), root?: Node, collect?: boolean): Node[];
  getParents(node: string | Node | null, selector?: string | ((node: Node) => boolean), root?: Node, collect?: boolean): Node[] {
    const collectAll = collect !== false;
    let elm: Node | null = isString(node) ? this.get(node) : node;
    const result: Node[] = [];
    const rootNode = root ?? this.getRoot();
    const matcher: (n: Node) => boolean = isString(selector)
      ? (n) => this.is(n, selector)
      : isFunction(selector)
        ? (selector as (n: Node) => boolean)
        : () => true;
    while (elm) {
      if (elm === rootNode || isNullable(elm.nodeType) || NodeType.isDocument(elm) || NodeType.isDocumentFragment(elm)) {
        break;
      }
      if (matcher(elm)) {
        result.push(elm);
        if (!collectAll) {
          break;
        }
      }
      elm = elm.parentNode;
    }
    return result;
  }

  get(elm: string | Node | null | undefined): HTMLElement | null {
    if (elm && this.doc && isString(elm)) {
      const node = this.doc.getElementById(elm);
      if (node && node.id !== elm) {
        return this.doc.getElementsByName(elm)[1] as HTMLElement;
      }
      return node;
    }
    return elm as HTMLElement | null;
  }

  getNext(node: Node | null, selector: string | ((node: Node) => boolean)): Node | null {
    return this.findSib(node, selector, 'nextSibling');
  }

  getPrev(node: Node | null, selector: string | ((node: Node) => boolean)): Node | null {
    return this.findSib(node, selector, 'previousSibling');
  }

  private findSib(node: Node | null, selector: string | ((node: Node) => boolean), name: 'nextSibling' | 'previousSibling'): Node | null {
    let func: (n: Node) => boolean;
    if (isString(selector)) {
      func = (n) => this.is(n, selector);
    } else {
      func = selector;
    }
    if (node) {
      let n: Node | null = node[name];
      for (; n; n = n[name]) {
        if (isFunction(func) && func(n)) {
          return n;
        }
      }
    }
    return null;
  }

  select<K extends keyof HTMLElementTagNameMap>(selector: K, scope?: string | Node): Array<HTMLElementTagNameMap[K]>;
  select<T extends HTMLElement = HTMLElement>(selector: string, scope?: string | Node): T[];
  select(selector: string, scope?: string | Node): HTMLElement[] {
    const root = (this.get(scope ?? null) ?? this.getRoot()) as ParentNode;
    return Array.from(root.querySelectorAll(selector)) as HTMLElement[];
  }

  is<T extends Element>(elm: Node | Node[] | null | undefined, selector: string): elm is T;
  is(elm: Node | Node[] | null | undefined, selector: string): boolean;
  is(elm: Node | Node[] | null | undefined, selector: string): boolean {
    if (!elm) {
      return false;
    }
    if (isArray(elm)) {
      return elm.every((e) => this.is(e, selector));
    }
    if (!NodeType.isElement(elm)) {
      return false;
    }
    // Simple id/class/tag selectors are fast-pathed.
    if (/^([a-z0-9],?)+$/i.test(selector)) {
      const names = selector.toLowerCase().split(',');
      return names.includes(elm.nodeName.toLowerCase());
    }
    try {
      return elm.matches(selector);
    } catch {
      return false;
    }
  }

  add(parentElm: RunArguments, name: string | Element, attrs?: Record<string, string | boolean | number | null> | null, html?: string | Node | null, create?: boolean): HTMLElement {
    return this.run(parentElm, (parent) => {
      const newElm = isString(name) ? this.doc.createElement(name) : name;
      this.setAttribs(newElm, attrs ?? null);
      if (html) {
        if (!isString(html) && NodeType.isNode(html)) {
          newElm.appendChild(html);
        } else if (isString(html)) {
          this.setHTML(newElm, html);
        }
      }
      return !create ? parent.appendChild(newElm) : newElm;
    }) as HTMLElement;
  }

  create<K extends keyof HTMLElementTagNameMap>(name: K, attrs?: Record<string, string | boolean | number | null> | null, html?: string | Node | null): HTMLElementTagNameMap[K];
  create(name: string, attrs?: Record<string, string | boolean | number | null> | null, html?: string | Node | null): HTMLElement;
  create(name: string, attrs?: Record<string, string | boolean | number | null> | null, html?: string | Node | null): HTMLElement {
    return this.add(this.doc.createElement(name), name, attrs, html, true);
  }

  createHTML(name: string, attrs?: Record<string, string | null> | null, html: string = ''): string {
    let outHtml = '<' + name;
    if (attrs) {
      for (const key of Object.keys(attrs)) {
        const v = attrs[key];
        if (isNonNullable(v)) {
          outHtml += ' ' + key + '="' + this.encode(String(v)) + '"';
        }
      }
    }
    if (html || !this.schema.getVoidElements()[name]) {
      return outHtml + '>' + html + '</' + name + '>';
    }
    return outHtml + ' />';
  }

  createFragment(html?: string): DocumentFragment {
    const container = this.doc.createElement('div');
    const frag = this.doc.createDocumentFragment();
    frag.appendChild(container);
    if (html) {
      container.innerHTML = html;
    }
    let node: Node | null;
    while ((node = container.firstChild)) {
      frag.appendChild(node);
    }
    frag.removeChild(container);
    return frag;
  }

  remove<T extends Node>(node: string | T | T[], keepChildren?: boolean): T | T[] | null {
    const result = this.run(node, (n) => {
      const parent = n.parentNode;
      if (!parent) {
        return null;
      }
      if (keepChildren) {
        while (n.firstChild) {
          parent.insertBefore(n.firstChild, n);
        }
      }
      parent.removeChild(n);
      return n;
    });
    return result as T | T[] | null;
  }

  setStyle(elm: string | Element | Element[], name: string | StyleMap, value?: string | number | null): void {
    this.run(elm, (e) => {
      const el = e as HTMLElement;
      if (isString(name)) {
        this.applyStyle(el, name, value ?? null);
      } else {
        this.setStyles(el, name);
      }
    });
  }

  private applyStyle(el: HTMLElement, name: string, value: string | number | null): void {
    let v: string | null = value === null || value === '' ? null : String(value);
    if (v !== null && typeof value === 'number' && !numericalCssMap[name]) {
      v = value + 'px';
    }
    const styleName = name.replace(/-(\D)/g, (_m, c: string) => c.toUpperCase());
    if (v === null) {
      el.style.removeProperty(name);
      (el.style as any)[styleName] = '';
    } else {
      (el.style as any)[styleName] = v;
      if ((el.style as any)[styleName] === '' && name.indexOf('-') !== -1) {
        el.style.setProperty(name, v);
      }
    }
    if (!el.getAttribute('style')) {
      el.removeAttribute('style');
    }
    if (this.updateStyles && this.keepValues) {
      el.setAttribute('data-mce-style', this.styles.serialize(this.styles.parse(el.style.cssText), el.nodeName.toLowerCase()));
      if (!el.getAttribute('data-mce-style')) {
        el.removeAttribute('data-mce-style');
      }
    }
  }

  getStyle(elm: string | Element | null, name: string, computed?: boolean): string | undefined {
    const el = this.get(elm) as HTMLElement | null;
    if (!el || !NodeType.isElement(el)) {
      return undefined;
    }
    if (computed) {
      const cs = this.win.getComputedStyle(el);
      return cs.getPropertyValue(name) || (cs as any)[name.replace(/-(\D)/g, (_m, c: string) => c.toUpperCase())];
    }
    const styleName = name.replace(/-(\D)/g, (_m, c: string) => c.toUpperCase());
    if (styleName === 'float') {
      return el.style.cssFloat || (el.style as any).styleFloat;
    }
    let value = (el.style as any)[styleName] as string | undefined;
    if (value === undefined || value === '') {
      value = el.style.getPropertyValue(name) || undefined;
    }
    if (value && (styleName === 'color' || styleName === 'backgroundColor' || styleName === 'borderColor') && this.settings.force_hex_color !== 'off') {
      value = this.styles.toHex(value);
    }
    return value;
  }

  setStyles(elm: string | Element | Element[], stylesArg: StyleMap): void {
    this.run(elm, (e) => {
      const el = e as HTMLElement;
      for (const k of Object.keys(stylesArg)) {
        this.applyStyle(el, k, stylesArg[k]);
      }
    });
  }

  removeAllAttribs(e: RunArguments<Element>): void {
    this.run(e, (el) => {
      const attrs = (el as Element).attributes;
      for (let i = attrs.length - 1; i >= 0; i--) {
        (el as Element).removeAttributeNode(attrs.item(i) as Attr);
      }
    });
  }

  setAttrib(elm: RunArguments<Element>, name: string, value: string | boolean | number | null): void {
    this.run(elm, (e) => {
      const el = e as Element;
      let v: string | null = value === null || value === undefined ? null : String(value);
      if (value === false) {
        v = null;
      } else if (value === true) {
        v = name;
      }
      if (this.settings.onSetAttrib) {
        const ev: SetAttribEvent = { attrElm: el, attrName: name, attrValue: v };
        this.settings.onSetAttrib(ev);
        v = ev.attrValue as string | null;
      }
      const hook = this.attrHooks[name];
      if (hook && hook.set) {
        hook.set(el, v, name);
      } else if (v === null || v === '') {
        el.removeAttribute(name);
      } else {
        el.setAttribute(name, v);
      }
    });
  }

  setAttribs(elm: RunArguments<Element>, attrs: Record<string, string | boolean | number | null> | null): void {
    if (!attrs) {
      return;
    }
    this.run(elm, (e) => {
      for (const k of Object.keys(attrs)) {
        this.setAttrib(e as Element, k, attrs[k]);
      }
    });
  }

  getAttrib(elm: string | Element | null, name: string, defaultVal: string = ''): string {
    let value: string | null = null;
    const el = this.get(elm);
    if (el && NodeType.isElement(el)) {
      const hook = this.attrHooks[name];
      if (hook && hook.get) {
        value = hook.get(el, name);
      } else {
        value = el.getAttribute(name);
      }
    }
    return isNonNullable(value) ? value : defaultVal;
  }

  getAttribs(elm: string | Element): NamedNodeMap | Attr[] {
    const el = this.get(elm);
    return el ? el.attributes : [];
  }

  getPos(elm: string | Element, rootElm?: Element | null): { x: number; y: number } {
    const el = this.get(elm) as HTMLElement | null;
    const root = (rootElm ?? this.doc.body) as HTMLElement;
    if (!el) {
      return { x: 0, y: 0 };
    }
    const rect = el.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const doc = root.ownerDocument;
    const docRoot = doc.documentElement;
    const view = doc.defaultView as Window;
    if (root === doc.body || root === docRoot) {
      const scrollX = view.pageXOffset || docRoot.scrollLeft;
      const scrollY = view.pageYOffset || docRoot.scrollTop;
      return { x: Math.round(rect.left + scrollX - (docRoot.clientLeft || 0)), y: Math.round(rect.top + scrollY - (docRoot.clientTop || 0)) };
    }
    return { x: Math.round(rect.left - rootRect.left + root.scrollLeft), y: Math.round(rect.top - rootRect.top + root.scrollTop) };
  }

  parseStyle(cssText: string | null | undefined): StyleMap {
    return this.styles.parse(cssText);
  }

  serializeStyle(stylesArg: StyleMap, name?: string): string {
    return this.styles.serialize(stylesArg, name);
  }

  addStyle(cssText: string): void {
    const doc = this.doc;
    let styleElm = doc.getElementById('mceDefaultStyles') as HTMLStyleElement | null;
    if (!styleElm) {
      styleElm = doc.createElement('style');
      styleElm.id = 'mceDefaultStyles';
      styleElm.type = 'text/css';
      const head = doc.getElementsByTagName('head')[0];
      if (head.firstChild) {
        head.insertBefore(styleElm, head.firstChild);
      } else {
        head.appendChild(styleElm);
      }
    }
    styleElm.appendChild(doc.createTextNode(cssText));
  }

  loadCSS(urls: string): void {
    if (!urls) {
      return;
    }
    const doc = this.doc;
    const head = doc.getElementsByTagName('head')[0];
    for (const url of urls.split(',')) {
      const u = url.trim();
      if (!u || this.files[u]) {
        continue;
      }
      this.files[u] = true;
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.type = 'text/css';
      link.href = u;
      if (this.settings.contentCssCors) {
        link.crossOrigin = 'anonymous';
      }
      if (this.settings.referrerPolicy) {
        link.referrerPolicy = this.settings.referrerPolicy;
      }
      head.appendChild(link);
    }
  }

  addClass(elm: RunArguments<Element>, cls: string): void {
    this.run(elm, (e) => cls.split(' ').forEach((c) => c && (e as Element).classList.add(c)));
  }

  removeClass(elm: RunArguments<Element>, cls: string): void {
    this.run(elm, (e) => {
      const el = e as Element;
      cls.split(' ').forEach((c) => c && el.classList.remove(c));
      if (el.classList.length === 0) {
        el.removeAttribute('class');
      }
    });
  }

  hasClass(elm: string | Element | null, cls: string): boolean {
    const el = this.get(elm);
    if (!el || !cls) {
      return false;
    }
    return cls.split(' ').every((c) => el.classList.contains(c));
  }

  toggleClass(elm: RunArguments<Element>, cls: string, state?: boolean): void {
    this.run(elm, (e) => {
      const el = e as Element;
      if (state === undefined) {
        cls.split(' ').forEach((c) => c && el.classList.toggle(c));
      } else if (state) {
        this.addClass(el, cls);
      } else {
        this.removeClass(el, cls);
      }
    });
  }

  show(elm: RunArguments<Element>): void {
    this.run(elm, (e) => ((e as HTMLElement).style.display = ''));
  }

  hide(elm: RunArguments<Element>): void {
    this.run(elm, (e) => ((e as HTMLElement).style.display = 'none'));
  }

  isHidden(elm: string | Element): boolean {
    const el = this.get(elm) as HTMLElement | null;
    return !el || el.style.display === 'none';
  }

  uniqueId(prefix: string = 'mce_'): string {
    return prefix + this.counter++;
  }

  setHTML(elm: RunArguments<Element>, html: string): void {
    this.run(elm, (e) => {
      (e as Element).innerHTML = html;
    });
  }

  getOuterHTML(elm: string | Node): string {
    const el = this.get(elm) as Node | null;
    if (!el) {
      return '';
    }
    if (NodeType.isElement(el)) {
      return el.outerHTML;
    }
    const div = this.doc.createElement('div');
    div.appendChild(el.cloneNode(true));
    return div.innerHTML;
  }

  setOuterHTML(elm: string | Node | Node[], html: string): void {
    this.run(elm, (e) => {
      if (NodeType.isElement(e)) {
        e.outerHTML = html;
      }
    });
  }

  decode(text: string): string {
    return Entities.decode(text);
  }

  encode(text: string): string {
    return Entities.encodeAllRaw(text);
  }

  insertAfter<T extends Node>(node: T | T[], reference: string | Node): T | T[] {
    const ref = this.get(reference) as Node;
    return this.run(node, (n) => {
      const parent = ref.parentNode;
      const nextSibling = ref.nextSibling;
      if (parent) {
        if (nextSibling) {
          parent.insertBefore(n, nextSibling);
        } else {
          parent.appendChild(n);
        }
      }
      return n;
    }) as T | T[];
  }

  replace<T extends Node>(newElm: Node, oldElm: T | T[], keepChildren?: boolean): T | T[] {
    return this.run(oldElm, (old) => {
      if (keepChildren) {
        while (old.firstChild) {
          newElm.appendChild(old.firstChild);
        }
      }
      old.parentNode?.replaceChild(newElm, old);
      return old;
    }) as T | T[];
  }

  rename<K extends keyof HTMLElementTagNameMap>(elm: Element, name: K): HTMLElementTagNameMap[K];
  rename(elm: Element, name: string): Element;
  rename(elm: Element, name: string): Element {
    if (elm.nodeName.toLowerCase() !== name.toLowerCase()) {
      const newElm = this.create(name);
      const attrs = elm.attributes;
      for (let i = 0; i < attrs.length; i++) {
        newElm.setAttribute(attrs[i].name, attrs[i].value);
      }
      this.replace(newElm, elm, true);
      return newElm;
    }
    return elm;
  }

  findCommonAncestor(a: Node, b: Node): Node | null {
    let ps: Node | null = a;
    while (ps) {
      let pe: Node | null = b;
      while (pe && ps !== pe) {
        pe = pe.parentNode;
      }
      if (ps === pe) {
        break;
      }
      ps = ps.parentNode;
    }
    if (!ps && a.ownerDocument) {
      return a.ownerDocument.documentElement;
    }
    return ps;
  }

  run<R, T extends Node>(elm: RunArguments<T>, func: (node: T) => R, scope?: any): R | R[] | null {
    const context = scope ?? this;
    if (isString(elm)) {
      const el = this.get(elm) as T | null;
      return el ? func.call(context, el) : null;
    }
    if (isArray(elm)) {
      const result: R[] = [];
      for (const item of elm) {
        const el = isString(item) ? (this.get(item) as T | null) : item;
        if (el) {
          result.push(func.call(context, el));
        }
      }
      return result;
    }
    if (!elm) {
      return null;
    }
    return func.call(context, elm);
  }

  isEmpty(node: Node, elements?: Record<string, {}>, options?: EmptyOptions): boolean {
    return isEmptyDom(this.schema, node, elements, options);
  }

  createRng(): Range {
    return this.doc.createRange();
  }

  nodeIndex(node: Node | null, normalized?: boolean): number {
    let idx = 0;
    if (node) {
      let lastNodeType = node.nodeType;
      let tempNode = node.previousSibling;
      while (tempNode) {
        const nodeType = tempNode.nodeType;
        if (normalized && NodeType.isText(tempNode)) {
          if (nodeType === lastNodeType || !tempNode.data.length) {
            tempNode = tempNode.previousSibling;
            continue;
          }
        }
        idx++;
        lastNodeType = nodeType;
        tempNode = tempNode.previousSibling;
      }
    }
    return idx;
  }

  /**
   * Splits `parentElm` at `splitElm`, moving everything after the split point into a clone of the
   * parent chain. Returns the replacement (or split element) in the new position.
   */
  split<T extends Node>(parentElm: Node, splitElm: Node, replacementElm?: T): T | Node | undefined {
    let range = this.createRng();
    let beforeFragment: DocumentFragment;
    let afterFragment: DocumentFragment;
    if (parentElm && splitElm && parentElm.parentNode && splitElm.parentNode) {
      const parentNode = parentElm.parentNode;
      range.setStart(parentNode, this.nodeIndex(parentElm));
      range.setEnd(splitElm.parentNode, this.nodeIndex(splitElm));
      beforeFragment = range.extractContents();
      range = this.createRng();
      range.setStart(splitElm.parentNode, this.nodeIndex(splitElm) + 1);
      range.setEnd(parentNode, this.nodeIndex(parentElm) + 1);
      afterFragment = range.extractContents();
      parentNode.insertBefore(trimNode(this, beforeFragment, this.schema), parentElm);
      if (replacementElm) {
        parentNode.insertBefore(replacementElm, parentElm);
      } else {
        parentNode.insertBefore(splitElm, parentElm);
      }
      parentNode.insertBefore(trimNode(this, afterFragment, this.schema), parentElm);
      this.remove(parentElm);
      return replacementElm || splitElm;
    }
    return undefined;
  }

  bind<K extends keyof HTMLElementEventMap>(target: Target | Target[], name: K | string, func: (evt: any) => void, scope?: any): (evt: any) => void {
    const targets = isArray(target) ? target : [target];
    for (const t of targets) {
      this.events.bind(t as EventTarget, name, func, scope ?? this);
    }
    return func;
  }

  unbind(target: Target | Target[], name?: string, func?: (evt: any) => void): void {
    const targets = isArray(target) ? target : [target];
    for (const t of targets) {
      this.events.unbind(t as EventTarget, name, func);
    }
  }

  dispatch(target: Target, name: string, evt?: any): boolean {
    return this.events.dispatch(target as EventTarget, name, evt);
  }

  fire(target: Target, name: string, evt?: any): boolean {
    return this.dispatch(target, name, evt);
  }

  getContentEditable(node: Node | null | undefined): string | null {
    if (node && NodeType.isElement(node)) {
      const contentEditable = node.getAttribute('data-mce-contenteditable');
      if (contentEditable && contentEditable !== 'inherit') {
        return contentEditable;
      }
      return node.contentEditable !== 'inherit' ? node.contentEditable : null;
    }
    return null;
  }

  getContentEditableParent(node: Node | null | undefined): string | null {
    const root = this.getRoot();
    let state: string | null = null;
    for (let tempNode: Node | null | undefined = node; tempNode && tempNode !== root; tempNode = tempNode.parentNode) {
      state = this.getContentEditable(tempNode);
      if (state !== null) {
        break;
      }
    }
    return state;
  }

  isEditable(node: Node | null | undefined): boolean {
    if (isNonNullable(node)) {
      const scope = NodeType.isElement(node) ? node : node.parentNode;
      if (scope && NodeType.isElement(scope)) {
        return this.getContentEditableParent(scope) !== 'false' && (scope as HTMLElement).isContentEditable !== false;
      }
    }
    return false;
  }

  isChildOf(node: Node, parent: Node): boolean {
    return node === parent || parent.contains(node);
  }

  dumpRng(r: Range): string {
    return 'startContainer: ' + r.startContainer.nodeName + ', startOffset: ' + r.startOffset + ', endContainer: ' + r.endContainer.nodeName + ', endOffset: ' + r.endOffset;
  }

  destroy(): void {
    this.events.destroy();
  }

  static readonly DOM: DOMUtils = new DOMUtils(document);
  static nodeIndex = (node: Node | null, normalized?: boolean): number => DOMUtils.DOM.nodeIndex(node, normalized);
  static uuid = uuid;
}

/** Trims empty text nodes and empty inline wrappers produced by range extraction. */
const trimNode = <T extends Node>(dom: DOMUtils, node: T, schema: Schema, root?: Node): T => {
  const rootNode = root ?? node;
  if (NodeType.isElement(node) && NodeType.isBookmarkNode(node)) {
    return node;
  }
  const children = node.childNodes;
  for (let i = children.length - 1; i >= 0; i--) {
    trimNode(dom, children[i], schema, rootNode);
  }
  if (NodeType.isDocument(node) || NodeType.isDocumentFragment(node)) {
    return node;
  }
  if (NodeType.isElement(node) && !NodeType.isInternal(node) && !schema.getNonEmptyElements()[node.nodeName.toLowerCase()]) {
    const name = node.nodeName.toLowerCase();
    if (!schema.isBlock(name) && isEmptyDom(schema, node) && !node.hasAttribute('name') && !node.hasAttribute('id') && !node.hasAttribute('data-mce-bookmark') && node !== rootNode) {
      dom.remove(node);
    }
  } else if (NodeType.isText(node) && node.data.length === 0 && node !== rootNode) {
    dom.remove(node);
  }
  return node;
};

/**
 * DOM level emptiness check (port of TinyMCE's Empty.isEmpty): `<p><br></p>` is empty, named
 * anchors/bookmarks/non-empty elements are content, nbsp is content.
 */
export interface EmptyOptions {
  skipBogus?: boolean;
  includeZwsp?: boolean;
  /** Treat non-breaking spaces as whitespace (a block holding only `&nbsp;` is empty). */
  includeNbsp?: boolean;
  checkRootAsContent?: boolean;
  isContent?: (n: Node) => boolean;
}

export const isEmptyDom = (schema: Schema, targetNode: Node, elements?: Record<string, {}>, options: EmptyOptions = {}): boolean => {
  const skipBogus = options.skipBogus !== false;
  const includeZwsp = !!options.includeZwsp;
  const includeNbsp = !!options.includeNbsp;
  const nonEmpty = elements ?? schema.getNonEmptyElements();
  const whitespace = schema.getWhitespaceElements();

  const isContent = (node: Node): boolean => {
    if (options.isContent && options.isContent(node)) {
      return true;
    }
    if (NodeType.isElement(node)) {
      const name = node.nodeName.toLowerCase();
      if (nonEmpty[name] && name !== 'br') {
        return true;
      }
      if (node.hasAttribute('name') || node.hasAttribute('data-mce-bookmark') || NodeType.isNamedAnchor(node)) {
        return true;
      }
      return false;
    }
    if (NodeType.isText(node)) {
      let text = includeZwsp ? node.data : NodeType.removeZwsp(node.data);
      if (includeNbsp) {
        text = text.replace(/\u00a0/g, ' ');
      }
      if (!NodeType.isWhitespaceText(text)) {
        return true;
      }
      const parent = node.parentNode;
      return !!parent && NodeType.isElement(parent) && !!whitespace[parent.nodeName.toLowerCase()] && text.length > 0;
    }
    return NodeType.isComment(node) ? false : false;
  };

  if (options.checkRootAsContent && isContent(targetNode)) {
    return false;
  }
  let brCount = 0;
  let node: Node | null = targetNode.firstChild;
  if (!node) {
    return true;
  }
  const walker = new TreeWalker(node, targetNode);
  do {
    if (skipBogus && NodeType.isBogusAll(node)) {
      node = walker.next(true) as Node | null;
      continue;
    }
    if (NodeType.isBogus(node) && skipBogus) {
      node = walker.next() as Node | null;
      continue;
    }
    if (NodeType.isBr(node)) {
      brCount++;
      node = walker.next() as Node | null;
      continue;
    }
    if (isContent(node)) {
      return false;
    }
    node = walker.next() as Node | null;
  } while (node);
  return brCount <= 1;
};
