import type { Editor } from '../core/Editor';
import * as NodeType from '../dom/NodeType';
import * as CaretUtils from '../dom/CaretUtils';

/**
 * Keeps the body structured: inline content directly in the body is wrapped in the forced root
 * block and an empty body gets a padded block.
 */
export const ensureRootBlock = (editor: Editor): boolean => {
  const body = editor.getBody();
  const dom = editor.dom;
  let hasContent = false;
  for (let c = body.firstChild; c; c = c.nextSibling) {
    // Browsers (Firefox) pad an emptied body with a bare <br>; that is not content.
    if (NodeType.isElement(c) && !NodeType.isBr(c)) {
      hasContent = true;
      break;
    }
    if (NodeType.isText(c) && NodeType.removeZwsp(c.data).length > 0) {
      hasContent = true;
      break;
    }
  }
  if (!hasContent) {
    body.innerHTML = '';
    const block = dom.create(editor.options.get('forced_root_block'), editor.options.get('forced_root_block_attrs'));
    CaretUtils.padBlock(editor, block);
    body.appendChild(block);
    if (editor.hasFocus()) {
      CaretUtils.moveCaretToStart(editor, block);
    }
    return true;
  }
  return false;
};

export const forceBlocks = (editor: Editor): boolean => {
  const body = editor.getBody();
  const dom = editor.dom;
  const blockName = editor.options.get('forced_root_block') as string;
  const attrs = editor.options.get('forced_root_block_attrs') as Record<string, string>;
  let changed = false;
  let needsWrap = false;
  for (let c = body.firstChild; c; c = c.nextSibling) {
    if ((NodeType.isText(c) && NodeType.removeZwsp(c.data).length > 0) || (NodeType.isElement(c) && !dom.isBlock(c) && !NodeType.isBookmarkNode(c) && !NodeType.isBogusAll(c))) {
      needsWrap = true;
      break;
    }
  }
  if (!needsWrap) {
    return false;
  }
  const hadFocus = editor.hasFocus();
  const bookmark = hadFocus ? editor.selection.getBookmark(1) : null;
  let wrapper: HTMLElement | null = null;
  let node = body.firstChild;
  while (node) {
    const next = node.nextSibling;
    const isInline = NodeType.isText(node) || (NodeType.isElement(node) && !dom.isBlock(node) && !NodeType.isBogusAll(node));
    if (isInline) {
      if (NodeType.isText(node) && node.data.length === 0) {
        body.removeChild(node);
      } else {
        if (!wrapper) {
          wrapper = dom.create(blockName, attrs);
          body.insertBefore(wrapper, node);
        }
        wrapper.appendChild(node);
        changed = true;
      }
    } else {
      wrapper = null;
    }
    node = next;
  }
  if (bookmark) {
    editor.selection.moveToBookmark(bookmark);
  }
  return changed;
};
