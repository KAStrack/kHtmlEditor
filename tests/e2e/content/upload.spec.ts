import { test, expect, Page } from '@playwright/test';
import { openHarness, initEditor, getContent, setContent } from '../helpers';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const DATA_IMG = `<p><img src="data:image/png;base64,${PNG}" alt="dot"></p>`;

const waitForContent = async (page: Page, predicate: (html: string) => boolean, timeout = 5000) => {
  const startTime = Date.now();
  let html = '';
  while (Date.now() - startTime < timeout) {
    html = await getContent(page);
    if (predicate(html)) {
      return html;
    }
    await page.waitForTimeout(50);
  }
  return html;
};

test.describe('image upload pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page);
  });

  test('automatic uploads post the blob and swap in the returned location', async ({ page }) => {
    let postedField = '';
    let postedType = '';
    await page.route('**/upload', async (route) => {
      const req = route.request();
      const body = req.postDataBuffer()?.toString('latin1') ?? '';
      postedField = /name="file"/.test(body) ? 'file' : '';
      postedType = /Content-Type: image\/png/.test(body) ? 'image/png' : '';
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ location: '/uploads/dot.png' }) });
    });
    await initEditor(page, { images_upload_url: '/upload', convert_urls: false, menubar: false, toolbar: 'bold' });
    await setContent(page, DATA_IMG);
    const html = await waitForContent(page, (h) => h.includes('/uploads/dot.png'));
    expect(html).toBe('<p><img src="/uploads/dot.png" alt="dot"></p>');
    expect(postedField).toBe('file');
    expect(postedType).toBe('image/png');
  });

  test('images_upload_base_path prefixes relative locations', async ({ page }) => {
    await page.route('**/upload', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ location: 'dot.png' }) }));
    await initEditor(page, { images_upload_url: '/upload', images_upload_base_path: '/media', convert_urls: false, menubar: false });
    await setContent(page, DATA_IMG);
    const html = await waitForContent(page, (h) => h.includes('/media/dot.png'));
    expect(html).toContain('src="/media/dot.png"');
  });

  test('images_upload_handler receives blobInfo and a progress callback', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__uploads = [];
      (window as any).__handler = (blobInfo: any, progress: (p: number) => void) => {
        progress(50);
        (window as any).__uploads.push({ filename: blobInfo.filename(), type: blobInfo.blob().type, base64: blobInfo.base64().length });
        return Promise.resolve('/h/' + blobInfo.filename());
      };
    });
    await page.evaluate(() => (window as any).kHtmlEditor.init({ selector: '#editor', menubar: false, convert_urls: false, images_upload_handler: (window as any).__handler }));
    await page.waitForFunction(() => (window as any).kHtmlEditor.activeEditor?.initialized);
    await setContent(page, DATA_IMG);
    const html = await waitForContent(page, (h) => h.includes('/h/'));
    expect(html).toMatch(/<img src="\/h\/blobid[a-z0-9_-]*\.png" alt="dot">/);
    const uploads = await page.evaluate(() => (window as any).__uploads);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].type).toBe('image/png');
    expect(uploads[0].filename).toMatch(/\.png$/);
  });

  test('failed uploads keep the image and show an error notification; remove:true removes it', async ({ page }) => {
    await page.evaluate(() => {
      let n = 0;
      (window as any).__handler = () => {
        n++;
        return n === 1 ? Promise.reject('Server said no') : Promise.reject({ message: 'Too large', remove: true });
      };
    });
    await page.evaluate(() => (window as any).kHtmlEditor.init({ selector: '#editor', menubar: false, convert_urls: false, images_upload_handler: (window as any).__handler }));
    await page.waitForFunction(() => (window as any).kHtmlEditor.activeEditor?.initialized);
    await setContent(page, DATA_IMG);
    await expect(page.locator('.khe-notification')).toContainText('Server said no');
    expect(await getContent(page)).toBe(DATA_IMG);
    // Second attempt: the handler asks for removal.
    const results = await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.uploadImages());
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe(false);
    expect(results[0].removed).toBe(true);
    await expect(page.locator('.khe-notification', { hasText: 'Too large' })).toBeVisible();
    // The emptied root block serialises to nothing (TinyMCE trimEmptyContents behaviour).
    expect(await getContent(page)).toBe('');
  });

  test('automatic_uploads:false keeps base64 until uploadImages() is called and updates undo levels', async ({ page }) => {
    await page.route('**/upload', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ location: '/u/dot.png' }) }));
    await initEditor(page, { images_upload_url: '/upload', automatic_uploads: false, convert_urls: false, menubar: false });
    await setContent(page, DATA_IMG);
    await page.waitForTimeout(100);
    expect(await getContent(page)).toBe(DATA_IMG);
    // The editor view uses a blob URI, the output a data URI.
    expect(await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.getBody().querySelector('img').getAttribute('src'))).toMatch(/^blob:/);
    const results = await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.uploadImages());
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe(true);
    expect(results[0].uploadUri).toBe('/u/dot.png');
    expect(await getContent(page)).toBe('<p><img src="/u/dot.png" alt="dot"></p>');
    // Undo stack was rewritten too.
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.undoManager.add());
    const levels = await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.undoManager.data.map((l: any) => l.content));
    for (const level of levels) {
      expect(level).not.toMatch(/blob:/);
    }
  });

  test('no upload handler configured: getContent returns the base64 image unchanged', async ({ page }) => {
    await initEditor(page, { menubar: false });
    await setContent(page, DATA_IMG);
    await page.waitForTimeout(100);
    expect(await getContent(page)).toBe(DATA_IMG);
    const results = await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.uploadImages());
    expect(results).toEqual([]);
  });

  test('video sources upload through media_upload_url', async ({ page }) => {
    let url = '';
    await page.route('**/media-upload', (route) => {
      url = route.request().url();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ location: '/v/clip.mp4' }) });
    });
    await page.route('**/upload', (route) => route.fulfill({ status: 500, body: 'should not be used' }));
    await initEditor(page, { images_upload_url: '/upload', media_upload_url: '/media-upload', convert_urls: false, menubar: false });
    await setContent(page, '<p><video controls="controls" width="300" height="150"><source src="data:video/mp4;base64,AAAAHGZ0eXBpc29t" type="video/mp4"></video></p>');
    const html = await waitForContent(page, (h) => h.includes('/v/clip.mp4'));
    expect(html).toContain('<source src="/v/clip.mp4" type="video/mp4">');
    expect(url).toMatch(/\/media-upload$/);
  });
});
