import type { Editor } from './Editor';
import * as NodeType from '../dom/NodeType';
import { raf } from '../util/Throttler';

/**
 * Fires `NodeChange` (with the current element and its parents) when the selection moves to a
 * different node, driven by rAF-throttled selectionchange rather than key events.
 */
export class NodeChange {
  private lastPath: Node[] = [];
  private readonly editor: Editor;

  constructor(editor: Editor) {
    this.editor = editor;
    const throttled = raf(() => {
      if (!editor.removed && editor.initialized && !editor.composing) {
        this.nodeChanged({ selectionChange: true });
      }
    });

    editor.on('init', () => {
      const doc = editor.getDoc();
      editor.dom.bind(doc, 'selectionchange', () => {
        if (editor.hasFocus() || editor.selection.getLastRng()) {
          editor.dispatch('SelectionChange');
          throttled.throttle();
        }
      });
    });
    editor.on('mouseup', (e) => {
      if (!e.isDefaultPrevented()) {
        this.nodeChanged();
      }
    });
    editor.on('remove', () => throttled.cancel());
  }

  nodeChanged(args: Record<string, any> = {}): void {
    const editor = this.editor;
    if (!editor.initialized || editor.removed || editor.options.get('disable_nodechange')) {
      return;
    }
    const root = editor.getBody();
    let node: Node = editor.selection.getStart(true) || root;
    if (!root.contains(node) && node !== root) {
      node = root;
    }
    if (NodeType.isText(node) && node.parentNode) {
      node = node.parentNode;
    }
    const parents: Node[] = [];
    for (let cur: Node | null = node; cur && cur !== root.parentNode; cur = cur.parentNode) {
      parents.push(cur);
      if (cur === root) {
        break;
      }
    }
    if (args.selectionChange && this.isSamePath(parents)) {
      return;
    }
    this.lastPath = parents;
    editor.dispatch('NodeChange', { ...args, element: node, parents });
  }

  private isSamePath(parents: Node[]): boolean {
    if (parents.length !== this.lastPath.length) {
      return false;
    }
    for (let i = 0; i < parents.length; i++) {
      if (parents[i] !== this.lastPath[i]) {
        return false;
      }
    }
    return true;
  }
}
