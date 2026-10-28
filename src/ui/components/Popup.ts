import { h, isDescendant } from './Dom';

/**
 * Fixed-position popup layer for menus, dropdowns and context toolbars. Handles placement
 * relative to an anchor (page or iframe coordinates), flipping, viewport clamping, outside-click
 * and Escape closing, and a parent/child stack so submenus do not close their parents.
 */
export type Placement = 'below' | 'above' | 'right' | 'left' | 'cursor' | 'node-above' | 'node-below';

export interface PopupOptions {
  /** Anchor element (page or iframe) or a viewport rect. */
  anchor: HTMLElement | DOMRect | (() => DOMRect | null);
  /** When the anchor lives inside an iframe, pass it so coordinates are translated. */
  iframe?: HTMLIFrameElement | null;
  content: HTMLElement;
  placement?: Placement;
  className?: string;
  parent?: PopupHandle | null;
  onClose?: (reason: 'outside' | 'escape' | 'programmatic' | 'scroll') => void;
  closeOnScroll?: boolean;
  /** Root element whose theme variables the popup inherits (the editor container). */
  themeRoot?: HTMLElement | null;
  /** Keep the popup within this element's rect (defaults to the viewport). */
  clipTo?: () => DOMRect | null;
  role?: string;
  ariaLabel?: string;
}

export interface PopupHandle {
  el: HTMLElement;
  close: (reason?: 'outside' | 'escape' | 'programmatic' | 'scroll') => void;
  reposition: () => void;
  isOpen: () => boolean;
  parent: PopupHandle | null;
  children: PopupHandle[];
}

const openPopups: PopupHandle[] = [];
let listenersBound = false;

const anchorRect = (opts: PopupOptions): DOMRect | null => {
  let rect: DOMRect | null;
  if (typeof opts.anchor === 'function') {
    rect = opts.anchor();
  } else if (opts.anchor instanceof DOMRect) {
    rect = opts.anchor;
  } else {
    rect = opts.anchor.getBoundingClientRect();
  }
  if (!rect) {
    return null;
  }
  if (opts.iframe) {
    const frameRect = opts.iframe.getBoundingClientRect();
    rect = new DOMRect(rect.left + frameRect.left, rect.top + frameRect.top, rect.width, rect.height);
  }
  return rect;
};

const bindGlobalListeners = () => {
  if (listenersBound) {
    return;
  }
  listenersBound = true;
  document.addEventListener(
    'mousedown',
    (e) => {
      const target = e.target as Node;
      // Close every popup that does not contain the target and is not an ancestor of one that does.
      for (const popup of openPopups.slice()) {
        if (!popupChainContains(popup, target)) {
          popup.close('outside');
        }
      }
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && openPopups.length) {
        const top = openPopups[openPopups.length - 1];
        e.stopPropagation();
        top.close('escape');
      }
    },
    true,
  );
  window.addEventListener('resize', () => openPopups.forEach((p) => p.reposition()));
  window.addEventListener('scroll', () => openPopups.forEach((p) => p.reposition()), true);
};

const popupChainContains = (popup: PopupHandle, target: Node): boolean => {
  if (isDescendant(popup.el, target)) {
    return true;
  }
  return popup.children.some((c) => popupChainContains(c, target));
};

