import type { Editor } from '../../core/Editor';
import type { MenuItemAnySpec, MenuItemSpec, NestedMenuItemSpec, ToggleMenuItemSpec, ChoiceMenuItemSpec, SeparatorMenuItemSpec, FancyMenuItemSpec, MenuItemApi, ToggleMenuItemApi } from '../../core/UiTypes';
import { h, svgEl, empty } from './Dom';
import { openPopup, PopupHandle, Placement } from './Popup';
import { getIcon } from '../Icons';
import { Env } from '../../util/Env';
import { isString, isArray, isFunction } from '../../util/Type';

/**
 * Menu rendering shared by menu buttons, split buttons, the menubar and context menus.
 */
export type MenuItemLike = MenuItemAnySpec | string;

export interface MenuContext {
  editor: Editor;
  themeRoot: HTMLElement;
}

export interface MenuOptions {
  anchor: HTMLElement | DOMRect | (() => DOMRect | null);
  iframe?: HTMLIFrameElement | null;
  items: MenuItemLike[] | string;
  parent?: PopupHandle | null;
  placement?: Placement;
  columns?: number | 'auto';
  presets?: 'normal' | 'color' | 'listpreview' | 'toolbar';
  /** Called for choice items. */
  onChoice?: (value: string, item: ChoiceMenuItemSpec) => void;
  /** Determines active state of choice items. */
  select?: (value: string) => boolean;
  onClose?: () => void;
  /** Focus the first item when opened (keyboard navigation). */
  autofocus?: boolean;
  searchable?: boolean | { placeholder?: string };
  className?: string;
  ariaLabel?: string;
}

export interface MenuHandle {
  popup: PopupHandle;
  close: () => void;
  focusFirst: () => void;
  el: HTMLElement;
}

export type FancyRenderer = (ctx: MenuContext, spec: FancyMenuItemSpec, close: () => void) => HTMLElement;
const fancyRenderers: Record<string, FancyRenderer> = {};
export const registerFancyMenuItem = (type: string, renderer: FancyRenderer): void => {
  fancyRenderers[type] = renderer;
};

const warned = new Set<string>();
const warnOnce = (msg: string) => {
  if (!warned.has(msg)) {
    warned.add(msg);
    console.warn('kHtmlEditor: ' + msg);
  }
};

/** Resolves a TinyMCE items string/array into item specs using the editor's registry. */
export const resolveItems = (editor: Editor, items: MenuItemLike[] | string | undefined): MenuItemAnySpec[] => {
  if (!items) {
    return [];
  }
  const list: MenuItemLike[] = isString(items) ? items.split(/\s+/).filter((s) => s.length) : items;
  const registry = editor.ui.registry.getAll().menuItems;
  const out: MenuItemAnySpec[] = [];
  for (const item of list) {
    if (isString(item)) {
      if (item === '|') {
        out.push({ type: 'separator' });
        continue;
      }
      const spec = registry[item.toLowerCase()];
      if (spec) {
        out.push(spec);
      } else {
        warnOnce(`menu item "${item}" is not registered and was skipped.`);
      }
    } else {
      out.push(item);
    }
  }
  // Drop leading/trailing/duplicate separators.
  const cleaned: MenuItemAnySpec[] = [];
  for (const item of out) {
    const isSep = (item as SeparatorMenuItemSpec).type === 'separator' && !(item as SeparatorMenuItemSpec).text;
    if (isSep && (cleaned.length === 0 || (cleaned[cleaned.length - 1] as SeparatorMenuItemSpec).type === 'separator')) {
      continue;
    }
    cleaned.push(item);
  }
  while (cleaned.length && (cleaned[cleaned.length - 1] as SeparatorMenuItemSpec).type === 'separator' && !(cleaned[cleaned.length - 1] as SeparatorMenuItemSpec).text) {
    cleaned.pop();
  }
  return cleaned;
};

