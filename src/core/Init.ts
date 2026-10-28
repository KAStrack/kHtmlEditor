import type { Editor } from './Editor';
import { DOMUtils } from '../dom/DOMUtils';
import { createSchema } from '../html/Schema';
import { createEditorParser } from './EditorParser';
import { createDomSerializer } from './DomSerializer';
import { EditorSelection } from '../selection/Selection';
import { createFormatter } from '../format/Formatter';
import { createUndoManager } from '../undo/UndoManager';
import { NodeChange } from './NodeChange';
import { createBareTheme, Theme } from './Theme';
import { PluginManager, ThemeManager } from './AddOnManager';
import { ScriptLoader } from './ScriptLoader';
import { I18n } from '../i18n/I18n';
import * as Options from './EditorOptions';
import { describeRemovedPlugin } from '../compat/legacyOptions';
import { createBlobCache } from '../content/BlobCache';
import { registerCoreCommands } from '../commands/Commands';
import { setupKeyboard } from '../keyboard/index';
import { isFunction, isString } from '../util/Type';

/**
 * Editor rendering and initialisation: form integration, plugin/theme loading, iframe creation,
 * content body setup and the init event sequence (PreInit → PostRender → init).
 */

const DOM = DOMUtils.DOM;

const isTextareaOrInput = (el: Element | null): boolean => !!el && (el.nodeName === 'TEXTAREA' || el.nodeName === 'INPUT');

const setupForm = (editor: Editor): void => {
  const id = editor.id;
  const elm = editor.getElement();
  if (!elm) {
    return;
  }
  editor.orgDisplay = elm.style.display;
  editor.orgVisibility = elm.style.visibility;
  const form = DOM.getParent(elm, 'form') as HTMLFormElement | null;
  if (form) {
    editor.formElement = form;
    if (Options.hasHiddenInput(editor) && !isTextareaOrInput(elm)) {
      DOM.insertAfter(DOM.create('input', { type: 'hidden', name: id }), elm);
      editor.hasHiddenInput = true;
    }
    editor.formEventDelegate = (e: Event) => {
      editor.dispatch(e.type, e);
    };
    form.addEventListener('submit', editor.formEventDelegate);
    form.addEventListener('reset', editor.formEventDelegate);
    editor.on('reset', () => {
      editor.resetContent();
    });
    if (Options.shouldAddFormSubmitTrigger(editor)) {
      editor.on('submit', () => {
        if (editor.initialized) {
          editor.save();
        }
      });
    }
    const anyForm = form as any;
    if (Options.shouldPatchSubmit(editor) && !anyForm.submit.nodeType && !anyForm.submit.length && !anyForm._mceOldSubmit) {
      anyForm._mceOldSubmit = anyForm.submit;
      anyForm.submit = () => {
        editor.editorManager.triggerSave();
        editor.setDirty(false);
        return anyForm._mceOldSubmit();
      };
    }
  }
};

const loadLanguage = (editor: Editor): Promise<void> => {
  const code = Options.getLanguageCode(editor);
  const url = Options.getLanguageUrl(editor);
  I18n.setCode(code);
  if (code && code !== 'en' && !I18n.hasCode(code)) {
    const languageUrl = url || `${editor.editorManager.baseURL}/langs/${code}.js`;
    return ScriptLoader.ScriptLoader.loadScript(languageUrl).catch(() => {
      editor.dispatch('LanguageLoadError', { message: 'Failed to load language: ' + code, code });
    });
  }
  return Promise.resolve();
};

const loadExternalPlugins = (editor: Editor): Promise<void> => {
  const external = Options.getExternalPlugins(editor);
  const loads = Object.keys(external).map((name) => PluginManager.load(name, external[name]).catch(() => {
    editor.dispatch('PluginLoadError', { type: 'plugin', name, url: external[name], message: 'Failed to load plugin: ' + name });
  }));
  return Promise.all(loads).then(() => undefined);
};

export const render = (editor: Editor): void => {
  if (!editor.getElement()) {
    console.error(`kHtmlEditor: target element with id "${editor.id}" not found.`);
    return;
  }
  if (editor.rendered) {
    return;
  }
  editor.rendered = true;
  editor.editorManager.add(editor);
  setupForm(editor);
  Promise.all([loadLanguage(editor), loadExternalPlugins(editor)])
    .then(() => init(editor))
    .catch((e) => console.error('kHtmlEditor: initialisation failed', e));
};

const initTheme = (editor: Editor): void => {
  const theme = editor.options.get('theme') as string | boolean | ((editor: Editor) => Theme);
  if (isFunction(theme)) {
    editor.theme = theme(editor);
    return;
  }
  const name = isString(theme) ? theme : 'silver';
  const factory = ThemeManager.get(name) ?? ThemeManager.get('silver') ?? ThemeManager.get('default');
  editor.theme = factory ? (factory(editor, '') as Theme) : createBareTheme(editor);
};

