import { test, expect } from '@playwright/test';
import { openHarness, initEditor, getContent, setContent, editorFrame } from '../helpers';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test.describe('object resizing', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page);
  });

  test('clicking an image shows handles and dragging a corner resizes proportionally', async ({ page }) => {
    await initEditor(page, { menubar: false });
    await setContent(page, `<p><img src="data:image/png;base64,${PNG}" width="100" height="50" alt=""></p>`);
    const frame = editorFrame(page);
    await frame.locator('img').click();
    const handles = frame.locator('.mce-resizehandle');
    await expect(handles).toHaveCount(4);
    const se = await handles.nth(3).boundingBox();
    await page.mouse.move(se!.x + 5, se!.y + 5);
    await page.mouse.down();
    await page.mouse.move(se!.x + 55, se!.y + 10, { steps: 5 });
    await expect(frame.locator('.mce-clonedresizable')).toHaveCount(1);
    await page.mouse.up();
    await expect(frame.locator('.mce-clonedresizable')).toHaveCount(0);
    expect(await getContent(page)).toBe(`<p><img src="data:image/png;base64,${PNG}" width="150" height="75" alt=""></p>`);
    // Handles stay attached and reposition to the new size.
    await expect(handles).toHaveCount(4);
    const undo = await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.undoManager.hasUndo());
    expect(undo).toBe(true);
  });

  test('ObjectResizeStart can veto and ObjectResized reports the size', async ({ page }) => {
    await initEditor(page, { menubar: false });
    await page.evaluate(() => {
      const ed = (window as any).kHtmlEditor.activeEditor;
      (window as any).__events = [];
      ed.on('ObjectResizeStart', (e: any) => {
        (window as any).__events.push(['start', e.width, e.height, e.origin]);
        if (e.width === 200) {
          e.preventDefault();
        }
      });
      ed.on('ObjectResized', (e: any) => (window as any).__events.push(['resized', e.width, e.height]));
    });
    await setContent(page, `<p><img src="data:image/png;base64,${PNG}" width="200" height="100" alt=""></p>`);
    const frame = editorFrame(page);
    await frame.locator('img').click();
    const se = await frame.locator('.mce-resizehandle').nth(3).boundingBox();
    await page.mouse.move(se!.x + 5, se!.y + 5);
    await page.mouse.down();
    await page.mouse.move(se!.x + 45, se!.y + 5, { steps: 3 });
    await page.mouse.up();
    expect(await getContent(page)).toContain('width="200" height="100"');
    const events = await page.evaluate(() => (window as any).__events);
    expect(events).toEqual([['start', 200, 100, 'corner-se']]);
  });

  test('tables get style widths and object_resizing:false disables handles', async ({ page }) => {
    await initEditor(page, { menubar: false });
    await setContent(page, '<table style="width: 200px;"><tbody><tr><td>a</td></tr></tbody></table>');
    const frame = editorFrame(page);
    await page.evaluate(() => {
      const ed = (window as any).kHtmlEditor.activeEditor;
      ed.selection.select(ed.getBody().querySelector('table'));
      ed.nodeChanged();
    });
    await expect(frame.locator('.mce-resizehandle')).toHaveCount(4);
    const se = await frame.locator('.mce-resizehandle').nth(3).boundingBox();
    await page.mouse.move(se!.x + 5, se!.y + 5);
    await page.mouse.down();
    await page.mouse.move(se!.x + 105, se!.y + 5, { steps: 3 });
    await page.mouse.up();
    const html = await getContent(page);
    expect(html).toMatch(/<table style="width: 300px; height: \d+px;">/);

    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.remove());
    await initEditor(page, { menubar: false, object_resizing: false });
    await setContent(page, `<p><img src="data:image/png;base64,${PNG}" width="100" height="50" alt=""></p>`);
    await editorFrame(page).locator('img').click();
    await page.waitForTimeout(100);
    await expect(editorFrame(page).locator('.mce-resizehandle')).toHaveCount(0);
  });
});
