import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';
import { Env } from '../../util/Env';

/** Pagebreak plugin: `<!-- pagebreak -->` separators shown as a placeholder image in the editor. */
const PLACEHOLDER_CLASS = 'mce-pagebreak';

const getSeparator = (editor: Editor): string => (editor.options.get('pagebreak_separator') as string) || '<!-- pagebreak -->';

const placeholderHtml = (): string => `<img src="${Env.transparentSrc}" class="${PLACEHOLDER_CLASS}" data-mce-resize="false" data-mce-placeholder="1">`;

const separatorNodes = (editor: Editor, doc: Document): Node[] => {
  const sep = getSeparator(editor);
  const comment = /^\s*<!--([\s\S]*?)-->\s*$/.exec(sep);
  if (comment) {
    return [doc.createComment(comment[1])];
  }
  const tpl = doc.createElement('div');
  tpl.innerHTML = sep;
  return Array.from(tpl.childNodes);
};

const register = (editor: Editor): void => {
  editor.options.register('pagebreak_separator', { processor: 'string', default: '<!-- pagebreak -->' });
  editor.options.register('pagebreak_split_block', { processor: 'boolean', default: false });

  editor.on('PreInit', () => {
    const sep = getSeparator(editor);
    const comment = /^\s*<!--([\s\S]*?)-->\s*$/.exec(sep);
    // Incoming separators become placeholders.
    if (comment) {
      const data = comment[1];
      editor.parser.addNodeFilter('#comment', ((nodes: Comment[]) => {
        nodes.forEach((node) => {
          if (node.data === data || node.data.trim() === data.trim()) {
            const img = node.ownerDocument.createElement('img');
            img.setAttribute('src', Env.transparentSrc);
            img.setAttribute('class', PLACEHOLDER_CLASS);
            img.setAttribute('data-mce-resize', 'false');
            img.setAttribute('data-mce-placeholder', '1');
            node.parentNode?.replaceChild(img, node);
          }
        });
      }) as any);
    } else {
      editor.parser.addNodeFilter('*', (nodes) => {
        nodes.forEach((node) => {
          if (node.outerHTML === sep && node.parentNode) {
            const img = node.ownerDocument.createElement('img');
            img.setAttribute('src', Env.transparentSrc);
            img.setAttribute('class', PLACEHOLDER_CLASS);
            img.setAttribute('data-mce-resize', 'false');
            img.setAttribute('data-mce-placeholder', '1');
            node.parentNode.replaceChild(img, node);
          }
        });
      });
    }
    // Placeholders become separators on output.
    editor.serializer.addNodeFilter('img', (nodes) => {
      nodes.forEach((node) => {
        if (node.classList.contains(PLACEHOLDER_CLASS) && node.parentNode) {
          const parent = node.parentNode;
          const replacements = separatorNodes(editor, node.ownerDocument);
          replacements.forEach((r) => parent.insertBefore(r, node));
          parent.removeChild(node);
        }
      });
    });
  });

  editor.editorCommands.addCommands({
    mcePageBreak: () => {
      const split = editor.options.get('pagebreak_split_block') as boolean;
      editor.undoManager.transact(() => {
        editor.insertContent(split ? `<p>${placeholderHtml()}</p>` : placeholderHtml());
      });
    },
  });
  editor.ui.registry.addButton('pagebreak', { icon: 'page-break', tooltip: 'Page break', onAction: () => editor.execCommand('mcePageBreak') });
  editor.ui.registry.addMenuItem('pagebreak', { icon: 'page-break', text: 'Page break', onAction: () => editor.execCommand('mcePageBreak') });
  editor.on('ResolveName', (e) => {
    if (e.target.nodeName === 'IMG' && (e.target as Element).classList.contains(PLACEHOLDER_CLASS)) {
      e.name = 'pagebreak';
    }
  });
};

PluginManager.add('pagebreak', register);
export default register;
