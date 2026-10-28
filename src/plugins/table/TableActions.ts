import type { Editor } from '../../core/Editor';
import { buildGrid, findCellPos, cellsInRect, expandRect, getCell, getTable, getRow, TableGrid, CellPos, GridCell } from './TableModel';
import * as CaretUtils from '../../dom/CaretUtils';

/** Structural table operations on top of the grid model. */

const padCell = (editor: Editor, cell: HTMLElement) => {
  if (!cell.firstChild) {
    cell.appendChild(editor.dom.create('br', { 'data-mce-bogus': '1' }));
  }
};

const cloneCell = (editor: Editor, from: HTMLTableCellElement, name?: string): HTMLTableCellElement => {
  const cell = editor.dom.create(name || from.nodeName.toLowerCase()) as HTMLTableCellElement;
  ['style', 'class', 'scope', 'valign', 'align'].forEach((attr) => {
    const v = from.getAttribute(attr);
    if (v && attr !== 'scope') {
      cell.setAttribute(attr, v);
    }
  });
  if (cell.hasAttribute('style')) {
    cell.setAttribute('data-mce-style', cell.getAttribute('style') as string);
  }
  padCell(editor, cell);
  return cell;
};

/** Returns the selected cells (fake selection) or the cell at the caret. */
export const getSelectedCells = (editor: Editor): HTMLTableCellElement[] => {
  const marked = Array.from(editor.getBody().querySelectorAll<HTMLTableCellElement>('td[data-mce-selected],th[data-mce-selected]'));
  if (marked.length) {
    return marked;
  }
  const cell = getCell(editor.selection.getStart(), editor.getBody());
  return cell ? [cell] : [];
};

export const getCurrentTable = (editor: Editor): HTMLTableElement | null => {
  const cells = getSelectedCells(editor);
  return cells.length ? getTable(cells[0], editor.getBody()) : getTable(editor.selection.getStart(), editor.getBody());
};

const selectionRect = (editor: Editor, grid: TableGrid): { start: CellPos; end: CellPos } | null => {
  const cells = getSelectedCells(editor);
  if (cells.length === 0) {
    return null;
  }
  let r1 = Infinity;
  let c1 = Infinity;
  let r2 = -1;
  let c2 = -1;
  for (const cell of cells) {
    const pos = findCellPos(grid, cell);
    if (!pos) {
      continue;
    }
    const g = grid.matrix[pos.row][pos.col];
    r1 = Math.min(r1, pos.row);
    c1 = Math.min(c1, pos.col);
    r2 = Math.max(r2, pos.row + g.rowSpan - 1);
    c2 = Math.max(c2, pos.col + g.colSpan - 1);
  }
  if (r2 < 0) {
    return null;
  }
  return { start: { row: r1, col: c1 }, end: { row: r2, col: c2 } };
};

const placeCaret = (editor: Editor, cell: HTMLElement | null | undefined) => {
  if (cell) {
    clearCellSelection(editor);
    CaretUtils.moveCaretToStart(editor, cell);
  }
};

export const clearCellSelection = (editor: Editor): void => {
  editor.getBody().querySelectorAll('td[data-mce-selected],th[data-mce-selected]').forEach((c) => c.removeAttribute('data-mce-selected'));
};

export const insertRow = (editor: Editor, before: boolean): void => {
  const table = getCurrentTable(editor);
  if (!table) {
    return;
  }
  const grid = buildGrid(table);
  const rect = selectionRect(editor, grid);
  if (!rect) {
    return;
  }
  const targetRowIdx = before ? rect.start.row : rect.end.row;
  const refRow = grid.rows[targetRowIdx];
  const newRow = editor.dom.create('tr') as HTMLTableRowElement;
  if (refRow.getAttribute('style')) {
    newRow.setAttribute('style', refRow.getAttribute('style') as string);
  }
  const insertIdx = before ? targetRowIdx : targetRowIdx + 1;
  for (let c = 0; c < grid.colCount; c++) {
    const g = grid.matrix[targetRowIdx]?.[c];
    if (!g) {
      newRow.appendChild(cloneCell(editor, editor.dom.create('td') as HTMLTableCellElement));
      continue;
    }
    const spansAcross = before ? g.origin.row < targetRowIdx : g.origin.row + g.rowSpan - 1 > targetRowIdx;
    if (spansAcross) {
      // The spanning cell grows to cover the new row.
      if (c === g.origin.col) {
        g.el.rowSpan = g.rowSpan + 1;
      }
      continue;
    }
    if (c === g.origin.col) {
      const cell = cloneCell(editor, g.el, refRow.parentElement?.nodeName === 'THEAD' ? 'th' : undefined);
      if (g.colSpan > 1) {
        cell.colSpan = g.colSpan;
      }
      newRow.appendChild(cell);
    }
  }
  const section = refRow.parentNode as Node;
  if (before) {
    section.insertBefore(newRow, refRow);
  } else {
    section.insertBefore(newRow, refRow.nextSibling);
  }
  void insertIdx;
  placeCaret(editor, newRow.cells[0]);
  editor.dispatch('NewRow', { node: newRow });
  editor.dispatch('TableModified', { table, structure: true, style: false });
};

