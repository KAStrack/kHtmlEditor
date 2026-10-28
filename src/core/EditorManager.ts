import { Observable } from '../util/Observable';
import { URI } from '../util/URI';
import { Env } from '../util/Env';
import { Tools } from '../util/Tools';
import { isString, isArray } from '../util/Type';
import { DOMUtils } from '../dom/DOMUtils';
import { Editor, RawEditorOptions } from './Editor';
import { PluginManager, ThemeManager } from './AddOnManager';
import { ScriptLoader } from './ScriptLoader';
import { I18n } from '../i18n/I18n';

declare const __KHE_VERSION__: string;
declare const __KHE_RELEASE_DATE__: string;

/**
 * The global editor manager (`kHtmlEditor`), API-compatible with the `tinymce` global.
 */
export class EditorManager extends Observable {
  readonly majorVersion = '7';
  readonly minorVersion = '0.0';
  readonly version: string = typeof __KHE_VERSION__ !== 'undefined' ? __KHE_VERSION__ : '0.0.0';
  readonly releaseDate: string = typeof __KHE_RELEASE_DATE__ !== 'undefined' ? __KHE_RELEASE_DATE__ : '';
  readonly pageUid: string = 'khe_' + Math.random().toString(36).slice(2);
  baseURL = '';
  baseURI!: URI;
  documentBaseURL = '';
  suffix = '';
  defaultOptions: RawEditorOptions = {};
  activeEditor: Editor | null = null;
  focusedEditor: Editor | null = null;
  readonly editors: Editor[] = [];
  readonly i18n = I18n;
  readonly DOM = DOMUtils.DOM;
  readonly PluginManager = PluginManager;
  readonly ThemeManager = ThemeManager;
  readonly ScriptLoader = ScriptLoader.ScriptLoader;
  readonly Env = Env;
  readonly Editor = Editor;
  readonly util = { Tools, I18n, URI };
  readonly dom = { DOMUtils };
  readonly isKHtmlEditor = true;

  // TinyMCE utility aliases.
  readonly each = Tools.each;
  readonly map = Tools.map;
  readonly grep = Tools.grep;
  readonly inArray = Tools.inArray;
  readonly extend = Tools.extend;
  readonly walk = Tools.walk;
  readonly resolve = Tools.resolve;
  readonly makeMap = Tools.makeMap;
  readonly toArray = Tools.toArray;
  readonly trim = Tools.trim;
  readonly explode = Tools.explode;
  readonly is = Tools.is;
  readonly isArray = Tools.isArray;
  readonly hasOwn = Tools.hasOwn;
  readonly _addCacheSuffix = Tools._addCacheSuffix;

  constructor() {
    super();
    this.setup();
  }

  get EditorManager(): EditorManager {
    return this;
  }

