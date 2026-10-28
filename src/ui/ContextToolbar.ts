import type { Editor } from '../core/Editor';
import type { ContextToolbarSpec, ContextFormSpec } from '../core/UiTypes';
import { h, svgEl } from './components/Dom';
import { openPopup, PopupHandle, Placement } from './components/Popup';
import { renderToolbarItems } from './components/Toolbar';
import { Component } from './components/Buttons';
import { getIcon } from './Icons';
import * as NodeType from '../dom/NodeType';
import { raf } from '../util/Throttler';

/**
 * Context toolbars and context forms (`ui.registry.addContextToolbar/addContextForm`) shown next
 * to the matching node or selection inside the editing area.
 */
export const setupContextToolbars = (editor: Editor, themeRoot: HTMLElement): { destroy: () => void } => {
  let popup: PopupHandle | null = null;
  let components: Component[] = [];
  let currentKey = '';
  let suppressed = false;
  // A form opened from a toolbar launch button stays open until hidden, regardless of predicates.
  let pinned = false;

  const close = () => {
    if (popup) {
      popup.close();
    }
  };

  const toolbars = () => editor.ui.registry.getAll().contextToolbars;

  const findMatch = (): { name: string; spec: ContextToolbarSpec | ContextFormSpec; node: HTMLElement } | null => {
    const all = toolbars();
    const names = Object.keys(all);
    if (names.length === 0) {
      return null;
    }
    const body = editor.getBody();
    const start = editor.selection.getStart();
    // Node-scoped toolbars check the node and its ancestors (closest wins); editor-scoped check only the start node.
    let node: Node | null = start;
    let depth = 0;
    while (node && node !== body) {
      if (NodeType.isElement(node)) {
        for (const name of names) {
          const spec = all[name];
          if ((spec.scope ?? 'node') === 'editor' && depth > 0) {
            continue;
          }
          try {
            if (spec.predicate(node)) {
              return { name, spec, node };
            }
          } catch {
            /* ignore faulty predicates */
          }
        }
      }
      node = node.parentNode;
      depth++;
    }
    return null;
  };

  const anchorFor = (spec: ContextToolbarSpec | ContextFormSpec, node: HTMLElement): { anchor: () => DOMRect | null; placement: Placement } => {
    const position = spec.position ?? 'node';
    if (position === 'selection') {
      return {
        anchor: () => {
          const rect = editor.selection.getBoundingClientRect();
          return rect ? rect : null;
        },
        placement: 'node-below',
      };
    }
    if (position === 'line') {
      return {
        anchor: () => {
          const rect = editor.selection.getBoundingClientRect();
          const body = editor.getBody().getBoundingClientRect();
          return rect ? new DOMRect(body.left + 8, rect.top, 1, rect.height) : null;
        },
        placement: 'right',
      };
    }
    return { anchor: () => (node.isConnected ? node.getBoundingClientRect() : null), placement: 'node-below' };
  };

  const clipTo = () => editor.iframeElement?.getBoundingClientRect() ?? null;

  const show = (match: { name: string; spec: ContextToolbarSpec | ContextFormSpec; node: HTMLElement }) => {
    const key = match.name + ':' + (match.spec.position === 'node' || !match.spec.position ? 'node' : 'sel');
    if (popup && currentKey === key && (popup as any).__node === match.node) {
      popup.reposition();
      return;
    }
    close();
    const { anchor, placement } = anchorFor(match.spec, match.node);
    const container = h('div', { class: 'khe-toolbar khe-context-toolbar', role: 'toolbar', 'aria-label': editor.translate('Contextual toolbar') });
    if ((match.spec as ContextFormSpec).type === 'contextform') {
      renderContextForm(editor, themeRoot, match.spec as ContextFormSpec, container, close);
    } else {
      components = renderToolbarItems({ editor, themeRoot, renderToolbarItems: (items, c) => renderToolbarItems({ editor, themeRoot }, items, c) }, (match.spec as ContextToolbarSpec).items, container);
    }
    if (!container.firstChild) {
      return;
    }
    popup = openPopup({
      anchor,
      iframe: editor.iframeElement,
      content: container,
      placement,
      themeRoot,
      clipTo,
      className: 'khe-context-popup',
      role: 'presentation',
      onClose: () => {
        components.forEach((c) => c.destroy());
        components = [];
        popup = null;
        currentKey = '';
        pinned = false;
      },
    });
    (popup as any).__node = match.node;
    currentKey = key;
  };

  const update = raf(() => {
    if (editor.removed || suppressed) {
      return;
    }
    if (!editor.hasFocus() && !(popup && popup.el.contains(document.activeElement))) {
      close();
      return;
    }
    if (pinned && popup) {
      popup.reposition();
      return;
    }
    const match = findMatch();
    if (match) {
      show(match);
    } else {
      close();
    }
  });

  editor.on('NodeChange SelectionChange ResizeEditor ScrollContent', () => update.throttle());
  editor.on('ContextFormLaunch', (e: { name: string }) => {
    const spec = toolbars()[e.name] as ContextFormSpec | undefined;
    if (!spec || spec.type !== 'contextform') {
      return;
    }
    close();
    pinned = true;
    show({ name: e.name, spec: { ...spec, position: 'selection' }, node: editor.selection.getStart() as HTMLElement });
  });
  editor.on('blur', () => {
    setTimeout(() => {
      if (!(popup && popup.el.contains(document.activeElement))) {
        close();
      }
    }, 10);
  });
  editor.on('remove', () => {
    update.cancel();
    close();
  });
  editor.on('keydown', (e) => {
    if (e.keyCode === 27 && popup) {
      close();
    }
  });
  // Hide while dialogs are open.
  editor.on('OpenWindow', () => {
    suppressed = true;
    close();
  });
  editor.on('CloseWindow', () => {
    suppressed = false;
    update.throttle();
  });
  editor.on('init', () => {
    const win = editor.getWin();
    win.addEventListener('scroll', () => popup?.reposition(), { passive: true });
  });

  return { destroy: close };
};