export const insertColumn = (editor: Editor, before: boolean): void => {
  const table = getCurrentTable(editor);
  if (!table) {
    return;
  }
  const grid = buildGrid(table);
  const rect = selectionRect(editor, grid);
  if (!rect) {
    return;
  }
  const targetCol = before ? rect.start.col : rect.end.col;
  let firstNew: HTMLTableCellElement | null = null;
  for (let r = 0; r < grid.rowCount; r++) {
    const g = grid.matrix[r]?.[targetCol];
    const row = grid.rows[r];
    if (!g) {
      const cell = cloneCell(editor, editor.dom.create('td') as HTMLTableCellElement);
      row.appendChild(cell);
      firstNew = firstNew || cell;
      continue;
    }
    const spansAcross = before ? g.origin.col < targetCol : g.origin.col + g.colSpan - 1 > targetCol;
    if (spansAcross) {
      if (r === g.origin.row) {
        g.el.colSpan = g.colSpan + 1;
      }
      continue;
    }
    if (r !== g.origin.row) {
      // Covered by a rowspan from above: nothing to insert in this row.
      continue;
    }
    const cell = cloneCell(editor, g.el);
    if (g.rowSpan > 1) {
      cell.rowSpan = g.rowSpan;
    }
    if (before) {
      g.el.parentNode?.insertBefore(cell, g.el);
    } else {
      g.el.parentNode?.insertBefore(cell, g.el.nextSibling);
    }
    firstNew = firstNew || cell;
  }
  // Keep colgroup in sync if present.
  const colgroup = table.querySelector('colgroup');
  if (colgroup) {
    const cols = Array.from(colgroup.querySelectorAll('col'));
    const ref = cols[targetCol];
    if (ref) {
      const col = ref.cloneNode(false) as HTMLElement;
      colgroup.insertBefore(col, before ? ref : ref.nextSibling);
    }
  }
  placeCaret(editor, firstNew);
  editor.dispatch('TableModified', { table, structure: true, style: false });
};

export const deleteRows = (editor: Editor): void => {
  const table = getCurrentTable(editor);
  if (!table) {
    return;
  }
  const grid = buildGrid(table);
  const rect = selectionRect(editor, grid);
  if (!rect) {
    return;
  }
  if (rect.end.row - rect.start.row + 1 >= grid.rowCount) {
    deleteTable(editor);
    return;
  }
  for (let r = rect.end.row; r >= rect.start.row; r--) {
    const row = grid.rows[r];
    // Cells spanning into this row from above shrink; cells starting here and spanning below move down.
    for (let c = 0; c < grid.colCount; c++) {
      const g = grid.matrix[r]?.[c];
      if (!g || c !== g.origin.col) {
        continue;
      }
      if (g.origin.row < r) {
        if (g.rowSpan > 1) {
          g.el.rowSpan = g.rowSpan - 1;
          g.rowSpan--;
        }
      } else if (g.rowSpan > 1) {
        // Move the cell to the next row with a reduced span.
        const nextRow = grid.rows[r + 1];
        if (nextRow) {
          g.el.rowSpan = g.rowSpan - 1;
          const nextCells = Array.from(nextRow.children).filter((x) => /^(TD|TH)$/.test(x.nodeName));
          let insertBeforeEl: Element | null = null;
          for (const nc of nextCells) {
            const pos = findCellPos(grid, nc as HTMLTableCellElement);
            if (pos && pos.col > c) {
              insertBeforeEl = nc;
              break;
            }
          }
          nextRow.insertBefore(g.el, insertBeforeEl);
          g.rowSpan--;
          g.origin.row = r + 1;
        }
      }
    }
    const section = row.parentNode;
    row.remove();
    if (section && section.nodeName !== 'TABLE' && !(section as Element).querySelector('tr')) {
      (section as Element).remove();
    }
  }
  const newGrid = buildGrid(table);
  const target = newGrid.matrix[Math.min(rect.start.row, newGrid.rowCount - 1)]?.[Math.min(rect.start.col, newGrid.colCount - 1)];
  placeCaret(editor, target?.el);
  editor.dispatch('TableModified', { table, structure: true, style: false });
};

