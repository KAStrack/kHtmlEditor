import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';
import { encodeRaw } from '../../html/Entities';

/**
 * Code sample plugin: `<pre class="language-xx">` blocks edited in a dialog. Highlighting uses a
 * global Prism when one is present (`codesample_global_prismjs`); output is always plain text.
 */
const DEFAULT_LANGUAGES = [
  { text: 'HTML/XML', value: 'markup' },
  { text: 'JavaScript', value: 'javascript' },
  { text: 'CSS', value: 'css' },
  { text: 'PHP', value: 'php' },
  { text: 'Ruby', value: 'ruby' },
  { text: 'Python', value: 'python' },
  { text: 'Java', value: 'java' },
  { text: 'C', value: 'c' },
  { text: 'C#', value: 'csharp' },
  { text: 'C++', value: 'cpp' },
];

const isCodeSample = (node: Node | null): node is HTMLPreElement => !!node && node.nodeName === 'PRE' && /\blanguage-/.test((node as Element).className);

const getSelectedCodeSample = (editor: Editor): HTMLPreElement | null => {
  const node = editor.selection.getNode();
  if (isCodeSample(node)) {
    return node;
  }
  return editor.dom.getParent(node, 'pre[class*="language-"]') as HTMLPreElement | null;
};

const getLanguage = (pre: Element): string => {
  const m = /\blanguage-([\w-]+)/.exec(pre.className);
  return m ? m[1] : 'markup';
};

const getPrism = (editor: Editor): any => {
  const w = window as any;
  if (editor.options.get('codesample_global_prismjs') && w.Prism) {
    return w.Prism;
  }
  return w.Prism && w.Prism.languages ? w.Prism : null;
};

const highlight = (editor: Editor, pre: HTMLElement): void => {
  const prism = getPrism(editor);
  const code = pre.textContent || '';
  const lang = getLanguage(pre);
  if (prism && prism.languages && prism.languages[lang]) {
    try {
      pre.innerHTML = prism.highlight(code, prism.languages[lang], lang);
      return;
    } catch {
      /* fall through */
    }
  }
  pre.textContent = code;
};

const insertCodeSample = (editor: Editor, language: string, code: string): void => {
  editor.undoManager.transact(() => {
    const existing = getSelectedCodeSample(editor);
    code = code.replace(/\r\n?/g, '\n');
    if (existing) {
      existing.className = 'language-' + language;
      existing.textContent = code;
      existing.setAttribute('contenteditable', 'false');
      highlight(editor, existing);
      editor.selection.select(existing);
    } else {
      editor.insertContent(`<pre id="__khe_new_codesample" class="language-${encodeRaw(language, true)}" contenteditable="false">${encodeRaw(code, false)}</pre>`);
      const pre = editor.dom.get('__khe_new_codesample') as HTMLElement | null;
      if (pre) {
        pre.removeAttribute('id');
        highlight(editor, pre);
        editor.selection.select(pre);
      }
    }
  });
  editor.nodeChanged();
};

const openDialog = (editor: Editor): void => {
  const languages = (editor.options.get('codesample_languages') as Array<{ text: string; value: string }>) || DEFAULT_LANGUAGES;
  const existing = getSelectedCodeSample(editor);
  const language = existing ? getLanguage(existing) : languages[0]?.value ?? 'markup';
  const code = existing ? existing.textContent || '' : '';
  editor.windowManager.open({
    title: 'Insert/Edit Code Sample',
    size: 'large',
    body: {
      type: 'panel',
      items: [
        { type: 'listbox', name: 'language', label: 'Language', items: languages },
        { type: 'textarea', name: 'code', label: 'Code view', spellcheck: false, classes: ['khe-source-textarea'] },
      ],
    },
    buttons: [
      { type: 'cancel', name: 'cancel', text: 'Cancel' },
      { type: 'submit', name: 'save', text: 'Save', primary: true },
    ],
    initialData: { language, code },
    onSubmit: (api: any) => {
      const data = api.getData() as { language: string; code: string };
      insertCodeSample(editor, data.language, data.code);
      api.close();
    },
  } as any);
};

const register = (editor: Editor): void => {
  editor.options.register('codesample_languages', { processor: 'object[]' });
  editor.options.register('codesample_global_prismjs', { processor: 'boolean', default: false });

  editor.on('PreInit', () => {
    editor.parser.addNodeFilter('pre', (nodes, _name, args) => {
      if ((args as any).format === 'raw') {
        return;
      }
      nodes.forEach((pre) => {
        if (/\blanguage-/.test(pre.className)) {
          pre.setAttribute('contenteditable', 'false');
          const code = pre.textContent || '';
          pre.textContent = code;
          highlight(editor, pre as HTMLElement);
        }
      });
    });
    editor.serializer.addNodeFilter('pre', (nodes) => {
      nodes.forEach((pre) => {
        if (/\blanguage-/.test(pre.className)) {
          pre.removeAttribute('contenteditable');
          const code = pre.textContent || '';
          pre.textContent = code;
        }
      });
    });
  });

  editor.editorCommands.addCommands({ codesample: () => openDialog(editor) });
  const setup = (api: { setEnabled: (s: boolean) => void; setActive?: (s: boolean) => void }) => {
    const update = () => {
      api.setEnabled(!editor.readonly && editor.selection.isEditable());
      if (api.setActive) {
        api.setActive(!!getSelectedCodeSample(editor));
      }
    };
    editor.on('NodeChange SwitchMode', update);
    update();
    return () => editor.off('NodeChange SwitchMode', update);
  };
  editor.ui.registry.addToggleButton('codesample', { icon: 'code-sample', tooltip: 'Insert/edit code sample', onAction: () => editor.execCommand('codesample'), onSetup: setup });
  editor.ui.registry.addMenuItem('codesample', { icon: 'code-sample', text: 'Code sample...', onAction: () => editor.execCommand('codesample'), onSetup: setup as any });
  editor.on('dblclick', (e) => {
    if (isCodeSample(e.target as Node) && !editor.readonly) {
      e.preventDefault();
      editor.selection.select(e.target as Node);
      openDialog(editor);
    }
  });
};

PluginManager.add('codesample', register);
export default register;
