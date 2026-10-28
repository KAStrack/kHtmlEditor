import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';
import * as TextSearch from './TextSearch';

/** Search and replace plugin with the TinyMCE dialog and `plugins.searchreplace` API. */
interface State {
  index: number;
  count: number;
  text: string;
  matchCase: boolean;
  wholeWord: boolean;
  inSelection: boolean;
}

const register = (editor: Editor): Record<string, any> => {
  const state: State = { index: -1, count: 0, text: '', matchCase: false, wholeWord: false, inSelection: false };

  const highlight = () => {
    TextSearch.markers(editor).forEach((m) => m.classList.remove(TextSearch.SELECTED_CLASS));
    const current = TextSearch.markers(editor, state.index);
    current.forEach((m) => m.classList.add(TextSearch.SELECTED_CLASS));
    if (current.length) {
      const rng = editor.dom.createRng();
      rng.setStartBefore(current[0]);
      rng.setEndAfter(current[current.length - 1]);
      editor.selection.setRng(rng);
      editor.selection.scrollIntoView(current[0]);
    }
  };

  const done = (keepEditorSelection?: boolean): Range | null => {
    const current = TextSearch.markers(editor, state.index);
    let rng: Range | null = null;
    if (current.length) {
      rng = editor.dom.createRng();
      rng.setStartBefore(current[0]);
      rng.setEndAfter(current[current.length - 1]);
    }
    const bookmark = rng ? editor.selection.getBookmark(2, true) : null;
    TextSearch.unwrapMarkers(editor);
    editor.getBody().normalize();
    state.index = -1;
    state.count = 0;
    if (!keepEditorSelection && bookmark) {
      editor.selection.moveToBookmark(bookmark);
    }
    return rng;
  };

  const find = (text: string, matchCase = false, wholeWord = false, inSelection = false): number => {
    done(true);
    state.text = text;
    state.matchCase = matchCase;
    state.wholeWord = wholeWord;
    state.inSelection = inSelection;
    state.count = TextSearch.findAndMark(editor, text, matchCase, wholeWord, inSelection);
    state.index = state.count > 0 ? 0 : -1;
    if (state.count > 0) {
      highlight();
    }
    return state.count;
  };

  const move = (forward: boolean) => {
    if (state.count === 0) {
      return;
    }
    state.index = (state.index + (forward ? 1 : -1) + state.count) % state.count;
    highlight();
  };

  const replace = (text: string, forward = true, all = false): boolean => {
    if (state.count === 0) {
      return false;
    }
    const indexes = all ? Array.from({ length: state.count }, (_v, i) => i) : [state.index];
    editor.undoManager.transact(() => {
      indexes.forEach((i) => TextSearch.replaceMatch(editor, i, text));
    });
    const bookmark = editor.selection.getBookmark(2, true);
    const remaining = TextSearch.renumber(editor);
    state.count = remaining;
    if (remaining === 0) {
      state.index = -1;
      TextSearch.unwrapMarkers(editor);
      editor.getBody().normalize();
      editor.selection.moveToBookmark(bookmark);
      editor.nodeChanged();
      return false;
    }
    if (!all) {
      state.index = forward ? Math.min(state.index, remaining - 1) : (state.index - 1 + remaining) % remaining;
      highlight();
    }
    editor.nodeChanged();
    return true;
  };

  const openDialog = () => {
    const selectedText = editor.selection.isCollapsed() ? '' : (editor.selection.getContent({ format: 'text' }) as string).trim();
    const initialData = { findtext: selectedText.indexOf('\n') === -1 ? selectedText : '', replacetext: '', matchcase: false, wholewords: false, inselection: false };
    let notFound = false;
    const updateButtons = (api: any) => {
      const found = state.count > 0;
      api.setEnabled('replace', found);
      api.setEnabled('replaceall', found);
      api.setEnabled('prev', state.count > 1);
      api.setEnabled('next', state.count > 1);
    };
    const spec = (): any => ({
      title: 'Find and Replace',
      size: 'normal',
      body: {
        type: 'panel',
        items: [
          ...(notFound ? [{ type: 'alertbanner', level: 'error', text: 'Could not find the specified string.', icon: 'warning' }] : []),
          { type: 'bar', items: [{ type: 'input', name: 'findtext', placeholder: 'Find', inputMode: 'search' }, { type: 'button', name: 'prev', text: 'Previous', icon: 'action-prev', enabled: false }, { type: 'button', name: 'next', text: 'Next', icon: 'action-next', enabled: false }] },
          { type: 'input', name: 'replacetext', placeholder: 'Replace with' },
          { type: 'grid', columns: 3, items: [{ type: 'checkbox', name: 'matchcase', label: 'Match case' }, { type: 'checkbox', name: 'wholewords', label: 'Find whole words only' }, { type: 'checkbox', name: 'inselection', label: 'Find in selection' }] },
        ],
      },
      buttons: [
        { type: 'submit', name: 'find', text: 'Find', primary: true },
        { type: 'custom', name: 'replace', text: 'Replace', enabled: false },
        { type: 'custom', name: 'replaceall', text: 'Replace all', enabled: false },
      ],
      initialData,
      onChange: (api: any, details: { name: string }) => {
        if (details.name === 'findtext' && state.count > 0) {
          done(false);
          api.setEnabled('replace', false);
          api.setEnabled('replaceall', false);
          api.setEnabled('prev', false);
          api.setEnabled('next', false);
        }
      },
      onSubmit: (api: any) => {
        const data = api.getData() as typeof initialData;
        if (!data.findtext) {
          return;
        }
        const count = find(data.findtext, data.matchcase, data.wholewords, data.inselection);
        const wasNotFound = notFound;
        notFound = count === 0;
        if (wasNotFound !== notFound) {
          api.redial(spec());
          api.setData(data);
        }
        updateButtons(api);
      },
      onAction: (api: any, details: { name: string }) => {
        const data = api.getData() as typeof initialData;
        switch (details.name) {
          case 'next':
            move(true);
            break;
          case 'prev':
            move(false);
            break;
          case 'replace':
            if (!replace(data.replacetext, true, false)) {
              updateButtons(api);
            }
            break;
          case 'replaceall':
            replace(data.replacetext, true, true);
            updateButtons(api);
            break;
          default:
            break;
        }
      },
      onClose: () => {
        done(false);
        editor.focus();
        editor.undoManager.add();
      },
    });
    editor.windowManager.open(spec());
  };

  editor.editorCommands.addCommands({ SearchReplace: () => openDialog() });
  editor.addShortcut('Meta+F', 'Find and replace', () => editor.execCommand('SearchReplace'));
  editor.ui.registry.addButton('searchreplace', { icon: 'search', tooltip: 'Find and replace', shortcut: 'Meta+F', onAction: () => editor.execCommand('SearchReplace') });
  editor.ui.registry.addMenuItem('searchreplace', { icon: 'search', text: 'Find and replace...', shortcut: 'Meta+F', onAction: () => editor.execCommand('SearchReplace') });

  return { done, find, next: () => move(true), prev: () => move(false), replace };
};

PluginManager.add('searchreplace', register);
export default register;