export const deleteColumns = (editor: Editor): void => {
  const table = getCurrentTable(editor);
  if (!table) {
    return;
  }
  const grid = buildGrid(table);
  const rect = selectionRect(editor, grid);
  if (!rect) {
    return;
  }
  if (rect.end.col - rect.start.col + 1 >= grid.colCount) {
    deleteTable(editor);
    return;
  }
  const removed = new Set<HTMLTableCellElement>();
  for (let c = rect.end.col; c >= rect.start.col; c--) {
    for (let r = 0; r < grid.rowCount; r++) {
      const g = grid.matrix[r]?.[c];
      if (!g || removed.has(g.el)) {
        continue;
      }
      if (g.colSpan > 1) {
        g.el.colSpan = g.colSpan - 1;
        g.colSpan--;
        if (g.el.colSpan <= 1) {
          g.el.removeAttribute('colspan');
        }
      } else {
        g.el.remove();
        removed.add(g.el);
      }
    }
    const colgroup = table.querySelector('colgroup');
    if (colgroup) {
      const cols = colgroup.querySelectorAll('col');
      cols[c]?.remove();
    }
  }
  const newGrid = buildGrid(table);
  const target = newGrid.matrix[Math.min(rect.start.row, newGrid.rowCount - 1)]?.[Math.min(rect.start.col, newGrid.colCount - 1)];
  placeCaret(editor, target?.el);
  editor.dispatch('TableModified', { table, structure: true, style: false });
};

export const deleteTable = (editor: Editor): void => {
  const table = getCurrentTable(editor);
  if (!table) {
    return;
  }
  const dom = editor.dom;
  const parent = table.parentNode as HTMLElement;
  const next = CaretUtils.findNextBlock(editor, table);
  const prev = CaretUtils.findPreviousBlock(editor, table);
  dom.remove(table);
  if (parent === editor.getBody() && !parent.firstChild) {
    editor.setContent('');
    editor.selection.setCursorLocation();
  } else if (next && editor.getBody().contains(next)) {
    CaretUtils.moveCaretToStart(editor, next);
  } else if (prev && editor.getBody().contains(prev)) {
    CaretUtils.moveCaretToEnd(editor, prev);
  } else {
    const p = dom.create(editor.options.get('forced_root_block') as string);
    CaretUtils.padBlock(editor, p);
    parent.appendChild(p);
    CaretUtils.moveCaretToStart(editor, p);
  }
  editor.dispatch('TableModified', { table, structure: true, style: false });
};

export const mergeCells = (editor: Editor): void => {
  const table = getCurrentTable(editor);
  if (!table) {
    return;
  }
  const grid = buildGrid(table);
  const rect = selectionRect(editor, grid);
  if (!rect) {
    return;
  }
  const expanded = expandRect(grid, rect.start, rect.end);
  const cells = cellsInRect(grid, expanded.start, expanded.end);
  if (cells.length < 2) {
    return;
  }
  const target = cells[0];
  const dom = editor.dom;
  for (let i = 1; i < cells.length; i++) {
    const cell = cells[i].el;
    const hasContent = cell.textContent?.replace(/﻿/g, '').trim().length || cell.querySelector('img,table,hr');
    if (hasContent) {
      // Move content into the target as blocks.
      const nodes = Array.from(cell.childNodes).filter((n) => !(n.nodeName === 'BR' && (n as Element).hasAttribute('data-mce-bogus')));
      if (nodes.length) {
        const targetEmpty = !target.el.textContent?.replace(/﻿/g, '').trim().length && !target.el.querySelector('img,table,hr');
        if (targetEmpty) {
          target.el.innerHTML = '';
        } else if (target.el.lastChild && !dom.isBlock(target.el.lastChild)) {
          target.el.appendChild(dom.create('br'));
        }
        nodes.forEach((n) => target.el.appendChild(n));
      }
    }
    cell.remove();
  }
  target.el.rowSpan = expanded.end.row - expanded.start.row + 1;
  target.el.colSpan = expanded.end.col - expanded.start.col + 1;
  if (target.el.rowSpan === 1) {
    target.el.removeAttribute('rowspan');
  }
  if (target.el.colSpan === 1) {
    target.el.removeAttribute('colspan');
  }
  padCell(editor, target.el);
  // Remove rows left without cells.
  buildGrid(table).rows.forEach((row) => {
    if (!row.querySelector('td,th')) {
      row.remove();
    }
  });
  clearCellSelection(editor);
  placeCaret(editor, target.el);
  editor.dispatch('TableModified', { table, structure: true, style: false });
};

