import { test, expect, Page } from '@playwright/test';
import { openHarness, initEditor, getContent, setContent, setCaret, editorFrame } from '../helpers';

const dialog = (page: Page) => page.locator('.khe-dialog');
const openMediaDialog = async (page: Page) => {
  await page.locator('#editor_parent [data-khe-name="media"]').click();
  await expect(dialog(page)).toBeVisible();
};
const save = (page: Page) => dialog(page).locator('.khe-button--primary').click();
const tab = (page: Page, title: string) => dialog(page).locator('.khe-tabs__tab', { hasText: title }).click();
const fillSource = async (page: Page, value: string) => {
  const input = dialog(page).locator('input[name="source"]');
  await input.fill(value);
  await input.dispatchEvent('input');
};

test.describe('media plugin', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page);
    await initEditor(page, { plugins: 'media', toolbar: 'media', menubar: false, convert_urls: false });
  });

  test('YouTube URLs become embed iframes with provider dimensions', async ({ page }) => {
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await openMediaDialog(page);
    await fillSource(page, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await expect(dialog(page).locator('.khe-sizeinput input').nth(0)).toHaveValue('560');
    await expect(dialog(page).locator('.khe-sizeinput input').nth(1)).toHaveValue('314');
    await tab(page, 'Embed');
    await expect(dialog(page).locator('textarea[name="embed"]')).toHaveValue('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="560" height="314" allowfullscreen="allowfullscreen"></iframe>');
    await save(page);
    expect(await getContent(page)).toBe('<p>x<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="560" height="314" allowfullscreen="allowfullscreen"></iframe></p>');
    // Live preview wrapper in the editor, selected after insert.
    const frame = editorFrame(page);
    await expect(frame.locator('span.mce-preview-object[data-mce-object="iframe"] iframe')).toHaveCount(1);
    await expect(frame.locator('span.mce-preview-object .mce-shim')).toHaveCount(1);
    expect(await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.selection.getNode().className)).toContain('mce-preview-object');
  });

  test('video URLs become video elements and round trip through the preview wrapper', async ({ page }) => {
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await openMediaDialog(page);
    await fillSource(page, '/media/movie.mp4');
    await expect(dialog(page).locator('.khe-sizeinput input').nth(0)).toHaveValue('');
    await dialog(page).locator('.khe-sizeinput input').nth(0).fill('300');
    await dialog(page).locator('.khe-sizeinput input').nth(0).dispatchEvent('input');
    await dialog(page).locator('.khe-sizeinput input').nth(1).fill('150');
    await dialog(page).locator('.khe-sizeinput input').nth(1).dispatchEvent('input');
    await save(page);
    expect(await getContent(page)).toBe('<p>x<video controls="controls" width="300" height="150">\n<source src="/media/movie.mp4" type="video/mp4"></video></p>');
    // Content set from outside gets the same wrapper and serialises unchanged.
    const html = '<p><video controls="controls" width="300" height="150" poster="/p.jpg">\n<source src="/a.mp4" type="video/mp4">\n<source src="/a.webm" type="video/webm"></video></p>';
    await setContent(page, html);
    await expect(editorFrame(page).locator('span.mce-preview-object video source')).toHaveCount(2);
    expect(await getContent(page)).toBe(html);
  });

  test('editing existing media prefills the dialog and replaces the element', async ({ page }) => {
    await setContent(page, '<p><video controls="controls" width="300" height="150" poster="/p.jpg">\n<source src="/a.mp4" type="video/mp4">\n<source src="/a.webm" type="video/webm"></video></p>');
    await editorFrame(page).locator('.mce-preview-object .mce-shim').dblclick();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).locator('input[name="source"]')).toHaveValue('/a.mp4');
    await expect(dialog(page).locator('.khe-sizeinput input').nth(0)).toHaveValue('300');
    await tab(page, 'Advanced');
    await expect(dialog(page).locator('input[name="altsource"]')).toHaveValue('/a.webm');
    await expect(dialog(page).locator('input[name="poster"]')).toHaveValue('/p.jpg');
    await dialog(page).locator('input[name="poster"]').fill('/new.jpg');
    await dialog(page).locator('input[name="poster"]').dispatchEvent('input');
    await save(page);
    expect(await getContent(page)).toBe('<p><video controls="controls" width="300" height="150" poster="/new.jpg">\n<source src="/a.mp4" type="video/mp4">\n<source src="/a.webm" type="video/webm"></video></p>');
    await expect(editorFrame(page).locator('video')).toHaveCount(1);
  });

  test('embed tab parses pasted embed code', async ({ page }) => {
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await openMediaDialog(page);
    await tab(page, 'Embed');
    const ta = dialog(page).locator('textarea[name="embed"]');
    await ta.fill('<iframe src="https://player.vimeo.com/video/123" width="400" height="300" allowfullscreen="allowfullscreen"></iframe>');
    await ta.dispatchEvent('input');
    await tab(page, 'General');
    await expect(dialog(page).locator('input[name="source"]')).toHaveValue('https://player.vimeo.com/video/123');
    await expect(dialog(page).locator('.khe-sizeinput input').nth(0)).toHaveValue('400');
    await save(page);
    expect(await getContent(page)).toBe('<p>x<iframe src="https://player.vimeo.com/video/123" width="400" height="300" allowfullscreen="allowfullscreen"></iframe></p>');
  });

  test('unknown iframes are sandboxed by the sanitiser and scripts in embed code are dropped', async ({ page }) => {
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await openMediaDialog(page);
    await tab(page, 'Embed');
    const ta = dialog(page).locator('textarea[name="embed"]');
    await ta.fill('<iframe src="https://evil.example/x" width="10" height="10"></iframe><script>window.__pwned = 1</script>');
    await ta.dispatchEvent('input');
    await save(page);
    expect(await getContent(page)).toBe('<p>x<iframe src="https://evil.example/x" width="10" height="10" sandbox=""></iframe></p>');
    expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
    expect(await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.getWin().__pwned)).toBeUndefined();
  });

  test('media_live_embeds:false uses image placeholders that round trip', async ({ page }) => {
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.remove());
    await initEditor(page, { plugins: 'media', toolbar: 'media', menubar: false, convert_urls: false, media_live_embeds: false });
    const html = '<p><video controls="controls" width="300" height="150">\n<source src="/a.mp4" type="video/mp4"></video></p>';
    await setContent(page, html);
    await expect(editorFrame(page).locator('img.mce-object[data-mce-object="video"]')).toHaveCount(1);
    expect(await getContent(page)).toBe(html);
  });

  test('upload tab inserts the file as a blob and uploads it through media_upload_url', async ({ page }) => {
    await page.route('**/media-upload', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ location: '/v/clip.mp4' }) }));
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.remove());
    await initEditor(page, { plugins: 'media', toolbar: 'media', menubar: false, convert_urls: false, media_upload_url: '/media-upload' });
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await openMediaDialog(page);
    await tab(page, 'Upload');
    await dialog(page).locator('.khe-dropzone input[type="file"]').setInputFiles({ name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from('AAAAHGZ0eXBpc29t', 'base64') });
    await expect(dialog(page).locator('input[name="source"]')).toHaveValue(/^blob:/);
    await save(page);
    await expect.poll(() => getContent(page)).toBe('<p>x<video controls="controls">\n<source src="/v/clip.mp4" type="video/mp4"></video></p>');
  });
});
