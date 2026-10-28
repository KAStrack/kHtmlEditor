import { test, expect } from '@playwright/test';
import { openHarness, initEditor, getContent, setContent, setCaret, selectText } from '../helpers';

const exec = (page: any, cmd: string, value?: any) => page.evaluate(({ cmd, value }: any) => (window as any).kHtmlEditor.activeEditor.execCommand(cmd, false, value), { cmd, value });
const state = (page: any, cmd: string) => page.evaluate((c: string) => (window as any).kHtmlEditor.activeEditor.queryCommandState(c), cmd);
const selectAcross = (page: any, s1: string, o1: number, s2: string, o2: number) =>
  page.evaluate(
    ({ s1, o1, s2, o2 }: any) => {
      const ed = (window as any).kHtmlEditor.activeEditor;
      const a = ed.getBody().querySelector(s1);
      const b = ed.getBody().querySelector(s2);
      const ta = ed.getDoc().createTreeWalker(a, 4).nextNode();
      const tb = ed.getDoc().createTreeWalker(b, 4).nextNode();
      const rng = ed.getDoc().createRange();
      rng.setStart(ta, o1);
      rng.setEnd(tb, o2);
      ed.focus();
      ed.selection.setRng(rng);
    },
    { s1, o1, s2, o2 },
  );

test.describe('lists plugin', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page);
    await initEditor(page, { plugins: 'lists advlist', toolbar: 'bullist numlist', menubar: false });
  });

  test('toggles a paragraph into a bullet list and back', async ({ page }) => {
    await setContent(page, '<p>one</p>');
    await setCaret(page, 'p', 1);
    await exec(page, 'InsertUnorderedList');
    expect(await getContent(page)).toBe('<ul>\n<li>one</li>\n</ul>');
    expect(await state(page, 'InsertUnorderedList')).toBe(true);
    await exec(page, 'InsertUnorderedList');
    expect(await getContent(page)).toBe('<p>one</p>');
  });

  test('multiple paragraphs become one list and switch type', async ({ page }) => {
    await setContent(page, '<p>a</p><p>b</p><p>c</p>');
    await selectAcross(page, 'p', 0, 'p:nth-child(3)', 1);
    await exec(page, 'InsertOrderedList');
    expect(await getContent(page)).toBe('<ol>\n<li>a</li>\n<li>b</li>\n<li>c</li>\n</ol>');
    await selectAcross(page, 'li', 0, 'li:nth-child(3)', 1);
    await exec(page, 'InsertUnorderedList');
    expect(await getContent(page)).toBe('<ul>\n<li>a</li>\n<li>b</li>\n<li>c</li>\n</ul>');
    expect(await state(page, 'InsertUnorderedList')).toBe(true);
  });

  test('indent and outdent nest items', async ({ page }) => {
    await setContent(page, '<ul><li>a</li><li>b</li><li>c</li></ul>');
    await setCaret(page, 'li:nth-child(2)', 1);
    await exec(page, 'Indent');
    expect(await getContent(page)).toBe('<ul>\n<li>a<ul>\n<li>b</li>\n</ul></li>\n<li>c</li>\n</ul>');
    await page.keyboard.press('Tab');
    expect(await getContent(page)).toBe('<ul>\n<li>a<ul>\n<li>b</li>\n</ul></li>\n<li>c</li>\n</ul>');
    await page.keyboard.press('Shift+Tab');
    expect(await getContent(page)).toBe('<ul>\n<li>a</li>\n<li>b</li>\n<li>c</li>\n</ul>');
  });

  test('outdent of a top-level item removes it from the list', async ({ page }) => {
    await setContent(page, '<ul><li>a</li><li>b</li><li>c</li></ul>');
    await setCaret(page, 'li:nth-child(2)', 1);
    await exec(page, 'Outdent');
    expect(await getContent(page)).toBe('<ul>\n<li>a</li>\n</ul>\n<p>b</p>\n<ul>\n<li>c</li>\n</ul>');
  });

  test('removing a nested item keeps siblings nested', async ({ page }) => {
    await setContent(page, '<ul><li>a<ul><li>b</li><li>c</li></ul></li></ul>');
    await setCaret(page, 'li li', 1);
    await exec(page, 'Outdent');
    expect(await getContent(page)).toBe('<ul>\n<li>a</li>\n<li>b<ul>\n<li>c</li>\n</ul></li>\n</ul>');
  });

  test('list buttons reflect state and advlist styles apply', async ({ page }) => {
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    const bullist = page.locator('#editor_parent [data-khe-name="bullist"] .khe-tbtn').first();
    await bullist.click();
    expect(await getContent(page)).toBe('<ul>\n<li>x</li>\n</ul>');
    await expect(bullist).toHaveClass(/khe-tbtn--active/);
    await page.locator('#editor_parent [data-khe-name="bullist"] .khe-tbtn--chevron').click();
    await page.locator('.khe-popup .khe-menu__item[title="Square"]').click();
    expect(await getContent(page)).toBe('<ul style="list-style-type: square;">\n<li>x</li>\n</ul>');
  });

  test('list properties set the start attribute', async ({ page }) => {
    await setContent(page, '<ol><li>a</li></ol>');
    await setCaret(page, 'li', 1);
    await exec(page, 'mceListUpdate', { start: '5' });
    expect(await getContent(page)).toBe('<ol start="5">\n<li>a</li>\n</ol>');
  });

  test('typing patterns create lists and headings', async ({ page }) => {
    await setContent(page, '<p></p>');
    await setCaret(page, 'p', 0);
    await page.keyboard.type('* item');
    expect(await getContent(page)).toBe('<ul>\n<li>item</li>\n</ul>');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('# Title');
    expect(await getContent(page)).toBe('<ul>\n<li>item</li>\n</ul>\n<h1>Title</h1>');
    await page.keyboard.press('Enter');
    await page.keyboard.type('some **bold** text');
    expect(await getContent(page)).toBe('<ul>\n<li>item</li>\n</ul>\n<h1>Title</h1>\n<p>some <strong>bold</strong> text</p>');
  });
});
