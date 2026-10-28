import type { Editor } from '../../core/Editor';
import type { ToolbarButtonAnySpec, ToolbarButtonSpec, ToolbarToggleButtonSpec, ToolbarMenuButtonSpec, ToolbarSplitButtonSpec, GroupToolbarButtonSpec, ButtonApi, ToggleButtonApi, MenuButtonApi, SplitButtonApi, ChoiceMenuItemSpec } from '../../core/UiTypes';
import { h, svgEl, empty } from './Dom';
import { getIcon } from '../Icons';
import { attachTooltip } from './Tooltip';
import { openMenu, MenuHandle, formatShortcut, MenuItemLike } from './Menu';
import { openPopup, PopupHandle } from './Popup';
import { renderSwatches, getColorCols } from './ColorSwatches';
import { isFunction, isString } from '../../util/Type';

/**
 * Toolbar button components. Each returns `{ el, destroy }` and wires the TinyMCE button API
 * (`setEnabled`, `setActive`, `setText`, `setIcon`) and `onSetup` lifecycle.
 */
export interface Component {
  el: HTMLElement;
  destroy: () => void;
  /** Re-evaluates readonly/disabled state. */
  updateMode?: () => void;
}

export interface ButtonContext {
  editor: Editor;
  themeRoot: HTMLElement;
  /** Renders a toolbar (used by group toolbar buttons). */
  renderToolbarItems?: (items: string | string[], container: HTMLElement) => Component[];
}

const translate = (editor: Editor, text: string | undefined): string => (text ? editor.translate(text) : '');

const tooltipText = (editor: Editor, spec: { tooltip?: string; text?: string; shortcut?: string }): string => {
  const base = translate(editor, spec.tooltip) || (spec.text ? '' : '');
  const shortcut = spec.shortcut ? formatShortcut(spec.shortcut) : '';
  return shortcut && base ? `${base} (${shortcut})` : base;
};

const iconSpan = (editor: Editor, icon: string): HTMLElement => svgEl(getIcon(icon, editor.ui.registry.getAll().icons));

const baseButton = (ctx: ButtonContext, spec: { icon?: string; text?: string; tooltip?: string; shortcut?: string; enabled?: boolean }, extraClass: string = ''): { btn: HTMLButtonElement; setText: (t: string) => void; setIcon: (i: string) => void } => {
  const { editor } = ctx;
  const btn = h('button', { type: 'button', class: 'khe-tbtn' + (extraClass ? ' ' + extraClass : ''), tabindex: '-1' }) as HTMLButtonElement;
  let iconEl: HTMLElement | null = null;
  let textEl: HTMLElement | null = null;
  const setIcon = (icon: string) => {
    if (iconEl) {
      iconEl.remove();
    }
    iconEl = icon ? iconSpan(editor, icon) : null;
    if (iconEl) {
      btn.insertBefore(iconEl, btn.firstChild);
    }
  };
  const setText = (text: string) => {
    if (!textEl) {
      textEl = h('span', { class: 'khe-tbtn__text' });
      if (iconEl && iconEl.nextSibling) {
        btn.insertBefore(textEl, iconEl.nextSibling);
      } else {
        btn.appendChild(textEl);
      }
    }
    textEl.textContent = translate(editor, text);
    btn.classList.toggle('khe-tbtn--has-text', !!text);
  };
  if (spec.icon) {
    setIcon(spec.icon);
  }
  if (spec.text) {
    setText(spec.text);
  }
  const tip = tooltipText(editor, spec) || translate(editor, spec.text);
  if (tip) {
    btn.setAttribute('aria-label', tip);
    attachTooltip(btn, () => tooltipText(editor, spec) || translate(editor, spec.text));
  }
  if (spec.enabled === false) {
    btn.disabled = true;
  }
  // Keep the selection inside the editor when clicking toolbar buttons.
  btn.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      e.preventDefault();
    }
  });
  return { btn, setText, setIcon };
};

