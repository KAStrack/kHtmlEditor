import { Observable } from '../util/Observable';
import { URI } from '../util/URI';
import { isFunction, isString } from '../util/Type';
import { explode } from '../util/Str';
import { uuidV4 } from '../util/Uuid';
import { DOMUtils } from '../dom/DOMUtils';
import type { Schema } from '../html/Schema';
import type { DomParser } from '../html/HtmlParser';
import { createOptions, Options } from './Options';
import * as EditorOptions from './EditorOptions';
import type { EditorManager } from './EditorManager';
import { EditorCommands, ExecCommandArgs } from '../commands/EditorCommands';
import { Shortcuts } from '../keyboard/Shortcuts';
import { createUiRegistry, UiRegistry } from './UiTypes';
import { createMode, EditorMode } from './Mode';
import { createWindowManager, WindowManager } from './WindowManager';
import { createNotificationManager, NotificationManager } from './NotificationManager';
import type { Theme, EditorUiApi } from './Theme';
import type { EditorSelection } from '../selection/Selection';
import type { Formatter } from '../format/Formatter';
import type { UndoManager } from '../undo/UndoManager';
import type { DomSerializer } from './DomSerializer';
import type { NodeChange } from './NodeChange';
import * as Content from '../content/ContentApi';
import * as EditorFocus from './EditorFocus';
import { convertURL as convertUrlImpl } from './UrlConverter';
import { setupNativeEvents } from './EditorEvents';
import { render } from './Init';
import { I18n } from '../i18n/I18n';
import { normalizeOptions } from '../compat/legacyOptions';
import type { BlobCache } from '../content/BlobCache';

export interface EditorUploadApi {
  blobCache: BlobCache;
  uploadImages: () => Promise<any[]>;
  uploadImagesAuto: () => Promise<any[]>;
  scanForImages: () => Promise<any[]>;
  destroy: () => void;
}

export interface EditorUi extends EditorUiApi {
  registry: UiRegistry;
  styleSheetLoader?: any;
}

export interface Quirks {
  isHidden?: () => boolean;
}

export type RawEditorOptions = Record<string, any>;

/**
 * The editor instance. API-compatible with TinyMCE's `tinymce.Editor` for everything a site or
 * plugin normally touches.
 */
export class Editor extends Observable {
  readonly id: string;
  readonly editorManager: EditorManager;
  readonly options: Options;
  /** Raw init configuration (TinyMCE 5 `editor.settings`). */
  readonly settings: RawEditorOptions;
  readonly editorUid: string = uuidV4();
  readonly documentBaseUrl: string;
  readonly baseUri: URI;
  readonly documentBaseURI: URI;
  readonly baseURI: URI;
  readonly suffix: string;
  readonly inline: boolean;
  readonly ui: EditorUi;
  readonly mode: EditorMode;
  readonly windowManager: WindowManager;
  readonly notificationManager: NotificationManager;
  readonly editorCommands: EditorCommands;
  readonly shortcuts: Shortcuts;
  readonly plugins: Record<string, any> = {};
  readonly contentCSS: string[] = [];
  readonly contentStyles: string[] = [];
  readonly loadedCSS: Record<string, boolean> = {};

  // Set during init.
  dom!: DOMUtils;
  schema!: Schema;
  parser!: DomParser;
  serializer!: DomSerializer;
  selection!: EditorSelection;
  formatter!: Formatter;
  undoManager!: UndoManager;
  editorUpload!: EditorUploadApi;
  theme!: Theme;
  quirks: Quirks = {};
  _nodeChangeDispatcher!: NodeChange;
  _nativeEvents: ReturnType<typeof setupNativeEvents>;

  initialized = false;
  rendered = false;
  override removed = false;
  destroyed = false;
  hidden = false;
  readonly: boolean;
  composing = false;
  hasVisual = true;
  isNotDirty = true;
  startContent = '';
  hasHiddenInput = false;
  orgDisplay = '';
  orgVisibility = '';

  container: HTMLElement | null = null;
  editorContainer: HTMLElement | null = null;
  contentAreaContainer: HTMLElement | null = null;
  iframeElement: HTMLIFrameElement | null = null;
  iframeHTML = '';
  contentDocument: Document | null = null;
  contentWindow: Window | null = null;
  bodyElement: HTMLElement | null = null;
  targetElm: HTMLElement | null = null;
  formElement: HTMLFormElement | null = null;
  formEventDelegate: ((e: Event) => void) | null = null;
  private editableRoot = true;

