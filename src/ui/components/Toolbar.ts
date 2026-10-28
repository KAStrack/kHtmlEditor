import type { Editor } from '../../core/Editor';
import { h, svgEl } from './Dom';
import { createToolbarButtonComponent, Component, ButtonContext } from './Buttons';
import { getIcon } from '../Icons';
import { attachTooltip } from './Tooltip';
import { isString, isArray } from '../../util/Type';

/**
 * Toolbar: parses TinyMCE toolbar definitions, renders groups of buttons and handles the
 * overflow modes (wrap, sliding, floating, scrolling) plus keyboard navigation.
 */
export type ToolbarMode = 'wrap' | 'sliding' | 'floating' | 'scrolling';

export interface ToolbarGroupDef {
  name?: string;
  items: string[];
}

export const DEFAULT_TOOLBAR = 'undo redo | blocks | bold italic | alignleft aligncenter alignright alignjustify | outdent indent';

const warned = new Set<string>();

/** Parses the toolbar/toolbar1..9 options into rows of groups. */
export const parseToolbars = (editor: Editor): ToolbarGroupDef[][] => {
  const options = editor.options;
  const toolbar = options.get('toolbar') as string | string[] | Array<{ name?: string; items: string[] }> | boolean | undefined;
  const rows: ToolbarGroupDef[][] = [];
  const parseString = (str: string): ToolbarGroupDef[] =>
    str
      .split('|')
      .map((g) => ({ items: g.trim().split(/\s+/).filter((s) => s.length > 0) }))
      .filter((g) => g.items.length > 0);

  if (toolbar === false) {
    return [];
  }
  const numbered: string[] = [];
  for (let i = 1; i <= 9; i++) {
    const t = options.get('toolbar' + i) as string | undefined;
    if (isString(t) && t.trim()) {
      numbered.push(t);
    }
  }
  if (numbered.length) {
    numbered.forEach((t) => rows.push(parseString(t)));
    return rows;
  }
  if (toolbar === undefined || toolbar === true) {
    return [parseString(DEFAULT_TOOLBAR)];
  }
  if (isString(toolbar)) {
    return toolbar.trim() ? [parseString(toolbar)] : [];
  }
  if (isArray(toolbar)) {
    if (toolbar.every(isString)) {
      (toolbar as string[]).forEach((t) => rows.push(parseString(t)));
    } else {
      rows.push((toolbar as Array<{ name?: string; items: string[] }>).map((g) => ({ name: g.name, items: isArray(g.items) ? g.items : String(g.items).split(/\s+/) })));
    }
  }
  return rows;
};

export interface ToolbarHandle {
  el: HTMLElement;
  destroy: () => void;
  refresh: () => void;
}

export const renderToolbarItems = (ctx: ButtonContext, items: string[] | string, container: HTMLElement): Component[] => {
  const { editor } = ctx;
  const registry = editor.ui.registry.getAll().buttons;
  const list = isString(items) ? items.split(/\s+/).filter((s) => s.length) : items;
  const components: Component[] = [];
  for (const name of list) {
    if (name === '|') {
      continue;
    }
    const spec = registry[name.toLowerCase()];
    if (!spec) {
      if (!warned.has(name)) {
        warned.add(name);
        console.warn(`kHtmlEditor: toolbar button "${name}" is not registered and was skipped.`);
      }
      continue;
    }
    const comp = createToolbarButtonComponent(ctx, name, spec);
    if (comp) {
      comp.el.setAttribute('data-khe-name', name.toLowerCase());
      container.appendChild(comp.el);
      components.push(comp);
    }
  }
  return components;
};

