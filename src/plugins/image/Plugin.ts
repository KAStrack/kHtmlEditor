import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';
import { openDialog } from './ImageDialog';
import * as ImageData from './ImageData';
import { isObject } from '../../util/Type';

/**
 * Image plugin: insert/edit dialog with upload and advanced tabs, figure captions, image lists,
 * `mceImage`/`mceUpdateImage` commands, toolbar button, menu item and context menu entry.
 */
const registerOptions = (editor: Editor) => {
  const r = editor.options.register;
  r('image_dimensions', { processor: 'boolean', default: true });
  r('image_advtab', { processor: 'boolean', default: false });
  r('image_uploadtab', { processor: 'boolean', default: true });
  r('image_prepend_url', { processor: 'string', default: '' });
  r('image_class_list', { processor: 'object[]' });
  r('image_description', { processor: 'boolean', default: true });
  r('image_title', { processor: 'boolean', default: false });
  r('image_caption', { processor: 'boolean', default: false });
  r('image_list', { processor: (v: unknown) => (v === false || typeof v === 'string' || Array.isArray(v) || typeof v === 'function' ? { valid: true, value: v } : { valid: false, message: 'Must be false, a string, an array or a function.' }), default: false });
};

const isImageTarget = (editor: Editor, node: Node | null): boolean => {
  if (!node) {
    return false;
  }
  if (ImageData.isImage(node)) {
    return true;
  }
  return ImageData.isFigure(node) && (node as HTMLElement).classList.contains('image') && !!(node as HTMLElement).querySelector('img');
};

const getImageFromNode = (editor: Editor, node: Node | null): HTMLImageElement | null => {
  if (ImageData.isImage(node)) {
    return node;
  }
  if (ImageData.isFigure(node)) {
    return (node as HTMLElement).querySelector('img');
  }
  const parentFigure = editor.dom.getParent(node, 'figure.image') as HTMLElement | null;
  return parentFigure ? parentFigure.querySelector('img') : null;
};

const setupFigureEditing = (editor: Editor) => {
  // In the editor the figure is non-editable while its caption stays editable; the attributes are
  // stripped on output.
  editor.on('PreInit', () => {
    editor.parser.addNodeFilter('figure', (nodes) => {
      nodes.forEach((figure) => {
        if (!figure.classList.contains('image')) {
          return;
        }
        figure.setAttribute('contenteditable', 'false');
        const caption = figure.querySelector('figcaption');
        if (caption) {
          caption.setAttribute('contenteditable', 'true');
        }
      });
    });
    editor.serializer.addNodeFilter('figure', (nodes) => {
      nodes.forEach((figure) => {
        if (!figure.classList.contains('image')) {
          return;
        }
        figure.removeAttribute('contenteditable');
        const caption = figure.querySelector('figcaption');
        if (caption) {
          caption.removeAttribute('contenteditable');
        }
      });
    });
  });
  // A caption emptied by the user is removed with its figure wrapper when the image is deleted.
  editor.on('ObjectResized', (e) => {
    if (ImageData.isImage(e.target)) {
      editor.dispatch('ImageResized', { target: e.target, width: e.width, height: e.height });
    }
  });
};

const register = (editor: Editor): Record<string, any> => {
  registerOptions(editor);
  setupFigureEditing(editor);

  editor.editorCommands.addCommands({
    mceImage: () => openDialog(editor),
    mceUpdateImage: (_cmd, _ui, value) => {
      if (!isObject(value)) {
        return;
      }
      const node = editor.selection.getNode();
      const image = getImageFromNode(editor, node);
      const data = { ...ImageData.defaultData(), ...(image ? ImageData.read(editor, image) : {}), ...value } as ImageData.ImageData;
      editor.undoManager.transact(() => {
        if (image) {
          ImageData.write(editor, image, data);
          ImageData.toggleCaption(editor, image, data.caption);
        } else {
          const img = editor.dom.create('img') as HTMLImageElement;
          ImageData.write(editor, img, data);
          editor.insertContent(data.caption ? ImageData.createFigure(editor, img).outerHTML : img.outerHTML);
        }
      });
      editor.nodeChanged();
    },
  });

  const setup = (api: { setEnabled: (s: boolean) => void; setActive?: (s: boolean) => void }) => {
    const update = () => {
      api.setEnabled(!editor.readonly && editor.selection.isEditable());
      if (api.setActive) {
        api.setActive(isImageTarget(editor, editor.selection.getNode()));
      }
    };
    editor.on('NodeChange SwitchMode', update);
    update();
    return () => editor.off('NodeChange SwitchMode', update);
  };
  editor.ui.registry.addToggleButton('image', { icon: 'image', tooltip: 'Insert/edit image', onAction: () => editor.execCommand('mceImage'), onSetup: setup });
  editor.ui.registry.addMenuItem('image', { icon: 'image', text: 'Image...', onAction: () => editor.execCommand('mceImage'), onSetup: setup as any });
  editor.ui.registry.addContextMenu('image', {
    update: (node) => (isImageTarget(editor, node) || !!editor.dom.getParent(node, 'figure.image') ? 'image' : ''),
  });

  editor.on('dblclick', (e) => {
    const image = getImageFromNode(editor, e.target as Node);
    if (image && !editor.readonly) {
      e.preventDefault();
      editor.selection.select(image);
      openDialog(editor, image);
    }
  });

  return {
    openDialog: (image?: HTMLImageElement) => openDialog(editor, image),
    getImageData: (image: HTMLImageElement) => ImageData.read(editor, image),
  };
};

PluginManager.add('image', register);
export default register;
