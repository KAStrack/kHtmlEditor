import type { Editor } from '../core/Editor';
import * as NodeType from '../dom/NodeType';
import * as CaretUtils from '../dom/CaretUtils';

/**
 * Object ("fake") selection for images, media, horizontal rules, tables and non-editable blocks:
 * clicking selects the element (data-mce-selected), Backspace/Delete removes it, Enter after a
 * selected block inserts a paragraph, and arrows let the caret pass non-editable blocks.
 */
const isSelectable = (node: Node | null): node is HTMLElement => {
  if (!NodeType.isElement(node)) {
    return false;
  }
  const el: HTMLElement = node;
  return /^(IMG|HR|VIDEO|AUDIO|OBJECT|EMBED|IFRAME|FIGURE)$/.test(el.nodeName) || el.getAttribute('contenteditable') === 'false' || el.classList.contains('mce-preview-object');
};

export const setupObjectSelection = (editor: Editor): void => {
  const dom = editor.dom;

  const clearSelected = () => {
    editor.getBody().querySelectorAll('[data-mce-selected]:not([data-mce-selected="inline-boundary"])').forEach((el) => {
      if (!NodeType.isTableCell(el)) {
        el.removeAttribute('data-mce-selected');
      }
    });
  };

  const selectObject = (el: HTMLElement) => {
    clearSelected();
    el.setAttribute('data-mce-selected', '1');
    editor.selection.select(el);
    editor.nodeChanged();
  };

  const getSelectedObject = (): HTMLElement | null => editor.selection.getSelectedObject() as HTMLElement | null;

  editor.on('mousedown', (e) => {
    let target = e.target as Node | null;
    if (!target || !editor.getBody().contains(target)) {
      return;
    }
    const cef = dom.getParent(target, (n) => NodeType.isContentEditableFalse(n), editor.getBody()) as HTMLElement | null;
    if (cef) {
      target = cef;
    }
    if (isSelectable(target)) {
      e.preventDefault();
      editor.focus();
      selectObject(target as HTMLElement);
    }
  });

  editor.on('NodeChange SelectionChange', () => {
    const selected = getSelectedObject();
    const marked = editor.getBody().querySelector('[data-mce-selected="1"]');
    if (selected !== marked) {
      clearSelected();
      if (selected) {
        selected.setAttribute('data-mce-selected', '1');
      }
    }
  });

  editor.on('keydown', (e) => {
    if (e.isDefaultPrevented()) {
      return;
    }
    const selected = getSelectedObject();
    if (selected) {
      if (e.keyCode === 8 || e.keyCode === 46) {
        e.preventDefault();
        editor.undoManager.transact(() => {
          const parent = selected.parentNode as HTMLElement;
          const block = CaretUtils.getTextBlock(editor, selected) ?? null;
          const isBlockLevel = dom.isBlock(selected) || parent === editor.getBody();
          dom.remove(selected);
          if (isBlockLevel) {
            const target = CaretUtils.findPreviousBlock(editor, parent === editor.getBody() ? (editor.getBody().firstChild as HTMLElement) ?? parent : parent) ?? (editor.getBody().querySelector('p,h1,h2,h3,h4,h5,h6,div,li,td,th') as HTMLElement | null);
            if (!editor.getBody().firstChild) {
              editor.setContent('');
              editor.selection.setCursorLocation();
            } else if (target) {
              CaretUtils.moveCaretToEnd(editor, target);
            }
          } else if (block) {
            if (!block.firstChild) {
              CaretUtils.padBlock(editor, block);
            }
            // Caret where the object was.
            const rng = dom.createRng();
            rng.setStart(parent, Math.min(parent.childNodes.length, Array.prototype.indexOf.call(parent.childNodes, selected) === -1 ? parent.childNodes.length : 0));
            rng.collapse(true);
            editor.selection.setRng(rng);
          }
        });
        editor.nodeChanged();
      } else if (e.keyCode === 13 && (dom.isBlock(selected) || selected.parentNode === editor.getBody())) {
        e.preventDefault();
        editor.undoManager.transact(() => {
          const p = dom.create(editor.options.get('forced_root_block') as string);
          CaretUtils.padBlock(editor, p);
          dom.insertAfter(p, selected);
          CaretUtils.moveCaretToStart(editor, p);
        });
      } else if ((e.keyCode === 37 || e.keyCode === 38) && (dom.isBlock(selected) || selected.parentNode === editor.getBody())) {
        // Move caret before the object.
        const prev = CaretUtils.findPreviousBlock(editor, selected);
        e.preventDefault();
        if (prev) {
          CaretUtils.moveCaretToEnd(editor, prev);
        } else {
          insertCaretBlock(editor, selected, true);
        }
      } else if ((e.keyCode === 39 || e.keyCode === 40) && (dom.isBlock(selected) || selected.parentNode === editor.getBody())) {
        const next = CaretUtils.findNextBlock(editor, selected);
        e.preventDefault();
        if (next) {
          CaretUtils.moveCaretToStart(editor, next);
        } else {
          insertCaretBlock(editor, selected, false);
        }
      }
      return;
    }
    // Arrow into a non-editable block from an adjacent paragraph selects it.
    if (e.keyCode === 40 || e.keyCode === 38 || e.keyCode === 37 || e.keyCode === 39) {
      const rng = editor.selection.getRng();
      if (!rng.collapsed) {
        return;
      }
      const block = CaretUtils.getTextBlock(editor, rng.startContainer);
      if (!block) {
        return;
      }
      const forward = e.keyCode === 40 || e.keyCode === 39;
      const atEdge = forward ? CaretUtils.isAtEndOfBlock(editor, rng, block) : CaretUtils.isAtStartOfBlock(editor, rng, block);
      if (!atEdge) {
        return;
      }
      const sibling = forward ? block.nextSibling : block.previousSibling;
      if (sibling && NodeType.isElement(sibling) && isSelectable(sibling) && (NodeType.isContentEditableFalse(sibling) || NodeType.isHr(sibling) || NodeType.isFigure(sibling) || dom.isBlock(sibling))) {
        e.preventDefault();
        selectObject(sibling);
        // Remove the temporary caret block if it is empty and bogus.
        if (block.getAttribute('data-mce-caret') && block.textContent?.replace(/﻿/g, '').trim() === '') {
          dom.remove(block);
        }
      }
    }
  });

  // Typing into a temporary caret block makes it a real paragraph.
  editor.on('input', () => {
    editor.getBody().querySelectorAll('[data-mce-caret]').forEach((el) => {
      if (el.textContent?.replace(/﻿/g, '').length) {
        el.removeAttribute('data-mce-caret');
        el.removeAttribute('data-mce-bogus');
      }
    });
  });
  editor.on('NodeChange', () => {
    editor.getBody().querySelectorAll('[data-mce-caret]').forEach((el) => {
      if (!el.contains(editor.selection.getRng().startContainer) && el.textContent?.replace(/﻿/g, '').trim() === '') {
        el.remove();
      }
    });
  });
};

const insertCaretBlock = (editor: Editor, ref: HTMLElement, before: boolean): void => {
  const p = editor.dom.create(editor.options.get('forced_root_block') as string, { 'data-mce-caret': before ? 'before' : 'after', 'data-mce-bogus': 'all' });
  CaretUtils.padBlock(editor, p);
  if (before) {
    ref.parentNode?.insertBefore(p, ref);
  } else {
    editor.dom.insertAfter(p, ref);
  }
  CaretUtils.moveCaretToStart(editor, p);
};
