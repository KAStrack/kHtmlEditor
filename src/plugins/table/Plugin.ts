import type { Editor } from '../../core/Editor';
import type { MenuItemAnySpec } from '../../core/UiTypes';
import { PluginManager } from '../../core/AddOnManager';
import * as Actions from './TableActions';
import { getCell, getTable, buildGrid } from './TableModel';
import { setupCellSelection } from './CellSelection';
import { setupColumnResize } from './TableResize';
import { openInsertDialog, openTableProps, openRowProps, openCellProps } from './TableDialogs';
import * as CaretUtils from '../../dom/CaretUtils';
import { isObject, isString } from '../../util/Type';

/**
 * Table plugin: insertion, row/column/cell operations, merge/split, properties dialogs, context
 * toolbar, context menu and keyboard navigation. Command names follow TinyMCE.
 */
const registerOptions = (editor: Editor) => {
  const r = editor.options.register;
  r('table_toolbar', { processor: 'string', default: 'tableprops tabledelete | tableinsertrowbefore tableinsertrowafter tabledeleterow | tableinsertcolbefore tableinsertcolafter tabledeletecol' });
  r('table_grid', { processor: 'boolean', default: true });
  r('table_default_attributes', { processor: 'object', default: { border: '1' } });
  r('table_default_styles', { processor: 'object', default: { 'border-collapse': 'collapse', width: '100%' } });
  r('table_sizing_mode', { processor: 'string', default: 'auto' });
  r('table_column_resizing', { processor: 'string', default: 'preservetable' });
  r('table_resize_bars', { processor: 'boolean', default: true });
  r('table_use_colgroups', { processor: 'boolean', default: true });
  r('table_header_type', { processor: 'string', default: 'section' });
  r('table_style_by_css', { processor: 'boolean', default: true });
  r('table_appearance_options', { processor: 'boolean', default: true });
  r('table_advtab', { processor: 'boolean', default: true });
  r('table_cell_advtab', { processor: 'boolean', default: true });
  r('table_row_advtab', { processor: 'boolean', default: true });
  r('table_class_list', { processor: 'object[]', default: [] });
  r('table_cell_class_list', { processor: 'object[]', default: [] });
  r('table_row_class_list', { processor: 'object[]', default: [] });
  r('table_border_widths', { processor: 'object[]', default: [{ title: 'None', value: '0' }, { title: '1px', value: '1px' }, { title: '2px', value: '2px' }, { title: '3px', value: '3px' }, { title: '5px', value: '5px' }] });
  r('table_border_styles', { processor: 'object[]', default: ['solid', 'dotted', 'dashed', 'double', 'groove', 'ridge', 'inset', 'outset', 'none', 'hidden'].map((s) => ({ title: s.charAt(0).toUpperCase() + s.slice(1), value: s })) });
  r('table_background_color_map', { processor: 'string[]' });
  r('table_border_color_map', { processor: 'string[]' });
  r('table_clone_elements', { processor: 'string', default: 'strong em b i span font h1 h2 h3 h4 h5 h6 p div' });
};