  setup(): void {
    this.documentBaseURL = URI.getDocumentBaseUrl(document.location);
    if (/^[^:]+:\/\/\/?[^\/]+\//.test(this.documentBaseURL)) {
      this.documentBaseURL = this.documentBaseURL.replace(/[\?#].*$/, '').replace(/[\/\\][^\/]+$/, '');
      if (!/[\/\\]$/.test(this.documentBaseURL)) {
        this.documentBaseURL += '/';
      }
    }
    let baseURL = '';
    let suffix = '';
    const scriptSrc = (document.currentScript as HTMLScriptElement | null)?.src || this.findScriptSrc();
    if (scriptSrc) {
      const src = scriptSrc.replace(/[\?#].*$/, '');
      const m = /\/([^/]+)$/.exec(src);
      if (m) {
        suffix = /\.min\.js$/.test(m[1]) ? '.min' : '';
        baseURL = src.substring(0, src.lastIndexOf('/'));
      }
    }
    if (!baseURL) {
      baseURL = this.documentBaseURL.replace(/\/$/, '');
    }
    this.baseURL = new URI(this.documentBaseURL).toAbsolute(baseURL);
    this.baseURI = new URI(this.baseURL);
    this.suffix = suffix;
    (PluginManager as any).setBaseUrl(this.baseURL + '/plugins');
    (ThemeManager as any).setBaseUrl(this.baseURL + '/themes');
  }

  private findScriptSrc(): string | null {
    const scripts = document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
      const src = scripts[i].src || '';
      if (/khtmleditor(\.min)?\.js(\?|#|$)/i.test(src)) {
        return src;
      }
    }
    return null;
  }

  overrideDefaults(defaultOptions: RawEditorOptions): void {
    const baseUrl = defaultOptions.base_url;
    if (baseUrl) {
      this._setBaseUrl(baseUrl);
    }
    const suffix = defaultOptions.suffix;
    if (suffix) {
      this.suffix = suffix;
    }
    this.defaultOptions = defaultOptions;
  }

  _setBaseUrl(baseUrl: string): void {
    this.baseURL = new URI(this.documentBaseURL).toAbsolute(baseUrl.replace(/\/+$/, ''));
    this.baseURI = new URI(this.baseURL);
  }

  init(options: RawEditorOptions): Promise<Editor[]> {
    const self = this;
    let targets: HTMLElement[] = [];
    const invalidInlineTargets = Tools.makeMap('area base basefont br col frame hr img input isindex link meta param embed source wbr track colgroup option table tbody tfoot thead tr th td script noscript style textarea video audio iframe object menu', ' ');

    const isInvalidInlineTarget = (elm: Element) => !!invalidInlineTargets[elm.nodeName.toLowerCase()];

    if (options.target && options.target.nodeType) {
      targets = [options.target as HTMLElement];
    } else if (options.selector) {
      targets = Array.from(document.querySelectorAll<HTMLElement>(options.selector)).filter((e) => !isInvalidInlineTarget(e) || e.nodeName === 'TEXTAREA');
    } else if (options.elements) {
      const ids = isString(options.elements) ? options.elements.split(',') : (options.elements as string[]);
      targets = ids.map((id) => document.getElementById(id.trim())).filter((e): e is HTMLElement => !!e);
    } else if (options.mode === 'textareas' || !options.selector) {
      targets = Array.from(document.getElementsByTagName('textarea'));
    }

    const createId = (elm: HTMLElement): string => {
      let id = elm.id;
      if (!id) {
        id = elm.getAttribute('name') || '';
        if (!id || document.getElementById(id)) {
          id = DOMUtils.DOM.uniqueId();
        }
        elm.setAttribute('id', id);
      }
      return id;
    };

    return new Promise<Editor[]>((resolve) => {
      const editors: Editor[] = [];
      const pending = new Set<Editor>();
      const finish = () => resolve(editors);
      const uniqueTargets = targets.filter((t, i) => targets.indexOf(t) === i);
      for (const elm of uniqueTargets) {
        const id = createId(elm);
        if (self.get(id)) {
          continue;
        }
        const editor = new Editor(id, { ...options, target: elm }, self);
        editors.push(editor);
        pending.add(editor);
        editor.on('init', () => {
          pending.delete(editor);
          if (pending.size === 0) {
            finish();
          }
        });
        editor.on('remove', () => {
          pending.delete(editor);
          if (pending.size === 0) {
            finish();
          }
        });
        editor.render();
      }
      if (editors.length === 0) {
        finish();
      }
    });
  }

  get(id?: string | number): Editor | Editor[] | null {
    if (id === undefined) {
      return this.editors;
    }
    if (typeof id === 'number') {
      return this.editors[id] ?? null;
    }
    return this.editors.find((e) => e.id === id) ?? null;
  }

  add(editor: Editor): Editor {
    if (!this.editors.includes(editor)) {
      this.editors.push(editor);
    }
    (this.editors as any)[editor.id] = editor;
    this.activeEditor = this.activeEditor ?? editor;
    this.dispatch('AddEditor', { editor });
    if (!this.beforeUnloadBound) {
      this.beforeUnloadBound = true;
      window.addEventListener('beforeunload', this.beforeUnloadDelegate);
    }
    return editor;
  }
  private beforeUnloadBound = false;
  private readonly beforeUnloadDelegate = (e: BeforeUnloadEvent) => {
    const event = this.dispatch('BeforeUnload', { returnValue: undefined as string | undefined });
    if (event.returnValue) {
      e.preventDefault();
      e.returnValue = event.returnValue;
    }
    this.editors.forEach((ed) => {
      if (ed.options?.get('add_unload_trigger') !== false) {
        try {
          ed.save({ format: 'raw', no_events: true, set_dirty: false });
        } catch {
          /* ignore */
        }
      }
    });
  };

  createEditor(id: string, options: RawEditorOptions): Editor {
    return this.add(new Editor(id, options, this));
  }

  remove(selector?: string | Editor): Editor | null | void {
    if (selector === undefined) {
      this.editors.slice().forEach((e) => this.remove(e));
      return;
    }
    if (isString(selector)) {
      Array.from(document.querySelectorAll(selector)).forEach((elm) => {
        const editor = this.get(elm.id) as Editor | null;
        if (editor) {
          this.remove(editor);
        }
      });
      return;
    }
    const editor = selector;
    const idx = this.editors.indexOf(editor);
    if (idx === -1) {
      return null;
    }
    this.editors.splice(idx, 1);
    delete (this.editors as any)[editor.id];
    if (this.activeEditor === editor) {
      this.activeEditor = this.editors[0] ?? null;
    }
    if (this.focusedEditor === editor) {
      this.focusedEditor = null;
    }
    this.dispatch('RemoveEditor', { editor });
    if (this.editors.length === 0 && this.beforeUnloadBound) {
      window.removeEventListener('beforeunload', this.beforeUnloadDelegate);
      this.beforeUnloadBound = false;
    }
    if (!editor.removed) {
      editor.remove();
    }
    return editor;
  }

  execCommand(cmd: string, ui?: boolean, value?: any): boolean {
    const editor = this.activeEditor;
    switch (cmd) {
      case 'mceAddEditor': {
        if (!this.get(value)) {
          new Editor(value, { ...this.defaultOptions }, this).render();
        }
        return true;
      }
      case 'mceRemoveEditor': {
        const e = this.get(value) as Editor | null;
        if (e) {
          e.remove();
        }
        return true;
      }
      case 'mceToggleEditor': {
        const e = this.get(value) as Editor | null;
        if (!e) {
          this.execCommand('mceAddEditor', false, value);
          return true;
        }
        if (e.isHidden()) {
          e.show();
        } else {
          e.hide();
        }
        return true;
      }
    }
    return editor ? editor.execCommand(cmd, ui, value) : false;
  }

  triggerSave(): void {
    this.editors.forEach((e) => e.save());
  }

  addI18n(code: string, items: Record<string, string>): void {
    I18n.add(code, items);
  }

  translate(text: any): string {
    return I18n.translate(text);
  }

  setActive(editor: Editor): void {
    const activeEditor = this.activeEditor;
    if (activeEditor !== editor) {
      if (activeEditor) {
        activeEditor.dispatch('deactivate', { relatedTarget: editor });
      }
      editor.dispatch('activate', { relatedTarget: activeEditor });
    }
    this.activeEditor = editor;
  }

  /** Alias kept for `tinymce.get()` style loops that use `tinymce.editors[i]`. */
  getEditors(): Editor[] {
    return this.editors;
  }

  isArrayLike(v: unknown): boolean {
    return isArray(v);
  }
}
