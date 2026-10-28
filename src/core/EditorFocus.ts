import type { Editor } from './Editor';
import * as NodeType from '../dom/NodeType';

/** Focus management: `editor.focus()`, `editor.hasFocus()`, focus/blur editor events, active editor tracking. */
export const hasFocus = (editor: Editor): boolean => {
  const body = editor.getBody();
  if (!body || editor.removed) {
    return false;
  }
  const doc = editor.getDoc();
  const active = doc.activeElement;
  if (editor.inline) {
    return !!active && (active === body || body.contains(active));
  }
  // Iframe: body (or a descendant) is the active element of the inner document and the iframe has focus in the outer document.
  const outerActive = document.activeElement;
  const iframeFocused = outerActive === editor.iframeElement;
  return iframeFocused && !!active && (active === body || body.contains(active));
};

const hasEditableSelection = (editor: Editor): boolean => {
  const rng = editor.selection.getRng();
  return editor.getBody().contains(rng.startContainer);
};

export const focus = (editor: Editor, skipFocus?: boolean | { scrollToSelection?: boolean }): void => {
  if (editor.removed) {
    return;
  }
  editor.editorManager.setActive(editor);
  if (skipFocus === true) {
    return;
  }
  const body = editor.getBody();
  if (!body) {
    return;
  }
  const lastRng = editor.selection.getLastRng();
  if (!hasFocus(editor)) {
    try {
      // Focus the body without scrolling the page.
      body.focus({ preventScroll: true });
    } catch {
      body.focus();
    }
  }
  if (lastRng && body.contains(lastRng.startContainer)) {
    editor.selection.setRng(lastRng);
  } else if (!hasEditableSelection(editor)) {
    editor.selection.setCursorLocation();
  }
  const scroll = typeof skipFocus === 'object' && skipFocus.scrollToSelection !== false;
  if (scroll) {
    editor.selection.scrollIntoView();
  }
};

export const setupFocusEvents = (editor: Editor): void => {
  editor.on('init', () => {
    const body = editor.getBody();
    const doc = editor.getDoc();
    let focused = false;
    editor.dom.bind(doc, 'focusin', (e: FocusEvent) => {
      const target = e.target as Node | null;
      if (target && (target === body || body.contains(target)) && !focused) {
        focused = true;
        editor.editorManager.setActive(editor);
        editor.editorManager.focusedEditor = editor;
        editor.dispatch('focus', { blurredEditor: null });
      }
    });
    editor.dom.bind(doc, 'focusout', () => {
      // Defer so that clicks inside our own UI (toolbar) don't count as blur.
      setTimeout(() => {
        if (editor.removed) {
          return;
        }
        if (!hasFocus(editor) && !isFocusInEditorUi(editor) && focused) {
          focused = false;
          if (editor.editorManager.focusedEditor === editor) {
            editor.editorManager.focusedEditor = null;
          }
          editor.dispatch('blur', { focusedEditor: editor.editorManager.focusedEditor });
        }
      }, 0);
    });
    if (editor.inline || true) {
      // Mousedown inside the iframe should always make this editor active.
      editor.dom.bind(doc, 'mousedown', () => editor.editorManager.setActive(editor));
    }
  });
};

export const isFocusInEditorUi = (editor: Editor): boolean => {
  const active = document.activeElement;
  const container = editor.getContainer();
  if (active && container && container.contains(active)) {
    return true;
  }
  const popups = document.querySelectorAll('.khe-popup, .khe-dialog-wrap, .khe-aux');
  for (let i = 0; i < popups.length; i++) {
    if (active && popups[i].contains(active)) {
      return true;
    }
  }
  return false;
};

export const isEditorUiElement = (editor: Editor, node: Node | null): boolean => {
  const container = editor.getContainer();
  return !!node && !!container && (container === node || container.contains(node));
};

export const isTextNodeInBody = (editor: Editor, node: Node | null): boolean => !!node && NodeType.isText(node) && editor.getBody().contains(node);
