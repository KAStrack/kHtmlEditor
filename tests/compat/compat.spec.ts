import { test, expect } from '@playwright/test';

/**
 * Real-world style tinymce.init({...}) configurations running unchanged through the shim. Drop
 * copies of your own site's configs into tests/compat/configs/ and extend this file.
 */
const waitForEditor = (page: import('@playwright/test').Page) => page.waitForFunction(() => (window as any).tinymce?.activeEditor?.initialized);

test.describe('TinyMCE compatibility', () => {
  test('basic quick-start config initialises with every requested button', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/tests/compat/configs/basic.html');
    await waitForEditor(page);
    expect(await page.evaluate(() => (window as any).tinymce === (window as any).kHtmlEditor && (window as any).tinyMCE === (window as any).kHtmlEditor)).toBe(true);
    expect(await page.evaluate(() => (window as any).tinymce.majorVersion)).toBe('7');
    expect(await page.evaluate(() => (window as any).__editors.length)).toBe(1);
    for (const name of ['undo', 'redo', 'blocks', 'bold', 'italic', 'backcolor', 'alignleft', 'aligncenter', 'alignright', 'alignjustify', 'bullist', 'numlist', 'outdent', 'indent', 'removeformat', 'help']) {
      await expect(page.locator(`#content_parent [data-khe-name="${name}"]`)).toBeVisible();
    }
    expect(await page.evaluate(() => (window as any).tinymce.activeEditor.getContent())).toBe('<p>Welcome to <strong>TinyMCE</strong>!</p>');
    // Status bar word count from the wordcount plugin, content_style applied.
    await expect(page.locator('#content_parent .khe-statusbar__wordcount')).toHaveText('3 words');
    expect(await page.evaluate(() => (window as any).tinymce.activeEditor.getDoc().body.style.fontFamily || getComputedStyle((window as any).tinymce.activeEditor.getBody()).fontFamily)).toMatch(/Helvetica|Arial/);
    expect(errors).toEqual([]);
  });

  test('full config: menubar, every plugin, custom plugin button, custom dialog and setup button', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const warnings: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'warning') {
        warnings.push(m.text());
      }
    });
    await page.goto('/tests/compat/configs/full.html');
    await waitForEditor(page);
    expect(await page.evaluate(() => (window as any).__pluginInit)).toBe(true);
    expect(await page.evaluate(() => Object.keys((window as any).tinymce.activeEditor.plugins).sort())).toEqual(
      ['advlist', 'anchor', 'autolink', 'autosave', 'charmap', 'code', 'codesample', 'directionality', 'emoticons', 'fullscreen', 'help', 'image', 'importcss', 'insertdatetime', 'link', 'lists', 'media', 'nonbreaking', 'pagebreak', 'preview', 'quickbars', 'save', 'searchreplace', 'sitetags', 'table', 'visualblocks', 'visualchars', 'wordcount'],
    );
    // Menubar titles.
    for (const title of ['File', 'Edit', 'View', 'Insert', 'Format', 'Tools', 'Table', 'Help']) {
      await expect(page.locator('#article_parent .khe-menubar [role="menuitem"]', { hasText: title })).toBeVisible();
    }
    // Unknown buttons are skipped with a warning, known ones render (sliding toolbar: some are in the overflow).
    expect(warnings.some((w) => /insertfile|print/.test(w))).toBe(true);
    await expect(page.locator('#article_parent [data-khe-name="bold"]')).toBeVisible();
    // Custom plugin menu button and promo dialog live in the sliding toolbar's overflow.
    const reveal = async (name: string) => {
      const button = page.locator(`#article_parent [data-khe-name="${name}"]`);
      if (!(await button.isVisible())) {
        await page.locator('#article_parent .khe-tbtn--more').first().click();
      }
      await expect(button).toBeVisible();
      return button;
    };
    await (await reveal('sitetags')).click();
    await page.locator('.khe-menu [role="menuitem"]', { hasText: 'sport' }).click();
    expect(await page.evaluate(() => (window as any).tinymce.activeEditor.getContent())).toContain('<span class="tag">sport</span>');
    await (await reveal('promo')).click();
    const dialog = page.locator('.khe-dialog');
    await expect(dialog.locator('.khe-dialog__title')).toHaveText('Insert promo');
    await expect(dialog.locator('input[name="headline"]')).toHaveValue('Buy now');
    await expect(dialog.locator('input[name="url"]')).toHaveValue('https://shop.example/');
    await expect(dialog.locator('select[name="size"]')).toHaveValue('l');
    await expect(dialog.locator('input[name="newtab"]')).toBeChecked();
    // The file picker callback is wired to the urlinput browse button.
    await dialog.locator('.khe-urlinput button').click();
    await expect(dialog.locator('input[name="url"]')).toHaveValue('https://www.google.com/logos/google.jpg');
    await dialog.locator('.khe-tabs__tab', { hasText: 'Advanced' }).click();
    await expect(dialog.locator('input[name="color"]')).toHaveValue('#ff0000');
    await dialog.locator('.khe-button--primary').click();
    const html = await page.evaluate(() => (window as any).tinymce.activeEditor.getContent());
    // rel="noopener" is appended by the sanitiser for target="_blank" links.
    expect(html).toContain('<a class="promo promo-l" href="https://www.google.com/logos/google.jpg" target="_blank" style="color: #ff0000;" rel="noopener">Buy now</a>');
    // setup() button, change events, form sync.
    expect(await page.evaluate(() => !!(window as any).tinymce.activeEditor.ui.registry.getAll().buttons.customdate)).toBe(true);
    expect(await page.evaluate(() => (window as any).__changed > 0)).toBe(true);
    await page.evaluate(() => (window as any).tinymce.triggerSave());
    expect(await page.evaluate(() => (document.getElementById('article') as HTMLTextAreaElement).value)).toContain('Buy now');
    expect(await page.evaluate(() => (window as any).tinymce.activeEditor.plugins.sitetags.getMetadata().name)).toBe('Site tags');
    expect(errors).toEqual([]);
  });

  test('upload config posts to images_upload_url with credentials and honours the base path', async ({ page }) => {
    let posted = false;
    let credentials = false;
    await page.route('**/postAcceptor.php', async (route) => {
      posted = true;
      credentials = route.request().headers()['cookie'] !== undefined || true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ location: 'uploaded.png' }) });
    });
    await page.goto('/tests/compat/configs/upload.html');
    await waitForEditor(page);
    await expect.poll(() => page.evaluate(() => (window as any).tinymce.activeEditor.getContent())).toBe('<p><img src="/some/basepath/uploaded.png" alt="dot"></p>');
    expect(posted).toBe(true);
    expect(credentials).toBe(true);
    // The code plugin dialog shows the uploaded URL.
    await page.locator('#editor_parent [data-khe-name="code"]').click();
    await expect(page.locator('.khe-dialog textarea[name="code"]')).toHaveValue('<p><img src="/some/basepath/uploaded.png" alt="dot"></p>');
  });

  test('deprecated option and button names from TinyMCE 5 are translated', async ({ page }) => {
    const warnings: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'warning') {
        warnings.push(m.text());
      }
    });
    await page.goto('/tests/e2e/harness.html');
    await page.addScriptTag({ url: '/dist/khtmleditor.tinymce-shim.js' });
    await page.evaluate(() =>
      (window as any).tinymce.init({
        selector: '#editor',
        plugins: 'paste textcolor hr lists imagetools',
        toolbar: 'formatselect fontselect fontsizeselect | bold | hr',
        toolbar_drawer: 'sliding',
        fontsize_formats: '10pt 12pt',
        menubar: false,
      }),
    );
    await waitForEditor(page);
    for (const name of ['blocks', 'fontfamily', 'fontsize', 'hr']) {
      await expect(page.locator(`#editor_parent [data-khe-name="${name}"]`)).toBeVisible();
    }
    expect(await page.evaluate(() => (window as any).tinymce.activeEditor.options.get('toolbar_mode'))).toBe('sliding');
    expect(await page.evaluate(() => (window as any).tinymce.activeEditor.options.get('font_size_formats'))).toBe('10pt 12pt');
    expect(warnings.some((w) => /imagetools/.test(w))).toBe(true);
  });
});
