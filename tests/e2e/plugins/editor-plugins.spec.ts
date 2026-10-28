import { test, expect, Page } from '@playwright/test';
import { openHarness, initEditor, getContent, setContent, setCaret, selectText, editorFrame, shortcutKey } from '../helpers';

const dialog = (page: Page) => page.locator('.khe-dialog');
const btn = (page: Page, name: string) => page.locator(`#editor_parent [data-khe-name="${name}"]`);
const ed = (page: Page, fn: string) => page.evaluate((code) => new Function('ed', code)((window as any).kHtmlEditor.activeEditor), fn);

test.describe('editor-level plugins', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page);
  });

  test('fullscreen toggles the container and page overflow', async ({ page }) => {
    await initEditor(page, { plugins: 'fullscreen', toolbar: 'fullscreen', menubar: false, height: 300 });
    await btn(page, 'fullscreen').click();
    await expect(page.locator('#editor_parent')).toHaveClass(/khe-fullscreen/);
    await expect(page.locator('html')).toHaveClass(/khe-fullscreen-root/);
    expect(await ed(page, 'return ed.queryCommandState("mceFullScreen")')).toBe(true);
    const box = await page.locator('#editor_parent').boundingBox();
    const viewport = page.viewportSize()!;
    expect(Math.round(box!.width)).toBe(viewport.width);
    expect(Math.round(box!.height)).toBe(viewport.height);
    await expect(btn(page, 'fullscreen')).toHaveClass(/khe-tbtn--active/);
    await page.keyboard.press(`${await shortcutKey(page)}+Shift+F`);
    await expect(page.locator('#editor_parent')).not.toHaveClass(/khe-fullscreen/);
    const after = await page.locator('#editor_parent').boundingBox();
    expect(Math.round(after!.height)).toBe(300);
  });

  test('autoresize grows and shrinks the editor with its content', async ({ page }) => {
    await initEditor(page, { plugins: 'autoresize', toolbar: 'bold', menubar: false, min_height: 120, max_height: 600 });
    await page.waitForTimeout(300);
    const h1 = await page.evaluate(() => (document.getElementById('editor_ifr') as HTMLElement).offsetHeight);
    await setContent(page, Array.from({ length: 20 }, (_v, i) => `<p>line ${i}</p>`).join(''));
    await expect.poll(() => page.evaluate(() => (document.getElementById('editor_ifr') as HTMLElement).offsetHeight)).toBeGreaterThan(h1 + 200);
    const h2 = await page.evaluate(() => (document.getElementById('editor_ifr') as HTMLElement).offsetHeight);
    expect(h2).toBeLessThanOrEqual(600);
    await setContent(page, '<p>short</p>');
    await expect.poll(() => page.evaluate(() => (document.getElementById('editor_ifr') as HTMLElement).offsetHeight)).toBeLessThan(h2);
    await expect(page.locator('#editor_parent .khe-resize-handle')).toHaveCount(0);
  });

  test('preview shows the content with its styles in a sandboxed iframe', async ({ page }) => {
    await initEditor(page, { plugins: 'preview', toolbar: 'preview', menubar: false, content_style: 'p { color: rgb(255, 0, 0); }' });
    await setContent(page, '<p>Preview <strong>me</strong></p>');
    await btn(page, 'preview').click();
    await expect(dialog(page).locator('.khe-dialog__title')).toHaveText('Preview');
    const iframe = dialog(page).locator('iframe');
    await expect(iframe).toHaveAttribute('sandbox', /allow-same-origin/);
    const frame = page.frameLocator('.khe-dialog iframe');
    await expect(frame.locator('p strong')).toHaveText('me');
    await expect(frame.locator('p')).toHaveCSS('color', 'rgb(255, 0, 0)');
  });

  test('wordcount shows counts in the status bar, dialog and API', async ({ page }) => {
    await initEditor(page, { plugins: 'wordcount', toolbar: 'wordcount', menubar: false });
    await setContent(page, '<p>One two three.</p><ul><li>four</li><li>five-six</li></ul>');
    const counter = page.locator('#editor_parent .khe-statusbar__wordcount');
    await expect(counter).toHaveText('5 words');
    await counter.click();
    await expect(counter).toHaveText(/\d+ characters/);
    expect(await ed(page, 'return ed.plugins.wordcount.body.getWordCount()')).toBe(5);
    expect(await ed(page, 'return ed.plugins.wordcount.body.getCharacterCountWithoutSpaces()')).toBe(24);
    await selectText(page, 'p', 0, 7);
    expect(await ed(page, 'return ed.plugins.wordcount.selection.getWordCount()')).toBe(2);
    await btn(page, 'wordcount').click();
    await expect(dialog(page).locator('.khe-dialog__title')).toHaveText('Word Count');
    await expect(dialog(page).locator('table tbody tr').first()).toContainText('Words');
    await expect(dialog(page).locator('table tbody tr').first().locator('td').nth(1)).toHaveText('5');
    await expect(dialog(page).locator('table tbody tr').first().locator('td').nth(2)).toHaveText('2');
  });

  test('save button follows dirty state and calls save_onsavecallback; cancel restores', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__saved = 0;
      (window as any).kHtmlEditor.init({ selector: '#editor', plugins: 'save', toolbar: 'save cancel', menubar: false, save_onsavecallback: () => (window as any).__saved++ });
    });
    await page.waitForFunction(() => (window as any).kHtmlEditor.activeEditor?.initialized);
    await expect(btn(page, 'save')).toBeDisabled();
    await setCaret(page, 'p', 0);
    await page.keyboard.type('x');
    await expect(btn(page, 'save')).toBeEnabled();
    await page.keyboard.press(`${await shortcutKey(page)}+s`);
    expect(await page.evaluate(() => (window as any).__saved)).toBe(1);
    expect(await page.evaluate(() => (document.getElementById('editor') as HTMLTextAreaElement).value)).toContain('xInitial');
    // Saving clears the dirty state, so cancel is disabled until the next edit.
    await expect(btn(page, 'cancel')).toBeDisabled();
    await page.keyboard.type('y');
    await btn(page, 'cancel').click();
    expect(await getContent(page)).toBe('<p>Initial <strong>content</strong></p>');
  });

  test('save submits the form when no callback is configured', async ({ page }) => {
    await page.evaluate(() => {
      const form = document.getElementById('form') as HTMLFormElement;
      // The harness submit button is id="submit", which shadows form.submit (TinyMCE reports a
      // collision for that); drop the id so the form method is reachable, then stub it.
      document.getElementById('submit')?.removeAttribute('id');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        (window as any).__submitted = (document.getElementById('editor') as HTMLTextAreaElement).value;
      });
      (form as any).submit = () => form.dispatchEvent(new Event('submit', { cancelable: true }));
    });
    await initEditor(page, { plugins: 'save', toolbar: 'save', menubar: false, save_enablewhendirty: false });
    await setContent(page, '<p>submit me</p>');
    await btn(page, 'save').click();
    expect(await page.evaluate(() => (window as any).__submitted)).toBe('<p>submit me</p>');
  });

  test('autosave stores, restores and removes drafts', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await initEditor(page, { plugins: 'autosave', toolbar: 'restoredraft', menubar: false, autosave_interval: '1s', autosave_prefix: 'khe-test-' });
    await expect(btn(page, 'restoredraft')).toBeDisabled();
    await setCaret(page, 'p', 0);
    await page.keyboard.type('draft ');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('khe-test-draft'))).toContain('draft');
    await expect(btn(page, 'restoredraft')).toBeEnabled();
    await setContent(page, '<p>other</p>');
    await btn(page, 'restoredraft').click();
    expect(await getContent(page)).toContain('draft');
    await ed(page, 'ed.plugins.autosave.removeDraft()');
    expect(await page.evaluate(() => localStorage.getItem('khe-test-draft'))).toBeNull();
    await expect(btn(page, 'restoredraft')).toBeDisabled();
    // Restore when empty on init.
    await page.evaluate(() => {
      localStorage.setItem('khe-test-draft', '<p>from storage</p>');
      localStorage.setItem('khe-test-time', String(Date.now()));
      (window as any).kHtmlEditor.activeEditor.remove();
      (document.getElementById('editor') as HTMLTextAreaElement).value = '';
    });
    await initEditor(page, { plugins: 'autosave', toolbar: 'restoredraft', menubar: false, autosave_prefix: 'khe-test-', autosave_restore_when_empty: true });
    expect(await getContent(page)).toBe('<p>from storage</p>');
  });

  test('help dialog lists shortcuts, plugins and the version', async ({ page }) => {
    await initEditor(page, { plugins: 'help link', toolbar: 'help', menubar: false });
    await setCaret(page, 'p', 0);
    await page.keyboard.press('Alt+0');
    await expect(dialog(page).locator('.khe-dialog__title')).toHaveText('Help');
    await expect(dialog(page).locator('table')).toContainText('Bold');
    await dialog(page).locator('.khe-tabs__tab', { hasText: 'Plugins' }).click();
    await expect(dialog(page).locator('.khe-htmlpanel li', { hasText: 'link' })).toBeVisible();
    await dialog(page).locator('.khe-tabs__tab', { hasText: 'Version' }).click();
    await expect(dialog(page).locator('.khe-tabs__panel:not([hidden]) .khe-htmlpanel')).toContainText('kHtmlEditor');
  });

  test('search and replace finds, navigates and replaces matches', async ({ page }) => {
    await initEditor(page, { plugins: 'searchreplace', toolbar: 'searchreplace', menubar: false });
    await setContent(page, '<p>The cat sat on the mat with the Cat.</p><p>Another cat.</p>');
    await setCaret(page, 'p', 0);
    await page.keyboard.press(`${await shortcutKey(page)}+f`);
    await expect(dialog(page).locator('.khe-dialog__title')).toHaveText('Find and Replace');
    await dialog(page).locator('input[name="findtext"]').fill('cat');
    await dialog(page).locator('input[name="findtext"]').press('Enter');
    await expect(editorFrame(page).locator('span.mce-match-marker')).toHaveCount(3);
    await expect(editorFrame(page).locator('span.mce-match-marker-selected')).toHaveText('cat');
    await dialog(page).locator('button[name="next"]').click();
    await expect(editorFrame(page).locator('span.mce-match-marker-selected')).toHaveAttribute('data-mce-index', '1');
    await dialog(page).locator('input[name="replacetext"]').fill('dog');
    await dialog(page).locator('.khe-button', { hasText: /^Replace$/ }).click();
    await expect(editorFrame(page).locator('span.mce-match-marker')).toHaveCount(2);
    await dialog(page).locator('.khe-button', { hasText: 'Replace all' }).click();
    await expect(editorFrame(page).locator('span.mce-match-marker')).toHaveCount(0);
    await dialog(page).locator('.khe-dialog__close').click();
    expect(await getContent(page)).toBe('<p>The dog sat on the mat with the dog.</p>\n<p>Another dog.</p>');
    // Match case and whole words, and the "not found" banner.
    await setContent(page, '<p>Cat concatenate cat</p>');
    await page.keyboard.press(`${await shortcutKey(page)}+f`);
    await dialog(page).locator('input[name="findtext"]').fill('cat');
    await dialog(page).locator('input[name="matchcase"]').check();
    await dialog(page).locator('input[name="wholewords"]').check();
    await dialog(page).locator('.khe-button--primary').click();
    await expect(editorFrame(page).locator('span.mce-match-marker')).toHaveCount(1);
    await dialog(page).locator('input[name="findtext"]').fill('zebra');
    await dialog(page).locator('.khe-button--primary').click();
    await expect(dialog(page).locator('.khe-alertbanner')).toContainText('Could not find the specified string.');
    await dialog(page).locator('.khe-dialog__close').click();
    await expect(editorFrame(page).locator('span.mce-match-marker')).toHaveCount(0);
    // API
    expect(await ed(page, 'return ed.plugins.searchreplace.find("cat", false, false)')).toBe(3);
    expect(await ed(page, 'ed.plugins.searchreplace.replace("kitten", true, true); return ed.getContent()')).toBe('<p>kitten conkittenenate kitten</p>');
  });

  test('importcss adds stylesheet classes to the formats menu', async ({ page }) => {
    await initEditor(page, { plugins: 'importcss', toolbar: 'styles', menubar: false, content_style: '.callout { background: yellow; } p.intro { font-weight: bold; } .khe-internal { color: red; }' });
    await setContent(page, '<p>hello world</p>');
    await selectText(page, 'p', 0, 5);
    await btn(page, 'styles').click();
    const menu = page.locator('.khe-menu');
    await expect(menu.locator('[role="menuitemcheckbox"], [role="menuitem"]', { hasText: '.callout' })).toBeVisible();
    await expect(menu.locator('[role="menuitemcheckbox"], [role="menuitem"]', { hasText: 'p.intro' })).toBeVisible();
    await menu.locator('[role="menuitemcheckbox"], [role="menuitem"]', { hasText: '.callout' }).click();
    expect(await getContent(page)).toBe('<p><span class="callout">hello</span> world</p>');
    await btn(page, 'styles').click();
    await menu.locator('[role="menuitemcheckbox"], [role="menuitem"]', { hasText: 'p.intro' }).click();
    expect(await getContent(page)).toBe('<p class="intro"><span class="callout">hello</span> world</p>');
  });
});
