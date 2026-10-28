import { test, expect } from '@playwright/test';
import { openHarness, initEditor, getContent, setContent, setCaret, selectText, editorFrame } from '../helpers';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test.describe('quickbars plugin', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page);
    await initEditor(page, { plugins: 'quickbars link image table', toolbar: false, menubar: false, convert_urls: false });
  });

  test('selecting text shows the selection toolbar and its buttons work', async ({ page }) => {
    await setContent(page, '<p>hello world</p>');
    await selectText(page, 'p', 0, 5);
    const popup = page.locator('.khe-context-popup');
    await expect(popup).toBeVisible();
    for (const name of ['bold', 'italic', 'quicklink', 'h2', 'h3', 'blockquote']) {
      await expect(popup.locator(`[data-khe-name="${name}"]`)).toBeVisible();
    }
    await popup.locator('[data-khe-name="bold"]').click();
    expect(await getContent(page)).toBe('<p><strong>hello</strong> world</p>');
    await popup.locator('[data-khe-name="h2"]').click();
    expect(await getContent(page)).toBe('<h2><strong>hello</strong> world</h2>');
    // Collapsing the selection hides it.
    await setCaret(page, 'h2', 1, 1);
    await expect(popup).toHaveCount(0);
  });

  test('an empty block shows the insert toolbar and quicktable inserts a table', async ({ page }) => {
    await setContent(page, '<p>text</p><p></p>');
    await setCaret(page, 'p:nth-child(2)', 0);
    const popup = page.locator('.khe-context-popup');
    await expect(popup.locator('[data-khe-name="quickimage"]')).toBeVisible();
    await expect(popup.locator('[data-khe-name="quicktable"]')).toBeVisible();
    await popup.locator('[data-khe-name="quicktable"]').click();
    const html = await getContent(page);
    expect(html).toContain('<table style="border-collapse: collapse; width: 100%;" border="1"><colgroup><col style="width: 50%;"><col style="width: 50%;"></colgroup>');
    expect((html.match(/<tr>/g) || []).length).toBe(2);
  });

  test('quickimage inserts the chosen file as an image', async ({ page }) => {
    await setContent(page, '<p>text</p><p></p>');
    await setCaret(page, 'p:nth-child(2)', 0);
    const popup = page.locator('.khe-context-popup');
    const chooser = page.waitForEvent('filechooser');
    await popup.locator('[data-khe-name="quickimage"]').click();
    await (await chooser).setFiles({ name: 'dot.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });
    await expect(editorFrame(page).locator('img')).toHaveCount(1);
    expect(await getContent(page)).toBe(`<p>text</p>\n<p><img src="data:image/png;base64,${PNG}" alt="dot"></p>`);
  });

  test('clicking an image shows the image toolbar with alignment buttons', async ({ page }) => {
    await setContent(page, `<p><img src="data:image/png;base64,${PNG}" width="20" height="20" alt=""></p>`);
    await editorFrame(page).locator('img').click();
    const popup = page.locator('.khe-context-popup');
    await expect(popup.locator('[data-khe-name="aligncenter"]')).toBeVisible();
    await popup.locator('[data-khe-name="aligncenter"]').click();
    expect(await getContent(page)).toBe(`<p><img src="data:image/png;base64,${PNG}" width="20" height="20" alt="" style="display: block; margin-left: auto; margin-right: auto;"></p>`);
    await expect(popup.locator('[data-khe-name="aligncenter"]')).toHaveClass(/khe-tbtn--active/);
  });

  test('toolbars can be disabled individually', async ({ page }) => {
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.remove());
    await initEditor(page, { plugins: 'quickbars', toolbar: false, menubar: false, quickbars_selection_toolbar: false, quickbars_insert_toolbar: 'quicktable' });
    await setContent(page, '<p>hello world</p><p></p>');
    await selectText(page, 'p', 0, 5);
    await page.waitForTimeout(150);
    await expect(page.locator('.khe-context-popup')).toHaveCount(0);
    await setCaret(page, 'p:nth-child(2)', 0);
    await expect(page.locator('.khe-context-popup [data-khe-name="quicktable"]')).toBeVisible();
    await expect(page.locator('.khe-context-popup [data-khe-name="quickimage"]')).toHaveCount(0);
  });
});
