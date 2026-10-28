import { test, expect } from '@playwright/test';
import { openHarness, initEditor, getContent, setContent, editorFrame } from '../helpers';

test.describe('code plugin', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page);
  });

  test('dialog shows the formatted source and applies sanitised edits', async ({ page }) => {
    await initEditor(page, { plugins: 'code', toolbar: 'code', menubar: false });
    await setContent(page, '<p>Hello <strong>world</strong></p><ul><li>a</li></ul>');
    await page.locator('#editor_parent [data-khe-name="code"]').click();
    const dialog = page.locator('.khe-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.khe-dialog__title')).toHaveText('Source Code');
    const ta = dialog.locator('textarea[name="code"]');
    await expect(ta).toHaveValue('<p>Hello <strong>world</strong></p>\n<ul>\n<li>a</li>\n</ul>');
    await ta.fill('<h2 onclick="alert(1)">Title</h2><script>window.__x=1</script><p>Body<img src="x" onerror="alert(1)"></p>');
    await dialog.locator('.khe-button--primary').click();
    await expect(dialog).toHaveCount(0);
    expect(await getContent(page)).toBe('<h2>Title</h2>\n<p>Body<img src="x"></p>');
    expect(await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.undoManager.hasUndo())).toBe(true);
    expect(await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.getWin().__x)).toBeUndefined();
    // Cancel leaves content untouched.
    await page.locator('#editor_parent [data-khe-name="code"]').click();
    await dialog.locator('textarea[name="code"]').fill('<p>nope</p>');
    await dialog.locator('.khe-button', { hasText: 'Cancel' }).click();
    expect(await getContent(page)).toBe('<h2>Title</h2>\n<p>Body<img src="x"></p>');
  });

  test('inline source view swaps the editing area for a textarea', async ({ page }) => {
    await initEditor(page, { plugins: 'code', toolbar: 'bold code', menubar: false, code_view: 'inline' });
    await setContent(page, '<p>Hello</p>');
    const button = page.locator('#editor_parent [data-khe-name="code"]');
    await button.click();
    const ta = page.locator('#editor_parent .khe-source-view');
    await expect(ta).toBeVisible();
    await expect(ta).toHaveValue('<p>Hello</p>');
    await expect(page.locator('#editor_ifr')).toBeHidden();
    await expect(page.locator('#editor_parent .khe-container')).toHaveClass(/khe-source-mode/);
    await expect(button).toHaveClass(/khe-tbtn--active/);
    expect(await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.queryCommandState('mceToggleSourceView'))).toBe(true);
    await ta.fill('<p>Edited <em>source</em></p><p>Two</p>');
    // getContent while open reflects the textarea.
    expect(await getContent(page)).toBe('<p>Edited <em>source</em></p>\n<p>Two</p>');
    await button.click();
    await expect(ta).toHaveCount(0);
    await expect(page.locator('#editor_ifr')).toBeVisible();
    await expect(page.locator('#editor_parent .khe-container')).not.toHaveClass(/khe-source-mode/);
    expect(await getContent(page)).toBe('<p>Edited <em>source</em></p>\n<p>Two</p>');
    await expect(editorFrame(page).locator('em')).toHaveText('source');
  });
});