export const openPopup = (opts: PopupOptions): PopupHandle => {
  bindGlobalListeners();
  const placement = opts.placement ?? 'below';
  const el = h('div', { class: 'khe-aux khe-popup' + (opts.className ? ' ' + opts.className : ''), role: opts.role ?? 'presentation', tabindex: '-1' });
  if (opts.ariaLabel) {
    el.setAttribute('aria-label', opts.ariaLabel);
  }
  if (opts.themeRoot) {
    // Inherit skin variables by copying the skin classes.
    opts.themeRoot.classList.forEach((c) => {
      if (c.startsWith('khe-skin-')) {
        el.classList.add(c);
      }
    });
    const style = getComputedStyle(opts.themeRoot);
    for (const v of ['--khe-bg', '--khe-bg-subtle', '--khe-fg', '--khe-fg-muted', '--khe-border', '--khe-border-strong', '--khe-accent', '--khe-accent-fg', '--khe-accent-soft', '--khe-hover', '--khe-active', '--khe-focus', '--khe-shadow', '--khe-radius', '--khe-font', '--khe-font-size', '--khe-danger', '--khe-success', '--khe-warning', '--khe-info']) {
      const val = style.getPropertyValue(v);
      if (val) {
        el.style.setProperty(v, val);
      }
    }
  }
  el.appendChild(opts.content);
  document.body.appendChild(el);

  let open = true;
  const handle: PopupHandle = {
    el,
    parent: opts.parent ?? null,
    children: [],
    isOpen: () => open,
    close: (reason = 'programmatic') => {
      if (!open) {
        return;
      }
      open = false;
      handle.children.slice().forEach((c) => c.close(reason));
      const idx = openPopups.indexOf(handle);
      if (idx !== -1) {
        openPopups.splice(idx, 1);
      }
      if (handle.parent) {
        const pidx = handle.parent.children.indexOf(handle);
        if (pidx !== -1) {
          handle.parent.children.splice(pidx, 1);
        }
      }
      el.remove();
      opts.onClose?.(reason);
    },
    reposition: () => {
      if (!open) {
        return;
      }
      const rect = anchorRect(opts);
      if (!rect) {
        return;
      }
      position(el, rect, placement, opts.clipTo ? opts.clipTo() : null);
    },
  };
  if (handle.parent) {
    handle.parent.children.push(handle);
  }
  openPopups.push(handle);
  handle.reposition();
  return handle;
};

const position = (el: HTMLElement, rect: DOMRect, placement: Placement, clip: DOMRect | null): void => {
  const margin = 4;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clipLeft = clip ? Math.max(0, clip.left) : 0;
  const clipTop = clip ? Math.max(0, clip.top) : 0;
  const clipRight = clip ? Math.min(vw, clip.right) : vw;
  const clipBottom = clip ? Math.min(vh, clip.bottom) : vh;
  // Reset to measure natural size.
  el.style.left = '0px';
  el.style.top = '0px';
  el.style.maxHeight = '';
  const w = el.offsetWidth;
  const hgt = el.offsetHeight;
  let left: number;
  let top: number;
  switch (placement) {
    case 'right':
      left = rect.right + 2;
      top = rect.top - 4;
      if (left + w > clipRight) {
        left = rect.left - w - 2;
      }
      break;
    case 'left':
      left = rect.left - w - 2;
      top = rect.top - 4;
      if (left < clipLeft) {
        left = rect.right + 2;
      }
      break;
    case 'above':
    case 'node-above':
      left = placement === 'node-above' ? rect.left + rect.width / 2 - w / 2 : rect.left;
      top = rect.top - hgt - margin;
      if (top < clipTop) {
        top = rect.bottom + margin;
      }
      break;
    case 'cursor':
      left = rect.left;
      top = rect.bottom + 2;
      break;
    case 'node-below':
      left = rect.left + rect.width / 2 - w / 2;
      top = rect.bottom + margin;
      if (top + hgt > clipBottom) {
        top = rect.top - hgt - margin;
      }
      break;
    case 'below':
    default:
      left = rect.left;
      top = rect.bottom + margin;
      if (top + hgt > clipBottom && rect.top - hgt - margin >= clipTop) {
        top = rect.top - hgt - margin;
      }
      break;
  }
  // Clamp horizontally.
  if (left + w > clipRight - margin) {
    left = Math.max(clipLeft + margin, clipRight - w - margin);
  }
  if (left < clipLeft + margin) {
    left = clipLeft + margin;
  }
  // Clamp vertically with scrolling fallback.
  if (top + hgt > vh - margin) {
    const spaceBelow = vh - top - margin;
    if (spaceBelow < 120 && rect.top > hgt + margin) {
      top = rect.top - hgt - margin;
    } else if (spaceBelow < hgt) {
      el.style.maxHeight = Math.max(100, spaceBelow) + 'px';
    }
  }
  if (top < margin) {
    top = margin;
  }
  el.style.left = Math.round(left) + 'px';
  el.style.top = Math.round(top) + 'px';
};

export const closeAllPopups = (reason: 'outside' | 'escape' | 'programmatic' | 'scroll' = 'programmatic'): void => {
  openPopups.slice().forEach((p) => p.close(reason));
};

export const hasOpenPopups = (): boolean => openPopups.length > 0;
export const getOpenPopups = (): PopupHandle[] => openPopups.slice();
