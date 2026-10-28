import type { Editor } from '../core/Editor';
import type { Theme } from '../core/Theme';
import { h } from './components/Dom';
import { parseToolbars, createToolbar, ToolbarHandle, ToolbarMode, renderToolbarItems, focusFirstToolbarButton } from './components/Toolbar';
import { createMenubar, MenubarHandle } from './components/Menubar';
import { createStatusBar, StatusBarHandle } from './components/StatusBar';
import { createNotificationManagerImpl } from './components/Notifications';
import { createWindowManagerImpl } from './components/Dialog';
import { closeAllPopups } from './components/Popup';
import { setupContextToolbars } from './ContextToolbar';
import { setupAutocompleter } from './Autocompleter';
import { setupContextMenu } from './ContextMenu';
import { registerThemeOptions } from './ThemeOptions';
import { registerCoreButtons } from './CoreButtons';
import { isEmptyDom } from '../dom/DOMUtils';
import skinCss from './skin/oxide.css';
import contentDefaultCss from './skin/content-default.css';
import contentDarkCss from './skin/content-dark.css';

/**
 * The default theme ("silver" for TinyMCE compatibility): renders the editor chrome and provides
 * the dialog and notification implementations.
 */
const SKIN_STYLE_ID = 'khe-skin-styles';

