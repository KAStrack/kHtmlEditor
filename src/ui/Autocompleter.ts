import type { Editor } from '../core/Editor';
import type { AutocompleterSpec } from '../core/UiTypes';
import { h } from './components/Dom';
import { openPopup, PopupHandle } from './components/Popup';
import * as NodeType from '../dom/NodeType';

/**
 * Autocompleter (`ui.registry.addAutocompleter`): typing a trigger character followed by text
 * opens a popup of matches (list or grid) that can be navigated with the keyboard; choosing an
 * item calls `onAction` with the range covering the trigger and pattern.
 */
interface ActiveState {
  name: string;
  spec: AutocompleterSpec;
  trigger: string;
  node: Text;
  start: number;
}

export const setupAutocompleter = (editor: Editor, themeRoot: HTMLElement): { destroy: () => void } => {
  let popup: PopupHandle | null = null;
  let active: ActiveState | null = null;
  let items: HTMLElement[] = [];
  let selected = -1;
  let requestId = 0;

  const specs = () => editor.ui.registry.getAll().autocompleters ?? {};

  const close = () => {
    if (popup) {
      popup.close();
    }
    popup = null;
    active = null;
    items = [];
    selected = -1;
  };

  const getTriggerRange = (): Range | null => {
    if (!active) {
      return null;
    }
    const rng = editor.selection.getRng();
    if (!rng.collapsed || rng.startContainer !== active.node) {
      return null;
    }
    const r = editor.dom.createRng();
    r.setStart(active.node, active.start);
    r.setEnd(active.node, rng.startOffset);
    return r;
  };

  const currentPattern = (): string | null => {
    const rng = getTriggerRange();
    if (!rng || !active) {
      return null;
    }
    const text = active.node.data.slice(active.start, rng.endOffset);
    return text.startsWith(active.trigger) ? text.slice(active.trigger.length) : null;
  };

  const api = {
    hide: () => close(),
    reload: (fetchOptions: Record<string, any>) => {
      void load(fetchOptions);
    },
  };

  const select = (index: number) => {
    if (!items.length) {
      return;
    }
    selected = (index + items.length) % items.length;
    items.forEach((el, i) => {
      el.classList.toggle('khe-autocompleter__item--selected', i === selected);
      el.setAttribute('aria-selected', String(i === selected));
    });
    items[selected].scrollIntoView({ block: 'nearest' });
  };

  const choose = (index: number) => {
    const el = items[index];
    if (!el || !active) {
      return;
    }
    const rng = getTriggerRange();
    const value = el.getAttribute('data-value') ?? '';
    const meta = (el as any).__meta;
    const spec = active.spec;
    if (rng) {
      editor.focus();
      spec.onAction(api, rng, value, meta);
    }
    close();
  };

  const render = (results: Array<{ value: string; text?: string; icon?: string; meta?: any }>, columns: number | 'auto') => {
    const grid = columns !== 1;
    const list = h('div', { class: 'khe-autocompleter' + (grid ? ' khe-autocompleter--grid' : ''), role: 'listbox', 'aria-label': editor.translate('Suggestions') });
    if (typeof columns === 'number' && columns > 1) {
      list.style.gridTemplateColumns = `repeat(${columns}, auto)`;
    }
    items = results.map((r, i) => {
      const el = h('div', { class: 'khe-autocompleter__item', role: 'option', 'data-value': r.value, title: r.text ?? r.value, 'aria-selected': 'false' });
      (el as any).__meta = r.meta;
      if (r.icon) {
        el.appendChild(h('span', { class: 'khe-autocompleter__icon' }, r.icon));
      }
      if (!grid && r.text) {
        el.appendChild(h('span', { class: 'khe-autocompleter__text' }, r.text));
      }
      el.addEventListener('mousedown', (e) => e.preventDefault());
      el.addEventListener('click', () => choose(i));
      list.appendChild(el);
      return el;
    });
    return list;
  };

  const load = (fetchOptions: Record<string, any> = {}) => {
    if (!active) {
      return Promise.resolve();
    }
    const pattern = currentPattern();
    if (pattern === null) {
      close();
      return Promise.resolve();
    }
    const spec = active.spec;
    const id = ++requestId;
    return spec.fetch(pattern, spec.maxResults ?? 10, fetchOptions).then((results) => {
      if (id !== requestId || !active) {
        return;
      }
      if (!results || results.length === 0) {
        if (popup) {
          popup.close();
          popup = null;
        }
        return;
      }
      const content = render(results.slice(0, spec.maxResults ?? 10), spec.columns ?? 1);
      if (popup) {
        popup.close();
      }
      popup = openPopup({
        anchor: () => editor.selection.getBoundingClientRect(),
        iframe: editor.iframeElement,
        content,
        placement: 'below',
        themeRoot,
        className: 'khe-autocompleter-popup',
        role: 'presentation',
        onClose: (reason) => {
          popup = null;
          if (reason !== 'programmatic') {
            active = null;
            items = [];
          }
        },
      });
      select(0);
    });
  };

  const findTrigger = (): ActiveState | null => {
    const rng = editor.selection.getRng();
    if (!rng.collapsed || !NodeType.isText(rng.startContainer)) {
      return null;
    }
    const node = rng.startContainer as Text;
    const text = node.data.slice(0, rng.startOffset);
    const all = specs();
    let best: ActiveState | null = null;
    for (const name of Object.keys(all)) {
      const spec = all[name];
      const trigger = spec.trigger ?? spec.ch ?? '';
      if (!trigger) {
        continue;
      }
      const idx = text.lastIndexOf(trigger);
      if (idx === -1) {
        continue;
      }
      // The trigger must start the text or follow whitespace, and the pattern must have no spaces.
      const before = idx === 0 ? '' : text.charAt(idx - 1);
      const pattern = text.slice(idx + trigger.length);
      if ((before && !/[\s (]/.test(before)) || /\s/.test(pattern)) {
        continue;
      }
      if (pattern.length < (spec.minChars ?? 1)) {
        continue;
      }
      if (spec.matches && !spec.matches(rng, text, pattern)) {
        continue;
      }
      if (!best || idx > best.start) {
        best = { name, spec, trigger, node, start: idx };
      }
    }
    return best;
  };

  const update = () => {
    if (editor.removed) {
      return;
    }
    if (active) {
      const pattern = currentPattern();
      if (pattern === null || pattern.length < (active.spec.minChars ?? 1)) {
        close();
        // Maybe another trigger applies now.
      } else {
        void load();
        return;
      }
    }
    const found = findTrigger();
    if (found) {
      active = found;
      void load();
    }
  };

  editor.on('keyup', (e) => {
    if ([13, 27, 38, 40, 37, 39, 9].includes(e.keyCode)) {
      return;
    }
    if (Object.keys(specs()).length === 0) {
      return;
    }
    update();
  });
  editor.on('keydown', (e) => {
    if (!popup || !items.length) {
      return;
    }
    const grid = popup.el.querySelector('.khe-autocompleter--grid');
    switch (e.keyCode) {
      case 40:
      case 39:
        e.preventDefault();
        select(selected + 1);
        break;
      case 38:
      case 37:
        e.preventDefault();
        select(selected - 1);
        break;
      case 13:
      case 9:
        e.preventDefault();
        choose(selected);
        break;
      case 27:
        e.preventDefault();
        close();
        break;
      default:
        break;
    }
    void grid;
  });
  editor.on('click blur SetContent', () => close());
  editor.on('NodeChange', () => {
    if (active && currentPattern() === null) {
      close();
    }
  });
  editor.on('remove', close);
  return { destroy: close };
};