  constructor(id: string, rawOptions: RawEditorOptions, editorManager: EditorManager) {
    super();
    this.id = id;
    this.editorManager = editorManager;
    this.parent = () => editorManager;
    const normalized = normalizeOptions({ id, ...editorManager.defaultOptions, ...rawOptions });
    this.settings = normalized;
    this.options = createOptions(normalized, (msg) => console.warn('kHtmlEditor: ' + msg));
    this.targetElm = (normalized.target as HTMLElement | undefined) ?? (document.getElementById(id) as HTMLElement | null);
    this.inline = false;
    if (normalized.inline) {
      console.warn('kHtmlEditor: inline mode is not supported yet; using the classic iframe mode.');
    }
    this.convertURL = this.convertURL.bind(this);
    EditorOptions.registerOptions(this);
    this.readonly = this.options.get('readonly');
    this.suffix = editorManager.suffix;
    this.baseUri = editorManager.baseURI;
    this.baseURI = editorManager.baseURI;
    this.documentBaseUrl = this.options.get('document_base_url');
    this.documentBaseURI = new URI(this.documentBaseUrl, { base_uri: this.baseUri });
    this.ui = { registry: createUiRegistry(), show: () => {}, hide: () => {}, setEnabled: () => {}, isEnabled: () => true };
    this.mode = createMode(this);
    this.windowManager = createWindowManager(this);
    this.notificationManager = createNotificationManager(this);
    this.editorCommands = new EditorCommands(this);
    this.shortcuts = new Shortcuts(this);
    this._nativeEvents = setupNativeEvents(this);
    EditorFocus.setupFocusEvents(this);
    this.editableRoot = this.options.get('editable_root');
    const setup = EditorOptions.getSetupCallback(this);
    if (isFunction(setup)) {
      setup.call(this, this);
    }
  }

  // ---------------------------------------------------------------- lifecycle
  render(): void {
    render(this);
  }

  focus(skipFocus?: boolean | { scrollToSelection?: boolean }): void {
    this.execCommand('mceFocus', false, skipFocus, { skip_focus: true });
  }

  hasFocus(): boolean {
    return EditorFocus.hasFocus(this);
  }

  translate(text: any): string {
    return I18n.translate(text);
  }

  getParam<T = any>(name: string, defaultVal?: T, type?: string): T {
    const options = this.options;
    let value: any;
    if (options.isRegistered(name)) {
      value = options.get(name);
    } else {
      value = this.settings[name];
    }
    if (value === undefined) {
      return defaultVal as T;
    }
    if (type === 'hash' && isString(value)) {
      const out: Record<string, string> = {};
      for (const item of explode(value)) {
        const parts = item.split('=');
        out[parts[0]] = parts.length > 1 ? parts[1] : parts[0];
      }
      return out as unknown as T;
    }
    if (type === 'string[]' || type === 'array') {
      return (isString(value) ? explode(value) : value) as T;
    }
    return value as T;
  }

  hasPlugin(name: string, loaded?: boolean): boolean {
    const hasPlugin = EditorOptions.getPlugins(this).includes(name);
    if (hasPlugin) {
      return loaded ? this.editorManager.PluginManager.get(name) !== undefined : true;
    }
    return false;
  }

  nodeChanged(args?: Record<string, any>): void {
    this._nodeChangeDispatcher?.nodeChanged(args);
  }

  // ---------------------------------------------------------------- commands
  addCommand<S>(name: string, callback: (this: S, ui: boolean, value: any, args?: ExecCommandArgs) => void, scope?: S): void {
    this.editorCommands.addCommand(name, callback as any, scope);
  }

  addQueryStateHandler<S>(name: string, callback: (this: S) => boolean, scope?: S): void {
    this.editorCommands.addQueryStateHandler(name, callback as any, scope);
  }

  addQueryValueHandler<S>(name: string, callback: (this: S) => string, scope?: S): void {
    this.editorCommands.addQueryValueHandler(name, callback as any, scope);
  }

  addShortcut(pattern: string, desc: string, cmdFunc: string | (() => void), scope?: any): void {
    this.shortcuts.add(pattern, desc, cmdFunc, scope);
  }

  execCommand(cmd: string, ui?: boolean, value?: any, args?: ExecCommandArgs): boolean {
    return this.editorCommands.execCommand(cmd, ui, value, args);
  }

  queryCommandState(cmd: string): boolean {
    return this.editorCommands.queryCommandState(cmd);
  }

  queryCommandValue(cmd: string): string {
    return this.editorCommands.queryCommandValue(cmd);
  }

  queryCommandSupported(cmd: string): boolean {
    return this.editorCommands.queryCommandSupported(cmd);
  }

