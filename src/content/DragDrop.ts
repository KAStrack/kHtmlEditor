import type { Editor } from '../core/Editor';
import type { PasteApi } from './Paste';
import * as PasteUtils from './PasteUtils';
import { getFiles } from './PasteUtils';
import * as NodeType from '../dom/NodeType';

/**
 * Drag and drop: files become cached blobs (uploaded later), content dragged in from outside goes
 * through the paste filters, and a selected object dragged within the editor is moved rather
 * than duplicated. `paste_block_drop` blocks all drops.
 */
export const setupDragDrop = (editor: Editor, paste: PasteApi): void => {
  let draggedNode: HTMLElement | null = null;
  let internalDrag = false;

  const isBlocked = () => !!editor.options.get('paste_block_drop');

  editor.on('dragstart', (e) => {
    internalDrag = true;
    const target = e.target as Node | null;
    const obj = editor.selection.getSelectedObject() as HTMLElement | null;
    if (obj && target && (obj === target || obj.contains(target))) {
      draggedNode = obj;
    } else if (target && NodeType.isElement(target) && /^(IMG|VIDEO|AUDIO|HR|TABLE)$/.test(target.nodeName)) {
      draggedNode = target as HTMLElement;
    } else {
      draggedNode = null;
    }
  });
  editor.on('dragend', () => {
    internalDrag = false;
    draggedNode = null;
  });

  editor.on('dragover dragenter', (e) => {
    if (isBlocked() || editor.readonly) {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'none';
      }
      return;
    }
    const dt: DataTransfer | null = e.dataTransfer ?? null;
    const hasFiles = !!dt && Array.from(dt.types || []).includes('Files');
    if (hasFiles || draggedNode || !internalDrag) {
      e.preventDefault();
      if (dt) {
        dt.dropEffect = draggedNode ? 'move' : 'copy';
      }
    }
  });

  editor.on('drop', (e) => {
    if (e.isDefaultPrevented()) {
      return;
    }
    if (isBlocked() || editor.readonly) {
      e.preventDefault();
      return;
    }
    const dt: DataTransfer | null = e.dataTransfer ?? null;
    if (!dt) {
      return;
    }
    const files = getFiles(dt).filter((f) => /^(image|video|audio)\//.test(f.type));
    const placeCaret = () => {
      editor.focus();
      editor.selection.placeCaretAt(e.clientX, e.clientY);
    };

    if (draggedNode && draggedNode.isConnected) {
      e.preventDefault();
      const node = draggedNode;
      draggedNode = null;
      placeCaret();
      const rng = editor.selection.getRng();
      if (node.contains(rng.startContainer)) {
        return;
      }
      editor.undoManager.transact(() => {
        node.removeAttribute('data-mce-selected');
        const parentBlock = editor.dom.getParent(node, (n) => NodeType.isElement(n) && editor.dom.isBlock(n), editor.getBody()) as HTMLElement | null;
        editor.dom.remove(node);
        if (parentBlock && parentBlock.isConnected && !parentBlock.firstChild) {
          editor.dom.remove(parentBlock);
        }
        const target = editor.selection.getRng();
        target.insertNode(node);
        editor.selection.select(node);
        node.setAttribute('data-mce-selected', '1');
      });
      editor.nodeChanged();
      return;
    }

    if (files.length) {
      e.preventDefault();
      placeCaret();
      void paste.pasteFiles(files);
      return;
    }

    if (internalDrag) {
      // Native text move inside the editor: record an undo level afterwards.
      setTimeout(() => {
        editor.undoManager.add();
        editor.nodeChanged();
      }, 0);
      return;
    }

    let html = '';
    let text = '';
    try {
      html = dt.getData('text/html');
      text = dt.getData('text/plain') || dt.getData('text/uri-list');
    } catch {
      /* ignore */
    }
    if (!html && !text) {
      return;
    }
    e.preventDefault();
    placeCaret();
    if (html && !paste.isPlainTextMode()) {
      paste.pasteHtml(html, PasteUtils.isMarkedInternal(html));
    } else if (text) {
      paste.pasteText(text);
    } else {
      paste.pasteText(PasteUtils.innerText(html));
    }
  });
};
