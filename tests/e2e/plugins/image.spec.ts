import { test, expect, Page } from '@playwright/test';
import { openHarness, initEditor, getContent, setContent, setCaret, editorFrame } from '../helpers';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const DATA = `data:image/png;base64,${PNG}`;

const dialog = (page: Page) => page.locator('.khe-dialog');
const openImageDialog = async (page: Page) => {
  await page.locator('#editor_parent [data-khe-name="image"]').click();
  await expect(dialog(page)).toBeVisible();
};
const save = (page: Page) => dialog(page).locator('.khe-button--primary').click();
const tab = (page: Page, title: string) => dialog(page).locator('.khe-tabs__tab', { hasText: title }).click();

test.describe('image plugin', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page);
  });

  test('inserts an image with alt text and measured dimensions', async ({ page }) => {
    await initEditor(page, { plugins: 'image', toolbar: 'image', menubar: false, convert_urls: false });
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await openImageDialog(page);
    await expect(dialog(page).locator('.khe-dialog__title')).toHaveText('Insert/Edit Image');
    await dialog(page).locator('input[name="src"]').fill(DATA);
    await dialog(page).locator('input[name="src"]').dispatchEvent('input');
    await expect(dialog(page).locator('.khe-sizeinput input').nth(0)).toHaveValue('1');
    await expect(dialog(page).locator('.khe-sizeinput input').nth(1)).toHaveValue('1');
    await dialog(page).locator('input[name="alt"]').fill('dot');
    await save(page);
    await expect(dialog(page)).toHaveCount(0);
    expect(await getContent(page)).toBe(`<p>x<img src="${DATA}" alt="dot" width="1" height="1"></p>`);
    // The inserted image is selected.
    expect(await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.selection.getNode().nodeName)).toBe('IMG');
  });

  test('double click edits the existing image and the toolbar button is active on images', async ({ page }) => {
    await initEditor(page, { plugins: 'image', toolbar: 'image', menubar: false, convert_urls: false, image_title: true });
    await setContent(page, '<p><img src="/pics/a.png" alt="a" width="10" height="20"></p>');
    await editorFrame(page).locator('img').dblclick();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).locator('input[name="src"]')).toHaveValue('/pics/a.png');
    await expect(dialog(page).locator('input[name="alt"]')).toHaveValue('a');
    await expect(dialog(page).locator('.khe-sizeinput input').nth(0)).toHaveValue('10');
    await dialog(page).locator('input[name="alt"]').fill('changed');
    await dialog(page).locator('input[name="title"]').fill('Title');
    await save(page);
    // New attributes are appended, like TinyMCE's write().
    expect(await getContent(page)).toBe('<p><img src="/pics/a.png" alt="changed" width="10" height="20" title="Title"></p>');
    await editorFrame(page).locator('img').click();
    await expect(page.locator('#editor_parent [data-khe-name="image"]')).toHaveClass(/khe-tbtn--active/);
  });

  test('captions wrap the image in a figure whose caption stays editable', async ({ page }) => {
    await initEditor(page, { plugins: 'image', toolbar: 'image', menubar: false, convert_urls: false, image_caption: true });
    await setContent(page, '<p><img src="/pics/a.png" alt="a"></p>');
    await editorFrame(page).locator('img').dblclick();
    await dialog(page).locator('input[name="caption"]').check();
    await save(page);
    expect(await getContent(page)).toBe('<figure class="image"><img src="/pics/a.png" alt="a">\n<figcaption>Caption</figcaption>\n</figure>');
    // In the editor the figure is non-editable and the caption editable.
    const frame = editorFrame(page);
    await expect(frame.locator('figure')).toHaveAttribute('contenteditable', 'false');
    await expect(frame.locator('figcaption')).toHaveAttribute('contenteditable', 'true');
    await frame.locator('figcaption').click();
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    expect(await getContent(page)).toContain('<figcaption>Caption!</figcaption>');
    // Unchecking removes the figure again.
    await frame.locator('img').dblclick();
    await dialog(page).locator('input[name="caption"]').uncheck();
    await save(page);
    expect(await getContent(page)).toBe('<p><img src="/pics/a.png" alt="a"></p>');
  });

  test('upload tab inserts the chosen file as a blob and uploads it', async ({ page }) => {
    await page.route('**/upload', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ location: '/up/pic.png' }) }));
    await initEditor(page, { plugins: 'image', toolbar: 'image', menubar: false, convert_urls: false, images_upload_url: '/upload' });
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await openImageDialog(page);
    await tab(page, 'Upload');
    await dialog(page).locator('.khe-dropzone input[type="file"]').setInputFiles({ name: 'pic.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });
    await expect(dialog(page).locator('input[name="src"]')).toHaveValue(/^blob:/);
    await dialog(page).locator('input[name="alt"]').fill('uploaded');
    await save(page);
    await expect.poll(() => getContent(page)).toBe('<p>x<img src="/up/pic.png" alt="uploaded" width="1" height="1"></p>');
  });

  test('image_list, image_class_list and mceUpdateImage', async ({ page }) => {
    await initEditor(page, {
      plugins: 'image',
      toolbar: 'image',
      menubar: false,
      convert_urls: false,
      image_list: [{ title: 'Logo', value: '/pics/logo.png' }],
      image_class_list: [{ title: 'None', value: '' }, { title: 'Rounded', value: 'rounded' }],
    });
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await openImageDialog(page);
    await dialog(page).locator('select[name="images"]').selectOption('/pics/logo.png');
    await expect(dialog(page).locator('input[name="src"]')).toHaveValue('/pics/logo.png');
    await dialog(page).locator('select[name="classes"]').selectOption('rounded');
    await save(page);
    expect(await getContent(page)).toBe('<p>x<img src="/pics/logo.png" class="rounded"></p>');
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.execCommand('mceUpdateImage', false, { alt: 'via command', width: '40', height: '30' }));
    expect(await getContent(page)).toBe('<p>x<img src="/pics/logo.png" class="rounded" alt="via command" width="40" height="30"></p>');
  });

  test('advanced tab writes spacing and border styles', async ({ page }) => {
    await initEditor(page, { plugins: 'image', toolbar: 'image', menubar: false, convert_urls: false, image_advtab: true });
    await setContent(page, '<p><img src="/pics/a.png" alt="a"></p>');
    await editorFrame(page).locator('img').dblclick();
    await tab(page, 'Advanced');
    await dialog(page).locator('input[name="border"]').fill('2');
    await dialog(page).locator('input[name="border"]').dispatchEvent('input');
    await dialog(page).locator('input[name="vspace"]').fill('5');
    await dialog(page).locator('input[name="vspace"]').dispatchEvent('input');
    await dialog(page).locator('select[name="borderstyle"]').selectOption('dashed');
    await expect(dialog(page).locator('input[name="style"]')).toHaveValue('border-width: 2px; margin-top: 5px; margin-bottom: 5px; border-style: dashed;');
    await save(page);
    expect(await getContent(page)).toBe('<p><img src="/pics/a.png" alt="a" style="border-width: 2px; margin-top: 5px; margin-bottom: 5px; border-style: dashed;"></p>');
  });

  test('context menu offers the image item on images', async ({ page }) => {
    await initEditor(page, { plugins: 'image', toolbar: 'image', menubar: false, convert_urls: false });
    await setContent(page, '<p><img src="/pics/a.png" alt="a"></p>');
    await editorFrame(page).locator('img').click({ button: 'right' });
    await expect(page.locator('.khe-menu [role="menuitem"]', { hasText: 'Image' })).toBeVisible();
    await page.locator('.khe-menu [role="menuitem"]', { hasText: 'Image' }).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).locator('input[name="src"]')).toHaveValue('/pics/a.png');
  });
});
