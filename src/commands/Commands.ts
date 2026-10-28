import type { Editor } from '../core/Editor';
import * as EditorFocus from '../core/EditorFocus';
import { insertContent } from '../content/InsertContent';
import { isString, isObject } from '../util/Type';

/** Registers the core commands that do not depend on the formatter. */
export const registerCoreCommands = (editor: Editor): void => {
  const commands = editor.editorCommands;

  commands.addCommands({
    mceFocus: (_cmd, _ui, value) => {
      EditorFocus.focus(editor, value);
    },
    mceResetDesignMode: () => {},
    mceAddUndoLevel: () => {
      editor.undoManager.add();
    },
    mceEndUndoLevel: () => {
      editor.undoManager.add();
    },
    mceBeginUndoLevel: () => {
      editor.undoManager.beforeChange();
    },
    mceRepaint: () => {},
    mceSetContent: (_cmd, _ui, value) => {
      editor.setContent(value);
    },
    mceInsertContent: (_cmd, _ui, value) => {
      if (isObject(value) && !isString(value)) {
        insertContent(editor, value.content, value);
      } else {
        insertContent(editor, value as string, {});
      }
    },
    mceInsertRawHTML: (_cmd, _ui, value) => {
      editor.selection.setContent('tiny_mce_marker');
      const content = editor.getContent() as string;
      editor.setContent(content.replace(/tiny_mce_marker/g, () => value));
    },
    mceReplaceContent: (_cmd, _ui, value) => {
      editor.execCommand('mceInsertContent', false, value.replace(/\{\$selection\}/g, editor.selection.getContent({ format: 'text' })));
    },
    mceNewDocument: () => {
      editor.setContent(editor.options.get('newdocument_content'));
    },
    mceCleanup: () => {
      const bm = editor.selection.getBookmark();
      editor.setContent(editor.getContent());
      editor.selection.moveToBookmark(bm);
    },
    mceToggleVisualAid: () => {
      editor.hasVisual = !editor.hasVisual;
      editor.addVisual();
    },
    mceRemoveNode: (_cmd, _ui, value) => {
      const node = value ?? editor.selection.getNode();
      if (node !== editor.getBody()) {
        const bm = editor.selection.getBookmark();
        editor.dom.remove(node, true);
        editor.selection.moveToBookmark(bm);
      }
    },
    mceSelectNodeDepth: (_cmd, _ui, value) => {
      let counter = 0;
      editor.dom.getParent(editor.selection.getNode(), (node) => {
        if (node.nodeType === 1 && counter++ === value) {
          editor.selection.select(node);
          return true;
        }
        return false;
      }, editor.getBody());
    },
    mceSelectNode: (_cmd, _ui, value) => {
      editor.selection.select(value);
    },
    mcePrint: () => {
      editor.getWin().print();
    },
    SelectAll: () => {
      const editingHost = editor.getBody();
      const rng = editor.dom.createRng();
      rng.selectNodeContents(editingHost);
      editor.selection.setRng(rng);
    },
    Undo: () => {
      editor.undoManager.undo();
    },
    Redo: () => {
      editor.undoManager.redo();
    },
    'Cut,Copy,Paste': (command: string) => {
      const doc = editor.getDoc();
      try {
        (doc as any).execCommand(command);
      } catch {
        /* clipboard commands may be blocked */
      }
    },
    Delete: () => {
      const rng = editor.selection.getRng();
      if (!rng.collapsed) {
        rng.deleteContents();
        editor.selection.setRng(rng);
      }
    },
    ForwardDelete: () => {
      const rng = editor.selection.getRng();
      if (!rng.collapsed) {
        rng.deleteContents();
        editor.selection.setRng(rng);
      }
    },
  });

  commands.addCommands(
    {
      Undo: () => editor.undoManager.hasUndo(),
      Redo: () => editor.undoManager.hasRedo(),
      mceToggleVisualAid: () => editor.hasVisual,
    },
    'state',
  );
};
