import { test, expect, Page } from '@playwright/test';
import { openHarness, initEditor, getContent, setContent, setCaret, selectText, editorFrame } from '../helpers';

const dialog = (page: Page) => page.locator('.khe-dialog');
const save = (page: Page) => dialog(page).locator('.khe-button--primary').click();
const btn = (page: Page, name: string) => page.locator(`#editor_parent [data-khe-name="${name}"]`);

test.describe('content plugins', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page);
  });

  test('anchor: inserts a named anchor that is non-editable in the editor and clean on output', async ({ page }) => {
    await initEditor(page, { plugins: 'anchor', toolbar: 'anchor', menubar: false });
    await setContent(page, '<p>hello world</p>');
    await setCaret(page, 'p', 5);
    await btn(page, 'anchor').click();
    await dialog(page).locator('input[name="id"]').fill('bad id');
    await save(page);
    await expect(page.locator('.khe-dialog', { hasText: 'ID should start with a letter' })).toBeVisible();
    await page.locator('.khe-dialog', { hasText: 'ID should start with a letter' }).locator('.khe-button--primary').click();
    await dialog(page).locator('input[name="id"]').fill('top');
    await save(page);
    expect(await getContent(page)).toBe('<p>hello<a id="top"></a> world</p>');
    await expect(editorFrame(page).locator('a#top')).toHaveAttribute('contenteditable', 'false');
    // Selecting text wraps it.
    await setContent(page, '<p>hello world</p>');
    await selectText(page, 'p', 6, 11);
    await btn(page, 'anchor').click();
    await dialog(page).locator('input[name="id"]').fill('w');
    await save(page);
    expect(await getContent(page)).toBe('<p>hello <a id="w"></a>world</p>');
  });

  test('nonbreaking: inserts wrapped non-breaking spaces and Tab when forced', async ({ page }) => {
    await initEditor(page, { plugins: 'nonbreaking', toolbar: 'nonbreaking', menubar: false, nonbreaking_force_tab: 2 });
    await setContent(page, '<p>ab</p>');
    await setCaret(page, 'p', 1);
    await btn(page, 'nonbreaking').click();
    expect(await getContent(page)).toBe('<p>a<span class="mce-nbsp-wrap" contenteditable="false">&nbsp;</span>b</p>');
    await setContent(page, '<p>ab</p>');
    await setCaret(page, 'p', 1);
    await page.keyboard.press('Tab');
    expect(await getContent(page)).toBe('<p>a<span class="mce-nbsp-wrap" contenteditable="false">&nbsp;&nbsp;</span>b</p>');
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.remove());
    await initEditor(page, { plugins: 'nonbreaking', toolbar: 'nonbreaking', menubar: false, nonbreaking_wrap: false });
    await setContent(page, '<p>ab</p>');
    await setCaret(page, 'p', 1);
    await btn(page, 'nonbreaking').click();
    expect(await getContent(page)).toBe('<p>a&nbsp;b</p>');
  });

  test('pagebreak: placeholder in the editor, comment separator on output', async ({ page }) => {
    await initEditor(page, { plugins: 'pagebreak', toolbar: 'pagebreak', menubar: false });
    await setContent(page, '<p>one</p>');
    await setCaret(page, 'p', 3);
    await btn(page, 'pagebreak').click();
    expect(await getContent(page)).toBe('<p>one<!-- pagebreak --></p>');
    // A root-level separator is wrapped in the forced root block, as TinyMCE does.
    await setContent(page, '<p>a</p>\n<!-- pagebreak -->\n<p>b</p>');
    await expect(editorFrame(page).locator('img.mce-pagebreak')).toHaveCount(1);
    expect(await getContent(page)).toBe('<p>a</p>\n<p><!-- pagebreak --></p>\n<p>b</p>');
    await setContent(page, '<p>a</p>\n<p><!-- pagebreak --></p>\n<p>b</p>');
    expect(await getContent(page)).toBe('<p>a</p>\n<p><!-- pagebreak --></p>\n<p>b</p>');
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.remove());
    await initEditor(page, { plugins: 'pagebreak', toolbar: 'pagebreak', menubar: false, pagebreak_split_block: true, pagebreak_separator: '<div class="page-break"></div>' });
    await setContent(page, '<p>one</p>');
    await setCaret(page, 'p', 3);
    await btn(page, 'pagebreak').click();
    expect(await getContent(page)).toBe('<p>one</p>\n<p>\n<div class="page-break"></div>\n</p>');
  });

  test('directionality: rtl/ltr set and clear the dir attribute and reflect state', async ({ page }) => {
    await initEditor(page, { plugins: 'directionality', toolbar: 'ltr rtl', menubar: false });
    await setContent(page, '<p>text</p><ul><li>a<ul><li>b</li></ul></li></ul>');
    await setCaret(page, 'p', 1);
    await expect(btn(page, 'ltr')).toHaveClass(/khe-tbtn--active/);
    await btn(page, 'rtl').click();
    expect(await getContent(page)).toBe('<p dir="rtl">text</p>\n<ul>\n<li>a\n<ul>\n<li>b</li>\n</ul>\n</li>\n</ul>');
    await expect(btn(page, 'rtl')).toHaveClass(/khe-tbtn--active/);
    await btn(page, 'ltr').click();
    expect(await getContent(page)).toBe('<p>text</p>\n<ul>\n<li>a\n<ul>\n<li>b</li>\n</ul>\n</li>\n</ul>');
    await setCaret(page, 'li li', 0);
    await btn(page, 'rtl').click();
    expect(await getContent(page)).toBe('<p>text</p>\n<ul dir="rtl">\n<li>a\n<ul>\n<li>b</li>\n</ul>\n</li>\n</ul>');
  });

  test('insertdatetime: commands insert formatted dates, optionally as time elements', async ({ page }) => {
    await initEditor(page, { plugins: 'insertdatetime', toolbar: 'insertdatetime', menubar: false });
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.execCommand('mceInsertDate', false, '%Y-%m-%d'));
    expect(await getContent(page)).toMatch(/^<p>x\d{4}-\d{2}-\d{2}<\/p>$/);
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.execCommand('mceInsertTime', false, ' %H:%M'));
    expect(await getContent(page)).toMatch(/^<p>x\d{4}-\d{2}-\d{2} \d{2}:\d{2}<\/p>$/);
    // The split button's main action repeats the last used format.
    await btn(page, 'insertdatetime').locator('.khe-split__main, button').first().click();
    expect(await getContent(page)).toMatch(/^<p>x\d{4}-\d{2}-\d{2} \d{2}:\d{2} \d{2}:\d{2}<\/p>$/);
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.remove());
    await initEditor(page, { plugins: 'insertdatetime', toolbar: 'insertdatetime', menubar: false, insertdatetime_element: true });
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.execCommand('mceInsertDate', false, '%d %B %Y'));
    expect(await getContent(page)).toMatch(/^<p>x<time datetime="\d{4}-\d{2}-\d{2}">\d{2} [A-Z][a-z]+ \d{4}<\/time><\/p>$/);
  });

  test('visualblocks and visualchars toggle their aids without leaking into output', async ({ page }) => {
    await initEditor(page, { plugins: 'visualblocks visualchars', toolbar: 'visualblocks visualchars', menubar: false, visualchars_default_state: true });
    await setContent(page, '<p>a&nbsp;b</p>');
    const frame = editorFrame(page);
    await expect(frame.locator('span.mce-nbsp')).toHaveCount(1);
    expect(await getContent(page)).toBe('<p>a&nbsp;b</p>');
    await expect(btn(page, 'visualchars')).toHaveClass(/khe-tbtn--active/);
    await btn(page, 'visualchars').click();
    await expect(frame.locator('span.mce-nbsp')).toHaveCount(0);
    await btn(page, 'visualblocks').click();
    await expect(frame.locator('body')).toHaveClass(/mce-visualblocks/);
    expect(await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.queryCommandState('mceVisualBlocks'))).toBe(true);
    await btn(page, 'visualblocks').click();
    await expect(frame.locator('body')).not.toHaveClass(/mce-visualblocks/);
  });

  test('charmap: dialog search and insert, and the : autocompleter', async ({ page }) => {
    await initEditor(page, { plugins: 'charmap', toolbar: 'charmap', menubar: false, charmap_append: [[0x2665, 'black heart suit custom']] });
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await btn(page, 'charmap').click();
    await expect(dialog(page).locator('.khe-dialog__title')).toHaveText('Special Character');
    await expect(dialog(page).locator('.khe-tabs__tab', { hasText: 'User Defined' })).toBeVisible();
    await dialog(page).locator('input[name="search"]').fill('euro sign');
    await dialog(page).locator('input[name="search"]').dispatchEvent('input');
    await dialog(page).locator('.khe-collection__item[data-value="€"]').first().click();
    await expect(dialog(page)).toHaveCount(0);
    // entity_encoding 'named' writes the character as an entity, like TinyMCE.
    expect(await getContent(page)).toBe('<p>x&euro;</p>');
    await page.keyboard.type(' :copyri');
    const popup = page.locator('.khe-autocompleter-popup');
    await expect(popup).toBeVisible();
    await expect(popup.locator('.khe-autocompleter__item').first()).toHaveAttribute('data-value', '©');
    await page.keyboard.press('Enter');
    await expect(popup).toHaveCount(0);
    expect(await getContent(page)).toBe('<p>x&euro; &copy;</p>');
  });

  test('emoticons: dialog and autocompleter insert emoji', async ({ page }) => {
    await initEditor(page, { plugins: 'emoticons', toolbar: 'emoticons', menubar: false, emoticons_append: { kastrack: { keywords: ['custom'], char: '🧭', category: 'user' } } });
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await btn(page, 'emoticons').click();
    await expect(dialog(page).locator('.khe-dialog__title')).toHaveText('Emojis');
    await dialog(page).locator('input[name="search"]').fill('kastrack');
    await dialog(page).locator('input[name="search"]').dispatchEvent('input');
    await dialog(page).locator('.khe-collection__item[data-value="🧭"]').first().click();
    expect(await getContent(page)).toBe('<p>x🧭</p>');
    await page.keyboard.type(' :grinn');
    const popup = page.locator('.khe-autocompleter-popup');
    await expect(popup.locator('.khe-autocompleter__item').first()).toHaveAttribute('data-value', '😀');
    await popup.locator('.khe-autocompleter__item').first().click();
    expect(await getContent(page)).toBe('<p>x🧭 😀</p>');
  });

  test('codesample: dialog inserts a pre block that is non-editable in the editor and plain on output', async ({ page }) => {
    await initEditor(page, { plugins: 'codesample', toolbar: 'codesample', menubar: false });
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await btn(page, 'codesample').click();
    await expect(dialog(page).locator('.khe-dialog__title')).toHaveText('Insert/Edit Code Sample');
    await dialog(page).locator('select[name="language"]').selectOption('javascript');
    await dialog(page).locator('textarea[name="code"]').fill('const a = 1 < 2;\n<b>not html</b>');
    await save(page);
    expect(await getContent(page)).toBe('<p>x</p>\n<pre class="language-javascript">const a = 1 &lt; 2;\n&lt;b&gt;not html&lt;/b&gt;</pre>');
    const pre = editorFrame(page).locator('pre');
    await expect(pre).toHaveAttribute('contenteditable', 'false');
    await pre.dblclick();
    await expect(dialog(page).locator('textarea[name="code"]')).toHaveValue('const a = 1 < 2;\n<b>not html</b>');
    await expect(dialog(page).locator('select[name="language"]')).toHaveValue('javascript');
    await dialog(page).locator('textarea[name="code"]').fill('x');
    await save(page);
    expect(await getContent(page)).toBe('<p>x</p>\n<pre class="language-javascript">x</pre>');
  });
});
