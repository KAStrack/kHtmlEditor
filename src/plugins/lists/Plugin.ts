import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';
import { toggleList, indentSelection, outdentSelection, updateList, isInList, canIndent, canOutdent, removeList } from './Operations';
import { getClosestList, getClosestItem } from './Entries';
import { isObject } from '../../util/Type';

/**
 * Lists plugin: bullet/numbered lists, nesting with Tab/Shift+Tab, list properties dialog.
 * Commands match TinyMCE: InsertUnorderedList, InsertOrderedList, InsertDefinitionList,
 * RemoveList, mceListProps, mceListUpdate.
 */
const register = (editor: Editor): Record<string, any> => {
  editor.options.register('lists_indent_on_tab', { processor: 'boolean', default: true });

  const toggle = (listType: 'ul' | 'ol' | 'dl') => (_cmd: string, _ui: boolean, value?: any) => {
    const detail = isObject(value) ? (value as Record<string, string>) : undefined;
    editor.undoManager.transact(() => toggleList(editor, listType, detail));
  };

  editor.editorCommands.addCommands({
    InsertUnorderedList: toggle('ul'),
    InsertOrderedList: toggle('ol'),
    InsertDefinitionList: toggle('dl'),
    RemoveList: () => {
      editor.undoManager.transact(() => {
        removeList(editor);
      });
    },
    mceListIndent: () => {
      editor.undoManager.transact(() => {
        indentSelection(editor);
      });
    },
    mceListOutdent: () => {
      editor.undoManager.transact(() => {
        outdentSelection(editor);
      });
    },
    mceListUpdate: (_cmd, _ui, value) => {
      if (isObject(value)) {
        editor.undoManager.transact(() => updateList(editor, value));
      }
    },
    mceListProps: () => openListProps(editor),
  });

  editor.editorCommands.addCommands(
    {
      InsertUnorderedList: () => isInList(editor, 'ul'),
      InsertOrderedList: () => isInList(editor, 'ol'),
      InsertDefinitionList: () => isInList(editor, 'dl'),
    },
    'state',
  );

  // Indent/Outdent inside lists delegate to list nesting.
  editor.on('BeforeExecCommand', (e) => {
    const cmd = (e.command || '').toLowerCase();
    if ((cmd === 'indent' || cmd === 'outdent') && getClosestItem(editor, editor.selection.getStart())) {
      e.preventDefault();
      if (cmd === 'indent') {
        editor.execCommand('mceListIndent');
      } else {
        editor.execCommand('mceListOutdent');
      }
    }
  });
  editor.addQueryStateHandler('Outdent', () => {
    if (getClosestItem(editor, editor.selection.getStart())) {
      return canOutdent(editor);
    }
    return false;
  });

  editor.on('keydown', (e) => {
    if (e.keyCode === 9 && !e.ctrlKey && !e.metaKey && !e.altKey && editor.options.get('lists_indent_on_tab')) {
      const item = getClosestItem(editor, editor.selection.getStart());
      if (item) {
        e.preventDefault();
        if (e.shiftKey) {
          editor.execCommand('mceListOutdent');
        } else if (canIndent(editor)) {
          editor.execCommand('mceListIndent');
        }
      }
    }
  });

  const setupToggle = (listType: 'ul' | 'ol') => (api: { setActive: (s: boolean) => void; setEnabled: (s: boolean) => void }) => {
    const update = () => {
      const list = getClosestList(editor, editor.selection.getStart());
      api.setActive(!!list && list.nodeName.toLowerCase() === listType);
      api.setEnabled(!editor.readonly && editor.selection.isEditable());
    };
    editor.on('NodeChange SwitchMode', update);
    update();
    return () => editor.off('NodeChange SwitchMode', update);
  };

  editor.ui.registry.addToggleButton('bullist', { icon: 'unordered-list', tooltip: 'Bullet list', onAction: () => editor.execCommand('InsertUnorderedList'), onSetup: setupToggle('ul') });
  editor.ui.registry.addToggleButton('numlist', { icon: 'ordered-list', tooltip: 'Numbered list', onAction: () => editor.execCommand('InsertOrderedList'), onSetup: setupToggle('ol') });
  editor.ui.registry.addToggleMenuItem('bullist', { text: 'Bullet list', icon: 'unordered-list', onAction: () => editor.execCommand('InsertUnorderedList'), onSetup: setupToggle('ul') as any });
  editor.ui.registry.addToggleMenuItem('numlist', { text: 'Numbered list', icon: 'ordered-list', onAction: () => editor.execCommand('InsertOrderedList'), onSetup: setupToggle('ol') as any });
  editor.ui.registry.addMenuItem('listprops', {
    text: 'List properties...',
    icon: 'ordered-list',
    onAction: () => editor.execCommand('mceListProps'),
    onSetup: (api) => {
      const update = () => api.setEnabled(isInList(editor, 'ol'));
      editor.on('NodeChange', update);
      update();
      return () => editor.off('NodeChange', update);
    },
  });
  editor.ui.registry.addContextMenu('lists', {
    update: (node) => (editor.dom.getParent(node, 'ol', editor.getBody()) ? 'listprops' : ''),
  });

  return {
    backspaceDelete: () => false,
  };
};

const openListProps = (editor: Editor): void => {
  const list = getClosestList(editor, editor.selection.getStart());
  if (!list || list.nodeName !== 'OL') {
    return;
  }
  editor.windowManager.open({
    title: 'List Properties',
    body: {
      type: 'panel',
      items: [{ type: 'input', name: 'start', label: 'Start list at number', inputMode: 'numeric' }],
    },
    initialData: { start: list.getAttribute('start') || '1' },
    buttons: [
      { type: 'cancel', name: 'cancel', text: 'Cancel' },
      { type: 'submit', name: 'save', text: 'Save', primary: true },
    ],
    onSubmit: (api) => {
      const data = api.getData() as { start: string };
      const start = parseInt(data.start, 10);
      editor.execCommand('mceListUpdate', false, { start: Number.isNaN(start) || start === 1 ? null : String(start) });
      api.close();
    },
  });
};

PluginManager.add('lists', register);
export default register;
