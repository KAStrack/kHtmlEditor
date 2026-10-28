import type { Editor } from '../core/Editor';
import { openMenu, MenuHandle, MenuItemLike } from './components/Menu';
import { isString } from '../util/Type';

/** Right-click (and long-press) context menu built from `ui.registry.addContextMenu` sections. */
export const setupContextMenu = (editor: Editor, themeRoot: HTMLElement): void => {
  let menu: MenuHandle | null = null;

  const getSections = (): string[] => {
    const option = editor.options.get('contextmenu') as string | false;
    if (option === false) {
      return [];
    }
    return String(option)
      .split(/[\s,]+/)
      .filter((s) => s.length);
  };

  const buildItems = (target: Element): MenuItemLike[] => {
    const registry = editor.ui.registry.getAll().contextMenus;
    const out: MenuItemLike[] = [];
    for (const section of getSections()) {
      if (section === '|') {
        out.push('|');
        continue;
      }
      const provider = registry[section.toLowerCase()];
      if (!provider) {
        continue;
      }
      let items: string | Array<string | any> = [];
      try {
        items = provider.update(target);
      } catch {
        continue;
      }
      const list = isString(items) ? items.split(/\s+/).filter((s) => s.length) : items;
      if (list.length) {
        if (out.length) {
          out.push('|');
        }
        out.push(...(list as MenuItemLike[]));
      }
    }
    return out;
  };

  const open = (clientX: number, clientY: number, target: Element) => {
    menu?.close();
    const items = buildItems(target);
    if (items.length === 0) {
      return false;
    }
    const frame = editor.iframeElement?.getBoundingClientRect();
    const rect = new DOMRect(clientX + (frame?.left ?? 0), clientY + (frame?.top ?? 0), 1, 1);
    menu = openMenu(
      { editor, themeRoot },
      {
        anchor: rect,
        items,
        placement: 'cursor',
        onClose: () => {
          menu = null;
        },
      },
    );
    return true;
  };

  editor.on('contextmenu', (e) => {
    if (getSections().length === 0) {
      return;
    }
    const neverNative = editor.options.get('contextmenu_never_use_native') as boolean;
    // Ctrl/Meta + right click falls back to the native menu unless disabled.
    if ((e.ctrlKey || e.metaKey) && !neverNative) {
      return;
    }
    const target = e.target as Element;
    if (!target || !editor.getBody().contains(target)) {
      return;
    }
    // Move the selection to the clicked node unless it is inside the current selection.
    const rng = editor.selection.getRng();
    if (rng.collapsed || !rng.intersectsNode(target)) {
      if (target.nodeName === 'IMG' || target.nodeName === 'HR' || target.nodeName === 'VIDEO' || target.nodeName === 'IFRAME') {
        editor.selection.select(target);
      } else if (typeof e.clientX === 'number') {
        editor.selection.placeCaretAt(e.clientX, e.clientY);
      }
    }
    if (open(e.clientX, e.clientY, target)) {
      e.preventDefault();
    }
  });

  // Long-press on touch devices.
  let pressTimer: number | null = null;
  editor.on('touchstart', (e) => {
    const touch = e.touches && e.touches[0];
    if (!touch) {
      return;
    }
    pressTimer = setTimeout(() => {
      pressTimer = null;
      const target = e.target as Element;
      if (target && editor.getBody().contains(target)) {
        open(touch.clientX, touch.clientY, target);
      }
    }, 600) as unknown as number;
  });
  editor.on('touchend touchmove touchcancel', () => {
    if (pressTimer !== null) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  });
  editor.on('remove', () => menu?.close());
};
