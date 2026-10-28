import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';

/** Nonbreaking plugin: inserts non-breaking spaces (`nonbreaking_force_tab`, `nonbreaking_wrap`). */
const insertNbsp = (editor: Editor, times: number): void => {
  const nbsp = '&nbsp;'.repeat(Math.max(1, times));
  const wrap = editor.options.get('nonbreaking_wrap') as boolean;
  const inWrapper = !!editor.dom.getParent(editor.selection.getStart(), 'span.mce-nbsp-wrap');
  const html = wrap && !inWrapper ? `<span class="mce-nbsp-wrap" contenteditable="false">${nbsp}</span>` : nbsp;
  editor.undoManager.transact(() => {
    editor.insertContent(html);
  });
};

const register = (editor: Editor): void => {
  editor.options.register('nonbreaking_force_tab', { processor: (v: unknown) => (typeof v === 'boolean' || typeof v === 'number' ? { valid: true, value: v } : { valid: false, message: 'Must be a boolean or number.' }), default: false });
  editor.options.register('nonbreaking_wrap', { processor: 'boolean', default: true });

  editor.editorCommands.addCommands({
    mceNonBreaking: () => insertNbsp(editor, 1),
  });
  editor.ui.registry.addButton('nonbreaking', { icon: 'non-breaking', tooltip: 'Nonbreaking space', onAction: () => editor.execCommand('mceNonBreaking') });
  editor.ui.registry.addMenuItem('nonbreaking', { icon: 'non-breaking', text: 'Nonbreaking space', onAction: () => editor.execCommand('mceNonBreaking') });

  const forceTab = editor.options.get('nonbreaking_force_tab');
  const spaces = forceTab === true ? 3 : typeof forceTab === 'number' && forceTab > 0 ? forceTab : 0;
  if (spaces) {
    editor.on('keydown', (e) => {
      if (e.keyCode === 9 && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (editor.dom.getParent(editor.selection.getStart(), 'li,td,th,pre')) {
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation?.();
        insertNbsp(editor, spaces);
      }
    });
  }
};

PluginManager.add('nonbreaking', register);
export default register;