export const splitCell = (editor: Editor): void => {
  const table = getCurrentTable(editor);
  if (!table) {
    return;
  }
  const cells = getSelectedCells(editor);
  const cell = cells[0];
  if (!cell || (cell.rowSpan <= 1 && cell.colSpan <= 1)) {
    return;
  }
  const grid = buildGrid(table);
  const pos = findCellPos(grid, cell);
  if (!pos) {
    return;
  }
  const g = grid.matrix[pos.row][pos.col];
  const rowSpan = g.rowSpan;
  const colSpan = g.colSpan;
  cell.removeAttribute('rowspan');
  cell.removeAttribute('colspan');
  // Extra cells in the origin row.
  for (let dc = 1; dc < colSpan; dc++) {
    cell.parentNode?.insertBefore(cloneCell(editor, cell), cell.nextSibling);
  }
  // Cells in the rows below.
  for (let dr = 1; dr < rowSpan; dr++) {
    const row = grid.rows[g.origin.row + dr];
    if (!row) {
      continue;
    }
    let insertBeforeEl: Element | null = null;
    for (const rc of Array.from(row.children)) {
      if (!/^(TD|TH)$/.test(rc.nodeName)) {
        continue;
      }
      const rcPos = findCellPos(grid, rc as HTMLTableCellElement);
      if (rcPos && rcPos.col > g.origin.col) {
        insertBeforeEl = rc;
        break;
      }
    }
    for (let dc = 0; dc < colSpan; dc++) {
      row.insertBefore(cloneCell(editor, cell), insertBeforeEl);
    }
  }
  placeCaret(editor, cell);
  editor.dispatch('TableModified', { table, structure: true, style: false });
};

/** Moves the caret to the next/previous cell, appending a row at the end. */
export const navigateCell = (editor: Editor, forward: boolean): boolean => {
  const cell = getCell(editor.selection.getStart(), editor.getBody());
  if (!cell) {
    return false;
  }
  const table = getTable(cell, editor.getBody()) as HTMLTableElement;
  const all = Array.from(table.querySelectorAll('td,th')).filter((c) => getTable(c, editor.getBody()) === table) as HTMLTableCellElement[];
  const idx = all.indexOf(cell);
  if (idx === -1) {
    return false;
  }
  const next = all[idx + (forward ? 1 : -1)];
  if (next) {
    clearCellSelection(editor);
    editor.selection.select(next, true);
    editor.selection.collapse(forward);
    const pos = forward ? editor.selection.firstEditablePosition(next) : editor.selection.lastEditablePosition(next);
    const rng = editor.dom.createRng();
    rng.setStart(pos.node, pos.offset);
    rng.collapse(true);
    editor.selection.setRng(rng);
    editor.selection.scrollIntoView(next);
    return true;
  }
  if (forward) {
    editor.undoManager.transact(() => {
      const row = getRow(cell, editor.getBody()) as HTMLTableRowElement;
      const newRow = editor.dom.create('tr') as HTMLTableRowElement;
      Array.from(row.children).forEach((c) => {
        if (/^(TD|TH)$/.test(c.nodeName)) {
          const nc = cloneCell(editor, c as HTMLTableCellElement, 'td');
          if ((c as HTMLTableCellElement).colSpan > 1) {
            nc.colSpan = (c as HTMLTableCellElement).colSpan;
          }
          newRow.appendChild(nc);
        }
      });
      row.parentNode?.insertBefore(newRow, row.nextSibling);
      placeCaret(editor, newRow.cells[0]);
      editor.dispatch('NewRow', { node: newRow });
      editor.dispatch('TableModified', { table, structure: true, style: false });
    });
    return true;
  }
  return false;
};

export const copyRows = (editor: Editor): HTMLTableRowElement[] | null => {
  const table = getCurrentTable(editor);
  if (!table) {
    return null;
  }
  const grid = buildGrid(table);
  const rect = selectionRect(editor, grid);
  if (!rect) {
    return null;
  }
  return grid.rows.slice(rect.start.row, rect.end.row + 1).map((r) => r.cloneNode(true) as HTMLTableRowElement);
};

