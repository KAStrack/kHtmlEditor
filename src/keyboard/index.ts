import type { Editor } from '../core/Editor';
import { setupKeyboard as setupController, registerInputHandler, registerKeydownHandler, registerSetupHook } from './InputController';
import { insertNewLine, insertBr } from './EnterKey';
import { handleDelete, afterDelete } from './DeleteKey';
import { normalizeAfterInput } from './Normalizer';
import { Delay } from '../util/Delay';
import { setupTextPatterns } from './TextPatterns';
import { setupInlineBoundaries } from './InlineBoundaries';
import { setupObjectSelection } from './ObjectSelection';

/** Wires the structural key handlers into the input controller and registers related commands. */

let registered = false;

const registerHandlers = (): void => {
  if (registered) {
    return;
  }
  registered = true;

  // Enter: keydown for physical keyboards, beforeinput for virtual ones (keyCode 229).
  let enterHandledByKeydown = false;
  registerKeydownHandler((editor, e) => {
    if (e.keyCode === 13 && !e.isComposing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      enterHandledByKeydown = true;
      editor.undoManager.transact(() => insertNewLine(editor, { shiftKey: e.shiftKey }));
      Delay.setEditorTimeout(editor, () => (enterHandledByKeydown = false), 0);
      return true;
    }
    return false;
  });
  registerInputHandler('insertParagraph', (editor) => {
    if (enterHandledByKeydown) {
      return false;
    }
    editor.undoManager.transact(() => insertNewLine(editor, { shiftKey: false }));
    return true;
  });
  registerInputHandler('insertLineBreak', (editor) => {
    if (enterHandledByKeydown) {
      return false;
    }
    editor.undoManager.transact(() => insertNewLine(editor, { shiftKey: true }));
    return true;
  });

  // Backspace/Delete.
  let nativeDeletePending = false;
  const onDelete = (editor: Editor, forward: boolean): boolean => {
    editor.undoManager.beforeChange();
    const handled = handleDelete(editor, forward);
    if (handled) {
      afterDelete(editor);
      editor.undoManager.add();
      editor.nodeChanged();
    } else {
      nativeDeletePending = true;
      Delay.setEditorTimeout(editor, () => (nativeDeletePending = false), 0);
    }
    return handled;
  };
  registerKeydownHandler((editor, e) => {
    if ((e.keyCode === 8 || e.keyCode === 46) && !e.isComposing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      return onDelete(editor, e.keyCode === 46);
    }
    return false;
  });
  registerInputHandler('deleteContentBackward', (editor) => (nativeDeletePending ? false : onDelete(editor, false)));
  registerInputHandler('deleteContentForward', (editor) => (nativeDeletePending ? false : onDelete(editor, true)));

  // Browser history must never bypass the editor's own undo stack.
  registerInputHandler('historyUndo', (editor) => {
    editor.execCommand('Undo');
    return true;
  });
  registerInputHandler('historyRedo', (editor) => {
    editor.execCommand('Redo');
    return true;
  });

  registerSetupHook((editor) => {
    setupTextPatterns(editor);
    setupInlineBoundaries(editor);
    setupObjectSelection(editor);
    editor.addShortcut('meta+z', 'Undo', 'Undo');
    editor.addShortcut('meta+y,meta+shift+z', 'Redo', 'Redo');
    editor.on('input', (e) => {
      if (!editor.composing && (!e.inputType || !/^insertComposition|^deleteComposition/.test(e.inputType))) {
        normalizeAfterInput(editor);
      }
    });
    editor.on('compositionend', () => {
      Delay.setEditorTimeout(editor, () => normalizeAfterInput(editor), 0);
    });
    editor.on('keyup', (e) => {
      if (e.keyCode === 8 || e.keyCode === 46) {
        afterDelete(editor);
      }
    });
    editor.editorCommands.addCommands({
      mceInsertNewLine: (_cmd, _ui, value) => {
        insertNewLine(editor, value || {});
      },
      InsertLineBreak: () => {
        insertBr(editor);
      },
      Delete: () => {
        if (!handleDelete(editor, false)) {
          const rng = editor.selection.getRng();
          if (!rng.collapsed) {
            rng.deleteContents();
            editor.selection.setRng(rng);
          }
        }
        afterDelete(editor);
      },
      ForwardDelete: () => {
        if (!handleDelete(editor, true)) {
          const rng = editor.selection.getRng();
          if (!rng.collapsed) {
            rng.deleteContents();
            editor.selection.setRng(rng);
          }
        }
        afterDelete(editor);
      },
    });
  });
};

export const setupKeyboard = (editor: Editor): void => {
  registerHandlers();
  setupController(editor);
};