const readonlyWatcher = (ctx: ButtonContext, btn: HTMLButtonElement, spec: { context?: string }, userEnabled: () => boolean): (() => void) => {
  const { editor } = ctx;
  const context = spec.context ?? 'mode:design';
  const update = () => {
    const disabledByMode = context !== 'any' && (editor.readonly || !editor.ui.isEnabled());
    btn.disabled = disabledByMode || !userEnabled();
  };
  editor.on('SwitchMode', update);
  editor.on('init', update);
  (btn as any).__updateMode = update;
  update();
  return () => editor.off('SwitchMode', update);
};

/**
 * Runs a spec's onSetup once the editor is initialised (sub APIs such as the formatter do not
 * exist while the chrome is being rendered) and returns a teardown runner.
 */
const deferSetup = <Api>(editor: Editor, onSetup: ((api: Api) => ((api: Api) => void) | void) | undefined, api: Api): { teardown: () => void } => {
  let teardown: ((api: Api) => void) | void;
  let pending = false;
  const run = () => {
    pending = false;
    if (isFunction(onSetup)) {
      teardown = onSetup(api);
    }
  };
  if (editor.initialized) {
    run();
  } else {
    pending = true;
    editor.once('init', run);
  }
  return {
    teardown: () => {
      if (pending) {
        editor.off('init', run);
      }
      if (isFunction(teardown)) {
        teardown(api);
      }
    },
  };
};

export const createButton = (ctx: ButtonContext, spec: ToolbarButtonSpec): Component => {
  const { btn, setText, setIcon } = baseButton(ctx, spec);
  let userEnabled = spec.enabled !== false;
  const api: ButtonApi = {
    isEnabled: () => userEnabled,
    setEnabled: (state) => {
      userEnabled = state;
      (btn as any).__updateMode?.();
    },
    setText,
    setIcon,
  };
  const unwatch = readonlyWatcher(ctx, btn, spec, () => userEnabled);
  btn.addEventListener('click', () => {
    if (!btn.disabled) {
      spec.onAction(api);
    }
  });
  const setup = deferSetup(ctx.editor, spec.onSetup, api);
  return {
    el: btn,
    destroy: () => {
      unwatch();
      setup.teardown();
    },
    updateMode: () => (btn as any).__updateMode?.(),
  };
};

export const createToggleButton = (ctx: ButtonContext, spec: ToolbarToggleButtonSpec): Component => {
  const { btn, setText, setIcon } = baseButton(ctx, spec);
  btn.setAttribute('aria-pressed', 'false');
  let userEnabled = spec.enabled !== false;
  let active = !!spec.active;
  const api: ToggleButtonApi = {
    isEnabled: () => userEnabled,
    setEnabled: (state) => {
      userEnabled = state;
      (btn as any).__updateMode?.();
    },
    setText,
    setIcon,
    isActive: () => active,
    setActive: (state) => {
      if (active !== state) {
        active = state;
        btn.classList.toggle('khe-tbtn--active', state);
        btn.setAttribute('aria-pressed', String(state));
      }
    },
  };
  if (active) {
    api.setActive(true);
  }
  const unwatch = readonlyWatcher(ctx, btn, spec, () => userEnabled);
  btn.addEventListener('click', () => {
    if (!btn.disabled) {
      spec.onAction(api);
    }
  });
  const setup = deferSetup(ctx.editor, spec.onSetup, api);
  return {
    el: btn,
    destroy: () => {
      unwatch();
      setup.teardown();
    },
    updateMode: () => (btn as any).__updateMode?.(),
  };
};

