import type { Editor } from '../../core/Editor';
import { buildGrid, findCellPos, cellsInRect, expandRect, getCell, getTable } from './TableModel';
import { clearCellSelection } from './TableActions';

/**
 * Multi-cell selection by mouse drag or Shift+Arrow, marked with data-mce-selected so that
 * formatting commands, the delete key and table operations act on the whole rectangle.
 */
export const setupCellSelection = (editor: Editor): void => {
  let startCell: HTMLTableCellElement | null = null;
  let dragging = false;

  const body = () => editor.getBody();

  const selectRect = (a: HTMLTableCellElement, b: HTMLTableCellElement) => {
    const table = getTable(a, body()) as HTMLTableElement;
    if (!table || getTable(b, body()) !== table) {
      return;
    }
    const grid = buildGrid(table);
    const pa = findCellPos(grid, a);
    const pb = findCellPos(grid, b);
    if (!pa || !pb) {
      return;
    }
    const rect = expandRect(grid, pa, pb);
    const cells = cellsInRect(grid, rect.start, rect.end);
    clearCellSelection(editor);
    if (cells.length > 1) {
      cells.forEach((c) => c.el.setAttribute('data-mce-selected', '1'));
      // Keep a real selection inside the last cell so keyboard commands work.
      const last = cells[cells.length - 1].el;
      const rng = editor.dom.createRng();
      rng.selectNodeContents(last);
      rng.collapse(false);
      editor.selection.setRng(rng);
      editor.dispatch('TableSelectionChange', { cells: cells.map((c) => c.el), start: a, finish: b });
    }
  };

  editor.on('mousedown', (e) => {
    if (e.button !== 0) {
      return;
    }
    const cell = getCell(e.target as Node, body());
    if (!(e.shiftKey && startCell && cell)) {
      if (body().querySelector('td[data-mce-selected],th[data-mce-selected]')) {
        clearCellSelection(editor);
        editor.dispatch('TableSelectionClear');
      }
    }
    if (cell) {
      if (e.shiftKey && startCell) {
        e.preventDefault();
        selectRect(startCell, cell);
        return;
      }
      startCell = cell;
      dragging = true;
    } else {
      startCell = null;
    }
  });

  editor.on('mouseover', (e) => {
    if (!dragging || !startCell) {
      return;
    }
    const cell = getCell(e.target as Node, body());
    if (cell && cell !== startCell) {
      selectRect(startCell, cell);
    } else if (cell === startCell && body().querySelector('td[data-mce-selected]')) {
      clearCellSelection(editor);
    }
  });

  const stopDrag = () => {
    dragging = false;
  };
  editor.on('mouseup', stopDrag);
  editor.on('init', () => {
    document.addEventListener('mouseup', stopDrag);
  });
  editor.on('remove', () => document.removeEventListener('mouseup', stopDrag));

  editor.on('keydown', (e) => {
    if (!e.shiftKey || e.keyCode < 37 || e.keyCode > 40) {
      return;
    }
    const current = getCell(editor.selection.getStart(), body());
    if (!current) {
      return;
    }
    const table = getTable(current, body()) as HTMLTableElement;
    const grid = buildGrid(table);
    const anchor = startCell && getTable(startCell, body()) === table ? startCell : current;
    const selected = Array.from(body().querySelectorAll<HTMLTableCellElement>('td[data-mce-selected],th[data-mce-selected]'));
    const focusCell = selected.length ? selected[selected.length - 1] : current;
    const pos = findCellPos(grid, focusCell);
    if (!pos) {
      return;
    }
    const g = grid.matrix[pos.row][pos.col];
    let next = { row: pos.row, col: pos.col };
    if (e.keyCode === 37) {
      next.col = g.origin.col - 1;
    } else if (e.keyCode === 39) {
      next.col = g.origin.col + g.colSpan;
    } else if (e.keyCode === 38) {
      next.row = g.origin.row - 1;
    } else {
      next.row = g.origin.row + g.rowSpan;
    }
    const target = grid.matrix[next.row]?.[next.col];
    if (!target) {
      return;
    }
    // Only take over when the selection is already a cell selection or the caret sits at a cell edge.
    if (selected.length === 0 && !(e.keyCode === 38 || e.keyCode === 40)) {
      return;
    }
    e.preventDefault();
    startCell = anchor;
    selectRect(anchor, target.el);
  });

  // Typing or deleting with a cell selection clears the cells' content.
  editor.on('keydown', (e) => {
    const selected = Array.from(body().querySelectorAll<HTMLTableCellElement>('td[data-mce-selected],th[data-mce-selected]'));
    if (selected.length === 0) {
      return;
    }
    if (e.keyCode === 8 || e.keyCode === 46) {
      e.preventDefault();
      editor.undoManager.transact(() => {
        selected.forEach((c) => {
          c.innerHTML = '<br data-mce-bogus="1">';
        });
      });
      editor.selection.setCursorLocation(selected[0], 0);
      clearCellSelection(editor);
    } else if (e.keyCode === 27) {
      clearCellSelection(editor);
      editor.dispatch('TableSelectionClear');
    }
  });
};
