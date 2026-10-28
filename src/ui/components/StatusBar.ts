import type { Editor } from '../../core/Editor';
import { h, svgEl, empty } from './Dom';
import { getIcon } from '../Icons';
import * as NodeType from '../../dom/NodeType';

/** Status bar with element path, word count slot, branding and the resize handle. */
export interface StatusBarHandle {
  el: HTMLElement;
  destroy: () => void;
  setWordCount: (text: string | null) => void;
}

export const createStatusBar = (editor: Editor, container: HTMLElement): StatusBarHandle | null => {
  if (editor.options.get('statusbar') === false) {
    return null;
  }
  const el = h('div', { class: 'khe-statusbar', role: 'group', 'aria-label': editor.translate('Editor status bar') });
  const path = h('div', { class: 'khe-path', role: 'navigation', 'aria-label': editor.translate('Element path') });
  const right = h('div', { class: 'khe-statusbar__right' });
  const showPath = editor.options.get('elementpath') !== false;
  if (showPath) {
    el.appendChild(path);
  } else {
    el.appendChild(h('div'));
  }
  el.appendChild(right);

  let wordCountBtn: HTMLButtonElement | null = null;
  const setWordCount = (text: string | null) => {
    if (text === null) {
      wordCountBtn?.remove();
      wordCountBtn = null;
      return;
    }
    if (!wordCountBtn) {
      wordCountBtn = h('button', { type: 'button', class: 'khe-statusbar__wordcount', 'aria-label': editor.translate('Word count') }) as HTMLButtonElement;
      wordCountBtn.addEventListener('click', () => {
        editor.dispatch('StatusbarWordCountClick');
      });
      right.insertBefore(wordCountBtn, right.firstChild);
    }
    wordCountBtn.textContent = text;
  };

  if (editor.options.get('branding') === true) {
    right.appendChild(h('span', { class: 'khe-statusbar__branding' }, h('a', { href: 'https://github.com/KAStrack/kHtmlEditor', target: '_blank', rel: 'noopener' }, 'kHtmlEditor')));
  }

  const resizeOpt = editor.options.get('resize') as boolean | 'both' | undefined;
  const resizeMode = resizeOpt === undefined ? 'vertical' : resizeOpt === false ? false : resizeOpt === 'both' ? 'both' : 'vertical';
  if (resizeMode) {
    const handle = h('div', { class: 'khe-resize-handle', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': editor.translate('Resize'), tabindex: '0' });
    handle.appendChild(svgEl(getIcon('resize-handle')));
    right.appendChild(handle);
    let startX = 0;
    let startY = 0;
    let startW = 0;
    let startH = 0;
    const minH = (editor.options.get('min_height') as number) || 100;
    const maxH = (editor.options.get('max_height') as number) || 0;
    const minW = (editor.options.get('min_width') as number) || 0;
    const maxW = (editor.options.get('max_width') as number) || 0;
    const move = (e: PointerEvent) => {
      const dy = e.clientY - startY;
      const dx = e.clientX - startX;
      let newH = Math.max(minH, startH + dy);
      if (maxH) {
        newH = Math.min(maxH, newH);
      }
      container.style.height = newH + 'px';
      if (resizeMode === 'both') {
        let newW = Math.max(minW || 100, startW + dx);
        if (maxW) {
          newW = Math.min(maxW, newW);
        }
        container.style.width = newW + 'px';
      }
      editor.dispatch('ResizeEditor');
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      editor.dispatch('ResizeEditor');
    };
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      startW = container.offsetWidth;
      startH = container.offsetHeight;
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
    handle.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 50 : 10;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const h2 = container.offsetHeight + (e.key === 'ArrowDown' ? step : -step);
        container.style.height = Math.max(minH, maxH ? Math.min(maxH, h2) : h2) + 'px';
        editor.dispatch('ResizeEditor');
      }
    });
  }

  const updatePath = (parents: Node[]) => {
    if (!showPath) {
      return;
    }
    empty(path);
    const body = editor.getBody();
    const chain = parents.filter((n) => n !== body && NodeType.isElement(n) && !NodeType.isBogus(n) && !NodeType.isBookmarkNode(n)).reverse();
    chain.forEach((node, i) => {
      const el2 = node as HTMLElement;
      let name = el2.nodeName.toLowerCase();
      const evt = editor.dispatch('ResolveName', { name, target: el2 });
      name = evt.name;
      if (el2.id) {
        name += '#' + el2.id;
      } else if (el2.className && !/^(mce-|khe-)/.test(el2.className)) {
        name += '.' + el2.className.split(/\s+/).filter((c) => c && !/^mce-/.test(c)).slice(0, 2).join('.');
      }
      const btn = h('button', { type: 'button', class: 'khe-path__item', 'data-index': String(i), 'aria-label': editor.translate(['Select the {0} element', name]) }, name);
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        editor.focus();
        editor.selection.select(el2);
        editor.nodeChanged();
      });
      if (i > 0) {
        path.appendChild(h('span', { class: 'khe-path__sep', 'aria-hidden': 'true' }, '›'));
      }
      path.appendChild(btn);
    });
  };
  const onNodeChange = (e: any) => updatePath(e.parents || []);
  editor.on('NodeChange', onNodeChange);

  return {
    el,
    setWordCount,
    destroy: () => editor.off('NodeChange', onNodeChange),
  };
};
