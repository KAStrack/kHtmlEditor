import { test, expect } from '@playwright/test';
import { openHarness, initEditor, getContent, setContent, setCaret, selectText } from '../helpers';

const exec = (page: any, cmd: string, value?: any) => page.evaluate(({ cmd, value }: any) => (window as any).kHtmlEditor.activeEditor.execCommand(cmd, false, value), { cmd, value });
const state = (page: any, cmd: string) => page.evaluate((c: string) => (window as any).kHtmlEditor.activeEditor.queryCommandState(c), cmd);
const value = (page: any, cmd: string) => page.evaluate((c: string) => (window as any).kHtmlEditor.activeEditor.queryCommandValue(c), cmd);
const selectAcross = (page: any, s1: string, o1: number, s2: string, o2: number) =>
  page.evaluate(
    ({ s1, o1, s2, o2 }: any) => {
      const ed = (window as any).kHtmlEditor.activeEditor;
      const a = ed.getBody().querySelector(s1);
      const b = ed.getBody().querySelector(s2);
      const ta = ed.getDoc().createTreeWalker(a, 4).nextNode();
      const tb = ed.getDoc().createTreeWalker(b, 4).nextNode();
      const rng = ed.getDoc().createRange();
      rng.setStart(ta, o1);
      rng.setEnd(tb, o2);
      ed.focus();
      ed.selection.setRng(rng);
    },
    { s1, o1, s2, o2 },
  );

