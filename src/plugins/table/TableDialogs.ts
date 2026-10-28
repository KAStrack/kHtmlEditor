import type { Editor } from '../../core/Editor';
import type { DialogSpec } from '../../core/WindowManager';
import { getCurrentTable, getSelectedCells } from './TableActions';
import { getRow } from './TableModel';

/** Insert table, table properties, row properties and cell properties dialogs. */

const classListItems = (editor: Editor, option: string): Array<{ text: string; value: string }> | null => {
  const list = editor.options.get(option) as Array<{ title: string; value: string }> | undefined;
  if (!list || !list.length) {
    return null;
  }
  return [{ text: 'None', value: '' }, ...list.map((i) => ({ text: i.title, value: i.value }))];
};

const px = (v: string): string => (v && /^\d+(\.\d+)?$/.test(v) ? v + 'px' : v);

export const openInsertDialog = (editor: Editor): void => {
  const spec: DialogSpec = {
    title: 'Table',
    body: {
      type: 'panel',
      items: [
        { type: 'grid', columns: 2, items: [{ type: 'input', name: 'cols', label: 'Columns', inputMode: 'numeric' }, { type: 'input', name: 'rows', label: 'Rows', inputMode: 'numeric' }] },
      ],
    },
    initialData: { cols: '2', rows: '2' },
    buttons: [
      { type: 'cancel', name: 'cancel', text: 'Cancel' },
      { type: 'submit', name: 'save', text: 'Save', primary: true },
    ],
    onSubmit: (api) => {
      const data = api.getData() as { cols: string; rows: string };
      const cols = Math.max(1, parseInt(data.cols, 10) || 1);
      const rows = Math.max(1, parseInt(data.rows, 10) || 1);
      api.close();
      editor.execCommand('mceInsertTable', false, { rows, columns: cols });
    },
  };
  editor.windowManager.open(spec);
};

const generalItems = (editor: Editor, kind: 'table' | 'row' | 'cell'): any[] => {
  const items: any[] = [];
  if (kind === 'table') {
    items.push({ type: 'grid', columns: 2, items: [{ type: 'input', name: 'width', label: 'Width' }, { type: 'input', name: 'height', label: 'Height' }] });
    const appearance = editor.options.get('table_appearance_options') !== false;
    if (appearance) {
      items.push({ type: 'grid', columns: 2, items: [{ type: 'input', name: 'cellspacing', label: 'Cell spacing' }, { type: 'input', name: 'cellpadding', label: 'Cell padding' }] });
      items.push({ type: 'grid', columns: 2, items: [{ type: 'input', name: 'border', label: 'Border width' }, { type: 'checkbox', name: 'caption', label: 'Show caption' }] });
    }
    items.push({ type: 'listbox', name: 'align', label: 'Alignment', items: [{ text: 'None', value: '' }, { text: 'Left', value: 'left' }, { text: 'Center', value: 'center' }, { text: 'Right', value: 'right' }] });
    const classes = classListItems(editor, 'table_class_list');
    if (classes) {
      items.push({ type: 'listbox', name: 'class', label: 'Class', items: classes });
    }
  } else if (kind === 'row') {
    items.push({ type: 'listbox', name: 'type', label: 'Row type', items: [{ text: 'Header', value: 'thead' }, { text: 'Body', value: 'tbody' }, { text: 'Footer', value: 'tfoot' }] });
    items.push({ type: 'listbox', name: 'align', label: 'Alignment', items: [{ text: 'None', value: '' }, { text: 'Left', value: 'left' }, { text: 'Center', value: 'center' }, { text: 'Right', value: 'right' }] });
    items.push({ type: 'input', name: 'height', label: 'Height' });
    const classes = classListItems(editor, 'table_row_class_list');
    if (classes) {
      items.push({ type: 'listbox', name: 'class', label: 'Class', items: classes });
    }
  } else {
    items.push({ type: 'grid', columns: 2, items: [{ type: 'input', name: 'width', label: 'Width' }, { type: 'input', name: 'height', label: 'Height' }] });
    items.push({ type: 'listbox', name: 'celltype', label: 'Cell type', items: [{ text: 'Cell', value: 'td' }, { text: 'Header cell', value: 'th' }] });
    items.push({ type: 'listbox', name: 'scope', label: 'Scope', items: [{ text: 'None', value: '' }, { text: 'Row', value: 'row' }, { text: 'Column', value: 'col' }, { text: 'Row group', value: 'rowgroup' }, { text: 'Column group', value: 'colgroup' }] });
    items.push({ type: 'grid', columns: 2, items: [{ type: 'listbox', name: 'halign', label: 'Horizontal align', items: [{ text: 'None', value: '' }, { text: 'Left', value: 'left' }, { text: 'Center', value: 'center' }, { text: 'Right', value: 'right' }] }, { type: 'listbox', name: 'valign', label: 'Vertical align', items: [{ text: 'None', value: '' }, { text: 'Top', value: 'top' }, { text: 'Middle', value: 'middle' }, { text: 'Bottom', value: 'bottom' }] }] });
    const classes = classListItems(editor, 'table_cell_class_list');
    if (classes) {
      items.push({ type: 'listbox', name: 'class', label: 'Class', items: classes });
    }
  }
  return items;
};

