import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';
import * as NodeType from '../../dom/NodeType';

/** Directionality plugin: `ltr`/`rtl` buttons set the `dir` attribute on the selected blocks. */
type Dir = 'ltr' | 'rtl';

const getBlockTarget = (editor: Editor, block: Element): Element => {
  // Lists and tables are set as a whole.
  const list = editor.dom.getParent(block, 'ol,ul', editor.getBody()) as Element | null;
  if (list) {
    let outer = list;
    let p: Element | null = list;
    while ((p = editor.dom.getParent(p.parentNode, 'ol,ul', editor.getBody()) as Element | null)) {
      outer = p;
    }
    return outer;
  }
  const cell = editor.dom.getParent(block, 'td,th', editor.getBody());
  if (cell) {
    return editor.dom.getParent(cell, 'table', editor.getBody()) as Element;
  }
  return block;
};

const getDir = (editor: Editor, node: Node): Dir => (editor.dom.getStyle(NodeType.isElement(node) ? node : (node.parentNode as Element), 'direction', true) === 'rtl' ? 'rtl' : 'ltr');

const setDir = (editor: Editor, dir: Dir): void => {
  const dom = editor.dom;
  const blocks = editor.selection.getSelectedBlocks();
  if (!blocks.length) {
    return;
  }
  const targets = new Set<Element>();
  blocks.forEach((b) => targets.add(getBlockTarget(editor, b)));
  editor.undoManager.transact(() => {
    targets.forEach((el) => {
      const parentDir = el.parentNode && el.parentNode !== editor.getBody() ? getDir(editor, el.parentNode) : (editor.options.get('directionality') as string) || 'ltr';
      if (parentDir === dir) {
        el.removeAttribute('dir');
      } else {
        el.setAttribute('dir', dir);
      }
      // Clear conflicting dir attributes on descendants.
      dom.select('[dir]', el as HTMLElement).forEach((child) => child.removeAttribute('dir'));
    });
  });
  editor.nodeChanged();
};

const register = (editor: Editor): void => {
  editor.editorCommands.addCommands({
    mceDirectionLTR: () => setDir(editor, 'ltr'),
    mceDirectionRTL: () => setDir(editor, 'rtl'),
  });
  const setup = (dir: Dir) => (api: { setActive: (s: boolean) => void; setEnabled: (s: boolean) => void }) => {
    const update = () => {
      api.setEnabled(!editor.readonly && editor.selection.isEditable());
      api.setActive(getDir(editor, editor.selection.getNode()) === dir);
    };
    editor.on('NodeChange SwitchMode', update);
    update();
    return () => editor.off('NodeChange SwitchMode', update);
  };
  editor.ui.registry.addToggleButton('ltr', { icon: 'ltr', tooltip: 'Left to right', onAction: () => editor.execCommand('mceDirectionLTR'), onSetup: setup('ltr') });
  editor.ui.registry.addToggleButton('rtl', { icon: 'rtl', tooltip: 'Right to left', onAction: () => editor.execCommand('mceDirectionRTL'), onSetup: setup('rtl') });
  editor.ui.registry.addToggleMenuItem('ltr', { icon: 'ltr', text: 'Left to right', onAction: () => editor.execCommand('mceDirectionLTR'), onSetup: setup('ltr') as any });
  editor.ui.registry.addToggleMenuItem('rtl', { icon: 'rtl', text: 'Right to left', onAction: () => editor.execCommand('mceDirectionRTL'), onSetup: setup('rtl') as any });
};

PluginManager.add('directionality', register);
export default register;