const insertTable = (editor: Editor, rows: number, columns: number, options: { headerRows?: number; headerColumns?: number } = {}): HTMLTableElement | null => {
  const dom = editor.dom;
  rows = Math.max(1, rows);
  columns = Math.max(1, columns);
  const table = dom.create('table') as HTMLTableElement;
  const attrs = editor.options.get('table_default_attributes') as Record<string, string>;
  const styles = editor.options.get('table_default_styles') as Record<string, string>;
  dom.setStyles(table, styles);
  Object.keys(attrs).forEach((k) => table.setAttribute(k, attrs[k]));
  const useColgroups = editor.options.get('table_use_colgroups') as boolean;
  const colWidth = (100 / columns).toFixed(4).replace(/\.?0+$/, '') + '%';
  if (useColgroups) {
    const colgroup = dom.create('colgroup');
    for (let c = 0; c < columns; c++) {
      const col = dom.create('col');
      dom.setStyle(col, 'width', colWidth);
      colgroup.appendChild(col);
    }
    table.appendChild(colgroup);
  }
  const headerRows = options.headerRows ?? 0;
  const headerType = editor.options.get('table_header_type') as string;
  let thead: HTMLElement | null = null;
  const tbody = dom.create('tbody');
  for (let r = 0; r < rows; r++) {
    const tr = dom.create('tr');
    const isHeaderRow = r < headerRows;
    for (let c = 0; c < columns; c++) {
      const isHeaderCol = c < (options.headerColumns ?? 0);
      const cell = dom.create(isHeaderRow || isHeaderCol ? 'th' : 'td');
      if (isHeaderRow) {
        cell.setAttribute('scope', 'col');
      } else if (isHeaderCol) {
        cell.setAttribute('scope', 'row');
      }
      if (!useColgroups) {
        dom.setStyle(cell, 'width', colWidth);
      }
      cell.appendChild(dom.create('br', { 'data-mce-bogus': '1' }));
      tr.appendChild(cell);
    }
    if (isHeaderRow && (headerType === 'section' || headerType === 'sectionCells')) {
      if (!thead) {
        thead = dom.create('thead');
        table.appendChild(thead);
      }
      thead.appendChild(tr);
    } else {
      tbody.appendChild(tr);
    }
  }
  table.appendChild(tbody);
  editor.undoManager.transact(() => {
    editor.insertContent(table.outerHTML);
  });
  // Place the caret in the first cell of the inserted table.
  const inserted = Array.from(editor.getBody().querySelectorAll('table')).find((t) => !t.hasAttribute('data-khe-seen'));
  editor.getBody().querySelectorAll('table').forEach((t) => t.setAttribute('data-khe-seen', ''));
  editor.getBody().querySelectorAll('table[data-khe-seen]').forEach((t) => t.removeAttribute('data-khe-seen'));
  const target = inserted ?? (getTable(editor.selection.getStart(), editor.getBody()) as HTMLTableElement | null);
  if (target) {
    const firstCell = target.querySelector('td,th') as HTMLElement | null;
    if (firstCell) {
      CaretUtils.moveCaretToStart(editor, firstCell);
    }
    editor.dispatch('NewRow', { node: target.querySelector('tr') });
    editor.dispatch('TableModified', { table: target, structure: true, style: false });
    editor.nodeChanged();
  }
  return target;
};