const initPlugins = (editor: Editor): void => {
  const names = [...Options.getForcedPlugins(editor), ...Options.getPlugins(editor)];
  const seen = new Set<string>();
  for (let name of names) {
    name = name.trim();
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    const Plugin = PluginManager.get(name);
    if (!Plugin) {
      const reason = describeRemovedPlugin(name);
      if (reason) {
        console.warn('kHtmlEditor: ' + reason);
      } else {
        editor.dispatch('PluginLoadError', { type: 'plugin', name, message: `Plugin "${name}" is not available.` });
        console.warn(`kHtmlEditor: plugin "${name}" is not available and was skipped.`);
      }
      continue;
    }
    try {
      const url = PluginManager.urls[name] || editor.editorManager.baseURL + '/plugins/' + name;
      const instance = Plugin(editor, url);
      editor.plugins[name] = instance ?? {};
    } catch (e) {
      console.error(`kHtmlEditor: failed to initialise plugin "${name}"`, e);
    }
  }
};

const createIframe = (editor: Editor, container: HTMLElement): HTMLIFrameElement => {
  const id = editor.id + '_ifr';
  const attrs: Record<string, string | null> = {
    id,
    frameBorder: '0',
    allowTransparency: 'true',
    title: editor.translate(Options.getIframeAriaText(editor)),
    ...Options.getIframeAttrs(editor),
  };
  const iframe = DOM.create('iframe', attrs);
  iframe.style.width = '100%';
  iframe.style.display = 'block';
  iframe.setAttribute('role', 'presentation');
  container.appendChild(iframe);
  editor.iframeElement = iframe;
  editor.contentAreaContainer = container;
  return iframe;
};

const buildIframeHtml = (editor: Editor, contentCss: string[]): string => {
  let html = Options.getDocType(editor) + '<html><head>';
  if (editor.documentBaseUrl !== editor.editorManager.documentBaseURL) {
    html += '<base href="' + editor.documentBaseURI.getURI() + '" />';
  }
  html += '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />';
  const csp = Options.getContentSecurityPolicy(editor);
  if (csp) {
    html += '<meta http-equiv="Content-Security-Policy" content="' + csp + '" />';
  }
  for (const url of contentCss) {
    html += '<link type="text/css" rel="stylesheet" href="' + DOM.encode(url) + '"' + (editor.options.get('content_css_cors') ? ' crossorigin="anonymous"' : '') + ' />';
  }
  const bodyId = Options.getBodyId(editor);
  const bodyClass = ('mce-content-body khe-content-body ' + Options.getBodyClass(editor)).trim();
  html += `</head><body id="${DOM.encode(bodyId)}" class="${DOM.encode(bodyClass)}" data-id="${DOM.encode(editor.id)}" aria-label="${DOM.encode(editor.translate(Options.getIframeAriaText(editor)))}"><br></body></html>`;
  return html;
};

const resolveContentCss = (editor: Editor): { urls: string[]; inline: string[] } => {
  const items = Options.getContentCss(editor);
  const urls: string[] = [];
  const inline: string[] = [];
  for (const item of items) {
    const bundled = editor.theme.getContentCss ? editor.theme.getContentCss(item) : undefined;
    if (bundled !== undefined) {
      inline.push(bundled);
    } else if (/^(default|dark|document|writer|tinymce-5|tinymce-5-dark)$/.test(item)) {
      // Unknown bundled keyword without a theme; skip silently.
      continue;
    } else {
      urls.push(editor.documentBaseURI.toAbsolute(item));
    }
  }
  const fontCss = editor.options.get('font_css') as string[];
  for (const f of fontCss) {
    urls.push(editor.documentBaseURI.toAbsolute(f));
  }
  return { urls, inline };
};

const waitForStylesheets = (doc: Document, timeoutMs = 3000): Promise<void> => {
  const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
  if (links.length === 0) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    let remaining = links.length;
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    const timer = setTimeout(finish, timeoutMs);
    const check = () => {
      remaining--;
      if (remaining <= 0) {
        clearTimeout(timer);
        finish();
      }
    };
    for (const link of links) {
      if (link.sheet) {
        check();
      } else {
        link.addEventListener('load', check, { once: true });
        link.addEventListener('error', check, { once: true });
      }
    }
  });
};

const init = (editor: Editor): void => {
  editor.dispatch('ScriptsLoaded');
  initTheme(editor);
  initPlugins(editor);
  const renderInfo = editor.theme.renderUI();
  editor.editorContainer = renderInfo.editorContainer;
  editor.container = renderInfo.editorContainer;
  editor.contentAreaContainer = renderInfo.iframeContainer;
  if (renderInfo.api) {
    Object.assign(editor.ui, renderInfo.api);
  }
  editor.dispatch('BeforeRenderUI');
  const target = editor.getElement();
  target.style.display = 'none';
  target.setAttribute('aria-hidden', 'true');

  const iframe = createIframe(editor, renderInfo.iframeContainer);
  const height = renderInfo.iframeHeight ?? renderInfo.height;
  if (height) {
    iframe.style.height = height + 'px';
  }
  const { urls, inline } = resolveContentCss(editor);
  editor.iframeHTML = buildIframeHtml(editor, urls);
  editor.contentCSS.push(...urls);

  const doc = iframe.contentDocument as Document;
  doc.open();
  doc.write(editor.iframeHTML);
  doc.close();
  editor.contentDocument = doc;
  editor.contentWindow = iframe.contentWindow;
  editor.bodyElement = doc.body;
  for (const css of inline) {
    const style = doc.createElement('style');
    style.setAttribute('data-khe-content-css', '');
    style.textContent = css;
    doc.head.appendChild(style);
  }
  const contentStyle = Options.getContentStyle(editor);
  waitForStylesheets(doc).then(() => {
    if (editor.removed) {
      return;
    }
    editor.dispatch('SkinLoaded');
    initContentBody(editor);
    if (contentStyle) {
      editor.dom.addStyle(contentStyle);
    }
    for (const s of editor.contentStyles) {
      editor.dom.addStyle(s);
    }
  });
};