export const pasteRows = (editor: Editor, rows: HTMLTableRowElement[], before: boolean): void => {
  const table = getCurrentTable(editor);
  if (!table || rows.length === 0) {
    return;
  }
  const grid = buildGrid(table);
  const rect = selectionRect(editor, grid);
  if (!rect) {
    return;
  }
  const ref = grid.rows[before ? rect.start.row : rect.end.row];
  const section = ref.parentNode as Node;
  let anchor: Node | null = before ? ref : ref.nextSibling;
  rows.forEach((row) => {
    const clone = editor.getDoc().adoptNode(row.cloneNode(true)) as HTMLTableRowElement;
    clone.querySelectorAll('[data-mce-selected]').forEach((c) => c.removeAttribute('data-mce-selected'));
    section.insertBefore(clone, anchor);
    if (!before) {
      anchor = clone.nextSibling;
    }
  });
  editor.dispatch('TableModified', { table, structure: true, style: false });
};

export const setHeaderRow = (editor: Editor, header: boolean): void => {
  const table = getCurrentTable(editor);
  if (!table) {
    return;
  }
  const grid = buildGrid(table);
  const rect = selectionRect(editor, grid);
  if (!rect) {
    return;
  }
  const dom = editor.dom;
  const bookmark = editor.selection.getBookmark(2, true);
  for (let r = rect.start.row; r <= rect.end.row; r++) {
    const row = grid.rows[r];
    Array.from(row.children).forEach((c) => {
      if (/^(TD|TH)$/.test(c.nodeName)) {
        const renamed = dom.rename(c, header ? 'th' : 'td');
        if (header) {
          renamed.setAttribute('scope', 'col');
        } else {
          renamed.removeAttribute('scope');
        }
      }
    });
    // Move the row into/out of thead when toggling the first rows.
    if (header && row.parentNode?.nodeName !== 'THEAD' && r === 0) {
      let thead = table.querySelector('thead');
      if (!thead) {
        thead = dom.create('thead');
        table.insertBefore(thead, table.firstChild);
      }
      thead.appendChild(row);
    } else if (!header && row.parentNode?.nodeName === 'THEAD') {
      const thead = row.parentNode as HTMLElement;
      let tbody = table.querySelector('tbody');
      if (!tbody) {
        tbody = dom.create('tbody');
        table.appendChild(tbody);
      }
      tbody.insertBefore(row, tbody.firstChild);
      if (!thead.querySelector('tr')) {
        thead.remove();
      }
    }
  }
  editor.selection.moveToBookmark(bookmark);
  editor.dispatch('TableModified', { table, structure: true, style: false });
};

export const setHeaderColumn = (editor: Editor, header: boolean): void => {
  const table = getCurrentTable(editor);
  if (!table) {
    return;
  }
  const grid = buildGrid(table);
  const rect = selectionRect(editor, grid);
  if (!rect) {
    return;
  }
  const dom = editor.dom;
  const bookmark = editor.selection.getBookmark(2, true);
  const done = new Set<HTMLTableCellElement>();
  for (let c = rect.start.col; c <= rect.end.col; c++) {
    for (let r = 0; r < grid.rowCount; r++) {
      const g = grid.matrix[r]?.[c];
      if (g && !done.has(g.el)) {
        done.add(g.el);
        const renamed = dom.rename(g.el, header ? 'th' : 'td');
        if (header) {
          renamed.setAttribute('scope', 'row');
        } else {
          renamed.removeAttribute('scope');
        }
      }
    }
  }
  editor.selection.moveToBookmark(bookmark);
  editor.dispatch('TableModified', { table, structure: true, style: false });
};

export const isHeaderRow = (editor: Editor): boolean => {
  const cells = getSelectedCells(editor);
  return cells.length > 0 && cells.every((c) => c.nodeName === 'TH' || c.parentElement?.parentElement?.nodeName === 'THEAD');
};

export const isHeaderColumn = (editor: Editor): boolean => {
  const table = getCurrentTable(editor);
  const cells = getSelectedCells(editor);
  if (!table || cells.length === 0) {
    return false;
  }
  const grid = buildGrid(table);
  const pos = findCellPos(grid, cells[0]);
  if (!pos) {
    return false;
  }
  for (let r = 0; r < grid.rowCount; r++) {
    const g = grid.matrix[r]?.[pos.col];
    if (g && g.el.nodeName !== 'TH') {
      return false;
    }
  }
  return true;
};

export type { GridCell };
