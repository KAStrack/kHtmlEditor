import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';

/** Anchor plugin: named anchors `<a id="...">`, kept non-editable in the editor. */
const isNamedAnchor = (node: Node | null): node is HTMLAnchorElement => !!node && node.nodeName === 'A' && !(node as Element).getAttribute('href') && (!!(node as Element).getAttribute('id') || !!(node as Element).getAttribute('name'));

const ID_RE = /^[A-Za-z][A-Za-z0-9\-:._]*$/;

/** Moves the anchor's children after it and marks it non-editable. */
const emptyAnchor = (a: Element): void => {
  const parent = a.parentNode;
  if (!parent) {
    return;
  }
  let ref: Node | null = a.nextSibling;
  while (a.lastChild) {
    const child = a.lastChild;
    parent.insertBefore(child, ref);
    ref = child;
  }
  a.setAttribute('contenteditable', 'false');
};

const getSelectedAnchor = (editor: Editor): HTMLAnchorElement | null => {
  const node = editor.selection.getNode();
  if (isNamedAnchor(node)) {
    return node;
  }
  const parent = editor.dom.getParent(node, 'a') as HTMLAnchorElement | null;
  return parent && isNamedAnchor(parent) ? parent : null;
};

const insertAnchor = (editor: Editor, id: string): void => {
  const existing = getSelectedAnchor(editor);
  editor.undoManager.transact(() => {
    if (existing) {
      existing.removeAttribute('name');
      existing.setAttribute('id', id);
      return;
    }
    if (editor.selection.isCollapsed()) {
      const html = editor.dom.createHTML('a', { id, contenteditable: 'false' }, '');
      editor.insertContent(html);
      return;
    }
    editor.formatter.apply('namedAnchor', { value: id });
    if (!editor.options.get('allow_html_in_named_anchor')) {
      // Like TinyMCE's core filter: the anchor stays empty and its content follows it.
      editor.dom.select('a[id]:not([href])', editor.getBody()).forEach((a) => {
        if (a.getAttribute('id') === id) {
          emptyAnchor(a);
        }
      });
    }
  });
  editor.addVisual();
  editor.nodeChanged();
};

const openDialog = (editor: Editor): void => {
  const existing = getSelectedAnchor(editor);
  const initial = existing ? existing.getAttribute('id') || existing.getAttribute('name') || '' : '';
  editor.windowManager.open({
    title: 'Anchor',
    size: 'normal',
    body: { type: 'panel', items: [{ type: 'input', name: 'id', label: 'ID', placeholder: 'example' }] },
    buttons: [
      { type: 'cancel', name: 'cancel', text: 'Cancel' },
      { type: 'submit', name: 'save', text: 'Save', primary: true },
    ],
    initialData: { id: initial },
    onSubmit: (api: any) => {
      const id = String((api.getData() as { id: string }).id || '').trim();
      if (!ID_RE.test(id)) {
        editor.windowManager.alert(editor.translate('ID should start with a letter, followed only by letters, numbers, dashes, dots, colons or underscores.'));
        return;
      }
      insertAnchor(editor, id);
      api.close();
    },
  } as any);
};

const register = (editor: Editor): void => {
  editor.options.register('allow_html_in_named_anchor', { processor: 'boolean', default: false });

  editor.on('PreInit', () => {
    editor.formatter.register('namedAnchor', { inline: 'a', selector: 'a:not([href])', remove: 'all', split: true, deep: true, attributes: { id: '%value' }, onmatch: (node: Node) => isNamedAnchor(node) } as any);
    // Empty anchors are non-editable objects inside the editor; without allow_html_in_named_anchor
    // any content inside a named anchor is moved after it (TinyMCE core behaviour).
    editor.parser.addNodeFilter('a', (nodes) => {
      nodes.forEach((node) => {
        if (!isNamedAnchor(node)) {
          return;
        }
        if (node.firstChild && !editor.options.get('allow_html_in_named_anchor')) {
          emptyAnchor(node);
        } else if (!node.firstChild) {
          node.setAttribute('contenteditable', 'false');
        }
      });
    });
    editor.serializer.addNodeFilter('a', (nodes) => {
      nodes.forEach((node) => {
        if (isNamedAnchor(node)) {
          node.removeAttribute('contenteditable');
          node.classList.remove('mce-item-anchor');
          if (!node.getAttribute('class')) {
            node.removeAttribute('class');
          }
        }
      });
    });
  });

  editor.editorCommands.addCommands({ mceAnchor: () => openDialog(editor) });
  const setup = (api: { setEnabled: (s: boolean) => void; setActive?: (s: boolean) => void }) => {
    const update = () => {
      api.setEnabled(!editor.readonly && editor.selection.isEditable());
      if (api.setActive) {
        api.setActive(!!getSelectedAnchor(editor));
      }
    };
    editor.on('NodeChange SwitchMode', update);
    update();
    return () => editor.off('NodeChange SwitchMode', update);
  };
  editor.ui.registry.addToggleButton('anchor', { icon: 'bookmark', tooltip: 'Anchor', onAction: () => editor.execCommand('mceAnchor'), onSetup: setup });
  editor.ui.registry.addMenuItem('anchor', { icon: 'bookmark', text: 'Anchor...', onAction: () => editor.execCommand('mceAnchor'), onSetup: setup as any });
  editor.on('dblclick', (e) => {
    if (isNamedAnchor(e.target as Node) && !editor.readonly) {
      e.preventDefault();
      editor.selection.select(e.target as Node);
      openDialog(editor);
    }
  });
};

PluginManager.add('anchor', register);
export default register;
