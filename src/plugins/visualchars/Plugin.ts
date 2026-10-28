import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';
import * as NodeType from '../../dom/NodeType';

/** Visual chars plugin: highlights non-breaking spaces and soft hyphens with bogus spans. */
const CHARS: Record<string, string> = { ' ': 'nbsp', '­': 'shy' };
const charsRegExp = /[ ­]/;

const register = (editor: Editor): void => {
  editor.options.register('visualchars_default_state', { processor: 'boolean', default: false });
  let enabled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const isWrapper = (n: Node | null): n is HTMLElement => NodeType.isElement(n) && n.hasAttribute('data-mce-bogus') && /\bmce-(nbsp|shy)\b/.test(n.className);

  const unwrapAll = () => {
    const body = editor.getBody();
    Array.from(body.querySelectorAll('span.mce-nbsp[data-mce-bogus],span.mce-shy[data-mce-bogus]')).forEach((span) => {
      const parent = span.parentNode;
      if (!parent) {
        return;
      }
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
    });
    body.normalize();
  };

  const wrapAll = () => {
    const body = editor.getBody();
    const doc = editor.getDoc();
    const bookmark = editor.selection.getBookmark(2, true);
    const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const texts: Text[] = [];
    let t = walker.nextNode() as Text | null;
    while (t) {
      if (charsRegExp.test(t.data) && !isWrapper(t.parentNode) && !editor.dom.getParent(t, '[data-mce-bogus="all"],pre,code')) {
        texts.push(t);
      }
      t = walker.nextNode() as Text | null;
    }
    texts.forEach((text) => {
      const parent = text.parentNode as Node;
      const frag = doc.createDocumentFragment();
      let buffer = '';
      const flush = () => {
        if (buffer) {
          frag.appendChild(doc.createTextNode(buffer));
          buffer = '';
        }
      };
      for (const ch of text.data) {
        const cls = CHARS[ch];
        if (cls) {
          flush();
          const span = doc.createElement('span');
          span.className = 'mce-' + cls;
          span.setAttribute('data-mce-bogus', '1');
          span.textContent = ch;
          frag.appendChild(span);
        } else {
          buffer += ch;
        }
      }
      flush();
      parent.replaceChild(frag, text);
    });
    editor.selection.moveToBookmark(bookmark);
  };

  const apply = (state: boolean) => {
    enabled = state;
    if (state) {
      wrapAll();
    } else {
      unwrapAll();
    }
    editor.dispatch('VisualChars', { state });
  };

  const scheduleRefresh = () => {
    if (!enabled) {
      return;
    }
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      if (enabled && !editor.removed) {
        wrapAll();
      }
    }, 300);
  };

  editor.editorCommands.addCommands({ mceVisualChars: () => apply(!enabled) });
  editor.editorCommands.addCommands({ mceVisualChars: () => enabled }, 'state');
  editor.on('init', () => {
    if (editor.options.get('visualchars_default_state')) {
      apply(true);
    }
  });
  editor.on('keyup SetContent', scheduleRefresh);
  // Undo snapshots must not contain the markers.
  editor.on('BeforeAddUndo', () => {
    if (enabled) {
      unwrapAll();
    }
  });
  editor.on('AddUndo undo redo', scheduleRefresh);

  const setup = (api: { setActive: (s: boolean) => void }) => {
    const update = (e?: any) => api.setActive(e && typeof e.state === 'boolean' ? e.state : enabled);
    editor.on('VisualChars', update);
    update();
    return () => editor.off('VisualChars', update);
  };
  editor.ui.registry.addToggleButton('visualchars', { icon: 'visualchars', tooltip: 'Show invisible characters', onAction: () => editor.execCommand('mceVisualChars'), onSetup: setup });
  editor.ui.registry.addToggleMenuItem('visualchars', { icon: 'visualchars', text: 'Show invisible characters', onAction: () => editor.execCommand('mceVisualChars'), onSetup: setup });
};

PluginManager.add('visualchars', register);
export default register;
