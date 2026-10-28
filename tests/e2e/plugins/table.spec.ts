import { test, expect } from '@playwright/test';
import { openHarness, initEditor, getContent, setContent, setCaret, editorFrame } from '../helpers';

const exec = (page: any, cmd: string, value?: any) => page.evaluate(({ cmd, value }: any) => (window as any).kHtmlEditor.activeEditor.execCommand(cmd, false, value), { cmd, value });
const selectCells = (page: any, s1: string, s2: string) =>
  page.evaluate(
    ({ s1, s2 }: any) => {
      const ed = (window as any).kHtmlEditor.activeEditor;
      ed.getBody().querySelectorAll('[data-mce-selected]').forEach((c: Element) => c.removeAttribute('data-mce-selected'));
      ed.getBody().querySelector(s1).setAttribute('data-mce-selected', '1');
      ed.getBody().querySelector(s2).setAttribute('data-mce-selected', '1');
      ed.focus();
      ed.selection.setCursorLocation(ed.getBody().querySelector(s2), 0);
    },
    { s1, s2 },
  );

const simple = (cells: string[][]) => '<table>\n<tbody>\n' + cells.map((row) => '<tr>\n' + row.map((c) => `<td>${c}</td>`).join('\n') + '\n</tr>').join('\n') + '\n</tbody>\n</table>';