  // ---------------------------------------------------------------- visibility
  show(): void {
    if (this.hidden) {
      this.hidden = false;
      const container = this.getContainer();
      if (container) {
        container.style.display = '';
      }
      const target = this.getElement();
      if (target) {
        target.style.display = 'none';
      }
      this.load();
      this.dispatch('show');
    }
  }

  hide(): void {
    if (!this.hidden) {
      this.save();
      const container = this.getContainer();
      if (container) {
        container.style.display = 'none';
      }
      const target = this.getElement();
      if (target) {
        target.style.display = this.orgDisplay;
      }
      this.hidden = true;
      this.dispatch('hide');
    }
  }

  isHidden(): boolean {
    return this.hidden;
  }

  setProgressState(state: boolean, time?: number): boolean {
    this.dispatch('ProgressState', { state, time });
    return state;
  }

  // ---------------------------------------------------------------- content
  load(args: Content.SetContentArgs = {}): string {
    const elm = this.getElement();
    if (elm) {
      const loadArgs = { ...args, load: true };
      const el = elm as HTMLElement;
      const isField = el.nodeName === 'TEXTAREA' || el.nodeName === 'INPUT';
      const value = isField ? (el as HTMLTextAreaElement).value : el.innerHTML;
      const html = this.setContent(value, loadArgs);
      if (!loadArgs.no_events) {
        this.dispatch('LoadContent', { ...loadArgs, element: elm });
      }
      return html;
    }
    return '';
  }

  save(args: Record<string, any> = {}): string {
    const elm = this.getElement();
    if (!elm || !this.initialized || this.removed) {
      return '';
    }
    const saveArgs: Record<string, any> = { ...args, save: true, element: elm };
    let html = this.getContent(saveArgs) as string;
    saveArgs.content = html;
    if (!saveArgs.no_events) {
      this.dispatch('SaveContent', saveArgs);
    }
    if (saveArgs.format === 'raw') {
      this.dispatch('RawSaveContent', saveArgs);
    }
    html = saveArgs.content;
    const target = elm as HTMLElement;
    const isField = target.nodeName === 'TEXTAREA' || target.nodeName === 'INPUT';
    if (!isField) {
      if (args.is_removing || !this.inline) {
        target.innerHTML = html;
      }
      const form = this.dom?.getParent(this.id, 'form') as HTMLFormElement | null;
      if (form) {
        const inputs = form.elements;
        for (let i = 0; i < inputs.length; i++) {
          const input = inputs[i] as HTMLInputElement;
          if (input.name === this.id) {
            input.value = html;
            break;
          }
        }
      }
    } else {
      (target as HTMLTextAreaElement).value = html;
    }
    if (saveArgs.set_dirty !== false) {
      this.setDirty(false);
    }
    return html;
  }

  setContent(content: string | Node, args?: Content.SetContentArgs): string {
    return Content.setContent(this, content, args);
  }

  getContent(args?: Content.GetContentArgs): any {
    return Content.getContent(this, args);
  }

  insertContent(content: string, args?: Record<string, any>): void {
    this.execCommand('mceInsertContent', false, args ? { content, ...args } : content);
  }

  resetContent(initialContent?: string): void {
    Content.resetContent(this, initialContent);
  }

  isDirty(): boolean {
    return !this.isNotDirty;
  }

  setDirty(state: boolean): void {
    const oldState = !this.isNotDirty;
    this.isNotDirty = !state;
    if (state && state !== oldState) {
      this.dispatch('dirty');
    }
  }

  uploadImages(): Promise<any[]> {
    return this.editorUpload ? this.editorUpload.uploadImages() : Promise.resolve([]);
  }

  // ---------------------------------------------------------------- DOM access
  getContainer(): HTMLElement {
    if (!this.container) {
      this.container = this.editorContainer ?? (document.getElementById(this.id + '_parent') as HTMLElement | null);
    }
    return this.container as HTMLElement;
  }

  getContentAreaContainer(): HTMLElement {
    return this.contentAreaContainer as HTMLElement;
  }

  getElement(): HTMLElement {
    if (!this.targetElm) {
      this.targetElm = document.getElementById(this.id) as HTMLElement | null;
    }
    return this.targetElm as HTMLElement;
  }

  getWin(): Window {
    if (!this.contentWindow) {
      const elm = this.iframeElement;
      if (elm) {
        this.contentWindow = elm.contentWindow;
      }
    }
    return this.contentWindow as Window;
  }

