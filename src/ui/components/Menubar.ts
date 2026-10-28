import type { Editor } from '../../core/Editor';
import { h } from './Dom';
import { openMenu, MenuHandle, resolveItems } from './Menu';
import { isString, isPlainObject } from '../../util/Type';

/**
 * Menubar built from the `menubar` and `menu` options with TinyMCE's default menus.
 */
export interface MenuDef {
  title: string;
  items: string;
}

export const DEFAULT_MENUS: Record<string, MenuDef> = {
  file: { title: 'File', items: 'newdocument restoredraft | preview | importword exportpdf exportword | print | deleteallconversations' },
  edit: { title: 'Edit', items: 'undo redo | cut copy paste pastetext | selectall | searchreplace' },
  view: { title: 'View', items: 'code revisionhistory | visualaid visualchars visualblocks | spellchecker | preview fullscreen | showcomments' },
  insert: { title: 'Insert', items: 'image link media addcomment pageembed codesample inserttable | math | charmap emoticons hr | pagebreak nonbreaking anchor tableofcontents footnotes | mergetags | insertdatetime' },
  format: { title: 'Format', items: 'bold italic underline strikethrough superscript subscript codeformat | styles blocks fontfamily fontsize align lineheight | forecolor backcolor | language | removeformat' },
  tools: { title: 'Tools', items: 'spellchecker spellcheckerlanguage | a11ycheck code wordcount' },
  table: { title: 'Table', items: 'inserttable | cell row column | advtablesort | tableprops deletetable' },
  help: { title: 'Help', items: 'help' },
};

export const DEFAULT_MENUBAR = 'file edit view insert format tools table help';

export interface MenubarHandle {
  el: HTMLElement;
  destroy: () => void;
  focusFirst: () => void;
}

export const createMenubar = (editor: Editor, themeRoot: HTMLElement): MenubarHandle | null => {
  const menubarOption = editor.options.get('menubar') as string | boolean | undefined;
  if (menubarOption === false) {
    return null;
  }
  const names = (isString(menubarOption) ? menubarOption : DEFAULT_MENUBAR).split(/\s+/).filter((s) => s.length);
  const menuOption = (editor.options.get('menu') as Record<string, MenuDef> | undefined) ?? {};
  const removed = ((editor.options.get('removed_menuitems') as string | undefined) ?? '').split(/[\s,]+/).filter((s) => s.length);
  const menus: Record<string, MenuDef> = { ...DEFAULT_MENUS };
  for (const k of Object.keys(menuOption)) {
    const m = menuOption[k];
    if (isPlainObject(m)) {
      menus[k] = { title: m.title ?? menus[k]?.title ?? k, items: isString(m.items) ? m.items : (m.items as unknown as string[] | undefined)?.join(' ') ?? '' };
    }
  }

  const el = h('div', { class: 'khe-menubar', role: 'menubar', 'aria-label': editor.translate('Editor menu bar') });
  const buttons: HTMLButtonElement[] = [];
  let openMenuHandle: MenuHandle | null = null;
  let openButton: HTMLButtonElement | null = null;

  const closeOpen = () => {
    openMenuHandle?.close();
  };

  const openFor = (btn: HTMLButtonElement, def: MenuDef, focus: boolean) => {
    if (openButton === btn && openMenuHandle) {
      closeOpen();
      return;
    }
    closeOpen();
    const items = def.items
      .split(/\s+/)
      .filter((n) => n.length && !removed.includes(n));
    const resolved = resolveItems(editor, items);
    if (resolved.length === 0) {
      return;
    }
    openMenuHandle = openMenu(
      { editor, themeRoot },
      {
        anchor: btn,
        items: resolved,
        autofocus: focus,
        ariaLabel: editor.translate(def.title),
        onClose: () => {
          btn.classList.remove('khe-mbtn--active');
          btn.setAttribute('aria-expanded', 'false');
          if (openButton === btn) {
            openMenuHandle = null;
            openButton = null;
          }
        },
      },
    );
    openButton = btn;
    btn.classList.add('khe-mbtn--active');
    btn.setAttribute('aria-expanded', 'true');
  };

  for (const name of names) {
    const def = menus[name];
    if (!def) {
      continue;
    }
    // Skip menus with no registered items.
    const hasAny = def.items.split(/\s+/).some((n) => n !== '|' && !!editor.ui.registry.getAll().menuItems[n.toLowerCase()]);
    if (!hasAny) {
      continue;
    }
    const btn = h('button', { type: 'button', class: 'khe-mbtn', role: 'menuitem', 'aria-haspopup': 'true', 'aria-expanded': 'false', tabindex: buttons.length === 0 ? '0' : '-1' }, editor.translate(def.title)) as HTMLButtonElement;
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => openFor(btn, def, false));
    btn.addEventListener('mouseenter', () => {
      if (openMenuHandle && openButton !== btn) {
        openFor(btn, def, false);
      }
    });
    btn.addEventListener('keydown', (e) => {
      const idx = buttons.indexOf(btn);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = buttons[(idx + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
        next.focus();
        if (openMenuHandle) {
          const nextName = names.filter((n) => menus[n])[buttons.indexOf(next)];
          openFor(next, menus[nextName] ?? def, true);
        }
      } else if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openFor(btn, def, true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeOpen();
        editor.focus();
      }
    });
    buttons.push(btn);
    el.appendChild(btn);
  }
  if (buttons.length === 0) {
    return null;
  }
  // Roving tabindex.
  el.addEventListener('focusin', (e) => {
    buttons.forEach((b) => (b.tabIndex = b === e.target ? 0 : -1));
  });

  return {
    el,
    destroy: closeOpen,
    focusFirst: () => buttons[0]?.focus(),
  };
};
