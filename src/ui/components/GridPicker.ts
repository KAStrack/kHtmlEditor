import { h } from './Dom';

/** 10x10 table size picker used by the insert table menu item. */
export const createGridPicker = (translate: (s: any) => string, onPick: (rows: number, cols: number) => void, maxRows = 10, maxCols = 10): HTMLElement => {
  const wrap = h('div', { class: 'khe-grid-picker', role: 'presentation' });
  const grid = h('div', { class: 'khe-grid-picker__grid', role: 'grid', 'aria-label': translate('Insert table') });
  grid.style.gridTemplateColumns = `repeat(${maxCols}, 18px)`;
  const label = h('div', { class: 'khe-grid-picker__label', 'aria-live': 'polite' }, '1 × 1');
  const cells: HTMLElement[] = [];
  let cur = { r: 1, c: 1 };
  const highlight = (r: number, c: number) => {
    cur = { r, c };
    cells.forEach((cell) => {
      const cr = Number(cell.dataset.r);
      const cc = Number(cell.dataset.c);
      cell.classList.toggle('khe-grid-picker__cell--on', cr <= r && cc <= c);
    });
    label.textContent = `${c} × ${r}`;
  };
  for (let r = 1; r <= maxRows; r++) {
    for (let c = 1; c <= maxCols; c++) {
      const cell = h('div', { class: 'khe-grid-picker__cell', role: 'gridcell', 'data-r': String(r), 'data-c': String(c), tabindex: r === 1 && c === 1 ? '0' : '-1', 'aria-label': `${c} × ${r}` });
      cell.addEventListener('mouseenter', () => highlight(r, c));
      cell.addEventListener('click', () => onPick(r, c));
      cells.push(cell);
      grid.appendChild(cell);
    }
  }
  grid.addEventListener('keydown', (e) => {
    let { r, c } = cur;
    if (e.key === 'ArrowRight') {
      c = Math.min(maxCols, c + 1);
    } else if (e.key === 'ArrowLeft') {
      c = Math.max(1, c - 1);
    } else if (e.key === 'ArrowDown') {
      r = Math.min(maxRows, r + 1);
    } else if (e.key === 'ArrowUp') {
      r = Math.max(1, r - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPick(cur.r, cur.c);
      return;
    } else {
      return;
    }
    e.preventDefault();
    highlight(r, c);
    const cell = cells[(r - 1) * maxCols + (c - 1)];
    cell.focus();
  });
  highlight(1, 1);
  wrap.appendChild(grid);
  wrap.appendChild(label);
  return wrap;
};
