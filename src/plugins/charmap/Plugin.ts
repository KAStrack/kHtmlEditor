import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';
import { defaultCharMap, CharGroup, CharEntry } from './CharMap';
import { isArray, isFunction } from '../../util/Type';

/** Character map plugin: dialog with categorised special characters, search and a `:` autocompleter. */
const USER_DEFINED = 'User Defined';

const toChar = (code: number): string => String.fromCodePoint(code);

const getCharMap = (editor: Editor): CharGroup[] => {
  let groups: CharGroup[] = defaultCharMap.map((g) => ({ name: g.name, characters: g.characters.slice() }));
  const custom = editor.options.get('charmap');
  const resolve = (v: unknown): CharEntry[] | null => {
    if (isFunction(v)) {
      return resolve(v());
    }
    return isArray(v) ? (v as CharEntry[]) : null;
  };
  const replaced = resolve(custom);
  if (replaced) {
    groups = [{ name: USER_DEFINED, characters: replaced }];
  }
  const appended = resolve(editor.options.get('charmap_append'));
  if (appended && appended.length) {
    const user = groups.find((g) => g.name === USER_DEFINED);
    if (user && replaced) {
      user.characters = user.characters.concat(appended);
    } else {
      groups.push({ name: USER_DEFINED, characters: appended });
    }
  }
  return groups;
};

const allChars = (groups: CharGroup[]): CharEntry[] => {
  const seen = new Set<number>();
  const out: CharEntry[] = [];
  groups.forEach((g) => g.characters.forEach((c) => {
    if (!seen.has(c[0])) {
      seen.add(c[0]);
      out.push(c);
    }
  }));
  return out;
};

const insertChar = (editor: Editor, chr: string): void => {
  editor.dispatch('insertCustomChar', { chr });
  editor.undoManager.transact(() => {
    editor.insertContent(chr);
  });
};

const openDialog = (editor: Editor): void => {
  const groups = getCharMap(editor);
  const toItems = (chars: CharEntry[]) => chars.map(([code, name]) => ({ text: name, value: toChar(code), icon: toChar(code) }));
  const tabs: any[] = [{ name: 'all', title: 'All', items: [{ type: 'input', name: 'search', label: 'Search', placeholder: 'Search' }, { type: 'collection', name: 'results', columns: 'auto' }] }].concat(groups.map((g, i) => ({ name: 'tab' + i, title: g.name, items: [{ type: 'collection', name: 'group' + i, columns: 'auto' }] })));
  const initial: Record<string, any> = { search: '', results: toItems(allChars(groups)) };
  groups.forEach((g, i) => {
    initial['group' + i] = toItems(g.characters);
  });
  editor.windowManager.open({
    title: 'Special Character',
    size: 'normal',
    body: { type: 'tabpanel', tabs },
    buttons: [{ type: 'cancel', name: 'close', text: 'Close', primary: true }],
    initialData: initial,
    onAction: (api: any, details: { name: string; value?: string }) => {
      if (details.name.startsWith('group') || details.name === 'results') {
        if (details.value) {
          insertChar(editor, details.value);
          api.close();
        }
      }
    },
    onChange: (api: any, details: { name: string }) => {
      if (details.name === 'search') {
        const term = String((api.getData() as any).search || '').toLowerCase().trim();
        const matches = term ? allChars(groups).filter(([code, name]) => name.toLowerCase().includes(term) || toChar(code) === term) : allChars(groups);
        api.setData({ results: toItems(matches) });
      }
    },
  } as any);
};

const register = (editor: Editor): Record<string, any> => {
  editor.options.register('charmap', { processor: (v: unknown) => (isArray(v) || isFunction(v) ? { valid: true, value: v } : { valid: false, message: 'Must be an array or a function.' }) });
  editor.options.register('charmap_append', { processor: (v: unknown) => (isArray(v) || isFunction(v) ? { valid: true, value: v } : { valid: false, message: 'Must be an array or a function.' }) });

  editor.editorCommands.addCommands({ mceShowCharmap: () => openDialog(editor) });
  editor.ui.registry.addButton('charmap', { icon: 'insert-character', tooltip: 'Special character', onAction: () => editor.execCommand('mceShowCharmap') });
  editor.ui.registry.addMenuItem('charmap', { icon: 'insert-character', text: 'Special character...', onAction: () => editor.execCommand('mceShowCharmap') });
  editor.ui.registry.addAutocompleter('charmap', {
    trigger: ':',
    columns: 'auto',
    minChars: 2,
    fetch: (pattern, maxResults) => {
      const term = pattern.toLowerCase();
      const matches = allChars(getCharMap(editor)).filter(([, name]) => name.toLowerCase().includes(term));
      return Promise.resolve(matches.slice(0, maxResults).map(([code, name]) => ({ type: 'autocompleteitem' as const, value: toChar(code), text: name, icon: toChar(code) })));
    },
    onAction: (api, rng, value) => {
      editor.selection.setRng(rng);
      insertChar(editor, value);
      api.hide();
    },
  });

  return {
    getCharMap: () => getCharMap(editor),
    insertChar: (chr: string) => insertChar(editor, chr),
  };
};

PluginManager.add('charmap', register);
export default register;