const register = (editor: Editor): Record<string, any> => {
  registerOptions(editor);
  let clipboardRows: HTMLTableRowElement[] | null = null;

  const inTable = () => !!getTable(editor.selection.getStart(), editor.getBody());
  const inCell = () => !!getCell(editor.selection.getStart(), editor.getBody()) || Actions.getSelectedCells(editor).length > 0;
  const transact = (f: () => void) => () => {
    editor.undoManager.transact(f);
    editor.nodeChanged();
  };

  editor.editorCommands.addCommands({
    mceInsertTable: (_cmd, _ui, value) => {
      if (isObject(value) && (value.rows || value.columns)) {
        insertTable(editor, Number(value.rows) || 2, Number(value.columns) || 2, value.options || {});
      } else {
        openInsertDialog(editor);
      }
    },
    mceInsertTableDialog: () => openInsertDialog(editor),
    mceTableProps: () => openTableProps(editor),
    mceTableRowProps: () => openRowProps(editor),
    mceTableCellProps: () => openCellProps(editor),
    mceTableInsertRowBefore: transact(() => Actions.insertRow(editor, true)),
    mceTableInsertRowAfter: transact(() => Actions.insertRow(editor, false)),
    mceTableInsertColBefore: transact(() => Actions.insertColumn(editor, true)),
    mceTableInsertColAfter: transact(() => Actions.insertColumn(editor, false)),
    mceTableDeleteRow: transact(() => Actions.deleteRows(editor)),
    mceTableDeleteCol: transact(() => Actions.deleteColumns(editor)),
    mceTableDelete: transact(() => Actions.deleteTable(editor)),
    mceTableMergeCells: transact(() => Actions.mergeCells(editor)),
    mceTableSplitCells: transact(() => Actions.splitCell(editor)),
    mceTableCopyRow: () => {
      clipboardRows = Actions.copyRows(editor);
    },
    mceTableCutRow: () => {
      clipboardRows = Actions.copyRows(editor);
      editor.undoManager.transact(() => Actions.deleteRows(editor));
    },
    mceTablePasteRowBefore: transact(() => {
      if (clipboardRows) {
        Actions.pasteRows(editor, clipboardRows, true);
      }
    }),
    mceTablePasteRowAfter: transact(() => {
      if (clipboardRows) {
        Actions.pasteRows(editor, clipboardRows, false);
      }
    }),
    mceTableRowType: (_cmd, _ui, value) => {
      const type = isObject(value) ? value.type : value;
      editor.undoManager.transact(() => Actions.setHeaderRow(editor, type === 'header'));
    },
    mceTableColType: (_cmd, _ui, value) => {
      const type = isObject(value) ? value.type : value;
      editor.undoManager.transact(() => Actions.setHeaderColumn(editor, type === 'th'));
    },
    mceTableToggleCaption: transact(() => {
      const table = Actions.getCurrentTable(editor);
      if (!table) {
        return;
      }
      const caption = table.querySelector('caption');
      if (caption) {
        caption.remove();
      } else {
        const cap = editor.dom.create('caption');
        cap.innerHTML = '<br data-mce-bogus="1">';
        table.insertBefore(cap, table.firstChild);
        CaretUtils.moveCaretToStart(editor, cap);
      }
    }),
    mceTableApplyCellStyle: (_cmd, _ui, value) => {
      if (!isObject(value)) {
        return;
      }
      editor.undoManager.transact(() => {
        Actions.getSelectedCells(editor).forEach((cell) => {
          Object.keys(value).forEach((k) => editor.dom.setStyle(cell, k, value[k] || ''));
          if (!cell.getAttribute('style')) {
            cell.removeAttribute('style');
            cell.removeAttribute('data-mce-style');
          }
        });
      });
      editor.dispatch('TableModified', { table: Actions.getCurrentTable(editor), structure: false, style: true });
    },
    mceTableToggleClass: (_cmd, _ui, value) => {
      const table = Actions.getCurrentTable(editor);
      if (table && isString(value)) {
        editor.undoManager.transact(() => editor.dom.toggleClass(table, value));
      }
    },
    mceTableCellToggleClass: (_cmd, _ui, value) => {
      if (isString(value)) {
        editor.undoManager.transact(() => Actions.getSelectedCells(editor).forEach((c) => editor.dom.toggleClass(c, value)));
      }
    },
    mceTableSizingMode: (_cmd, _ui, value) => {
      editor.options.set('table_sizing_mode', value);
    },
  });

  editor.editorCommands.addCommands(
    {
      mceTableRowType: () => Actions.isHeaderRow(editor),
      mceTableColType: () => Actions.isHeaderColumn(editor),
    },
    'state',
  );
  editor.editorCommands.addCommands(
    {
      mceTableRowType: () => (Actions.isHeaderRow(editor) ? 'header' : 'body'),
      mceTableColType: () => (Actions.isHeaderColumn(editor) ? 'th' : 'td'),
    },
    'value',
  );

  // Tab navigation between cells.
  editor.on('keydown', (e) => {
    if (e.keyCode === 9 && !e.ctrlKey && !e.metaKey && !e.altKey && editor.options.get('table_tab_navigation') !== false) {
      const cell = getCell(editor.selection.getStart(), editor.getBody());
      if (cell && !editor.dom.getParent(editor.selection.getStart(), 'li', cell)) {
        e.preventDefault();
        if (Actions.navigateCell(editor, !e.shiftKey)) {
          editor.nodeChanged();
        }
      }
    }
  });

  setupCellSelection(editor);
  setupColumnResize(editor);

  // ---- UI ----
  type Setup = (api: { setEnabled: (s: boolean) => void }) => () => void;
  const setupInTable: Setup = (api) => {
    const update = () => api.setEnabled(!editor.readonly && inTable());
    editor.on('NodeChange SwitchMode TableSelectionChange TableSelectionClear', update);
    update();
    return () => editor.off('NodeChange SwitchMode TableSelectionChange TableSelectionClear', update);
  };
  const setupInCell: Setup = (api) => {
    const update = () => api.setEnabled(!editor.readonly && inCell());
    editor.on('NodeChange SwitchMode TableSelectionChange TableSelectionClear', update);
    update();
    return () => editor.off('NodeChange SwitchMode TableSelectionChange TableSelectionClear', update);
  };
  const cmdButton = (name: string, icon: string, tooltip: string, cmd: string, setup: Setup = setupInCell) => {
    editor.ui.registry.addButton(name, { icon, tooltip, onAction: () => editor.execCommand(cmd), onSetup: setup });
    editor.ui.registry.addMenuItem(name, { icon, text: tooltip, onAction: () => editor.execCommand(cmd), onSetup: setup as any });
  };

  cmdButton('tableprops', 'table', 'Table properties', 'mceTableProps', setupInTable);
  cmdButton('tabledelete', 'table-delete-table', 'Delete table', 'mceTableDelete', setupInTable);
  cmdButton('tablecellprops', 'table-cell-properties', 'Cell properties', 'mceTableCellProps');
  cmdButton('tablemergecells', 'table-merge-cells', 'Merge cells', 'mceTableMergeCells');
  cmdButton('tablesplitcells', 'table-split-cells', 'Split cell', 'mceTableSplitCells');
  cmdButton('tableinsertrowbefore', 'table-insert-row-above', 'Insert row before', 'mceTableInsertRowBefore');
  cmdButton('tableinsertrowafter', 'table-insert-row-after', 'Insert row after', 'mceTableInsertRowAfter');
  cmdButton('tabledeleterow', 'table-delete-row', 'Delete row', 'mceTableDeleteRow');
  cmdButton('tablerowprops', 'table-row-properties', 'Row properties', 'mceTableRowProps');
  cmdButton('tablecutrow', 'cut-row', 'Cut row', 'mceTableCutRow');
  cmdButton('tablecopyrow', 'duplicate-row', 'Copy row', 'mceTableCopyRow');
  cmdButton('tablepasterowbefore', 'paste-row-before', 'Paste row before', 'mceTablePasteRowBefore');
  cmdButton('tablepasterowafter', 'paste-row-after', 'Paste row after', 'mceTablePasteRowAfter');
  cmdButton('tableinsertcolbefore', 'table-insert-column-before', 'Insert column before', 'mceTableInsertColBefore');
  cmdButton('tableinsertcolafter', 'table-insert-column-after', 'Insert column after', 'mceTableInsertColAfter');
  cmdButton('tabledeletecol', 'table-delete-column', 'Delete column', 'mceTableDeleteCol');
  cmdButton('tableinsertdialog', 'table', 'Insert table', 'mceInsertTableDialog', (api) => {
    api.setEnabled(!editor.readonly);
    return () => {};
  });
  editor.ui.registry.addMenuItem('inserttabledialog', { icon: 'table', text: 'Insert table', onAction: () => openInsertDialog(editor) });
  editor.ui.registry.addMenuItem('deletetable', { icon: 'table-delete-table', text: 'Delete table', onAction: () => editor.execCommand('mceTableDelete'), onSetup: setupInTable as any });

  editor.ui.registry.addToggleButton('tablecaption', {
    icon: 'table-caption',
    tooltip: 'Table caption',
    onAction: () => editor.execCommand('mceTableToggleCaption'),
    onSetup: (api) => {
      const update = () => {
        const table = Actions.getCurrentTable(editor);
        api.setEnabled(!!table && !editor.readonly);
        api.setActive(!!table && !!table.querySelector('caption'));
      };
      editor.on('NodeChange SwitchMode TableModified', update);
      update();
      return () => editor.off('NodeChange SwitchMode TableModified', update);
    },
  });
  editor.ui.registry.addToggleButton('tablerowheader', {
    icon: 'table-top-header',
    tooltip: 'Row header',
    onAction: () => editor.execCommand('mceTableRowType', false, { type: Actions.isHeaderRow(editor) ? 'body' : 'header' }),
    onSetup: (api) => {
      const update = () => {
        api.setEnabled(!editor.readonly && inCell());
        api.setActive(inCell() && Actions.isHeaderRow(editor));
      };
      editor.on('NodeChange SwitchMode TableModified', update);
      update();
      return () => editor.off('NodeChange SwitchMode TableModified', update);
    },
  });
  editor.ui.registry.addToggleButton('tablecolheader', {
    icon: 'table-left-header',
    tooltip: 'Column header',
    onAction: () => editor.execCommand('mceTableColType', false, { type: Actions.isHeaderColumn(editor) ? 'td' : 'th' }),
    onSetup: (api) => {
      const update = () => {
        api.setEnabled(!editor.readonly && inCell());
        api.setActive(inCell() && Actions.isHeaderColumn(editor));
      };
      editor.on('NodeChange SwitchMode TableModified', update);
      update();
      return () => editor.off('NodeChange SwitchMode TableModified', update);
    },
  });

  const cellStyleMenu = (name: string, icon: string, tooltip: string, style: string, items: Array<{ title: string; value: string }>) => {
    editor.ui.registry.addMenuButton(name, {
      icon,
      tooltip,
      fetch: (callback) => {
        const cells = Actions.getSelectedCells(editor);
        const current = cells.length ? editor.dom.getStyle(cells[0], style) || '' : '';
        callback(items.map((i) => ({ type: 'togglemenuitem', text: i.title, active: current === i.value, onAction: () => editor.execCommand('mceTableApplyCellStyle', false, { [style]: i.value }) }) as MenuItemAnySpec));
      },
      onSetup: setupInCell as any,
    });
  };
  cellStyleMenu('tablecellvalign', 'vertical-align', 'Vertical align', 'vertical-align', [{ title: 'None', value: '' }, { title: 'Top', value: 'top' }, { title: 'Middle', value: 'middle' }, { title: 'Bottom', value: 'bottom' }]);
  cellStyleMenu('tablecellborderwidth', 'border-width', 'Border width', 'border-width', editor.options.get('table_border_widths') as Array<{ title: string; value: string }>);
  cellStyleMenu('tablecellborderstyle', 'border-style', 'Border style', 'border-style', editor.options.get('table_border_styles') as Array<{ title: string; value: string }>);

  const colorMenu = (name: string, icon: string, tooltip: string, style: string, mapOption: string) => {
    editor.ui.registry.addMenuButton(name, {
      icon,
      tooltip,
      fetch: (callback) => {
        const map = (editor.options.get(mapOption) as string[] | undefined) ?? (editor.options.get('color_map') as string[] | undefined) ?? [];
        callback([{ type: 'fancymenuitem', fancytype: 'colorswatch', initData: { format: 'forecolor', colors: map }, onAction: (data: any) => editor.execCommand('mceTableApplyCellStyle', false, { [style]: data.value === 'remove' ? '' : data.value }) }] as MenuItemAnySpec[]);
      },
      onSetup: setupInCell as any,
    });
  };
  colorMenu('tablecellbackgroundcolor', 'cell-background-color', 'Background color', 'background-color', 'table_background_color_map');
  colorMenu('tablecellbordercolor', 'cell-border-color', 'Border color', 'border-color', 'table_border_color_map');

  const classMenu = (name: string, tooltip: string, option: string, cmd: string, target: () => Element | null) => {
    const list = editor.options.get(option) as Array<{ title: string; value: string }>;
    if (!list || !list.length) {
      return;
    }
    editor.ui.registry.addMenuButton(name, {
      icon: name === 'tableclass' ? 'table-classes' : 'table-cell-classes',
      tooltip,
      fetch: (callback) => {
        const el = target();
        callback(list.map((i) => ({ type: 'togglemenuitem', text: i.title, active: !!el && el.classList.contains(i.value), onAction: () => editor.execCommand(cmd, false, i.value) }) as MenuItemAnySpec));
      },
      onSetup: setupInTable as any,
    });
  };
  classMenu('tableclass', 'Table styles', 'table_class_list', 'mceTableToggleClass', () => Actions.getCurrentTable(editor));
  classMenu('tablecellclass', 'Cell styles', 'table_cell_class_list', 'mceTableCellToggleClass', () => Actions.getSelectedCells(editor)[0] ?? null);

  // Main table button: insert grid plus table operations.
  const tableMenuItems = (): MenuItemAnySpec[] => {
    const items: MenuItemAnySpec[] = [];
    if (editor.options.get('table_grid') !== false) {
      items.push({ type: 'fancymenuitem', fancytype: 'inserttable', onAction: (data: any) => editor.execCommand('mceInsertTable', false, { rows: data.numRows, columns: data.numColumns }) });
    } else {
      items.push({ type: 'menuitem', text: 'Insert table', icon: 'table', onAction: () => openInsertDialog(editor) });
    }
    if (inTable()) {
      items.push({ type: 'separator' });
      items.push({ type: 'nestedmenuitem', text: 'Cell', icon: 'table-cell-properties', getSubmenuItems: () => 'tablecellprops tablemergecells tablesplitcells' });
      items.push({ type: 'nestedmenuitem', text: 'Row', icon: 'table-row-properties', getSubmenuItems: () => 'tableinsertrowbefore tableinsertrowafter tabledeleterow tablerowprops | tablecutrow tablecopyrow tablepasterowbefore tablepasterowafter' });
      items.push({ type: 'nestedmenuitem', text: 'Column', icon: 'table-insert-column-after', getSubmenuItems: () => 'tableinsertcolbefore tableinsertcolafter tabledeletecol' });
      items.push({ type: 'separator' });
      items.push({ type: 'menuitem', text: 'Table properties', icon: 'table', onAction: () => editor.execCommand('mceTableProps') });
      items.push({ type: 'menuitem', text: 'Delete table', icon: 'table-delete-table', onAction: () => editor.execCommand('mceTableDelete') });
    }
    return items;
  };
  editor.ui.registry.addMenuButton('table', { icon: 'table', tooltip: 'Table', fetch: (callback) => callback(tableMenuItems()) });
  editor.ui.registry.addNestedMenuItem('inserttable', { text: 'Table', icon: 'table', getSubmenuItems: () => [{ type: 'fancymenuitem', fancytype: 'inserttable', onAction: (data: any) => editor.execCommand('mceInsertTable', false, { rows: data.numRows, columns: data.numColumns }) }] as MenuItemAnySpec[] });
  editor.ui.registry.addNestedMenuItem('cell', { text: 'Cell', icon: 'table-cell-properties', getSubmenuItems: () => 'tablecellprops tablemergecells tablesplitcells' });
  editor.ui.registry.addNestedMenuItem('row', { text: 'Row', icon: 'table-row-properties', getSubmenuItems: () => 'tableinsertrowbefore tableinsertrowafter tabledeleterow tablerowprops | tablecutrow tablecopyrow tablepasterowbefore tablepasterowafter' });
  editor.ui.registry.addNestedMenuItem('column', { text: 'Column', icon: 'table-insert-column-after', getSubmenuItems: () => 'tableinsertcolbefore tableinsertcolafter tabledeletecol' });

  editor.ui.registry.addContextToolbar('table', {
    predicate: (node) => !!getTable(node, editor.getBody()) && node.nodeName !== 'TABLE' ? false : node.nodeName === 'TABLE',
    items: editor.options.get('table_toolbar') as string,
    position: 'node',
    scope: 'node',
  });
  editor.ui.registry.addContextMenu('table', {
    update: (node) => (getTable(node, editor.getBody()) ? 'cell row column | tableprops deletetable' : 'inserttable'),
  });

  return {
    insertTable: (rows: number, columns: number, options?: any) => insertTable(editor, rows, columns, options),
    getSelectedCells: () => Actions.getSelectedCells(editor),
    getGrid: () => {
      const t = Actions.getCurrentTable(editor);
      return t ? buildGrid(t) : null;
    },
  };
};

PluginManager.add('table', register);
export default register;