export const createToolbar = (ctx: ButtonContext, groups: ToolbarGroupDef[], mode: ToolbarMode, overlord: HTMLElement): ToolbarHandle => {
  const { editor } = ctx;
  const el = h('div', { class: 'khe-toolbar khe-toolbar--' + mode, role: 'toolbar', 'aria-label': editor.translate('Editor toolbar') });
  const overflow = h('div', { class: 'khe-toolbar__overflow' + (mode === 'floating' ? ' khe-toolbar__overflow--floating' : ''), role: 'toolbar', hidden: true });
  const components: Component[] = [];
  const groupEls: HTMLElement[] = [];
  let moreBtn: HTMLButtonElement | null = null;
  let overflowOpen = false;

  for (const group of groups) {
    const g = h('div', { class: 'khe-tgroup', role: 'group' });
    if (group.name) {
      g.setAttribute('aria-label', editor.translate(group.name));
    }
    const comps = renderToolbarItems(ctx, group.items, g);
    if (comps.length) {
      components.push(...comps);
      groupEls.push(g);
      el.appendChild(g);
    }
  }

  const usesOverflow = mode === 'sliding' || mode === 'floating';
  if (usesOverflow) {
    moreBtn = h('button', { type: 'button', class: 'khe-tbtn khe-tbtn--more', tabindex: '-1', 'aria-label': editor.translate('Reveal or hide additional toolbar items'), 'aria-expanded': 'false' }) as HTMLButtonElement;
    moreBtn.appendChild(svgEl(getIcon('more-drawer')));
    moreBtn.style.marginLeft = 'auto';
    moreBtn.hidden = true;
    moreBtn.addEventListener('mousedown', (e) => e.preventDefault());
    moreBtn.addEventListener('click', () => setOverflowOpen(!overflowOpen));
    attachTooltip(moreBtn, () => editor.translate('More...'));
    el.appendChild(moreBtn);
    overlord.appendChild(el);
    overlord.appendChild(overflow);
  } else {
    overlord.appendChild(el);
  }

  const setOverflowOpen = (open: boolean) => {
    overflowOpen = open;
    overflow.hidden = !open || overflow.childElementCount === 0;
    moreBtn?.setAttribute('aria-expanded', String(open));
    moreBtn?.classList.toggle('khe-tbtn--active', open);
    editor.dispatch('ToolbarOverflowToggle', { open });
  };

  const layout = () => {
    if (!usesOverflow || !moreBtn) {
      return;
    }
    // Move everything back to measure.
    groupEls.forEach((g) => el.insertBefore(g, moreBtn));
    const available = el.clientWidth;
    if (available === 0) {
      return;
    }
    const moreWidth = 34;
    let used = 0;
    let overflowFrom = groupEls.length;
    const widths = groupEls.map((g) => g.offsetWidth + 7);
    const total = widths.reduce((a, b) => a + b, 0);
    if (total > available) {
      for (let i = 0; i < groupEls.length; i++) {
        if (used + widths[i] > available - moreWidth) {
          overflowFrom = i;
          break;
        }
        used += widths[i];
      }
    }
    for (let i = overflowFrom; i < groupEls.length; i++) {
      overflow.appendChild(groupEls[i]);
    }
    const hasOverflow = overflowFrom < groupEls.length;
    moreBtn.hidden = !hasOverflow;
    if (!hasOverflow) {
      setOverflowOpen(false);
    } else {
      overflow.hidden = !overflowOpen;
    }
  };

  let ro: ResizeObserver | null = null;
  if (usesOverflow && typeof ResizeObserver !== 'undefined') {
    let frame: number | null = null;
    ro = new ResizeObserver(() => {
      if (frame === null) {
        frame = requestAnimationFrame(() => {
          frame = null;
          layout();
        });
      }
    });
    ro.observe(el);
  }

  // Close the floating overflow when clicking in the content.
  if (mode === 'floating') {
    editor.on('mousedown', () => setOverflowOpen(false));
  }

  // Keyboard: roving tabindex across all buttons; Alt+F10 handled by the theme.
  const allButtons = () => Array.from(overlord.querySelectorAll<HTMLElement>('.khe-tbtn:not([hidden]), .khe-tbtn--more:not([hidden])')).filter((b) => b.offsetParent !== null && !(b as HTMLButtonElement).disabled);
  overlord.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('khe-tbtn')) {
      return;
    }
    const buttons = allButtons();
    const idx = buttons.indexOf(target);
    if (idx === -1) {
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = buttons[(idx + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
      next.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      buttons[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      buttons[buttons.length - 1].focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      editor.focus();
    }
  });

  return {
    el,
    refresh: layout,
    destroy: () => {
      ro?.disconnect();
      components.forEach((c) => c.destroy());
    },
  };
};

export const focusFirstToolbarButton = (overlord: HTMLElement): boolean => {
  const first = Array.from(overlord.querySelectorAll<HTMLButtonElement>('.khe-tbtn')).find((b) => !b.disabled && b.offsetParent !== null);
  if (first) {
    first.focus();
    return true;
  }
  return false;
};