export const formatShortcut = (shortcut: string | undefined): string => {
  if (!shortcut) {
    return '';
  }
  const mac = Env.mac;
  return shortcut
    .split(/[\s,]+/)[0]
    .split('+')
    .map((part) => {
      const p = part.trim().toLowerCase();
      if (p === 'meta') {
        return mac ? '⌘' : 'Ctrl';
      }
      if (p === 'ctrl') {
        return mac ? '⌃' : 'Ctrl';
      }
      if (p === 'alt') {
        return mac ? '⌥' : 'Alt';
      }
      if (p === 'shift') {
        return mac ? '⇧' : 'Shift';
      }
      if (p === 'access') {
        return mac ? '⌃⌥' : 'Shift+Alt';
      }
      return p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(mac ? '' : '+');
};

const iconNode = (editor: Editor, name: string | undefined): HTMLElement => {
  const wrap = h('span', { class: 'khe-menu__icon' });
  if (name) {
    wrap.appendChild(svgEl(getIcon(name, editor.ui.registry.getAll().icons)));
  }
  return wrap;
};

export const openMenu = (ctx: MenuContext, options: MenuOptions): MenuHandle => {
  const { editor } = ctx;
  const items = resolveItems(editor, options.items);
  const teardowns: Array<() => void> = [];
  let activeSubmenu: PopupHandle | null = null;
  const presets = options.presets ?? 'normal';

  const menu = h('div', { class: 'khe-menu' + (options.className ? ' ' + options.className : ''), role: 'menu' });
  if (options.ariaLabel) {
    menu.setAttribute('aria-label', options.ariaLabel);
  }
  const columns = options.columns;
  if (columns && columns !== 1) {
    menu.classList.add('khe-menu--columns');
    menu.style.gridTemplateColumns = columns === 'auto' ? `repeat(auto-fill, minmax(36px, 1fr))` : `repeat(${columns}, auto)`;
    if (columns === 'auto') {
      menu.style.minWidth = '200px';
    }
  }

  const popup = openPopup({
    anchor: options.anchor,
    iframe: options.iframe,
    content: menu,
    placement: options.placement ?? 'below',
    parent: options.parent ?? null,
    themeRoot: ctx.themeRoot,
    role: 'presentation',
    onClose: () => {
      teardowns.forEach((t) => t());
      options.onClose?.();
    },
  });

  const closeRoot = () => {
    let p: PopupHandle = popup;
    while (p.parent) {
      p = p.parent;
    }
    p.close();
  };

  const closeSubmenu = () => {
    if (activeSubmenu) {
      activeSubmenu.close();
      activeSubmenu = null;
    }
  };

  const buttons: HTMLElement[] = [];

  const makeApi = (btn: HTMLButtonElement, toggle: boolean): ToggleMenuItemApi => ({
    isEnabled: () => !btn.disabled,
    setEnabled: (state) => {
      btn.disabled = !state;
      btn.classList.toggle('khe-menu__item--disabled', !state);
      btn.setAttribute('aria-disabled', String(!state));
    },
    isActive: () => btn.getAttribute('aria-checked') === 'true',
    setActive: (state) => {
      if (toggle) {
        btn.setAttribute('aria-checked', String(state));
      }
      btn.classList.toggle('khe-menu__item--active', state);
    },
  });

  const renderItem = (item: MenuItemAnySpec): HTMLElement | null => {
    const type = (item as any).type as string | undefined;
    if (type === 'separator') {
      const sep = item as SeparatorMenuItemSpec;
      if (sep.text) {
        return h('div', { class: 'khe-menu__title', role: 'presentation' }, editor.translate(sep.text));
      }
      return h('div', { class: 'khe-menu__separator', role: 'separator' });
    }
    if (type === 'fancymenuitem') {
      const fancy = item as FancyMenuItemSpec;
      const renderer = fancyRenderers[fancy.fancytype];
      if (!renderer) {
        warnOnce(`fancy menu item type "${fancy.fancytype}" is not supported.`);
        return null;
      }
      return renderer(ctx, fancy, closeRoot);
    }

    const spec = item as MenuItemSpec | NestedMenuItemSpec | ToggleMenuItemSpec | ChoiceMenuItemSpec;
    const isToggle = type === 'togglemenuitem' || type === 'choiceitem';
    const isNested = type === 'nestedmenuitem';
    const btn = h('button', { type: 'button', class: 'khe-menu__item', role: isToggle ? 'menuitemcheckbox' : 'menuitem', tabindex: '-1' }) as HTMLButtonElement;
    if (presets === 'listpreview' || (columns && columns !== 1 && !spec.text)) {
      btn.classList.add('khe-menu__item--icon-only');
      btn.title = editor.translate(spec.text ?? '');
    }
    const api = makeApi(btn, isToggle);

    if (isToggle) {
      const check = h('span', { class: 'khe-menu__check' });
      check.appendChild(svgEl(getIcon('checkmark')));
      btn.appendChild(check);
      if (spec.icon) {
        btn.appendChild(iconNode(editor, spec.icon));
      }
    } else {
      btn.appendChild(iconNode(editor, spec.icon));
    }
    if (spec.text && !(presets === 'listpreview')) {
      const label = h('span', { class: 'khe-menu__label' }, editor.translate(spec.text));
      const meta = (spec as any).meta as Record<string, any> | undefined;
      if (meta && meta.style) {
        const preview = h('span', { class: 'khe-menu__preview', style: String(meta.style) }, editor.translate(spec.text));
        empty(label);
        label.appendChild(preview);
      }
      btn.appendChild(label);
    }
    if ((spec as MenuItemSpec).shortcut) {
      btn.appendChild(h('span', { class: 'khe-menu__shortcut' }, formatShortcut((spec as MenuItemSpec).shortcut)));
    }
    if (isNested) {
      btn.setAttribute('aria-haspopup', 'true');
      btn.appendChild(svgEl(getIcon('chevron-right'), 'khe-icon khe-menu__caret'));
    }
    if (spec.enabled === false) {
      api.setEnabled(false);
    }
    if (type === 'choiceitem') {
      const value = (spec as ChoiceMenuItemSpec).value ?? '';
      const active = options.select ? options.select(value) : !!(spec as ChoiceMenuItemSpec).active;
      api.setActive(active);
    } else if (isToggle && (spec as ToggleMenuItemSpec).active) {
      api.setActive(true);
    }
    if (isFunction((spec as MenuItemSpec).onSetup)) {
      const teardown = ((spec as MenuItemSpec).onSetup as (api: MenuItemApi) => (api: MenuItemApi) => void)(api);
      if (isFunction(teardown)) {
        teardowns.push(() => teardown(api));
      }
    }

    const activate = () => {
      if (btn.disabled) {
        return;
      }
      if (isNested) {
        openSubmenu(btn, spec as NestedMenuItemSpec);
        return;
      }
      closeRoot();
      if (type === 'choiceitem') {
        options.onChoice?.((spec as ChoiceMenuItemSpec).value ?? '', spec as ChoiceMenuItemSpec);
      } else if (isFunction((spec as MenuItemSpec).onAction)) {
        ((spec as MenuItemSpec).onAction as (api: MenuItemApi) => void)(api);
      }
    };

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      activate();
    });
    btn.addEventListener('mousedown', (e) => {
      // Keep the editor selection; focus stays in the menu only via keyboard.
      e.preventDefault();
    });
    btn.addEventListener('mouseenter', () => {
      focusItem(btn);
      if (isNested) {
        openSubmenu(btn, spec as NestedMenuItemSpec);
      } else {
        closeSubmenu();
      }
    });
    buttons.push(btn);
    return btn;
  };

  const openSubmenu = (btn: HTMLElement, spec: NestedMenuItemSpec) => {
    if (activeSubmenu && (activeSubmenu as any).__anchor === btn) {
      return;
    }
    closeSubmenu();
    const subItems = spec.getSubmenuItems();
    const sub = openMenu(ctx, {
      anchor: btn,
      items: subItems as MenuItemLike[] | string,
      parent: popup,
      placement: 'right',
      autofocus: false,
      onClose: () => {
        if (activeSubmenu && (activeSubmenu as any).__anchor === btn) {
          activeSubmenu = null;
        }
      },
    });
    (sub.popup as any).__anchor = btn;
    activeSubmenu = sub.popup;
    btn.setAttribute('aria-expanded', 'true');
    const prevClose = sub.popup.close;
    sub.popup.close = (reason) => {
      btn.removeAttribute('aria-expanded');
      prevClose(reason);
    };
    (sub as any).__btn = btn;
  };

  const focusItem = (btn: HTMLElement) => {
    buttons.forEach((b) => {
      b.classList.toggle('khe-menu__item--focused', b === btn);
      b.tabIndex = b === btn ? 0 : -1;
    });
    btn.focus({ preventScroll: true });
  };

  const focusByOffset = (delta: number) => {
    const enabled = buttons.filter((b) => !(b as HTMLButtonElement).disabled);
    if (enabled.length === 0) {
      return;
    }
    const current = enabled.findIndex((b) => b.classList.contains('khe-menu__item--focused'));
    let next = current + delta;
    if (next < 0) {
      next = enabled.length - 1;
    }
    if (next >= enabled.length) {
      next = 0;
    }
    focusItem(enabled[next]);
  };

  let searchInput: HTMLInputElement | null = null;
  if (options.searchable) {
    searchInput = h('input', { type: 'search', class: 'khe-input khe-menu__search', placeholder: editor.translate(typeof options.searchable === 'object' && options.searchable.placeholder ? options.searchable.placeholder : 'Search'), 'aria-label': editor.translate('Search') }) as HTMLInputElement;
    searchInput.addEventListener('input', () => {
      const q = searchInput!.value.toLowerCase();
      buttons.forEach((b) => {
        const text = (b.textContent || '').toLowerCase();
        b.style.display = !q || text.includes(q) ? '' : 'none';
      });
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusByOffset(1);
      }
    });
    menu.appendChild(searchInput);
  }

  for (const item of items) {
    const el = renderItem(item);
    if (el) {
      menu.appendChild(el);
    }
  }

  menu.addEventListener('keydown', (e) => {
    const key = e.key;
    if (key === 'ArrowDown') {
      e.preventDefault();
      focusByOffset(1);
    } else if (key === 'ArrowUp') {
      e.preventDefault();
      focusByOffset(-1);
    } else if (key === 'Home') {
      e.preventDefault();
      const enabled = buttons.filter((b) => !(b as HTMLButtonElement).disabled);
      if (enabled[0]) {
        focusItem(enabled[0]);
      }
    } else if (key === 'End') {
      e.preventDefault();
      const enabled = buttons.filter((b) => !(b as HTMLButtonElement).disabled);
      if (enabled.length) {
        focusItem(enabled[enabled.length - 1]);
      }
    } else if (key === 'ArrowRight') {
      const focused = buttons.find((b) => b.classList.contains('khe-menu__item--focused'));
      if (focused && focused.getAttribute('aria-haspopup') === 'true') {
        e.preventDefault();
        focused.click();
        setTimeout(() => {
          const subBtn = activeSubmenu?.el.querySelector<HTMLElement>('.khe-menu__item:not([disabled])');
          subBtn?.focus();
          subBtn?.classList.add('khe-menu__item--focused');
        }, 0);
      }
    } else if (key === 'ArrowLeft') {
      if (popup.parent) {
        e.preventDefault();
        const anchorBtn = (popup as any).__anchor as HTMLElement | undefined;
        popup.close();
        anchorBtn?.focus();
      }
    } else if (key === 'Enter' || key === ' ') {
      const focused = buttons.find((b) => b.classList.contains('khe-menu__item--focused'));
      if (focused) {
        e.preventDefault();
        focused.click();
      }
    } else if (key === 'Tab') {
      closeRoot();
    } else if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !searchInput) {
      // Type-ahead.
      const letter = key.toLowerCase();
      const enabled = buttons.filter((b) => !(b as HTMLButtonElement).disabled);
      const current = enabled.findIndex((b) => b.classList.contains('khe-menu__item--focused'));
      for (let i = 1; i <= enabled.length; i++) {
        const candidate = enabled[(current + i) % enabled.length];
        if ((candidate.textContent || '').trim().toLowerCase().startsWith(letter)) {
          focusItem(candidate);
          break;
        }
      }
    }
  });

  const focusFirst = () => {
    if (searchInput) {
      searchInput.focus();
      return;
    }
    const first = buttons.find((b) => !(b as HTMLButtonElement).disabled);
    if (first) {
      focusItem(first);
    }
  };
  if (options.autofocus !== false) {
    setTimeout(focusFirst, 0);
  }

  return { popup, close: () => popup.close(), focusFirst, el: menu };
};

export const isMenuItemArray = (v: unknown): v is MenuItemLike[] => isArray(v);
