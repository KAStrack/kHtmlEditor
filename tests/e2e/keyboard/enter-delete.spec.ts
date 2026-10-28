import { test, expect } from '@playwright/test';
import { openHarness, initEditor, getContent, setContent, setCaret, selectText, getBodyHtml, shortcutKey } from '../helpers';

test.describe('Enter and Delete keys', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page);
    await initEditor(page);
  });

  test('Enter in the middle of a paragraph splits it', async ({ page }) => {
    await setContent(page, '<p>Hello world</p>');
    await setCaret(page, 'p', 5);
    await page.keyboard.press('Enter');
    expect(await getContent(page)).toBe('<p>Hello</p>\n<p>world</p>');
    await page.keyboard.type('X');
    expect(await getContent(page)).toBe('<p>Hello</p>\n<p>Xworld</p>');
  });

  test('Enter at the end of a heading creates a paragraph', async ({ page }) => {
    await setContent(page, '<h1>Title</h1>');
    await setCaret(page, 'h1', 5);
    await page.keyboard.press('Enter');
    await page.keyboard.type('Body');
    expect(await getContent(page)).toBe('<h1>Title</h1>\n<p>Body</p>');
  });

  test('Enter at the start of a block inserts an empty block before', async ({ page }) => {
    await setContent(page, '<p>Hello</p>');
    await setCaret(page, 'p', 0);
    await page.keyboard.press('Enter');
    expect(await getContent(page)).toBe('<p>&nbsp;</p>\n<p>Hello</p>');
    await page.keyboard.type('X');
    expect(await getContent(page)).toBe('<p>&nbsp;</p>\n<p>XHello</p>');
  });

  test('Enter keeps inline formatting', async ({ page }) => {
    await setContent(page, '<p><strong>bold</strong></p>');
    await setCaret(page, 'strong', 4);
    await page.keyboard.press('Enter');
    await page.keyboard.type('more');
    expect(await getContent(page)).toBe('<p><strong>bold</strong></p>\n<p><strong>more</strong></p>');
  });

  test('Shift+Enter inserts a line break', async ({ page }) => {
    await setContent(page, '<p>ab</p>');
    await setCaret(page, 'p', 1);
    await page.keyboard.press('Shift+Enter');
    expect(await getContent(page)).toBe('<p>a<br>b</p>');
    await setCaret(page, 'p', 1, 1);
    await page.keyboard.press('Shift+Enter');
    expect(await getContent(page)).toBe('<p>a<br>b<br><br></p>');
  });

  test('Enter in pre inserts a line break', async ({ page }) => {
    await setContent(page, '<pre>code</pre>');
    await setCaret(page, 'pre', 4);
    await page.keyboard.press('Enter');
    await page.keyboard.type('x');
    expect(await getContent(page)).toBe('<pre>code<br>x</pre>');
  });

  test('Enter in a list item splits it and empty item leaves the list', async ({ page }) => {
    await setContent(page, '<ul><li>one</li></ul>');
    await setCaret(page, 'li', 3);
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    expect(await getContent(page)).toBe('<ul>\n<li>one</li>\n<li>two</li>\n</ul>');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('after');
    expect(await getContent(page)).toBe('<ul>\n<li>one</li>\n<li>two</li>\n</ul>\n<p>after</p>');
  });

  test('Enter in an empty blockquote paragraph exits the blockquote', async ({ page }) => {
    await setContent(page, '<blockquote><p>quote</p></blockquote>');
    await setCaret(page, 'p', 5);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('out');
    expect(await getContent(page)).toBe('<blockquote>\n<p>quote</p>\n</blockquote>\n<p>out</p>');
  });

  test('Enter in a table cell creates paragraphs inside the cell', async ({ page }) => {
    await setContent(page, '<table><tbody><tr><td>ab</td></tr></tbody></table>');
    await setCaret(page, 'td', 1);
    await page.keyboard.press('Enter');
    expect(await getContent(page)).toBe('<table>\n<tbody>\n<tr>\n<td>\n<p>a</p>\n<p>b</p>\n</td>\n</tr>\n</tbody>\n</table>');
  });

  test('Backspace at the start of a paragraph merges with the previous one', async ({ page }) => {
    await setContent(page, '<p>one</p><p>two</p>');
    await setCaret(page, 'p:nth-child(2)', 0);
    await page.keyboard.press('Backspace');
    expect(await getContent(page)).toBe('<p>onetwo</p>');
    await page.keyboard.type('|');
    expect(await getContent(page)).toBe('<p>one|two</p>');
  });

  test('Backspace in an empty paragraph removes it', async ({ page }) => {
    await setContent(page, '<p>one</p><p></p>');
    await setCaret(page, 'p:nth-child(2)', 0);
    await page.keyboard.press('Backspace');
    expect(await getContent(page)).toBe('<p>one</p>');
    await page.keyboard.type('!');
    expect(await getContent(page)).toBe('<p>one!</p>');
  });

  test('Delete at the end of a paragraph merges the next one', async ({ page }) => {
    await setContent(page, '<p>one</p><p>two</p>');
    await setCaret(page, 'p', 3);
    await page.keyboard.press('Delete');
    expect(await getContent(page)).toBe('<p>onetwo</p>');
  });

  test('Backspace at the start of a list item merges into the previous item', async ({ page }) => {
    await setContent(page, '<ul><li>one</li><li>two</li></ul>');
    await setCaret(page, 'li:nth-child(2)', 0);
    await page.keyboard.press('Backspace');
    expect(await getContent(page)).toBe('<ul>\n<li>onetwo</li>\n</ul>');
  });

  test('Backspace at the start of the first list item converts it to a paragraph', async ({ page }) => {
    await setContent(page, '<ul><li>one</li><li>two</li></ul>');
    await setCaret(page, 'li', 0);
    await page.keyboard.press('Backspace');
    expect(await getContent(page)).toBe('<p>one</p>\n<ul>\n<li>two</li>\n</ul>');
  });

  test('Backspace after a table moves into the last cell instead of merging', async ({ page }) => {
    await setContent(page, '<table><tbody><tr><td>cell</td></tr></tbody></table><p>after</p>');
    await setCaret(page, 'p', 0);
    await page.keyboard.press('Backspace');
    expect(await getContent(page)).toBe('<table>\n<tbody>\n<tr>\n<td>cell</td>\n</tr>\n</tbody>\n</table>\n<p>after</p>');
    await page.keyboard.type('!');
    expect(await getContent(page)).toBe('<table>\n<tbody>\n<tr>\n<td>cell!</td>\n</tr>\n</tbody>\n</table>\n<p>after</p>');
  });

  test('deleting a selection that spans blocks merges them', async ({ page }) => {
    await setContent(page, '<p>one two</p><h2>three four</h2>');
    await page.evaluate(() => {
      const ed = (window as any).kHtmlEditor.activeEditor;
      const p = ed.getBody().querySelector('p').firstChild;
      const h = ed.getBody().querySelector('h2').firstChild;
      const rng = ed.getDoc().createRange();
      rng.setStart(p, 4);
      rng.setEnd(h, 6);
      ed.focus();
      ed.selection.setRng(rng);
    });
    await page.keyboard.press('Backspace');
    expect(await getContent(page)).toBe('<p>one four</p>');
  });

  test('select all and delete leaves a padded paragraph', async ({ page }) => {
    await setContent(page, '<p>one</p><p>two</p>');
    await setCaret(page, 'p', 0);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    expect(await getBodyHtml(page)).toBe('<p><br data-mce-bogus="1"></p>');
    await page.keyboard.type('new');
    expect(await getContent(page)).toBe('<p>new</p>');
  });

  test('typing coalesces into a single undo level and Enter closes it', async ({ page }) => {
    await setContent(page, '<p>a</p>');
    await setCaret(page, 'p', 1);
    await page.keyboard.type('bcd');
    await page.keyboard.press('Enter');
    await page.keyboard.type('ef');
    expect(await getContent(page)).toBe('<p>abcd</p>\n<p>ef</p>');
    await page.keyboard.press(`${await shortcutKey(page)}+z`);
    expect(await getContent(page)).toBe('<p>abcd</p>\n<p>&nbsp;</p>');
    await page.keyboard.press(`${await shortcutKey(page)}+z`);
    expect(await getContent(page)).toBe('<p>abcd</p>');
    await page.keyboard.press(`${await shortcutKey(page)}+z`);
    expect(await getContent(page)).toBe('<p>a</p>');
  });

  test('typing over a selection replaces it', async ({ page }) => {
    await setContent(page, '<p>hello world</p>');
    await selectText(page, 'p', 0, 5);
    await page.keyboard.type('bye');
    expect(await getContent(page)).toBe('<p>bye world</p>');
  });
});