const renderContextForm = (editor: Editor, themeRoot: HTMLElement, spec: ContextFormSpec, container: HTMLElement, close: () => void): void => {
  container.classList.add('khe-context-form');
  const input = h('input', { type: 'text', class: 'khe-input', placeholder: spec.placeholder ? editor.translate(spec.placeholder) : null, 'aria-label': editor.translate(spec.label || 'Value') }) as HTMLInputElement;
  input.value = spec.initValue ? spec.initValue() : '';
  const formApi = {
    getValue: () => input.value,
    setValue: (v: string) => {
      input.value = v;
    },
    hide: close,
  };
  container.appendChild(input);
  const primary = spec.commands.find((c) => c.primary) ?? spec.commands[0];
  for (const cmd of spec.commands) {
    const btn = h('button', { type: 'button', class: 'khe-tbtn' + (cmd.primary ? ' khe-tbtn--active' : ''), 'aria-label': editor.translate(cmd.tooltip || cmd.text || ''), title: editor.translate(cmd.tooltip || cmd.text || '') });
    if (cmd.icon) {
      btn.appendChild(svgEl(getIcon(cmd.icon, editor.ui.registry.getAll().icons)));
    } else if (cmd.text) {
      btn.appendChild(h('span', { class: 'khe-tbtn__text' }, editor.translate(cmd.text)));
    }
    const api = { isEnabled: () => !(btn as HTMLButtonElement).disabled, setEnabled: (s: boolean) => ((btn as HTMLButtonElement).disabled = !s), isActive: () => btn.classList.contains('khe-tbtn--active'), setActive: (s: boolean) => btn.classList.toggle('khe-tbtn--active', s), setText: () => {}, setIcon: () => {} };
    btn.addEventListener('click', () => cmd.onAction(formApi, api));
    if (cmd.onSetup) {
      cmd.onSetup(api);
    }
    container.appendChild(btn);
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && primary) {
      e.preventDefault();
      primary.onAction(formApi, { isEnabled: () => true, setEnabled: () => {}, isActive: () => false, setActive: () => {}, setText: () => {}, setIcon: () => {} });
    } else if (e.key === 'Escape') {
      close();
      editor.focus();
    }
  });
  setTimeout(() => input.focus(), 0);
  void themeRoot;
};
