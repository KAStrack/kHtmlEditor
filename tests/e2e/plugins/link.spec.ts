import { test, expect, Page } from '@playwright/test';
import { openHarness, initEditor, getContent, setContent, setCaret, selectText, editorFrame, shortcutKey } from '../helpers';

const dialog = (page: Page) => page.locator('.khe-dialog');
const save = (page: Page) => dialog(page).locator('.khe-button--primary').click();
const fillUrl = async (page: Page, value: string) => {
  const input = dialog(page).locator('input[name="url"]');
  await input.fill(value);
  await input.dispatchEvent('input');
};

test.describe('link plugin', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page);
  });

  test('Ctrl+K opens the dialog and links the selected text', async ({ page }) => {
    await initEditor(page, { plugins: 'link', toolbar: 'link unlink openlink', menubar: false, convert_urls: false });
    await setContent(page, '<p>hello world</p>');
    await selectText(page, 'p', 0, 5);
    await page.keyboard.press(`${await shortcutKey(page)}+k`);
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).locator('.khe-dialog__title')).toHaveText('Insert/Edit Link');
    await expect(dialog(page).locator('input[name="text"]')).toHaveValue('hello');
    await fillUrl(page, 'https://example.com/');
    await dialog(page).locator('input[name="title"]').fill('Example');
    await save(page);
    expect(await getContent(page)).toBe('<p><a href="https://example.com/" title="Example">hello</a> world</p>');
    // Toolbar state follows the caret.
    await expect(page.locator('#editor_parent [data-khe-name="link"]')).toHaveClass(/khe-tbtn--active/);
    await expect(page.locator('#editor_parent [data-khe-name="unlink"]')).toBeEnabled();
    await setCaret(page, 'p', 2, 1);
    await expect(page.locator('#editor_parent [data-khe-name="link"]')).not.toHaveClass(/khe-tbtn--active/);
    await expect(page.locator('#editor_parent [data-khe-name="unlink"]')).toBeDisabled();
  });

  test('a collapsed caret inserts a link with the typed text and URL text tracks the URL', async ({ page }) => {
    await initEditor(page, { plugins: 'link', toolbar: 'link', menubar: false, convert_urls: false });
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await page.locator('#editor_parent [data-khe-name="link"]').click();
    await fillUrl(page, 'https://example.com/a');
    await expect(dialog(page).locator('input[name="text"]')).toHaveValue('https://example.com/a');
    await dialog(page).locator('input[name="text"]').fill('Example');
    await save(page);
    expect(await getContent(page)).toBe('<p>x<a href="https://example.com/a">Example</a></p>');
  });

  test('editing an existing link updates href and text; unlink removes it', async ({ page }) => {
    await initEditor(page, { plugins: 'link', toolbar: 'link unlink', menubar: false, convert_urls: false });
    await setContent(page, '<p>see <a href="https://old.example/" target="_blank" rel="noopener">here</a> now</p>');
    await setCaret(page, 'a', 2);
    await page.locator('#editor_parent [data-khe-name="link"]').click();
    await expect(dialog(page).locator('input[name="url"]')).toHaveValue('https://old.example/');
    await expect(dialog(page).locator('input[name="text"]')).toHaveValue('here');
    await expect(dialog(page).locator('select[name="target"]')).toHaveValue('_blank');
    await fillUrl(page, 'https://new.example/');
    await dialog(page).locator('input[name="text"]').fill('there');
    await save(page);
    expect(await getContent(page)).toBe('<p>see <a href="https://new.example/" target="_blank" rel="noopener">there</a> now</p>');
    await setCaret(page, 'a', 1);
    await page.locator('#editor_parent [data-khe-name="unlink"]').click();
    expect(await getContent(page)).toBe('<p>see there now</p>');
  });

  test('external targets are prefixed, with a confirmation unless assumed', async ({ page }) => {
    await initEditor(page, { plugins: 'link', toolbar: 'link', menubar: false, convert_urls: false });
    await setContent(page, '<p>hello world</p>');
    await selectText(page, 'p', 0, 5);
    await page.locator('#editor_parent [data-khe-name="link"]').click();
    await fillUrl(page, 'www.example.com');
    await save(page);
    const confirm = page.locator('.khe-dialog', { hasText: 'external link' });
    await expect(confirm).toBeVisible();
    await confirm.locator('.khe-button', { hasText: 'Yes' }).click();
    expect(await getContent(page)).toBe('<p><a href="https://www.example.com">hello</a> world</p>');

    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.remove());
    await initEditor(page, { plugins: 'link', toolbar: 'link', menubar: false, convert_urls: false, link_assume_external_targets: 'http', link_default_target: '_blank' });
    await setContent(page, '<p>hello world</p>');
    await selectText(page, 'p', 6, 11);
    await page.locator('#editor_parent [data-khe-name="link"]').click();
    await fillUrl(page, 'example.org/page');
    await save(page);
    expect(await getContent(page)).toBe('<p>hello <a href="http://example.org/page" rel="noopener" target="_blank">world</a></p>');
  });

  test('email addresses get a mailto prefix after confirmation', async ({ page }) => {
    await initEditor(page, { plugins: 'link', toolbar: 'link', menubar: false, convert_urls: false });
    await setContent(page, '<p>mail me</p>');
    await selectText(page, 'p', 0, 4);
    await page.locator('#editor_parent [data-khe-name="link"]').click();
    await fillUrl(page, 'someone@example.com');
    await save(page);
    await page.locator('.khe-dialog', { hasText: 'email address' }).locator('.khe-button', { hasText: 'Yes' }).click();
    expect(await getContent(page)).toBe('<p><a href="mailto:someone@example.com">mail</a> me</p>');
  });

  test('link_list, anchors and class list populate the dialog', async ({ page }) => {
    await initEditor(page, {
      plugins: 'link',
      toolbar: 'link',
      menubar: false,
      convert_urls: false,
      link_list: [{ title: 'Docs', value: 'https://docs.example/' }],
      link_class_list: [{ title: 'None', value: '' }, { title: 'Button', value: 'btn' }],
      link_rel_list: [{ title: 'None', value: '' }, { title: 'No follow', value: 'nofollow' }],
    });
    await setContent(page, '<p><a id="top"></a>hello world</p>');
    await selectText(page, 'p', 0, 5);
    await page.locator('#editor_parent [data-khe-name="link"]').click();
    await dialog(page).locator('select[name="anchor"]').selectOption('#top');
    await expect(dialog(page).locator('input[name="url"]')).toHaveValue('#top');
    await dialog(page).locator('select[name="link"]').selectOption('https://docs.example/');
    await expect(dialog(page).locator('input[name="url"]')).toHaveValue('https://docs.example/');
    await dialog(page).locator('select[name="linkClass"]').selectOption('btn');
    await dialog(page).locator('select[name="rel"]').selectOption('nofollow');
    await save(page);
    expect(await getContent(page)).toBe('<p><a id="top"></a><a href="https://docs.example/" rel="nofollow" class="btn">hello</a> world</p>');
  });

  test('quicklink context form edits links inline when link_context_toolbar is on', async ({ page }) => {
    await initEditor(page, { plugins: 'link', toolbar: 'quicklink', menubar: false, convert_urls: false, link_context_toolbar: true });
    await setContent(page, '<p>see <a href="https://a.example/">here</a> now</p>');
    await setCaret(page, 'a', 2);
    const form = page.locator('.khe-context-form');
    await expect(form).toBeVisible();
    await expect(form.locator('input')).toHaveValue('https://a.example/');
    await form.locator('input').fill('https://b.example/');
    await form.locator('input').press('Enter');
    expect(await getContent(page)).toBe('<p>see <a href="https://b.example/">here</a> now</p>');
    // Launch from the toolbar on plain text inserts a new link.
    await setContent(page, '<p>plain text</p>');
    await selectText(page, 'p', 0, 5);
    await page.locator('#editor_parent [data-khe-name="quicklink"]').click();
    await expect(form).toBeVisible();
    await form.locator('input').fill('https://c.example/');
    await form.locator('input').press('Enter');
    expect(await getContent(page)).toBe('<p><a href="https://c.example/">plain</a> text</p>');
  });

  test('context menu offers link, unlink and open link on links', async ({ page }) => {
    await initEditor(page, { plugins: 'link', toolbar: 'link', menubar: false, convert_urls: false });
    await setContent(page, '<p>see <a href="https://a.example/">here</a> now</p>');
    await editorFrame(page).locator('a').click({ button: 'right' });
    const menu = page.locator('.khe-menu');
    await expect(menu.locator('[role="menuitem"]', { hasText: 'Link...' })).toBeVisible();
    await expect(menu.locator('[role="menuitem"]', { hasText: 'Remove link' })).toBeVisible();
    await expect(menu.locator('[role="menuitem"]', { hasText: 'Open link' })).toBeVisible();
    await menu.locator('[role="menuitem"]', { hasText: 'Remove link' }).click();
    expect(await getContent(page)).toBe('<p>see here now</p>');
  });
});