export const createMenuButton = (ctx: ButtonContext, spec: ToolbarMenuButtonSpec): Component => {
  const { editor } = ctx;
  const { btn, setText, setIcon } = baseButton(ctx, spec, 'khe-tbtn--menu');
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  btn.appendChild(svgEl(getIcon('chevron-down'), 'khe-icon khe-tbtn__chevron'));
  let userEnabled = spec.enabled !== false;
  let active = false;
  let menu: MenuHandle | null = null;
  const api: MenuButtonApi = {
    isEnabled: () => userEnabled,
    setEnabled: (state) => {
      userEnabled = state;
      (btn as any).__updateMode?.();
    },
    setText,
    setIcon,
    isActive: () => active,
    setActive: (state) => {
      active = state;
      btn.classList.toggle('khe-tbtn--active', state);
    },
    setTooltip: (tooltip) => {
      btn.setAttribute('aria-label', editor.translate(tooltip));
    },
  };
  const unwatch = readonlyWatcher(ctx, btn, spec, () => userEnabled);
  const open = () => {
    if (menu) {
      menu.close();
      return;
    }
    spec.fetch(
      (items) => {
        if (btn.disabled) {
          return;
        }
        menu = openMenu(
          { editor, themeRoot: ctx.themeRoot },
          {
            anchor: btn,
            items: items as MenuItemLike[] | string,
            searchable: spec.search,
            onClose: () => {
              menu = null;
              btn.classList.remove('khe-tbtn--open');
              btn.setAttribute('aria-expanded', 'false');
            },
          },
        );
        btn.classList.add('khe-tbtn--open');
        btn.setAttribute('aria-expanded', 'true');
      },
      { pattern: '' },
      api,
    );
  };
  btn.addEventListener('click', () => {
    if (!btn.disabled) {
      open();
    }
  });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && !menu) {
      e.preventDefault();
      open();
    }
  });
  const setup = deferSetup(editor, spec.onSetup, api);
  return {
    el: btn,
    destroy: () => {
      unwatch();
      menu?.close();
      setup.teardown();
    },
    updateMode: () => (btn as any).__updateMode?.(),
  };
};

export const createSplitButton = (ctx: ButtonContext, spec: ToolbarSplitButtonSpec): Component => {
  const { editor } = ctx;
  const wrap = h('div', { class: 'khe-split', role: 'group' });
  const { btn, setText, setIcon } = baseButton(ctx, spec);
  const arrow = h('button', { type: 'button', class: 'khe-tbtn khe-tbtn--chevron', tabindex: '-1', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': editor.translate(spec.tooltip ? spec.tooltip + ' ' : '') + editor.translate('menu') }) as HTMLButtonElement;
  arrow.appendChild(svgEl(getIcon('chevron-down'), 'khe-icon khe-tbtn__chevron'));
  arrow.addEventListener('mousedown', (e) => e.preventDefault());
  wrap.appendChild(btn);
  wrap.appendChild(arrow);
  let userEnabled = spec.enabled !== false;
  let active = false;
  let menu: MenuHandle | null = null;
  const colorBar = spec.presets === 'color' ? h('span', { class: 'khe-tbtn__color-bar' }) : null;
  if (colorBar) {
    btn.appendChild(colorBar);
  }
  const api: SplitButtonApi = {
    isEnabled: () => userEnabled,
    setEnabled: (state) => {
      userEnabled = state;
      (btn as any).__updateMode?.();
      arrow.disabled = btn.disabled;
    },
    setText,
    setIcon,
    isActive: () => active,
    setActive: (state) => {
      active = state;
      btn.classList.toggle('khe-tbtn--active', state);
      btn.setAttribute('aria-pressed', String(state));
    },
    setIconFill: (_id, value) => {
      if (colorBar) {
        colorBar.style.setProperty('--khe-color-value', value);
      }
    },
  };
  const unwatch = readonlyWatcher(ctx, btn, spec, () => userEnabled);
  const syncArrow = () => {
    arrow.disabled = btn.disabled;
  };
  editor.on('SwitchMode init', syncArrow);
  syncArrow();
  const openDropdown = () => {
    if (menu) {
      menu.close();
      return;
    }
    spec.fetch((items: ChoiceMenuItemSpec[]) => {
      if (arrow.disabled) {
        return;
      }
      if (spec.presets === 'color') {
        const current = items.find((i) => i.value && spec.select && spec.select(i.value))?.value ?? null;
        const cols = typeof spec.columns === 'number' ? spec.columns : getColorCols(editor, 'forecolor');
        const grid = renderSwatches(editor, items, cols, current, (value) => {
          colorPopup?.close();
          spec.onItemAction(api, value);
        });
        const colorPopup: PopupHandle = openPopup({
          anchor: wrap,
          content: grid,
          themeRoot: ctx.themeRoot,
          onClose: () => {
            menu = null;
            arrow.classList.remove('khe-tbtn--open');
            arrow.setAttribute('aria-expanded', 'false');
          },
        });
        menu = { popup: colorPopup, close: () => colorPopup.close(), focusFirst: () => (grid.querySelector('.khe-swatch') as HTMLElement | null)?.focus(), el: grid };
        arrow.classList.add('khe-tbtn--open');
        arrow.setAttribute('aria-expanded', 'true');
        setTimeout(() => menu?.focusFirst(), 0);
        return;
      }
      menu = openMenu(
        { editor, themeRoot: ctx.themeRoot },
        {
          anchor: wrap,
          items: items as MenuItemLike[],
          columns: spec.columns,
          presets: spec.presets,
          select: spec.select,
          onChoice: (value) => {
            spec.onItemAction(api, value);
          },
          onClose: () => {
            menu = null;
            arrow.classList.remove('khe-tbtn--open');
            arrow.setAttribute('aria-expanded', 'false');
          },
        },
      );
      arrow.classList.add('khe-tbtn--open');
      arrow.setAttribute('aria-expanded', 'true');
    }, api);
  };
  btn.addEventListener('click', () => {
    if (!btn.disabled) {
      spec.onAction(api);
    }
  });
  arrow.addEventListener('click', () => {
    if (!arrow.disabled) {
      openDropdown();
    }
  });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      openDropdown();
    }
  });
  const setup = deferSetup(editor, spec.onSetup, api);
  return {
    el: wrap,
    destroy: () => {
      unwatch();
      editor.off('SwitchMode init', syncArrow);
      menu?.close();
      setup.teardown();
    },
    updateMode: () => {
      (btn as any).__updateMode?.();
      syncArrow();
    },
  };
};