const advancedItems = (): any[] => [
  { type: 'input', name: 'borderstyle', label: 'Border style' },
  { type: 'colorinput', name: 'bordercolor', label: 'Border color' },
  { type: 'colorinput', name: 'backgroundcolor', label: 'Background color' },
];

const buildBody = (editor: Editor, kind: 'table' | 'row' | 'cell'): DialogSpec['body'] => {
  const advOption = kind === 'table' ? 'table_advtab' : kind === 'row' ? 'table_row_advtab' : 'table_cell_advtab';
  const showAdvanced = editor.options.get(advOption) !== false;
  if (showAdvanced) {
    return {
      type: 'tabpanel',
      tabs: [
        { name: 'general', title: 'General', items: generalItems(editor, kind) },
        { name: 'advanced', title: 'Advanced', items: advancedItems() },
      ],
    };
  }
  return { type: 'panel', items: generalItems(editor, kind) };
};

const styleOf = (editor: Editor, el: Element, name: string): string => editor.dom.getStyle(el, name) || '';

export const openTableProps = (editor: Editor): void => {
  const table = getCurrentTable(editor);
  if (!table) {
    return;
  }
  const dom = editor.dom;
  const caption = table.querySelector('caption');
  const data = {
    width: styleOf(editor, table, 'width') || table.getAttribute('width') || '',
    height: styleOf(editor, table, 'height') || table.getAttribute('height') || '',
    cellspacing: styleOf(editor, table, 'border-spacing') || table.getAttribute('cellspacing') || '',
    cellpadding: table.getAttribute('cellpadding') || '',
    border: table.getAttribute('border') || styleOf(editor, table, 'border-width') || '',
    caption: !!caption,
    align: styleOf(editor, table, 'margin-left') === 'auto' && styleOf(editor, table, 'margin-right') === 'auto' ? 'center' : styleOf(editor, table, 'float') || '',
    class: table.getAttribute('class') || '',
    borderstyle: styleOf(editor, table, 'border-style'),
    bordercolor: styleOf(editor, table, 'border-color'),
    backgroundcolor: styleOf(editor, table, 'background-color'),
  };
  editor.windowManager.open({
    title: 'Table Properties',
    size: 'normal',
    body: buildBody(editor, 'table'),
    initialData: data,
    buttons: [
      { type: 'cancel', name: 'cancel', text: 'Cancel' },
      { type: 'submit', name: 'save', text: 'Save', primary: true },
    ],
    onSubmit: (api) => {
      const d = api.getData() as typeof data;
      editor.undoManager.transact(() => {
        dom.setStyles(table, { width: px(d.width), height: px(d.height), 'border-spacing': px(d.cellspacing), 'border-style': d.borderstyle, 'border-color': d.bordercolor, 'background-color': d.backgroundcolor });
        if (d.border) {
          table.setAttribute('border', d.border);
          if (editor.options.get('table_style_by_css')) {
            dom.setStyle(table, 'border-width', px(d.border));
          }
        } else {
          table.removeAttribute('border');
          dom.setStyle(table, 'border-width', '');
        }
        if (d.cellpadding) {
          table.setAttribute('cellpadding', d.cellpadding);
        } else {
          table.removeAttribute('cellpadding');
        }
        dom.setStyles(table, { float: '', 'margin-left': '', 'margin-right': '' });
        if (d.align === 'center') {
          dom.setStyles(table, { 'margin-left': 'auto', 'margin-right': 'auto' });
        } else if (d.align) {
          dom.setStyle(table, 'float', d.align);
        }
        if (d.class !== undefined) {
          dom.setAttrib(table, 'class', d.class || null);
        }
        const existing = table.querySelector('caption');
        if (d.caption && !existing) {
          const cap = dom.create('caption');
          cap.innerHTML = '<br data-mce-bogus="1">';
          table.insertBefore(cap, table.firstChild);
        } else if (!d.caption && existing) {
          existing.remove();
        }
        if (!table.getAttribute('style')) {
          table.removeAttribute('style');
          table.removeAttribute('data-mce-style');
        }
      });
      editor.dispatch('TableModified', { table, structure: false, style: true });
      api.close();
    },
  });
};

