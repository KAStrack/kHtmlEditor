import * as NodeType from '../../dom/NodeType';

/**
 * Grid model of a table that resolves rowspan/colspan into a matrix of cells so that structural
 * operations (insert/delete rows and columns, merge/split) can be expressed on coordinates.
 */
export interface CellPos {
  row: number;
  col: number;
}

export interface GridCell {
  el: HTMLTableCellElement;
  /** Top-left origin of this (possibly spanning) cell. */
  origin: CellPos;
  rowSpan: number;
  colSpan: number;
}

export interface TableGrid {
  table: HTMLTableElement;
  rows: HTMLTableRowElement[];
  /** matrix[row][col] → the cell covering that slot. */
  matrix: GridCell[][];
  rowCount: number;
  colCount: number;
}

export const getRows = (table: HTMLTableElement): HTMLTableRowElement[] => {
  const rows: HTMLTableRowElement[] = [];
  Array.from(table.children).forEach((section) => {
    if (section.nodeName === 'TR') {
      rows.push(section as HTMLTableRowElement);
    } else if (/^(THEAD|TBODY|TFOOT)$/.test(section.nodeName)) {
      Array.from(section.children).forEach((row) => {
        if (row.nodeName === 'TR') {
          rows.push(row as HTMLTableRowElement);
        }
      });
    }
  });
  return rows;
};

export const buildGrid = (table: HTMLTableElement): TableGrid => {
  const rows = getRows(table);
  const matrix: GridCell[][] = [];
  rows.forEach((row, r) => {
    matrix[r] = matrix[r] || [];
    let c = 0;
    Array.from(row.children).forEach((child) => {
      if (!/^(TD|TH)$/.test(child.nodeName)) {
        return;
      }
      const cell = child as HTMLTableCellElement;
      while (matrix[r][c]) {
        c++;
      }
      const rowSpan = Math.max(1, cell.rowSpan || 1);
      const colSpan = Math.max(1, cell.colSpan || 1);
      const gridCell: GridCell = { el: cell, origin: { row: r, col: c }, rowSpan, colSpan };
      for (let dr = 0; dr < rowSpan; dr++) {
        for (let dc = 0; dc < colSpan; dc++) {
          const rr = r + dr;
          if (rr >= rows.length) {
            break;
          }
          matrix[rr] = matrix[rr] || [];
          matrix[rr][c + dc] = gridCell;
        }
      }
      c += colSpan;
    });
  });
  const colCount = matrix.reduce((max, row) => Math.max(max, row.length), 0);
  return { table, rows, matrix, rowCount: rows.length, colCount };
};

export const findCellPos = (grid: TableGrid, cell: HTMLTableCellElement): CellPos | null => {
  for (let r = 0; r < grid.matrix.length; r++) {
    for (let c = 0; c < grid.matrix[r].length; c++) {
      const g = grid.matrix[r][c];
      if (g && g.el === cell) {
        return { row: r, col: c };
      }
    }
  }
  return null;
};

export const cellAt = (grid: TableGrid, row: number, col: number): GridCell | undefined => grid.matrix[row]?.[col];

/** Unique cells covered by the rectangle between two positions (inclusive). */
export const cellsInRect = (grid: TableGrid, a: CellPos, b: CellPos): GridCell[] => {
  const r1 = Math.min(a.row, b.row);
  const r2 = Math.max(a.row, b.row);
  const c1 = Math.min(a.col, b.col);
  const c2 = Math.max(a.col, b.col);
  const seen = new Set<HTMLTableCellElement>();
  const out: GridCell[] = [];
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const g = grid.matrix[r]?.[c];
      if (g && !seen.has(g.el)) {
        seen.add(g.el);
        out.push(g);
      }
    }
  }
  return out;
};

/** Expands a rectangle so that it fully contains every spanning cell it touches. */
export const expandRect = (grid: TableGrid, a: CellPos, b: CellPos): { start: CellPos; end: CellPos } => {
  let r1 = Math.min(a.row, b.row);
  let r2 = Math.max(a.row, b.row);
  let c1 = Math.min(a.col, b.col);
  let c2 = Math.max(a.col, b.col);
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const g = grid.matrix[r]?.[c];
        if (!g) {
          continue;
        }
        const gr2 = g.origin.row + g.rowSpan - 1;
        const gc2 = g.origin.col + g.colSpan - 1;
        if (g.origin.row < r1) {
          r1 = g.origin.row;
          changed = true;
        }
        if (g.origin.col < c1) {
          c1 = g.origin.col;
          changed = true;
        }
        if (gr2 > r2) {
          r2 = gr2;
          changed = true;
        }
        if (gc2 > c2) {
          c2 = gc2;
          changed = true;
        }
      }
    }
  }
  return { start: { row: r1, col: c1 }, end: { row: r2, col: c2 } };
};

export const getCell = (node: Node | null, root: Node): HTMLTableCellElement | null => {
  let cur: Node | null = node;
  while (cur && cur !== root) {
    if (NodeType.isElement(cur) && /^(TD|TH)$/.test(cur.nodeName)) {
      return cur as HTMLTableCellElement;
    }
    cur = cur.parentNode;
  }
  return null;
};

export const getTable = (node: Node | null, root: Node): HTMLTableElement | null => {
  let cur: Node | null = node;
  while (cur && cur !== root) {
    if (NodeType.isElement(cur) && cur.nodeName === 'TABLE') {
      return cur as HTMLTableElement;
    }
    cur = cur.parentNode;
  }
  return null;
};

export const getRow = (node: Node | null, root: Node): HTMLTableRowElement | null => {
  let cur: Node | null = node;
  while (cur && cur !== root) {
    if (NodeType.isElement(cur) && cur.nodeName === 'TR') {
      return cur as HTMLTableRowElement;
    }
    cur = cur.parentNode;
  }
  return null;
};