  getDoc(): Document {
    if (!this.contentDocument) {
      const win = this.getWin();
      if (win) {
        this.contentDocument = win.document;
      }
    }
    return this.contentDocument as Document;
  }

  getBody(): HTMLElement {
    const doc = this.getDoc();
    return (this.bodyElement || (doc ? doc.body : null)) as HTMLElement;
  }

  convertURL(url: string, name: string, elm?: string | Element): string {
    return convertUrlImpl(this, url, name, elm);
  }

  addVisual(elm?: HTMLElement): void {
    const dom = this.dom;
    if (!dom) {
      return;
    }
    const root = elm ?? this.getBody();
    const tableClass = EditorOptions.getVisualAidsTableClass(this);
    const anchorClass = EditorOptions.getVisualAidsAnchorClass(this);
    const enabled = this.hasVisual;
    dom.select('table,a', root).forEach((el) => {
      if (el.nodeName === 'TABLE') {
        const border = dom.getAttrib(el, 'border') || dom.getStyle(el, 'border-width') || dom.getStyle(el, 'border');
        const hasBorder = border && border !== '0' && border !== '0px' && !/^0(px)?\s/.test(border);
        dom.toggleClass(el, tableClass, enabled && !hasBorder);
      } else if (el.nodeName === 'A' && !el.hasAttribute('href') && (el.hasAttribute('id') || el.hasAttribute('name'))) {
        dom.toggleClass(el, anchorClass, enabled);
      }
    });
    this.dispatch('VisualAid', { element: root, hasVisual: enabled });
  }

  setEditableRoot(state: boolean): void {
    if (this.editableRoot !== state) {
      this.editableRoot = state;
      if (this.initialized && !this.readonly) {
        this.getBody().contentEditable = String(state);
      }
      this.dispatch('EditableRootStateChange', { state });
    }
  }

  hasEditableRoot(): boolean {
    return this.editableRoot;
  }

  announce(message: string, options?: { assertive?: boolean }): void {
    const region = document.getElementById('khe-aria-live-' + this.id) ?? (() => {
      const el = document.createElement('div');
      el.id = 'khe-aria-live-' + this.id;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', options?.assertive ? 'assertive' : 'polite');
      el.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);';
      document.body.appendChild(el);
      return el;
    })();
    region.setAttribute('aria-live', options?.assertive ? 'assertive' : 'polite');
    region.textContent = '';
    setTimeout(() => {
      region.textContent = message;
    }, 50);
  }

  bindPendingEventDelegates(): void {
    this._nativeEvents.bindPending();
  }

  unbindAllNativeEvents(): void {
    this._nativeEvents.unbindAll();
  }

  // ---------------------------------------------------------------- removal
  remove(): void {
    if (this.removed) {
      return;
    }
    const body = this.getBody();
    const element = this.getElement();
    if (body && this.initialized) {
      this.save({ is_removing: true });
    }
    this.removed = true;
    this.unbindAllNativeEvents();
    if (this.hasHiddenInput && element?.nextSibling && element.nextSibling.nodeName === 'INPUT') {
      element.parentNode?.removeChild(element.nextSibling);
    }
    this.dispatch('remove');
    this.editorManager.remove(this);
    if (!this.inline && body && element) {
      element.style.visibility = this.orgVisibility;
      element.style.display = this.orgDisplay;
    }
    this.dispatch('detach');
    const container = this.getContainer();
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    if (this.editorUpload) {
      this.editorUpload.destroy();
    }
    if (this.formElement && this.formEventDelegate) {
      this.formElement.removeEventListener('submit', this.formEventDelegate);
      this.formElement.removeEventListener('reset', this.formEventDelegate);
      const form = this.formElement as any;
      if (form._mceOldSubmit) {
        form.submit = form._mceOldSubmit;
        delete form._mceOldSubmit;
      }
    }
    this.destroy();
  }

  destroy(automatic?: boolean): void {
    if (this.destroyed) {
      return;
    }
    if (!automatic && !this.removed) {
      this.remove();
      return;
    }
    if (!automatic) {
      if (this.editorManager.activeEditor === this) {
        this.editorManager.activeEditor = null;
      }
      if (this.editorManager.focusedEditor === this) {
        this.editorManager.focusedEditor = null;
      }
    }
    this.theme?.destroy?.();
    this.dom?.destroy();
    this.selection?.destroy();
    this.off();
    this.contentAreaContainer = this.formElement = this.container = this.editorContainer = null;
    this.bodyElement = this.contentDocument = this.contentWindow = null;
    this.iframeElement = this.targetElm = null;
    this.destroyed = true;
  }
}
