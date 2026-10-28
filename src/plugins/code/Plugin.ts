import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';

/**
 * Code plugin: HTML source editing. `code_view: 'dialog'` (default, TinyMCE parity) opens the
 * Source Code dialog; `code_view: 'inline'` swaps the editing area for a textarea while keeping
 * the toolbar visible (kHtmlEditor extension).
 */
const getSource = (editor: Editor): string => editor.getContent({ source_view: true }) as string;

const setSource = (editor: Editor, html: string): void => {
  editor.focus();
  editor.undoManager.transact(() => {
    editor.setContent(html, { source_view: true });
  });
  editor.selection.setCursorLocation();
  editor.nodeChanged();
};

const openDialog = (editor: Editor): void => {
  editor.windowManager.open({
    title: 'Source Code',
    size: 'large',
    body: { type: 'panel', items: [{ type: 'textarea', name: 'code', spellcheck: false, classes: ['khe-source-textarea'] }] },
    buttons: [
      { type: 'cancel', name: 'cancel', text: 'Cancel' },
      { type: 'submit', name: 'save', text: 'Save', primary: true },
    ],
    initialData: { code: getSource(editor) },
    onSubmit: (api: any) => {
      setSource(editor, (api.getData() as { code: string }).code);
      api.close();
    },
  } as any);
};

const setupInline = (editor: Editor) => {
  let textarea: HTMLTextAreaElement | null = null;

  const isOpen = () => textarea !== null;

  const open = () => {
    if (textarea) {
      return;
    }
    const area = editor.getContentAreaContainer();
    const iframe = editor.iframeElement;
    if (!area || !iframe) {
      return;
    }
    // Read the source before the textarea exists so the BeforeGetContent sync below stays idle.
    const source = getSource(editor);
    textarea = document.createElement('textarea');
    textarea.className = 'khe-source-view';
    textarea.setAttribute('aria-label', editor.translate('Source code'));
    textarea.spellcheck = false;
    textarea.value = source;
    textarea.style.height = iframe.offsetHeight + 'px';
    iframe.style.display = 'none';
    area.appendChild(textarea);
    editor.getContainer().classList.add('khe-source-mode');
    textarea.focus();
    editor.dispatch('SourceViewChange', { state: true });
    editor.dispatch('ResizeEditor');
  };

  const close = (apply: boolean) => {
    if (!textarea) {
      return;
    }
    const value = textarea.value;
    const iframe = editor.iframeElement;
    textarea.remove();
    textarea = null;
    if (iframe) {
      iframe.style.display = '';
    }
    editor.getContainer().classList.remove('khe-source-mode');
    if (apply) {
      setSource(editor, value);
    } else {
      editor.focus();
    }
    editor.dispatch('SourceViewChange', { state: false });
    editor.dispatch('ResizeEditor');
  };

  // Form submission / getContent while the source is open uses the textarea's content.
  editor.on('BeforeGetContent', (e) => {
    if (textarea && e.format !== 'raw') {
      const value = textarea.value;
      editor.undoManager.ignore(() => editor.setContent(value, { no_events: true }));
    }
  });
  editor.on('ResizeEditor', () => {
    if (textarea && editor.iframeElement) {
      const h = editor.iframeElement.style.height || editor.iframeElement.getAttribute('height');
      if (h) {
        textarea.style.height = /^\d+$/.test(h) ? h + 'px' : h;
      }
    }
  });
  editor.on('remove', () => close(false));

  return { isOpen, open, close, toggle: () => (isOpen() ? close(true) : open()) };
};

const register = (editor: Editor): Record<string, any> => {
  const inline = setupInline(editor);
  const isInlineMode = () => editor.options.get('code_view') === 'inline';

  editor.editorCommands.addCommands({
    mceCodeEditor: () => {
      if (isInlineMode()) {
        inline.toggle();
      } else {
        openDialog(editor);
      }
    },
    mceToggleSourceView: () => inline.toggle(),
  });
  editor.editorCommands.addCommands({ mceToggleSourceView: () => inline.isOpen() }, 'state');

  editor.ui.registry.addToggleButton('code', {
    icon: 'sourcecode',
    tooltip: 'Source code',
    onAction: () => editor.execCommand('mceCodeEditor'),
    onSetup: (api) => {
      const update = () => {
        api.setActive(inline.isOpen());
        api.setEnabled(!editor.readonly || inline.isOpen());
      };
      editor.on('SourceViewChange SwitchMode', update);
      update();
      return () => editor.off('SourceViewChange SwitchMode', update);
    },
  });
  editor.ui.registry.addMenuItem('code', { icon: 'sourcecode', text: 'Source code', onAction: () => editor.execCommand('mceCodeEditor') });

  return {
    isSourceViewOpen: inline.isOpen,
    toggleSourceView: inline.toggle,
  };
};

PluginManager.add('code', register);
export default register;
