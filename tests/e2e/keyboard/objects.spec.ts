import { test, expect } from '@playwright/test';
import { openHarness, initEditor, getContent, setContent, setCaret, editorFrame } from '../helpers';

test.describe('object selection and inline boundaries', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page);
    await initEditor(page, { menubar: false, toolbar: false });
  });

  test('clicking an hr selects it and Backspace removes it', async ({ page }) => {
    await setContent(page, '<p>a</p><hr><p>b</p>');
    await editorFrame(page).locator('hr').click();
    await expect(editorFrame(page).locator('hr')).toHaveAttribute('data-mce-selected', '1');
    await page.keyboard.press('Backspace');
    expect(await getContent(page)).toBe('<p>a</p>\n<p>b</p>');
  });

  test('Enter on a selected image block inserts a paragraph after it', async ({ page }) => {
    await setContent(page, '<p>a</p><p><img src="x.png" alt=""></p>');
    await page.evaluate(() => {
      const ed = (window as any).kHtmlEditor.activeEditor;
      ed.focus();
      ed.selection.select(ed.getBody().querySelector('img'));
    });
    await page.keyboard.press('Backspace');
    expect(await getContent(page)).toBe('<p>a</p>\n<p>&nbsp;</p>');
  });

  test('arrow keys move the caret out of a link at its edge', async ({ page }) => {
    await setContent(page, '<p>see <a href="x">link</a></p>');
    await setCaret(page, 'a', 4);
    await expect(editorFrame(page).locator('a')).toHaveAttribute('data-mce-selected', 'inline-boundary');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type(' after');
    expect(await getContent(page)).toBe('<p>see <a href="x">link</a> after</p>');
    await setCaret(page, 'a', 4);
    await page.keyboard.type('ed');
    expect(await getContent(page)).toBe('<p>see <a href="x">linked</a> after</p>');
  });
});