test.describe('autolink plugin', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page);
    await initEditor(page, { plugins: 'autolink link', toolbar: 'link', menubar: false, convert_urls: false });
  });

  test('typing a URL followed by space creates a link', async ({ page }) => {
    await setContent(page, '<p>go to</p>');
    await setCaret(page, 'p', 5);
    await page.keyboard.type(' www.example.com ');
    expect(await getContent(page)).toBe('<p>go to <a href="https://www.example.com">www.example.com</a>&nbsp;</p>');
    await page.keyboard.type('and https://x.y/z?q=1.');
    await page.keyboard.press('Enter');
    expect(await getContent(page)).toBe('<p>go to <a href="https://www.example.com">www.example.com</a> and <a href="https://x.y/z?q=1">https://x.y/z?q=1</a>.</p>\n<p>&nbsp;</p>');
  });

  test('emails become mailto links and existing links are left alone', async ({ page }) => {
    await setContent(page, '<p>mail</p>');
    await setCaret(page, 'p', 4);
    await page.keyboard.type(' a@b.co ');
    expect(await getContent(page)).toBe('<p>mail <a href="mailto:a@b.co">a@b.co</a>&nbsp;</p>');
    await setContent(page, '<p>pre <a href="https://a.example/">https://a.example/</a> post</p>');
    await page.evaluate(() => {
      const ed = (window as any).kHtmlEditor.activeEditor;
      const text = ed.getBody().querySelector('a').nextSibling;
      ed.focus();
      ed.selection.setCursorLocation(text, text.length);
    });
    await page.keyboard.type(' ');
    expect(await getContent(page)).toBe('<p>pre <a href="https://a.example/">https://a.example/</a> post&nbsp;</p>');
  });
});
