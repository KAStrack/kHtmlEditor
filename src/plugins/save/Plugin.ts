import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';
import { isFunction } from '../../util/Type';

/** Save plugin: save/cancel buttons that submit the form or call the configured callbacks. */
const displayError = (editor: Editor, message: string) => editor.notificationManager.open({ text: editor.translate(message), type: 'error' });

const save = (editor: Editor): void => {
  const form = editor.formElement as (HTMLFormElement & { _mceOldSubmit?: () => void }) | null;
  if (editor.options.get('save_enablewhendirty') && !editor.isDirty()) {
    return;
  }
  editor.save();
  const cb = editor.options.get('save_onsavecallback');
  if (isFunction(cb)) {
    cb.call(editor, editor);
    editor.nodeChanged();
    return;
  }
  if (form) {
    editor.setDirty(false);
    if (!form.onsubmit || (form.onsubmit as (e: Event) => any).call(form, new Event('submit')) !== false) {
      const submit = form._mceOldSubmit || form.submit;
      if (typeof submit === 'function') {
        submit.call(form);
      } else {
        displayError(editor, 'Error: Form submit field collision.');
      }
    }
    editor.nodeChanged();
  } else {
    displayError(editor, 'Error: No form element found.');
  }
};

const cancel = (editor: Editor): void => {
  const cb = editor.options.get('save_oncancelcallback');
  if (isFunction(cb)) {
    cb.call(editor, editor);
    return;
  }
  editor.resetContent(editor.startContent || '');
};

const register = (editor: Editor): void => {
  editor.options.register('save_enablewhendirty', { processor: 'boolean', default: true });
  editor.options.register('save_onsavecallback', { processor: 'function' });
  editor.options.register('save_oncancelcallback', { processor: 'function' });

  editor.editorCommands.addCommands({ mceSave: () => save(editor), mceCancel: () => cancel(editor) });
  editor.addShortcut('Meta+S', 'Save', () => editor.execCommand('mceSave'));

  const setup = (api: { setEnabled: (s: boolean) => void }) => {
    if (!editor.options.get('save_enablewhendirty')) {
      api.setEnabled(true);
      return () => {};
    }
    const update = () => api.setEnabled(editor.isDirty());
    editor.on('NodeChange dirty change SetContent', update);
    update();
    return () => editor.off('NodeChange dirty change SetContent', update);
  };
  editor.ui.registry.addButton('save', { icon: 'save', tooltip: 'Save', shortcut: 'Meta+S', onAction: () => editor.execCommand('mceSave'), onSetup: setup });
  editor.ui.registry.addButton('cancel', { icon: 'cancel', tooltip: 'Cancel', onAction: () => editor.execCommand('mceCancel'), onSetup: setup });
  editor.ui.registry.addMenuItem('save', { icon: 'save', text: 'Save', shortcut: 'Meta+S', onAction: () => editor.execCommand('mceSave'), onSetup: setup as any });
  editor.ui.registry.addMenuItem('cancel', { icon: 'cancel', text: 'Cancel', onAction: () => editor.execCommand('mceCancel'), onSetup: setup as any });
};

PluginManager.add('save', register);
export default register;
