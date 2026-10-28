import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';
import { insertFiles } from '../../content/InsertFiles';
import * as NodeType from '../../dom/NodeType';

/**
 * Quickbars plugin: a text-selection toolbar, an insert toolbar on empty blocks and an image
 * toolbar (`quickbars_selection_toolbar`, `quickbars_insert_toolbar`, `quickbars_image_toolbar`),
 * plus the `quickimage` and `quicktable` buttons.
 */
const registerOptions = (editor: Editor) => {
  const r = editor.options.register;
  const toolbarProcessor = (value: unknown) => (value === false || typeof value === 'string' ? { valid: true as const, value: value === false ? '' : value } : Array.isArray(value) ? { valid: true as const, value: value.join(' ') } : { valid: false as const, message: 'Must be a string, an array or false.' });
  r('quickbars_selection_toolbar', { processor: toolbarProcessor, default: 'bold italic | quicklink h2 h3 blockquote' });
  r('quickbars_insert_toolbar', { processor: toolbarProcessor, default: 'quickimage quicktable' });
  r('quickbars_image_toolbar', { processor: toolbarProcessor, default: 'alignleft aligncenter alignright' });
};

const isImageNode = (node: Node | null): boolean => !!node && (node.nodeName === 'IMG' || (node.nodeName === 'FIGURE' && /\bimage\b/.test((node as HTMLElement).className)));

const pickImageFiles = (editor: Editor): void => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
  document.body.appendChild(input);
  const cleanup = () => input.remove();
  input.addEventListener('change', () => {
    const files = input.files ? Array.from(input.files) : [];
    cleanup();
    editor.focus();
    void insertFiles(editor, files);
  });
  input.addEventListener('cancel', cleanup);
  input.click();
};

const register = (editor: Editor): void => {
  registerOptions(editor);

  editor.ui.registry.addButton('quickimage', { icon: 'image', tooltip: 'Insert image', onAction: () => pickImageFiles(editor) });
  editor.ui.registry.addButton('quicktable', {
    icon: 'table',
    tooltip: 'Insert table',
    onAction: () => {
      editor.execCommand('mceInsertTable', false, { rows: 2, columns: 2 });
    },
  });

  const insertItems = editor.options.get('quickbars_insert_toolbar') as string;
  if (insertItems) {
    editor.ui.registry.addContextToolbar('quickblock', {
      predicate: (node) => {
        if (!NodeType.isElement(node) || node === editor.getBody() || !editor.selection.isCollapsed()) {
          return false;
        }
        const textBlocks = editor.schema.getTextBlockElements();
        return !!textBlocks[node.nodeName.toLowerCase()] && editor.dom.isEmpty(node) && editor.selection.isEditable();
      },
      items: insertItems,
      position: 'line',
      scope: 'editor',
    });
  }

  const selectionItems = editor.options.get('quickbars_selection_toolbar') as string;
  if (selectionItems) {
    editor.ui.registry.addContextToolbar('textselection', {
      predicate: (node) => {
        if (editor.selection.isCollapsed() || isImageNode(node) || !editor.selection.isEditable()) {
          return false;
        }
        if (editor.selection.getSelectedObject()) {
          return false;
        }
        return String(editor.selection.getContent({ format: 'text' })).trim().length > 0;
      },
      items: selectionItems,
      position: 'selection',
      scope: 'editor',
    });
  }

  const imageItems = editor.options.get('quickbars_image_toolbar') as string;
  if (imageItems) {
    editor.ui.registry.addContextToolbar('imageselection', {
      predicate: (node) => isImageNode(node) && editor.selection.isEditable(),
      items: imageItems,
      position: 'node',
    });
  }
};

PluginManager.add('quickbars', register);
export default register;