test.describe('table plugin', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page);
    await initEditor(page, { plugins: 'table', toolbar: 'table', menubar: false });
  });

  test('inserts a table with colgroup and places the caret in the first cell', async ({ page }) => {
    await setContent(page, '<p>a</p>');
    await setCaret(page, 'p', 1);
    await exec(page, 'mceInsertTable', { rows: 2, columns: 2 });
    expect(await getContent(page)).toBe(
      '<p>a</p>\n<table style="border-collapse: collapse; width: 100%;" border="1"><colgroup><col style="width: 50%;"><col style="width: 50%;"></colgroup>\n<tbody>\n<tr>\n<td>&nbsp;</td>\n<td>&nbsp;</td>\n</tr>\n<tr>\n<td>&nbsp;</td>\n<td>&nbsp;</td>\n</tr>\n</tbody>\n</table>',
    );
    await page.keyboard.type('x');
    expect(await getContent(page)).toContain('<td>x</td>\n<td>&nbsp;</td>');
  });

  test('inserts and deletes rows and columns', async ({ page }) => {
    await setContent(page, simple([['a', 'b'], ['c', 'd']]));
    await setCaret(page, 'td', 1);
    await exec(page, 'mceTableInsertRowAfter');
    expect(await getContent(page)).toBe(simple([['a', 'b'], ['&nbsp;', '&nbsp;'], ['c', 'd']]));
    await setCaret(page, 'td', 1);
    await exec(page, 'mceTableInsertColBefore');
    expect(await getContent(page)).toBe(simple([['&nbsp;', 'a', 'b'], ['&nbsp;', '&nbsp;', '&nbsp;'], ['&nbsp;', 'c', 'd']]));
    await setCaret(page, 'tr:nth-child(2) td:nth-child(2)', 0);
    await exec(page, 'mceTableDeleteRow');
    expect(await getContent(page)).toBe(simple([['&nbsp;', 'a', 'b'], ['&nbsp;', 'c', 'd']]));
    await setCaret(page, 'td', 0);
    await exec(page, 'mceTableDeleteCol');
    expect(await getContent(page)).toBe(simple([['a', 'b'], ['c', 'd']]));
  });

  test('merges and splits cells', async ({ page }) => {
    await setContent(page, simple([['a', 'b'], ['c', 'd']]));
    await selectCells(page, 'tr:nth-child(1) td:nth-child(1)', 'tr:nth-child(1) td:nth-child(2)');
    await exec(page, 'mceTableMergeCells');
    expect(await getContent(page)).toBe('<table>\n<tbody>\n<tr>\n<td colspan="2">a<br>b</td>\n</tr>\n<tr>\n<td>c</td>\n<td>d</td>\n</tr>\n</tbody>\n</table>');
    await setCaret(page, 'td', 0);
    await exec(page, 'mceTableSplitCells');
    expect(await getContent(page)).toBe(simple([['a<br>b', '&nbsp;'], ['c', 'd']]));
  });

  test('row header toggling moves rows into thead with th cells', async ({ page }) => {
    await setContent(page, simple([['a', 'b'], ['c', 'd']]));
    await setCaret(page, 'td', 0);
    await exec(page, 'mceTableRowType', { type: 'header' });
    expect(await getContent(page)).toBe('<table>\n<thead>\n<tr>\n<th scope="col">a</th>\n<th scope="col">b</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>c</td>\n<td>d</td>\n</tr>\n</tbody>\n</table>');
    expect(await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.queryCommandValue('mceTableRowType'))).toBe('header');
  });

  test('Tab navigates cells and adds a row at the end', async ({ page }) => {
    await setContent(page, simple([['a', 'b']]));
    await setCaret(page, 'td', 1);
    await page.keyboard.press('Tab');
    await page.keyboard.type('x');
    expect(await getContent(page)).toBe(simple([['a', 'xb']]));
    await page.keyboard.press('Tab');
    await page.keyboard.type('y');
    expect(await getContent(page)).toBe(simple([['a', 'xb'], ['y', '&nbsp;']]));
  });

  test('deleting the table leaves the caret in a paragraph', async ({ page }) => {
    await setContent(page, '<p>before</p>' + simple([['a']]));
    await setCaret(page, 'td', 0);
    await exec(page, 'mceTableDelete');
    expect(await getContent(page)).toBe('<p>before</p>');
  });

  test('table menu button opens the grid picker and inserts', async ({ page }) => {
    await setContent(page, '<p>a</p>');
    await setCaret(page, 'p', 1);
    await page.locator('#editor_parent [data-khe-name="table"]').click();
    const cell = page.locator('.khe-popup .khe-grid-picker__cell[data-r="2"][data-c="3"]');
    await cell.hover();
    await expect(page.locator('.khe-popup .khe-grid-picker__label')).toHaveText('3 × 2');
    await cell.click();
    const html = await getContent(page);
    expect(html).toContain('<colgroup><col style="width: 33.3333%;"><col style="width: 33.3333%;"><col style="width: 33.3333%;"></colgroup>');
    expect((html.match(/<tr>/g) || []).length).toBe(2);
  });

  test('context toolbar appears for tables and cell properties dialog applies styles', async ({ page }) => {
    await setContent(page, simple([['a', 'b']]));
    await setCaret(page, 'td', 0);
    await expect(page.locator('.khe-context-popup [data-khe-name="tableprops"]')).toBeVisible();
    await exec(page, 'mceTableCellProps');
    const dialog = page.locator('.khe-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="width"]').fill('100px');
    await dialog.locator('select[name="halign"]').selectOption('center');
    await dialog.locator('.khe-button--primary').click();
    expect(await getContent(page)).toBe('<table>\n<tbody>\n<tr>\n<td style="width: 100px; text-align: center;">a</td>\n<td>b</td>\n</tr>\n</tbody>\n</table>');
  });

  test('drag selection of cells marks a rectangle', async ({ page }) => {
    await setContent(page, simple([['a', 'b'], ['c', 'd']]));
    const frame = editorFrame(page);
    const first = frame.locator('td').first();
    const last = frame.locator('td').last();
    const b1 = await first.boundingBox();
    const b2 = await last.boundingBox();
    await page.mouse.move(b1!.x + 5, b1!.y + 5);
    await page.mouse.down();
    await page.mouse.move(b2!.x + 5, b2!.y + 5, { steps: 4 });
    await page.mouse.up();
    await expect(frame.locator('td[data-mce-selected]')).toHaveCount(4);
    await page.keyboard.press('Delete');
    expect(await getContent(page)).toBe(simple([['&nbsp;', '&nbsp;'], ['&nbsp;', '&nbsp;']]));
  });
});
