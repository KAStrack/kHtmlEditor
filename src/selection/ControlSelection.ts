import type { Editor } from '../core/Editor';
import * as Options from '../core/EditorOptions';
import * as NodeType from '../dom/NodeType';

/**
 * Resize handles for images, tables, figures and media (`object_resizing`). Four corner handles
 * are drawn inside the content body (bogus, never serialised); dragging shows a ghost and applies
 * the new size on release, firing ObjectResizeStart/ObjectResized like TinyMCE.
 */
export const setupControlSelection = (editor: Editor): void => {
  const dom = editor.dom;
  const corners: Array<[string, number, number, number, number]> = [
    // name, x factor, y factor, width delta sign, height delta sign
    ['nw', 0, 0, -1, -1],
    ['ne', 1, 0, 1, -1],
    ['sw', 0, 1, -1, 1],
    ['se', 1, 1, 1, 1],
  ];
  let selected: HTMLElement | null = null;
  let handles: HTMLElement[] = [];
  let ghost: HTMLElement | null = null;
  let resizing = false;
  let start = { x: 0, y: 0, w: 0, h: 0, ratio: 1 };
  let current = { w: 0, h: 0 };
  let activeCorner: (typeof corners)[number] | null = null;

  const isImage = (el: Element) => el.nodeName === 'IMG';

  const getResizeTarget = (el: HTMLElement): HTMLElement => (el.nodeName === 'FIGURE' ? (el.querySelector('img') as HTMLElement | null) ?? el : el);

  const isResizable = (el: Element | null): el is HTMLElement => {
    if (!el || !NodeType.isElement(el) || el === editor.getBody() || !el.isConnected) {
      return false;
    }
    const selector = Options.getObjectResizing(editor);
    if (!selector || editor.readonly) {
      return false;
    }
    if (el.getAttribute('data-mce-resize') === 'false' || el.hasAttribute('data-mce-bogus')) {
      return false;
    }
    if (el.classList.contains('mce-preview-object')) {
      return true;
    }
    return dom.is(el, selector);
  };

  const removeHandles = () => {
    handles.forEach((h) => h.remove());
    handles = [];
    if (ghost) {
      ghost.remove();
      ghost = null;
    }
    selected = null;
  };

  const positionHandles = () => {
    if (!selected || !selected.isConnected) {
      removeHandles();
      return;
    }
    const body = editor.getBody();
    const pos = dom.getPos(selected, body);
    const w = selected.offsetWidth;
    const h = selected.offsetHeight;
    handles.forEach((handle, i) => {
      const [, fx, fy] = corners[i];
      handle.style.left = Math.round(pos.x + fx * w - 5) + 'px';
      handle.style.top = Math.round(pos.y + fy * h - 5) + 'px';
    });
  };

  const showHandles = (el: HTMLElement) => {
    if (selected === el && handles.length) {
      positionHandles();
      return;
    }
    removeHandles();
    selected = el;
    const body = editor.getBody();
    const cursors: Record<string, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' };
    corners.forEach((corner) => {
      const handle = dom.create('div', { class: 'mce-resizehandle', 'data-mce-bogus': 'all', 'data-mce-resize-handle': corner[0], contenteditable: 'false', unselectable: 'on', style: 'cursor:' + cursors[corner[0]] });
      handle.addEventListener('mousedown', (e) => startResize(e, corner));
      handle.addEventListener('touchstart', (e) => startResize(e, corner), { passive: false });
      body.appendChild(handle);
      handles.push(handle);
    });
    positionHandles();
  };

  const pointer = (e: MouseEvent | TouchEvent) => {
    if ((e as TouchEvent).touches && (e as TouchEvent).touches.length) {
      const t = (e as TouchEvent).touches[0];
      return { x: t.clientX, y: t.clientY };
    }
    return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
  };

  const startResize = (e: MouseEvent | TouchEvent, corner: (typeof corners)[number]) => {
    if (!selected || resizing) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const target = getResizeTarget(selected);
    const evt = editor.dispatch('ObjectResizeStart', { target, width: target.offsetWidth, height: target.offsetHeight, origin: 'corner-' + corner[0] });
    if (evt.isDefaultPrevented()) {
      return;
    }
    resizing = true;
    activeCorner = corner;
    const p = pointer(e);
    start = { x: p.x, y: p.y, w: target.offsetWidth, h: target.offsetHeight, ratio: target.offsetHeight ? target.offsetWidth / target.offsetHeight : 1 };
    current = { w: start.w, h: start.h };
    const pos = dom.getPos(selected, editor.getBody());
    ghost = selected.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('data-mce-selected');
    ghost.removeAttribute('id');
    ghost.setAttribute('data-mce-bogus', 'all');
    ghost.classList.add('mce-clonedresizable');
    ghost.style.position = 'absolute';
    ghost.style.left = pos.x + 'px';
    ghost.style.top = pos.y + 'px';
    ghost.style.margin = '0';
    ghost.style.pointerEvents = 'none';
    ghost.style.opacity = '0.5';
    ghost.style.zIndex = '1297';
    ghost.style.width = start.w + 'px';
    ghost.style.height = start.h + 'px';
    editor.getBody().appendChild(ghost);
    const doc = editor.getDoc();
    doc.addEventListener('mousemove', onMove);
    doc.addEventListener('mouseup', endResize);
    doc.addEventListener('touchmove', onMove, { passive: false });
    doc.addEventListener('touchend', endResize);
    document.addEventListener('mouseup', endResize);
  };

  const onMove = (e: MouseEvent | TouchEvent) => {
    if (!resizing || !activeCorner || !selected) {
      return;
    }
    e.preventDefault();
    const p = pointer(e);
    const dx = (p.x - start.x) * activeCorner[3];
    const dy = (p.y - start.y) * activeCorner[4];
    let w = Math.max(5, start.w + dx);
    let h = Math.max(5, start.h + dy);
    const target = getResizeTarget(selected);
    const proportional = isImage(target) ? Options.isResizeImgProportional(editor) && !(e as MouseEvent).shiftKey : !!(e as MouseEvent).shiftKey;
    if (proportional && start.ratio) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        h = Math.round(w / start.ratio);
      } else {
        w = Math.round(h * start.ratio);
      }
    }
    current = { w: Math.round(w), h: Math.round(h) };
    if (ghost) {
      ghost.style.width = current.w + 'px';
      ghost.style.height = current.h + 'px';
    }
  };

  const endResize = () => {
    if (!resizing) {
      return;
    }
    const doc = editor.getDoc();
    doc.removeEventListener('mousemove', onMove);
    doc.removeEventListener('mouseup', endResize);
    doc.removeEventListener('touchmove', onMove);
    doc.removeEventListener('touchend', endResize);
    document.removeEventListener('mouseup', endResize);
    resizing = false;
    if (ghost) {
      ghost.remove();
      ghost = null;
    }
    const el = selected;
    const corner = activeCorner;
    activeCorner = null;
    if (!el || !corner) {
      return;
    }
    const target = getResizeTarget(el);
    if (current.w !== start.w || current.h !== start.h) {
      editor.undoManager.transact(() => {
        if (isImage(target)) {
          target.setAttribute('width', String(current.w));
          target.setAttribute('height', String(current.h));
          dom.setStyle(target, 'width', '');
          dom.setStyle(target, 'height', '');
        } else {
          dom.setStyle(target, 'width', current.w + 'px');
          dom.setStyle(target, 'height', current.h + 'px');
        }
        if (target.getAttribute('style') === '') {
          target.removeAttribute('style');
          target.removeAttribute('data-mce-style');
        }
      });
      editor.dispatch('ObjectResized', { target, width: current.w, height: current.h, origin: 'corner-' + corner[0] });
      editor.nodeChanged();
    }
    positionHandles();
  };

  const update = () => {
    if (editor.removed || resizing) {
      return;
    }
    const obj = editor.selection.getSelectedObject();
    if (isResizable(obj)) {
      showHandles(obj);
    } else {
      removeHandles();
    }
  };

  editor.on('NodeChange ResizeEditor ResizeContent', update);
  editor.on('ObjectSelected', update);
  editor.on('keydown blur', () => {
    if (!resizing) {
      removeHandles();
    }
  });
  editor.on('input', () => {
    if (!resizing && selected && !selected.isConnected) {
      removeHandles();
    }
  });
  editor.on('ScrollContent', positionHandles);
  editor.on('init', () => {
    editor.getWin().addEventListener('scroll', positionHandles, { passive: true });
    editor.getWin().addEventListener('resize', positionHandles, { passive: true });
  });
  editor.on('SwitchMode', () => {
    if (editor.readonly) {
      removeHandles();
    }
  });
  editor.on('remove', removeHandles);
};