export const openRowProps = (editor: Editor): void => {
  const cells = getSelectedCells(editor);
  if (cells.length === 0) {
    return;
  }
  const rows = Array.from(new Set(cells.map((c) => getRow(c, editor.getBody())).filter((r): r is HTMLTableRowElement => !!r)));
  const first = rows[0];
  const dom = editor.dom;
  const data = {
    type: first.parentElement?.nodeName.toLowerCase() || 'tbody',
    align: styleOf(editor, first, 'text-align'),
    height: styleOf(editor, first, 'height') || first.getAttribute('height') || '',
    class: first.getAttribute('class') || '',
    borderstyle: styleOf(editor, first, 'border-style'),
    bordercolor: styleOf(editor, first, 'border-color'),
    backgroundcolor: styleOf(editor, first, 'background-color'),
  };
  editor.windowManager.open({
    title: 'Row Properties',
    body: buildBody(editor, 'row'),
    initialData: data,
    buttons: [
      { type: 'cancel', name: 'cancel', text: 'Cancel' },
      { type: 'submit', name: 'save', text: 'Save', primary: true },
    ],
    onSubmit: (api) => {
      const d = api.getData() as typeof data;
      editor.undoManager.transact(() => {
        rows.forEach((row) => {
          dom.setStyles(row, { 'text-align': d.align, height: px(d.height), 'border-style': d.borderstyle, 'border-color': d.bordercolor, 'background-color': d.backgroundcolor });
          dom.setAttrib(row, 'class', d.class || null);
          const table = row.closest('table');
          if (table && d.type && row.parentElement?.nodeName.toLowerCase() !== d.type) {
            let section = table.querySelector(d.type) as HTMLElement | null;
            if (!section) {
              section = dom.create(d.type);
              if (d.type === 'thead') {
                table.insertBefore(section, table.querySelector('tbody,tfoot'));
              } else {
                table.appendChild(section);
              }
            }
            const oldSection = row.parentElement;
            section.appendChild(row);
            if (oldSection && oldSection.nodeName !== 'TABLE' && !oldSection.querySelector('tr')) {
              oldSection.remove();
            }
          }
          if (!row.getAttribute('style')) {
            row.removeAttribute('style');
            row.removeAttribute('data-mce-style');
          }
        });
      });
      editor.dispatch('TableModified', { table: getCurrentTable(editor), structure: true, style: true });
      api.close();
    },
  });
};

export const openCellProps = (editor: Editor): void => {
  const cells = getSelectedCells(editor);
  if (cells.length === 0) {
    return;
  }
  const first = cells[0];
  const dom = editor.dom;
  const data = {
    width: styleOf(editor, first, 'width') || first.getAttribute('width') || '',
    height: styleOf(editor, first, 'height') || first.getAttribute('height') || '',
    celltype: first.nodeName.toLowerCase(),
    scope: first.getAttribute('scope') || '',
    halign: styleOf(editor, first, 'text-align'),
    valign: styleOf(editor, first, 'vertical-align'),
    class: first.getAttribute('class') || '',
    borderstyle: styleOf(editor, first, 'border-style'),
    bordercolor: styleOf(editor, first, 'border-color'),
    backgroundcolor: styleOf(editor, first, 'background-color'),
  };
  editor.windowManager.open({
    title: 'Cell Properties',
    body: buildBody(editor, 'cell'),
    initialData: data,
    buttons: [
      { type: 'cancel', name: 'cancel', text: 'Cancel' },
      { type: 'submit', name: 'save', text: 'Save', primary: true },
    ],
    onSubmit: (api) => {
      const d = api.getData() as typeof data;
      editor.undoManager.transact(() => {
        cells.forEach((cellIn) => {
          let cell = cellIn;
          if (d.celltype && cell.nodeName.toLowerCase() !== d.celltype) {
            cell = dom.rename(cell, d.celltype) as HTMLTableCellElement;
          }
          dom.setStyles(cell, { width: px(d.width), height: px(d.height), 'text-align': d.halign, 'vertical-align': d.valign, 'border-style': d.borderstyle, 'border-color': d.bordercolor, 'background-color': d.backgroundcolor });
          dom.setAttrib(cell, 'scope', d.scope || null);
          dom.setAttrib(cell, 'class', d.class || null);
          if (!cell.getAttribute('style')) {
            cell.removeAttribute('style');
            cell.removeAttribute('data-mce-style');
          }
        });
      });
      editor.dispatch('TableModified', { table: getCurrentTable(editor), structure: false, style: true });
      api.close();
    },
  });
};
