import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';
import { builtInEmojis, categoryTitles, EmojiEntry } from './EmojiDatabase';
import { isObject, isString } from '../../util/Type';

/** Emoticons plugin: emoji dialog with categories and search, plus a `:` autocompleter. */
interface Emoji {
  title: string;
  keywords: string[];
  char: string;
  category: string;
}

const toList = (db: Record<string, EmojiEntry>): Emoji[] =>
  Object.keys(db).map((title) => {
    const e = db[title];
    return { title, keywords: e.keywords || [], char: e.char, category: e.category || 'user' };
  });

const loadDatabase = (editor: Editor): Promise<Emoji[]> => {
  const url = editor.options.get('emoticons_database_url') as string | undefined;
  const append = editor.options.get('emoticons_append') as Record<string, EmojiEntry> | undefined;
  const merge = (db: Record<string, EmojiEntry>) => toList({ ...db, ...(isObject(append) ? append : {}) });
  if (isString(url) && url) {
    return fetch(url)
      .then((r) => r.json())
      .then((json) => merge(isObject(json) ? json : builtInEmojis))
      .catch(() => merge(builtInEmojis));
  }
  return Promise.resolve(merge(builtInEmojis));
};

const matches = (e: Emoji, term: string): boolean => e.title.toLowerCase().includes(term) || e.keywords.some((k) => k.toLowerCase().includes(term));

const insertEmoji = (editor: Editor, chr: string): void => {
  editor.undoManager.transact(() => {
    editor.insertContent(chr);
  });
};

const openDialog = (editor: Editor, emojis: Emoji[]): void => {
  const categories = Array.from(new Set(emojis.map((e) => e.category)));
  const toItems = (list: Emoji[]) => list.map((e) => ({ text: e.title, value: e.char, icon: e.char }));
  const tabs: any[] = [{ name: 'all', title: 'All', items: [{ type: 'input', name: 'search', label: 'Search', placeholder: 'Search' }, { type: 'collection', name: 'results', columns: 'auto' }] }].concat(
    categories.map((c, i) => ({ name: 'cat' + i, title: categoryTitles[c] || c, items: [{ type: 'collection', name: 'cat' + i, columns: 'auto' }] })),
  );
  const initial: Record<string, any> = { search: '', results: toItems(emojis) };
  categories.forEach((c, i) => {
    initial['cat' + i] = toItems(emojis.filter((e) => e.category === c));
  });
  editor.windowManager.open({
    title: 'Emojis',
    size: 'normal',
    body: { type: 'tabpanel', tabs },
    buttons: [{ type: 'cancel', name: 'close', text: 'Close', primary: true }],
    initialData: initial,
    onAction: (api: any, details: { name: string; value?: string }) => {
      if ((details.name === 'results' || details.name.startsWith('cat')) && details.value) {
        insertEmoji(editor, details.value);
        api.close();
      }
    },
    onChange: (api: any, details: { name: string }) => {
      if (details.name === 'search') {
        const term = String((api.getData() as any).search || '').toLowerCase().trim();
        api.setData({ results: toItems(term ? emojis.filter((e) => matches(e, term)) : emojis) });
      }
    },
  } as any);
};

const register = (editor: Editor): void => {
  editor.options.register('emoticons_database', { processor: 'string', default: 'emojis' });
  editor.options.register('emoticons_database_url', { processor: 'string' });
  editor.options.register('emoticons_database_id', { processor: 'string', default: 'tinymce.plugins.emoticons' });
  editor.options.register('emoticons_append', { processor: 'object', default: {} });
  editor.options.register('emoticons_images_url', { processor: 'string', default: 'https://twemoji.maxcdn.com/v/13.0.1/72x72/' });

  let database: Promise<Emoji[]> | null = null;
  const getDatabase = () => {
    if (!database) {
      database = loadDatabase(editor);
    }
    return database;
  };

  editor.editorCommands.addCommands({
    mceEmoticons: () => {
      void getDatabase().then((emojis) => openDialog(editor, emojis));
    },
  });
  editor.ui.registry.addButton('emoticons', { icon: 'emoji', tooltip: 'Emojis', onAction: () => editor.execCommand('mceEmoticons') });
  editor.ui.registry.addMenuItem('emoticons', { icon: 'emoji', text: 'Emojis...', onAction: () => editor.execCommand('mceEmoticons') });
  editor.ui.registry.addAutocompleter('emoticons', {
    trigger: ':',
    columns: 'auto',
    minChars: 2,
    fetch: (pattern, maxResults) => getDatabase().then((emojis) => {
      const term = pattern.toLowerCase();
      return emojis.filter((e) => matches(e, term)).slice(0, maxResults).map((e) => ({ type: 'autocompleteitem' as const, value: e.char, text: e.title, icon: e.char }));
    }),
    onAction: (api, rng, value) => {
      editor.selection.setRng(rng);
      insertEmoji(editor, value);
      api.hide();
    },
  });
  editor.on('init', () => {
    void getDatabase();
  });
};

PluginManager.add('emoticons', register);
export default register;