export const createGroupToolbarButton = (ctx: ButtonContext, spec: GroupToolbarButtonSpec): Component => {
  const { btn, setText, setIcon } = baseButton(ctx, spec, 'khe-tbtn--menu');
  btn.setAttribute('aria-haspopup', 'true');
  let userEnabled = spec.enabled !== false;
  let popupComponents: Component[] = [];
  let popup: PopupHandle | null = null;
  const api: ButtonApi = {
    isEnabled: () => userEnabled,
    setEnabled: (state) => {
      userEnabled = state;
      (btn as any).__updateMode?.();
    },
    setText,
    setIcon,
  };
  const unwatch = readonlyWatcher(ctx, btn, spec, () => userEnabled);
  btn.addEventListener('click', () => {
    if (btn.disabled || !ctx.renderToolbarItems) {
      return;
    }
    if (popup) {
      popup.close();
      return;
    }
    const container = h('div', { class: 'khe-toolbar khe-context-toolbar', role: 'toolbar' });
    popupComponents = ctx.renderToolbarItems(spec.items, container);
    popup = openPopup({
      anchor: btn,
      content: container,
      themeRoot: ctx.themeRoot,
      onClose: () => {
        popupComponents.forEach((c) => c.destroy());
        popupComponents = [];
        popup = null;
      },
    });
  });
  const setup = deferSetup(ctx.editor, spec.onSetup, api);
  return {
    el: btn,
    destroy: () => {
      unwatch();
      popup?.close();
      setup.teardown();
    },
    updateMode: () => (btn as any).__updateMode?.(),
  };
};

export const createToolbarButtonComponent = (ctx: ButtonContext, name: string, spec: ToolbarButtonAnySpec): Component | null => {
  switch (spec.type) {
    case 'togglebutton':
      return createToggleButton(ctx, spec as ToolbarToggleButtonSpec);
    case 'menubutton':
      return createMenuButton(ctx, spec as ToolbarMenuButtonSpec);
    case 'splitbutton':
      return createSplitButton(ctx, spec as ToolbarSplitButtonSpec);
    case 'grouptoolbarbutton':
      return createGroupToolbarButton(ctx, spec as GroupToolbarButtonSpec);
    case 'button':
    default:
      if (!isFunction((spec as ToolbarButtonSpec).onAction)) {
        console.warn(`kHtmlEditor: toolbar button "${name}" has no onAction handler.`);
      }
      return createButton(ctx, spec as ToolbarButtonSpec);
  }
};

export const isStringValue = isString;
export const clearChildren = empty;
