import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';
import * as NodeType from '../../dom/NodeType';

/** Word count plugin: status bar counter, dialog and `plugins.wordcount.body/selection` API. */
export interface Counts {
  words: number;
  characters: number;
  charactersWithoutSpaces: number;
}

const WORD_RE = /[\p{L}\p{N}_]+(?:['’.\-][\p{L}\p{N}_]+)*/gu;

const textOf = (node: Node): string => {
  const doc = node.ownerDocument as Document;
  const walker = doc.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let out = '';
  let cur: Node | null = walker.currentNode;
  const isBlockish = (n: Node) => NodeType.isElement(n) && /^(P|DIV|LI|TD|TH|H[1-6]|PRE|BLOCKQUOTE|BR|TR|UL|OL|TABLE|FIGCAPTION|SECTION|ARTICLE|ADDRESS)$/.test(n.nodeName);
  while (cur) {
    if (NodeType.isText(cur) && !(cur.parentElement && cur.parentElement.closest('[data-mce-bogus="all"],script,style'))) {
      out += cur.data;
    } else if (isBlockish(cur)) {
      out += '\n';
    }
    cur = walker.nextNode();
  }
  return NodeType.removeZwsp(out).replace(/ /g, ' ');
};

export const countText = (text: string, countRegex?: RegExp): Counts => {
  const words = text.match(countRegex ?? WORD_RE) ?? [];
  const characters = text.replace(/\n/g, '').length;
  const charactersWithoutSpaces = text.replace(/\s/g, '').length;
  return { words: words.length, characters, charactersWithoutSpaces };
};

const register = (editor: Editor): Record<string, any> => {
  editor.options.register('wordcount_countregex', { processor: 'regexp' });
  const regex = () => editor.options.get('wordcount_countregex') as RegExp | undefined;

  const bodyCounts = (): Counts => countText(textOf(editor.getBody()), regex());
  const selectionCounts = (): Counts => {
    const rng = editor.selection.getRng();
    if (rng.collapsed) {
      return { words: 0, characters: 0, charactersWithoutSpaces: 0 };
    }
    const frag = rng.cloneContents();
    return countText(textOf(frag), regex());
  };

  let timer: ReturnType<typeof setTimeout> | null = null;
  const update = () => {
    if (editor.removed || !editor.getBody()) {
      return;
    }
    editor.dispatch('WordCountUpdate', { wordCount: bodyCounts() });
  };
  const schedule = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      update();
    }, 300);
  };

  editor.on('init', () => setTimeout(update, 0));
  editor.on('SetContent BeforeAddUndo undo redo keyup', schedule);
  editor.on('remove', () => {
    if (timer) {
      clearTimeout(timer);
    }
  });

  const openDialog = () => {
    const b = bodyCounts();
    const s = selectionCounts();
    editor.windowManager.open({
      title: 'Word Count',
      size: 'normal',
      body: {
        type: 'panel',
        items: [
          {
            type: 'table',
            header: ['Count', 'Document', 'Selection'],
            cells: [
              ['Words', String(b.words), String(s.words)],
              ['Characters (no spaces)', String(b.charactersWithoutSpaces), String(s.charactersWithoutSpaces)],
              ['Characters', String(b.characters), String(s.characters)],
            ],
          },
        ],
      },
      buttons: [{ type: 'cancel', name: 'close', text: 'Close', primary: true }],
    } as any);
  };
  editor.editorCommands.addCommands({ mceWordCount: () => openDialog() });
  editor.addShortcut('Meta+Shift+C', 'Word count', () => editor.execCommand('mceWordCount'));
  editor.ui.registry.addButton('wordcount', { icon: 'character-count', tooltip: 'Word count', shortcut: 'Meta+Shift+C', onAction: () => editor.execCommand('mceWordCount') });
  editor.ui.registry.addMenuItem('wordcount', { icon: 'character-count', text: 'Word count', shortcut: 'Meta+Shift+C', onAction: () => editor.execCommand('mceWordCount') });

  return {
    body: {
      getWordCount: () => bodyCounts().words,
      getCharacterCount: () => bodyCounts().characters,
      getCharacterCountWithoutSpaces: () => bodyCounts().charactersWithoutSpaces,
      getCounts: bodyCounts,
    },
    selection: {
      getWordCount: () => selectionCounts().words,
      getCharacterCount: () => selectionCounts().characters,
      getCharacterCountWithoutSpaces: () => selectionCounts().charactersWithoutSpaces,
      getCounts: selectionCounts,
    },
    getCount: () => bodyCounts().words,
  };
};

PluginManager.add('wordcount', register);
export default register;
