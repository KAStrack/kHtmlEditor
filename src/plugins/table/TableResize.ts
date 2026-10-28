import type { Editor } from '../../core/Editor';
import { buildGrid, getCell, getTable } from './TableModel';

/**
 * Column resizing by dragging the border between cells (`table_resize_bars`). Widths are written
 * as pixels or percentages depending on `table_column_resizing` / `table_sizing_mode`.
 */
export const setupColumnResize = (editor: Editor): void => {
  if (editor.options.get('table_resize_bars') === false) {
    return;
  }
  const EDGE = 5;
  let hoverCol: { table: HTMLTableElement; col: number; x: number } | null = null;
  let drag: { table: HTMLTableElement; col: number; startX: number; widths: number[]; tableWidth: number } | null = null;
  let guide: HTMLElement | null = null;

  const columnEdges = (table: HTMLTableElement): number[] => {
    const grid = buildGrid(table);
    const edges: number[] = [];
    const firstRow = grid.matrix[0] || [];
    for (let c = 0; c < grid.colCount; c++) {
      // Find a cell in any row that starts at column c to measure its right edge.
      for (let r = 0; r < grid.rowCount; r++) {
        const g = grid.matrix[r]?.[c];
        if (g && g.origin.col + g.colSpan - 1 === c) {
          edges[c] = g.el.getBoundingClientRect().right;
          break;
        }
      }
    }
    void firstRow;
    return edges;
  };

  editor.on('mousemove', (e) => {
    if (drag || editor.readonly) {
      return;
    }
    const cell = getCell(e.target as Node, editor.getBody());
    const body = editor.getBody();
    if (!cell) {
      if (hoverCol) {
        hoverCol = null;
        body.style.cursor = '';
      }
      return;
    }
    const table = getTable(cell, body) as HTMLTableElement;
    const edges = columnEdges(table);
    const x = e.clientX;
    let found: number = -1;
    edges.forEach((edge, i) => {
      if (i < edges.length - 1 && Math.abs(edge - x) <= EDGE) {
        found = i;
      }
    });
    if (found >= 0) {
      hoverCol = { table, col: found, x: edges[found] };
      body.style.cursor = 'col-resize';
    } else if (hoverCol) {
      hoverCol = null;
      body.style.cursor = '';
    }
  });

  editor.on('mousedown', (e) => {
    if (!hoverCol || e.button !== 0) {
      return;
    }
    e.preventDefault();
    const { table, col } = hoverCol;
    const grid = buildGrid(table);
    const widths: number[] = [];
    for (let c = 0; c < grid.colCount; c++) {
      for (let r = 0; r < grid.rowCount; r++) {
        const g = grid.matrix[r]?.[c];
        if (g && g.colSpan === 1) {
          widths[c] = g.el.getBoundingClientRect().width;
          break;
        }
      }
      widths[c] = widths[c] || table.getBoundingClientRect().width / grid.colCount;
    }
    drag = { table, col, startX: e.clientX, widths, tableWidth: table.getBoundingClientRect().width };
    guide = editor.dom.create('div', { 'data-mce-bogus': 'all', class: 'mce-resize-bar-guide' });
    guide.style.cssText = `position:absolute;top:${table.offsetTop}px;left:${hoverCol.x + editor.getWin().scrollX}px;height:${table.offsetHeight}px;width:2px;background:#4099ff;pointer-events:none;z-index:1000`;
    editor.getBody().appendChild(guide);
    const move = (ev: MouseEvent) => {
      if (guide && drag) {
        guide.style.left = ev.clientX + editor.getWin().scrollX + 'px';
      }
    };
    const up = (ev: MouseEvent) => {
      editor.getDoc().removeEventListener('mousemove', move);
      editor.getDoc().removeEventListener('mouseup', up);
      if (!drag) {
        return;
      }
      const delta = ev.clientX - drag.startX;
      applyResize(drag, delta);
      guide?.remove();
      guide = null;
      drag = null;
      editor.getBody().style.cursor = '';
    };
    editor.getDoc().addEventListener('mousemove', move);
    editor.getDoc().addEventListener('mouseup', up);
  });

  const applyResize = (d: NonNullable<typeof drag>, delta: number) => {
    const { table, col, widths, tableWidth } = d;
    const min = 10;
    const grid = buildGrid(table);
    const mode = editor.options.get('table_column_resizing') as string;
    const sizing = editor.options.get('table_sizing_mode') as string;
    const usePercent = sizing === 'relative' || (sizing === 'auto' && /%$/.test(table.style.width || ''));
    const newWidths = widths.slice();
    const left = Math.max(min, widths[col] + delta);
    const actualDelta = left - widths[col];
    newWidths[col] = left;
    if (mode !== 'resizetable' && newWidths[col + 1] !== undefined) {
      newWidths[col + 1] = Math.max(min, widths[col + 1] - actualDelta);
    }
    const totalWidth = mode === 'resizetable' ? tableWidth + actualDelta : tableWidth;
    const fmt = (w: number) => (usePercent ? ((w / totalWidth) * 100).toFixed(2) + '%' : Math.round(w) + 'px');
    editor.undoManager.transact(() => {
      const colgroup = table.querySelector('colgroup');
      if (colgroup) {
        const cols = colgroup.querySelectorAll('col');
        newWidths.forEach((w, i) => {
          if (cols[i]) {
            editor.dom.setStyle(cols[i], 'width', fmt(w));
          }
        });
      } else {
        for (let c = 0; c < grid.colCount; c++) {
          for (let r = 0; r < grid.rowCount; r++) {
            const g = grid.matrix[r]?.[c];
            if (g && g.origin.col === c && g.colSpan === 1) {
              editor.dom.setStyle(g.el, 'width', fmt(newWidths[c]));
            }
          }
        }
      }
      if (mode === 'resizetable') {
        editor.dom.setStyle(table, 'width', usePercent ? table.style.width : Math.round(totalWidth) + 'px');
      }
    });
    editor.dispatch('TableModified', { table, structure: false, style: true });
    editor.dispatch('ObjectResized', { target: table, width: totalWidth, height: table.offsetHeight, origin: 'table' });
  };
};