const initContentBody = (editor: Editor): void => {
  const doc = editor.getDoc();
  const body = editor.getBody();
  const options = editor.options;

  editor.schema = createSchema({
    schema: options.get('schema'),
    valid_elements: options.get('valid_elements'),
    extended_valid_elements: options.get('extended_valid_elements'),
    invalid_elements: options.get('invalid_elements'),
    valid_children: options.get('valid_children'),
    custom_elements: options.get('custom_elements'),
    valid_styles: options.get('valid_styles'),
    invalid_styles: options.get('invalid_styles'),
    valid_classes: options.get('valid_classes'),
    verify_html: options.get('verify_html'),
    padd_empty_block_inline_children: options.get('format_empty_lines'),
  });

  editor.dom = new DOMUtils(doc, {
    keep_values: true,
    url_converter: editor.convertURL,
    url_converter_scope: editor,
    update_styles: true,
    root_element: null,
    schema: editor.schema,
    contentCssCors: options.get('content_css_cors'),
    referrerPolicy: options.get('referrer_policy'),
    onSetAttrib: (e) => {
      editor.dispatch('SetAttrib', e);
    },
  });

  editor.parser = createEditorParser(editor);
  editor.serializer = createDomSerializer(editor);
  editor.selection = new EditorSelection(editor.dom, editor.getWin(), editor);
  editor.formatter = createFormatter(editor);
  editor.undoManager = createUndoManager(editor);
  editor._nodeChangeDispatcher = new NodeChange(editor);
  editor.editorUpload = createEditorUpload(editor);
  registerCoreCommands(editor);
  setupKeyboard(editor);

  body.contentEditable = String(editor.hasEditableRoot() && !editor.readonly);
  if (!Options.shouldBrowserSpellcheck(editor)) {
    body.spellcheck = false;
    body.setAttribute('spellcheck', 'false');
  }
  const dir = Options.getDirectionality(editor);
  if (dir) {
    body.dir = dir;
  }
  editor.hasVisual = Options.isVisualAidsEnabled(editor);

  editor.dispatch('PreInit');

  const protect = Options.getProtect(editor);
  if (protect) {
    editor.on('BeforeSetContent', (e) => {
      for (const pattern of protect) {
        e.content = e.content.replace(pattern, (str: string) => '<!--mce:protected ' + escape(str) + '-->');
      }
    });
  }
  editor.on('SetContent', () => {
    editor.addVisual(editor.getBody());
  });
  editor.on('compositionstart compositionend', (e) => {
    editor.composing = e.type === 'compositionstart';
  });

  editor.dispatch('PostRender');

  // Initial content.
  editor.load({ initial: true, format: 'html' });
  editor.startContent = editor.getContent({ format: 'raw', no_events: true });
  editor.bindPendingEventDelegates();
  editor.initialized = true;
  if (editor.readonly) {
    editor.mode.set('readonly');
  }
  editor.dispatch('init');
  editor.nodeChanged({ initial: true });

  const initCallback = Options.getInitInstanceCallback(editor);
  if (isFunction(initCallback)) {
    initCallback.call(editor, editor);
  }
  const autoFocus = Options.getAutoFocus(editor);
  if (autoFocus === true || autoFocus === editor.id) {
    setTimeout(() => {
      if (!editor.removed) {
        editor.focus();
        editor.selection.scrollIntoView();
      }
    }, 100);
  }
};

const createEditorUpload = (editor: Editor): Editor['editorUpload'] => {
  const blobCache = createBlobCache();
  let impl: Editor['editorUpload'] | null = null;
  const getImpl = () => {
    if (!impl && uploadFactory) {
      impl = uploadFactory(editor, blobCache);
    }
    return impl;
  };
  return {
    blobCache,
    uploadImages: () => getImpl()?.uploadImages() ?? Promise.resolve([]),
    uploadImagesAuto: () => getImpl()?.uploadImagesAuto() ?? Promise.resolve([]),
    scanForImages: () => getImpl()?.scanForImages() ?? Promise.resolve([]),
    destroy: () => {
      getImpl()?.destroy();
      blobCache.destroy();
    },
  };
};

let uploadFactory: ((editor: Editor, blobCache: ReturnType<typeof createBlobCache>) => Editor['editorUpload']) | null = null;
/** Lets the content layer register the real upload implementation without a circular import. */
export const setEditorUploadFactory = (f: typeof uploadFactory): void => {
  uploadFactory = f;
};