test.describe('formatter', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page);
    await initEditor(page);
  });

  test('applies and removes bold on a selection', async ({ page }) => {
    await setContent(page, '<p>hello world</p>');
    await selectText(page, 'p', 0, 5);
    await exec(page, 'Bold');
    expect(await getContent(page)).toBe('<p><strong>hello</strong> world</p>');
    expect(await state(page, 'Bold')).toBe(true);
    await exec(page, 'Bold');
    expect(await getContent(page)).toBe('<p>hello world</p>');
    expect(await state(page, 'Bold')).toBe(false);
  });

  test('applies formats across blocks and nested formats', async ({ page }) => {
    await setContent(page, '<p>one two</p><p>three four</p>');
    await selectAcross(page, 'p', 4, 'p:nth-child(2)', 5);
    await exec(page, 'Italic');
    expect(await getContent(page)).toBe('<p>one <em>two</em></p>\n<p><em>three</em> four</p>');
    await exec(page, 'Bold');
    expect(await getContent(page)).toBe('<p>one <strong><em>two</em></strong></p>\n<p><strong><em>three</em></strong> four</p>');
  });

  test('removes bold from part of a bold run by splitting', async ({ page }) => {
    await setContent(page, '<p><strong>hello world</strong></p>');
    await selectText(page, 'strong', 6, 11);
    await exec(page, 'Bold');
    expect(await getContent(page)).toBe('<p><strong>hello </strong>world</p>');
  });

  test('underline and strikethrough', async ({ page }) => {
    await setContent(page, '<p>text</p>');
    await selectText(page, 'p', 0, 4);
    await exec(page, 'Underline');
    expect(await getContent(page)).toBe('<p><span style="text-decoration: underline;">text</span></p>');
    await exec(page, 'Strikethrough');
    expect(await getContent(page)).toBe('<p><s><span style="text-decoration: underline;">text</span></s></p>');
    await exec(page, 'Underline');
    await exec(page, 'Strikethrough');
    expect(await getContent(page)).toBe('<p>text</p>');
  });

  test('caret format: typing after toggling bold continues bold', async ({ page }) => {
    await setContent(page, '<p>ab</p>');
    await setCaret(page, 'p', 2);
    await exec(page, 'Bold');
    await page.keyboard.type('cd');
    await exec(page, 'Bold');
    await page.keyboard.type('ef');
    expect(await getContent(page)).toBe('<p>ab<strong>cd</strong>ef</p>');
  });

  test('caret inside a word formats the whole word', async ({ page }) => {
    await setContent(page, '<p>hello world</p>');
    await setCaret(page, 'p', 2);
    await exec(page, 'Bold');
    expect(await getContent(page)).toBe('<p><strong>hello</strong> world</p>');
  });

  test('block formats: headings and FormatBlock value', async ({ page }) => {
    await setContent(page, '<p>title</p><p>body</p>');
    await setCaret(page, 'p', 1);
    await exec(page, 'FormatBlock', 'h2');
    expect(await getContent(page)).toBe('<h2>title</h2>\n<p>body</p>');
    expect(await value(page, 'FormatBlock')).toBe('h2');
    await exec(page, 'FormatBlock', 'p');
    expect(await getContent(page)).toBe('<p>title</p>\n<p>body</p>');
  });

  test('blockquote wraps and unwraps', async ({ page }) => {
    await setContent(page, '<p>a</p><p>b</p>');
    await selectAcross(page, 'p', 0, 'p:nth-child(2)', 1);
    await exec(page, 'mceBlockQuote');
    expect(await getContent(page)).toBe('<blockquote>\n<p>a</p>\n<p>b</p>\n</blockquote>');
    expect(await state(page, 'mceBlockQuote')).toBe(true);
    await exec(page, 'mceBlockQuote');
    expect(await getContent(page)).toBe('<p>a</p>\n<p>b</p>');
  });

  test('alignment toggles exclusively', async ({ page }) => {
    await setContent(page, '<p>a</p>');
    await setCaret(page, 'p', 0);
    await exec(page, 'JustifyCenter');
    expect(await getContent(page)).toBe('<p style="text-align: center;">a</p>');
    expect(await state(page, 'JustifyCenter')).toBe(true);
    await exec(page, 'JustifyRight');
    expect(await getContent(page)).toBe('<p style="text-align: right;">a</p>');
    await exec(page, 'JustifyRight');
    expect(await getContent(page)).toBe('<p>a</p>');
  });

  test('colors, fonts and sizes with spans and removal', async ({ page }) => {
    await setContent(page, '<p>text</p>');
    await selectText(page, 'p', 0, 4);
    await exec(page, 'ForeColor', '#ff0000');
    expect(await getContent(page)).toBe('<p><span style="color: #ff0000;">text</span></p>');
    await exec(page, 'FontName', 'Arial');
    expect(await getContent(page)).toBe('<p><span style="color: #ff0000; font-family: Arial;">text</span></p>');
    await exec(page, 'FontSize', '18px');
    expect(await getContent(page)).toBe('<p><span style="color: #ff0000; font-family: Arial; font-size: 18px;">text</span></p>');
    expect(await value(page, 'FontName')).toBe('Arial');
    expect(await value(page, 'FontSize')).toBe('18px');
    await exec(page, 'ForeColor', 'default');
    expect(await getContent(page)).toBe('<p><span style="font-family: Arial; font-size: 18px;">text</span></p>');
    await exec(page, 'RemoveFormat');
    expect(await getContent(page)).toBe('<p>text</p>');
  });

  test('removeformat strips inline formatting but keeps blocks', async ({ page }) => {
    await setContent(page, '<h2><strong>a <em>b</em></strong> <span class="x">c</span></h2>');
    await selectText(page, 'strong', 0, 1);
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.execCommand('SelectAll'));
    await exec(page, 'RemoveFormat');
    expect(await getContent(page)).toBe('<h2>a b c</h2>');
  });

  test('links via mceInsertLink and unlink', async ({ page }) => {
    await setContent(page, '<p>click here now</p>');
    await selectText(page, 'p', 6, 10);
    await exec(page, 'mceInsertLink', { href: 'https://example.com/', target: '_blank' });
    expect(await getContent(page)).toBe('<p>click <a href="https://example.com/" target="_blank" rel="noopener">here</a> now</p>');
    await exec(page, 'unlink');
    expect(await getContent(page)).toBe('<p>click here now</p>');
  });

  test('indent and outdent paragraphs', async ({ page }) => {
    await setContent(page, '<p>a</p>');
    await setCaret(page, 'p', 0);
    await exec(page, 'Indent');
    expect(await getContent(page)).toBe('<p style="padding-left: 40px;">a</p>');
    expect(await state(page, 'Outdent')).toBe(true);
    await exec(page, 'Indent');
    expect(await getContent(page)).toBe('<p style="padding-left: 80px;">a</p>');
    await exec(page, 'Outdent');
    await exec(page, 'Outdent');
    expect(await getContent(page)).toBe('<p>a</p>');
    expect(await state(page, 'Outdent')).toBe(false);
  });

  test('keyboard shortcut Ctrl+B toggles bold', async ({ page }) => {
    await setContent(page, '<p>text</p>');
    await selectText(page, 'p', 0, 4);
    await page.keyboard.press('ControlOrMeta+b');
    expect(await getContent(page)).toBe('<p><strong>text</strong></p>');
  });

  test('formatChanged fires on caret movement', async ({ page }) => {
    await setContent(page, '<p>plain <strong>bold</strong></p>');
    const states = await page.evaluate(async () => {
      const ed = (window as any).kHtmlEditor.activeEditor;
      const log: boolean[] = [];
      ed.formatter.formatChanged('bold', (s: boolean) => log.push(s));
      const strong = ed.getBody().querySelector('strong').firstChild;
      let rng = ed.getDoc().createRange();
      rng.setStart(strong, 2);
      rng.collapse(true);
      ed.focus();
      ed.selection.setRng(rng);
      ed.nodeChanged();
      const plain = ed.getBody().querySelector('p').firstChild;
      rng = ed.getDoc().createRange();
      rng.setStart(plain, 1);
      rng.collapse(true);
      ed.selection.setRng(rng);
      ed.nodeChanged();
      return log;
    });
    expect(states).toEqual([true, false]);
  });

  test('custom formats via the formats option and style_formats-like usage', async ({ page }) => {
    await page.evaluate(async () => {
      const k = (window as any).kHtmlEditor;
      k.remove();
      await k.init({ selector: '#editor', formats: { custom_mark: { inline: 'span', classes: 'highlight', styles: { backgroundColor: 'yellow' } }, custom_block: { block: 'div', classes: 'callout' } } });
    });
    await setContent(page, '<p>some text</p>');
    await selectText(page, 'p', 0, 4);
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.formatter.apply('custom_mark'));
    expect(await getContent(page)).toBe('<p><span style="background-color: yellow;" class="highlight">some</span> text</p>');
    expect(await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.formatter.match('custom_mark'))).toBe(true);
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.formatter.apply('custom_block'));
    expect(await getContent(page)).toBe('<div class="callout"><span style="background-color: yellow;" class="highlight">some</span> text</div>');
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.formatter.remove('custom_mark'));
    expect(await getContent(page)).toBe('<div class="callout">some text</div>');
  });
});
