import { test, expect } from '@playwright/test';
import { openHarness, initEditor, getContent, setContent, selectText, setCaret } from '../helpers';

test.describe('theme UI', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page);
  });

  test('renders menubar, default toolbar, status bar and iframe', async ({ page }) => {
    await initEditor(page);
    const container = page.locator('#editor_parent');
    await expect(container).toBeVisible();
    await expect(container.locator('.khe-menubar .khe-mbtn')).toHaveCount(5);
    await expect(container.locator('.khe-menubar .khe-mbtn').first()).toHaveText('File');
    const names = await container.locator('.khe-toolbar [data-khe-name]').evaluateAll((els) => els.map((e) => e.getAttribute('data-khe-name')));
    expect(names).toEqual(['undo', 'redo', 'blocks', 'bold', 'italic', 'alignleft', 'aligncenter', 'alignright', 'alignjustify', 'outdent', 'indent']);
    await expect(container.locator('.khe-statusbar .khe-path__item')).toHaveText(['p']);
    await expect(container.locator('.khe-edit-area iframe')).toBeVisible();
  });

  test('custom toolbar string with separators and unknown buttons', async ({ page }) => {
    await initEditor(page, { toolbar: 'bold italic | underline strikethrough notabutton | forecolor backcolor', menubar: false, statusbar: false });
    const container = page.locator('#editor_parent');
    await expect(container.locator('.khe-menubar')).toHaveCount(0);
    await expect(container.locator('.khe-statusbar')).toHaveCount(0);
    await expect(container.locator('.khe-tgroup')).toHaveCount(3);
    const names = await container.locator('.khe-toolbar [data-khe-name]').evaluateAll((els) => els.map((e) => e.getAttribute('data-khe-name')));
    expect(names).toEqual(['bold', 'italic', 'underline', 'strikethrough', 'forecolor', 'backcolor']);
  });

  test('toolbar buttons apply formats and reflect state', async ({ page }) => {
    await initEditor(page, { toolbar: 'bold italic alignright', menubar: false });
    await setContent(page, '<p>hello world</p>');
    await selectText(page, 'p', 0, 5);
    const bold = page.locator('#editor_parent [data-khe-name="bold"]');
    await bold.click();
    expect(await getContent(page)).toBe('<p><strong>hello</strong> world</p>');
    await expect(bold).toHaveClass(/khe-tbtn--active/);
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
    await setCaret(page, 'p', 3, 1);
    await expect(bold).not.toHaveClass(/khe-tbtn--active/);
    await page.locator('#editor_parent [data-khe-name="alignright"]').click();
    expect(await getContent(page)).toBe('<p style="text-align: right;"><strong>hello</strong> world</p>');
  });

  test('fontfamily names the matching format, the system stack and default_font_stack', async ({ page }) => {
    await initEditor(page, { toolbar: 'fontfamily', menubar: false });
    const fonts = page.locator('#editor_parent [data-khe-name="fontfamily"]');
    // The default content font is the platform stack.
    await setContent(page, '<p>plain</p>');
    await setCaret(page, 'p', 1);
    await expect(fonts).toContainText('System Font');
    // A stack whose first family matches a format shows that format, checked in the menu.
    await setContent(page, '<p><span style="font-family: georgia, serif;">serif</span></p>');
    await setCaret(page, 'span', 1);
    await expect(fonts).toContainText('Georgia');
    await fonts.click();
    await expect(page.locator('.khe-popup .khe-menu__item[aria-checked="true"]')).toHaveText('Georgia');
    await page.keyboard.press('Escape');
    // Unknown families show their first name; default_font_stack adds a custom system stack.
    await setContent(page, '<p><span style="font-family: \'Brand Sans\', Inter, sans-serif;">brand</span></p>');
    await setCaret(page, 'span', 1);
    await expect(fonts).toContainText('Brand Sans');
    await page.evaluate(() => (window as any).kHtmlEditor.remove());
    await initEditor(page, { toolbar: 'fontfamily', menubar: false, default_font_stack: ['Brand Sans', 'Inter'] });
    await setContent(page, '<p><span style="font-family: \'Brand Sans\', Inter, sans-serif;">brand</span></p>');
    await setCaret(page, 'span', 1);
    await expect(fonts).toContainText('System Font');
  });

  test('blocks dropdown shows current block and changes it', async ({ page }) => {
    await initEditor(page, { toolbar: 'blocks', menubar: false });
    await setContent(page, '<h2>Title</h2>');
    await setCaret(page, 'h2', 2);
    const blocks = page.locator('#editor_parent [data-khe-name="blocks"]');
    await expect(blocks).toContainText('Heading 2');
    await blocks.click();
    const menu = page.locator('.khe-popup .khe-menu');
    await expect(menu).toBeVisible();
    await expect(menu.locator('.khe-menu__item')).toHaveCount(8);
    await menu.locator('.khe-menu__item', { hasText: 'Paragraph' }).click();
    expect(await getContent(page)).toBe('<p>Title</p>');
    await expect(blocks).toContainText('Paragraph');
    await expect(page.locator('.khe-popup')).toHaveCount(0);
  });

  test('menubar opens menus and runs items', async ({ page }) => {
    await initEditor(page);
    await setContent(page, '<p>text</p>');
    await selectText(page, 'p', 0, 4);
    await page.locator('#editor_parent .khe-mbtn', { hasText: 'Format' }).click();
    const menu = page.locator('.khe-popup .khe-menu').first();
    await expect(menu).toBeVisible();
    await menu.locator('.khe-menu__item', { hasText: 'Italic' }).click();
    expect(await getContent(page)).toBe('<p><em>text</em></p>');
  });

  test('color split button applies default color and dropdown picks swatches', async ({ page }) => {
    await initEditor(page, { toolbar: 'forecolor', menubar: false });
    await setContent(page, '<p>text</p>');
    await selectText(page, 'p', 0, 4);
    await page.locator('#editor_parent .khe-split .khe-tbtn').first().click();
    expect(await getContent(page)).toBe('<p><span style="color: #000000;">text</span></p>');
    await page.locator('#editor_parent .khe-split .khe-tbtn--chevron').click();
    const swatches = page.locator('.khe-popup .khe-swatch');
    await expect(swatches.first()).toBeVisible();
    await page.locator('.khe-popup .khe-swatch[title="Red"]').click();
    expect(await getContent(page)).toBe('<p><span style="color: #e03e2d;">text</span></p>');
    await page.locator('#editor_parent .khe-split .khe-tbtn--chevron').click();
    await page.locator('.khe-popup .khe-swatch--remove').click();
    expect(await getContent(page)).toBe('<p>text</p>');
  });

  test('windowManager dialog renders the TinyMCE spec and returns data', async ({ page }) => {
    await initEditor(page, { menubar: false, toolbar: false });
    await page.evaluate(() => {
      const ed = (window as any).kHtmlEditor.activeEditor;
      (window as any).__result = null;
      ed.windowManager.open({
        title: 'Test dialog',
        body: {
          type: 'panel',
          items: [
            { type: 'input', name: 'title', label: 'Title' },
            { type: 'selectbox', name: 'kind', label: 'Kind', items: [{ text: 'One', value: '1' }, { text: 'Two', value: '2' }] },
            { type: 'checkbox', name: 'flag', label: 'Flag' },
            { type: 'sizeinput', name: 'dims', label: 'Size' },
          ],
        },
        buttons: [
          { type: 'cancel', text: 'Cancel' },
          { type: 'submit', text: 'Save', primary: true },
        ],
        initialData: { title: 'Hello', kind: '2', flag: true, dims: { width: '10', height: '20' } },
        onSubmit: (api: any) => {
          (window as any).__result = api.getData();
          api.close();
        },
      });
    });
    const dialog = page.locator('.khe-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.khe-dialog__title')).toHaveText('Test dialog');
    await expect(dialog.locator('input[name="title"]')).toHaveValue('Hello');
    await expect(dialog.locator('select')).toHaveValue('2');
    await dialog.locator('input[name="title"]').fill('Changed');
    await dialog.locator('.khe-button--primary').click();
    const result = await page.evaluate(() => (window as any).__result);
    expect(result).toEqual({ title: 'Changed', kind: '2', flag: true, dims: { width: '10', height: '20' } });
    await expect(page.locator('.khe-dialog')).toHaveCount(0);
  });

  test('custom button registered in setup appears and acts', async ({ page }) => {
    await page.evaluate(async () => {
      const k = (window as any).kHtmlEditor;
      await k.init({
        selector: '#editor',
        menubar: false,
        toolbar: 'mybutton | bold',
        setup: (ed: any) => {
          ed.ui.registry.addButton('mybutton', {
            text: 'Insert date',
            icon: 'insert-time',
            tooltip: 'Insert a date',
            onAction: () => ed.insertContent('<em>2026</em>'),
          });
        },
      });
    });
    const btn = page.locator('#editor_parent [data-khe-name="mybutton"]');
    await expect(btn).toContainText('Insert date');
    await setContent(page, '<p>a</p>');
    await setCaret(page, 'p', 1);
    await btn.click();
    expect(await getContent(page)).toBe('<p>a<em>2026</em></p>');
  });

  test('notifications render and close', async ({ page }) => {
    await initEditor(page, { menubar: false });
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.notificationManager.open({ text: 'Saved!', type: 'success', timeout: 0 }));
    const n = page.locator('#editor_parent .khe-notification');
    await expect(n).toHaveText(/Saved!/);
    await expect(n).toHaveClass(/khe-notification--success/);
    await n.locator('.khe-notification__close').click();
    await expect(page.locator('#editor_parent .khe-notification')).toHaveCount(0);
  });

  test('readonly mode disables toolbar buttons except undo/redo context any', async ({ page }) => {
    await initEditor(page, { toolbar: 'undo bold', menubar: false, readonly: true });
    await expect(page.locator('#editor_parent [data-khe-name="bold"]')).toBeDisabled();
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.mode.set('design'));
    await expect(page.locator('#editor_parent [data-khe-name="bold"]')).toBeEnabled();
  });

  test('dark skin applies', async ({ page }) => {
    await initEditor(page, { skin: 'oxide-dark', content_css: 'dark' });
    await expect(page.locator('#editor_parent')).toHaveClass(/khe-skin-dark/);
    const bg = await page.frameLocator('#editor_ifr').locator('body').evaluate((b) => getComputedStyle(b).backgroundColor);
    expect(bg).toBe('rgb(34, 47, 62)');
  });
});