const ensureSkinCss = (editor: Editor): void => {
  const skinUrl = editor.options.get('skin_url') as string | undefined;
  if (skinUrl) {
    const href = skinUrl.replace(/\/$/, '') + '/skin.css';
    if (!document.querySelector(`link[href="${href}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    }
    return;
  }
  if (!document.getElementById(SKIN_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = SKIN_STYLE_ID;
    style.textContent = skinCss;
    document.head.appendChild(style);
  }
};

const isDarkSkin = (editor: Editor): boolean => {
  const skin = editor.options.get('skin') as string | boolean;
  if (skin === 'oxide-dark' || skin === 'dark') {
    return true;
  }
  if (skin === 'auto') {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return false;
};

const toPx = (v: number | string | undefined): string | null => {
  if (v === undefined || v === null || v === '') {
    return null;
  }
  return typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v)) ? v + 'px' : String(v);
};

export const createTheme = (editor: Editor): Theme => {
  registerThemeOptions(editor);
  registerCoreButtons(editor);

  let container: HTMLElement | null = null;
  let toolbars: ToolbarHandle[] = [];
  let menubar: MenubarHandle | null = null;
  let statusbar: StatusBarHandle | null = null;
  let contextToolbars: { destroy: () => void } | null = null;
  let autocompleter: { destroy: () => void } | null = null;
  let enabled = true;

  const renderUI = () => {
    ensureSkinCss(editor);
    const dark = isDarkSkin(editor);
    container = h('div', { class: 'khe-container' + (dark ? ' khe-skin-dark' : ''), role: 'application', 'aria-label': editor.translate('Rich Text Editor') });
    container.id = editor.id + '_parent';
    if (editor.options.get('toolbar_location') === 'bottom') {
      container.classList.add('khe-toolbar-bottom');
    }
    const width = toPx(editor.options.get('width'));
    const height = toPx(editor.options.get('height'));
    if (width) {
      container.style.width = width;
    }
    if (height) {
      container.style.height = height;
    }
    const minH = editor.options.get('min_height') as number;
    const maxH = editor.options.get('max_height') as number;
    if (minH) {
      container.style.minHeight = minH + 'px';
    }
    if (maxH) {
      container.style.maxHeight = maxH + 'px';
    }

    const header = h('div', { class: 'khe-header' });
    if (editor.options.get('toolbar_sticky')) {
      header.classList.add('khe-header--sticky');
      header.style.setProperty('--khe-sticky-offset', (editor.options.get('toolbar_sticky_offset') as number) + 'px');
    }
    menubar = createMenubar(editor, container);
    if (menubar) {
      header.appendChild(menubar.el);
    }
    const rows = parseToolbars(editor);
    const mode = editor.options.get('toolbar_mode') as ToolbarMode;
    const overlord = h('div', { class: 'khe-toolbar-overlord' });
    const ctx = { editor, themeRoot: container, renderToolbarItems: (items: string | string[], c: HTMLElement) => renderToolbarItems({ editor, themeRoot: container as HTMLElement }, items, c) };
    rows.forEach((groups, i) => {
      const rowOverlord = rows.length > 1 ? h('div', { class: 'khe-toolbar-overlord' }) : overlord;
      toolbars.push(createToolbar(ctx, groups, rows.length > 1 && mode !== 'scrolling' ? 'wrap' : mode, rowOverlord));
      if (rows.length > 1) {
        overlord.appendChild(rowOverlord);
      }
      void i;
    });
    if (rows.length) {
      header.appendChild(overlord);
    }
    if (menubar || rows.length) {
      container.appendChild(header);
    }

    const editArea = h('div', { class: 'khe-edit-area' });
    container.appendChild(editArea);

    statusbar = createStatusBar(editor, container);
    if (statusbar) {
      container.appendChild(statusbar.el);
    }

    const target = editor.getElement();
    target.parentNode?.insertBefore(container, target.nextSibling);

    setupBehaviours(container);

    return {
      editorContainer: container,
      iframeContainer: editArea,
      api: {
        show: () => {
          if (container) {
            container.style.display = '';
          }
        },
        hide: () => {
          if (container) {
            container.style.display = 'none';
          }
        },
        setEnabled: (state: boolean) => {
          enabled = state;
          container?.classList.toggle('khe-disabled', !state);
          editor.dispatch('SwitchMode', { mode: editor.mode.get() });
        },
        isEnabled: () => enabled,
      },
    };
  };

  const setupBehaviours = (root: HTMLElement) => {
    contextToolbars = setupContextToolbars(editor, root);
    autocompleter = setupAutocompleter(editor, root);
    setupContextMenu(editor, root);

    editor.on('init', () => {
      // Focus highlight.
      if (editor.options.get('highlight_on_focus') !== false) {
        editor.on('focus', () => root.classList.add('khe-focused'));
        editor.on('blur', () => root.classList.remove('khe-focused'));
      }
      // Placeholder.
      const placeholder = editor.options.get('placeholder') as string | undefined;
      if (placeholder) {
        const body = editor.getBody();
        body.setAttribute('aria-placeholder', placeholder);
        const update = () => {
          const empty = isEmptyDom(editor.schema, body, undefined, { includeNbsp: true, includeZwsp: false }) && !body.querySelector('img,table,hr,video,iframe');
          if (empty) {
            body.setAttribute('data-mce-placeholder', placeholder);
          } else {
            body.removeAttribute('data-mce-placeholder');
          }
        };
        editor.on('input SetContent change keyup undo redo', update);
        update();
      }
      // Word count from the plugin (if loaded).
      editor.on('WordCountUpdate', (e) => {
        const count = e.wordCount;
        if (count && statusbar) {
          const mode = (statusbar as any).__mode || 'words';
          statusbar.setWordCount(mode === 'words' ? editor.translate(['{0} words', count.words]) : editor.translate(['{0} characters', count.characters]));
        }
      });
      editor.on('StatusbarWordCountClick', () => {
        if (statusbar) {
          (statusbar as any).__mode = (statusbar as any).__mode === 'characters' ? 'words' : 'characters';
          editor.dispatch('WordCountUpdate', { wordCount: (editor.plugins.wordcount as any)?.body?.getCounts?.() ?? null });
        }
      });
      // Close popups when the content is clicked or scrolled.
      editor.on('mousedown', () => closeAllPopups());
      // Keyboard access to the chrome.
      editor.addShortcut('alt+F9', 'Focus to menubar', () => {
        menubar?.focusFirst();
      });
      editor.addShortcut('alt+F10', 'Focus to toolbar', () => {
        const overlord = root.querySelector<HTMLElement>('.khe-toolbar-overlord');
        if (overlord) {
          focusFirstToolbarButton(overlord);
        }
      });
      editor.addShortcut('alt+F11', 'Focus to element path', () => {
        (root.querySelector('.khe-path__item') as HTMLElement | null)?.focus();
      });
      editor.addShortcut('alt+F12', 'Focus to editor', () => editor.focus());
      // Sticky toolbar needs a non-clipped container.
      root.classList.toggle('khe-readonly', editor.readonly);
    });
    editor.on('SwitchMode', () => {
      root.classList.toggle('khe-readonly', editor.readonly);
    });
    editor.on('ResizeEditor', () => toolbars.forEach((t) => t.refresh()));
  };

  return {
    renderUI,
    getWindowManagerImpl: () => createWindowManagerImpl(editor, () => container),
    getNotificationManagerImpl: () => createNotificationManagerImpl(editor, () => container),
    getContentCss: (name: string) => {
      switch (name) {
        case 'default':
        case 'document':
        case 'writer':
        case 'tinymce-5':
          return contentDefaultCss;
        case 'dark':
        case 'tinymce-5-dark':
          return contentDarkCss;
        default:
          return undefined;
      }
    },
    destroy: () => {
      toolbars.forEach((t) => t.destroy());
      toolbars = [];
      menubar?.destroy();
      statusbar?.destroy();
      contextToolbars?.destroy();
      autocompleter?.destroy();
      closeAllPopups();
    },
  };
};
