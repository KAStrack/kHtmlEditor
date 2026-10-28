import { test, expect, Page } from '@playwright/test';
import { openHarness, initEditor, getContent, setContent, setCaret, selectText, editorFrame } from '../helpers';

// Firefox hides the data of synthetic ClipboardEvents, so there the event is pushed through the
// editor's own dispatcher with a readable DataTransfer. Chromium gets a real DOM event.
const paste = async (page: Page, data: Record<string, string>, files?: Array<{ name: string; type: string; base64: string }>) => {
  const ff = await page.evaluate(() => /Firefox/.test(navigator.userAgent));
  await page.evaluate(
    ({ data, files, ff }) => {
      const ed = (window as any).kHtmlEditor.activeEditor;
      const dt = new DataTransfer();
      Object.keys(data).forEach((k) => dt.setData(k, data[k]));
      (files || []).forEach((f) => {
        const bin = atob(f.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) {
          bytes[i] = bin.charCodeAt(i);
        }
        dt.items.add(new File([bytes], f.name, { type: f.type }));
      });
      if (ff) {
        ed.dispatch('paste', { clipboardData: dt, target: ed.getBody() });
      } else {
        ed.getBody().dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      }
    },
    { data, files, ff },
  );
};
const copyOrCut = async (page: Page, type: 'copy' | 'cut') => {
  const ff = await page.evaluate(() => /Firefox/.test(navigator.userAgent));
  return page.evaluate(
    ({ type, ff }) => {
      const ed = (window as any).kHtmlEditor.activeEditor;
      const dt = new DataTransfer();
      if (ff) {
        ed.dispatch(type, { clipboardData: dt, target: ed.getBody() });
      } else {
        ed.getBody().dispatchEvent(new ClipboardEvent(type, { clipboardData: dt, bubbles: true, cancelable: true }));
      }
      return { html: dt.getData('text/html'), text: dt.getData('text/plain') };
    },
    { type, ff },
  );
};

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const WORD = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta name=Generator content="Microsoft Word 15"><style><!-- p.MsoNormal {margin:0in;} --></style></head><body lang=EN-US style='tab-interval:.5in'>
<!--StartFragment-->
<p class=MsoNormal><b>Bold</b> text<o:p></o:p></p>
<p class=MsoListParagraphCxSpFirst style='text-indent:-.25in;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol;mso-fareast-font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>One<o:p></o:p></p>
<p class=MsoListParagraphCxSpMiddle style='margin-left:1.0in;text-indent:-.25in;mso-list:l0 level2 lfo1'><![if !supportLists]><span style='font-family:"Courier New"'><span style='mso-list:Ignore'>o<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span></span><![endif]>Two<o:p></o:p></p>
<p class=MsoListParagraphCxSpLast style='text-indent:-.25in;mso-list:l1 level1 lfo2'><![if !supportLists]><span style='mso-list:Ignore'>1.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span><![endif]>Three<o:p></o:p></p>
<p class=MsoNormal align=center style='text-align:center;mso-pagination:widow-orphan'><span style='color:red;mso-bidi-font-weight:bold'>Red</span> centred<o:p></o:p></p>
<!--EndFragment-->
</body></html>`;

const GDOCS = `<meta charset='utf-8'><meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1234-abcd"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial;color:#000000;background-color:transparent;font-weight:700;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Bold</span><span style="font-size:11pt;font-family:Arial;color:#000000;font-weight:400;font-style:italic;text-decoration:none;white-space:pre-wrap;"> italic</span><span style="font-size:11pt;font-family:Arial;font-weight:400;text-decoration:underline;white-space:pre-wrap;"> under</span></p></b>`;

test.describe('paste', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page);
    await initEditor(page, { menubar: false, toolbar: 'bold pastetext', convert_urls: false });
  });

  test('Google Docs HTML keeps bold/italic/underline but drops the styling noise', async ({ page }) => {
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await paste(page, { 'text/html': GDOCS, 'text/plain': 'Bold italic under' });
    expect(await getContent(page)).toBe('<p>x</p>\n<p><strong>Bold</strong><em> italic</em><u> under</u></p>');
  });

  test('Word HTML becomes clean lists and paragraphs', async ({ page }) => {
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await paste(page, { 'text/html': WORD, 'text/plain': 'Bold text' });
    expect(await getContent(page)).toBe(
      '<p>x</p>\n<p><strong>Bold</strong> text</p>\n<ul>\n<li>One\n<ul>\n<li>Two</li>\n</ul>\n</li>\n</ul>\n<ol>\n<li>Three</li>\n</ol>\n<p style="text-align: center;"><span style="color: red;">Red</span> centred</p>',
    );
  });

  test('plain text pastes paragraphs, line breaks and tabs', async ({ page }) => {
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await paste(page, { 'text/plain': 'line1\nline2\n\npara2\ttab  two' });
    expect(await getContent(page)).toBe('<p>x</p>\n<p>line1<br>line2</p>\n<p>para2&nbsp;&nbsp;&nbsp;&nbsp;tab &nbsp;two</p>');
    await setContent(page, '<p>ab</p>');
    await setCaret(page, 'p', 1);
    await paste(page, { 'text/plain': 'X < Y' });
    expect(await getContent(page)).toBe('<p>aX &lt; Yb</p>');
  });

  test('paste as text mode and the mceTogglePlainTextPaste command', async ({ page }) => {
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await page.evaluate(() => {
      (window as any).__toggle = [];
      (window as any).kHtmlEditor.activeEditor.on('PastePlainTextToggle', (e: any) => (window as any).__toggle.push(e.state));
    });
    await page.locator('#editor_parent [data-khe-name="pastetext"]').click();
    expect(await page.evaluate(() => (window as any).__toggle)).toEqual([true]);
    expect(await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.queryCommandState('mceTogglePlainTextPaste'))).toBe(true);
    await paste(page, { 'text/html': '<p><strong>Bold</strong> html</p>', 'text/plain': 'Bold html' });
    expect(await getContent(page)).toBe('<p>xBold html</p>');
    await expect(page.locator('#editor_parent [data-khe-name="pastetext"]')).toHaveClass(/khe-tbtn--active/);
  });

  test('image files paste as blobs and serialise as data URIs without an upload URL', async ({ page }) => {
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await paste(page, {}, [{ name: 'shot.png', type: 'image/png', base64: PNG }]);
    await expect(editorFrame(page).locator('img')).toHaveCount(1);
    expect(await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.getBody().querySelector('img').src)).toMatch(/^blob:/);
    expect(await getContent(page)).toBe(`<p>x<img src="data:image/png;base64,${PNG}" alt="shot"></p>`);
    const undo = await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.undoManager.hasUndo());
    expect(undo).toBe(true);
  });

  test('pasted image files are uploaded automatically when configured', async ({ page }) => {
    await page.route('**/upload', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ location: '/up/shot.png' }) }));
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.remove());
    await initEditor(page, { menubar: false, images_upload_url: '/upload', convert_urls: false });
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await paste(page, {}, [{ name: 'shot.png', type: 'image/png', base64: PNG }]);
    await expect.poll(() => getContent(page)).toBe('<p>x<img src="/up/shot.png" alt="shot"></p>');
  });

  test('smart paste turns URLs into links or images', async ({ page }) => {
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await paste(page, { 'text/plain': 'https://example.com/pic.png' });
    expect(await getContent(page)).toBe('<p>x<img src="https://example.com/pic.png"></p>');
    await setContent(page, '<p>click here</p>');
    await selectText(page, 'p', 0, 5);
    await paste(page, { 'text/plain': 'https://example.com/' });
    expect(await getContent(page)).toBe('<p><a href="https://example.com/">click</a> here</p>');
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await paste(page, { 'text/plain': 'https://example.com/page' });
    expect(await getContent(page)).toBe('<p>x<a href="https://example.com/page">https://example.com/page</a></p>');
    // smart_paste off: plain text
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.options.set('smart_paste', false));
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await paste(page, { 'text/plain': 'https://example.com/page' });
    expect(await getContent(page)).toBe('<p>xhttps://example.com/page</p>');
  });

  test('copy marks the clipboard as internal and internal pastes skip the filters', async ({ page }) => {
    await setContent(page, '<p><span style="color: red;">red</span> text</p>');
    await selectText(page, 'span', 0, 3);
    const copied = await copyOrCut(page, 'copy');
    expect(copied.html).toBe('<!-- x-tinymce/html --><span style="color: red;">red</span>');
    expect(copied.text).toBe('red');
    await setCaret(page, 'p', 1, 1);
    await paste(page, { 'text/html': copied.html, 'text/plain': copied.text });
    expect(await getContent(page)).toBe('<p><span style="color: red;">red</span> <span style="color: red;">red</span>text</p>');
    // The same HTML pasted from outside (Chrome/Safari style removal) loses the colour in webkit browsers only.
    const external = await page.evaluate(() => /Chrome|Safari/.test(navigator.userAgent) && !/Firefox/.test(navigator.userAgent));
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await paste(page, { 'text/html': '<meta charset=\'utf-8\'><span style="color: red;">red</span>', 'text/plain': 'red' });
    expect(await getContent(page)).toBe(external ? '<p>xred</p>' : '<p>x<span style="color: red;">red</span></p>');
  });

  test('cut writes the clipboard and removes the selection', async ({ page }) => {
    await setContent(page, '<p>hello world</p>');
    await selectText(page, 'p', 0, 6);
    const cut = await copyOrCut(page, 'cut');
    expect(cut.text).toBe('hello ');
    await expect.poll(() => getContent(page)).toBe('<p>world</p>');
  });

  test('paste_preprocess and paste_postprocess hooks run and events can cancel', async ({ page }) => {
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.remove());
    await page.evaluate(() =>
      (window as any).kHtmlEditor.init({
        selector: '#editor',
        menubar: false,
        paste_preprocess: (_ed: any, args: any) => {
          args.content = args.content.replace('foo', 'bar');
        },
        paste_postprocess: (_ed: any, args: any) => {
          args.node.querySelectorAll('em').forEach((em: Element) => em.setAttribute('class', 'pp'));
        },
      }),
    );
    await page.waitForFunction(() => (window as any).kHtmlEditor.activeEditor?.initialized);
    await setContent(page, '<p>x</p>');
    await setCaret(page, 'p', 1);
    await paste(page, { 'text/html': '<em>foo</em>', 'text/plain': 'foo' });
    expect(await getContent(page)).toBe('<p>x<em class="pp">bar</em></p>');
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.on('PastePreProcess', (e: any) => e.preventDefault()));
    await paste(page, { 'text/html': '<em>again</em>', 'text/plain': 'again' });
    expect(await getContent(page)).toBe('<p>x<em class="pp">bar</em></p>');
  });

  test('dropping external HTML inserts it at the drop point and paste_block_drop blocks drops', async ({ page }) => {
    await setContent(page, '<p>hello world</p>');
    const frame = editorFrame(page);
    const box = await frame.locator('p').boundingBox();
    const ff = await page.evaluate(() => /Firefox/.test(navigator.userAgent));
    const drop = () =>
      page.evaluate(
        ({ x, y, ff }) => {
          const ed = (window as any).kHtmlEditor.activeEditor;
          const dt = new DataTransfer();
          dt.setData('text/html', '<strong>dropped</strong>');
          dt.setData('text/plain', 'dropped');
          const target = ed.getDoc().elementFromPoint(x, y) || ed.getBody();
          if (ff) {
            ed.dispatch('drop', { dataTransfer: dt, clientX: x, clientY: y, target });
          } else {
            target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true }));
          }
        },
        { x: 2, y: 8, ff },
      );
    void box;
    await drop();
    expect(await getContent(page)).toBe('<p><strong>dropped</strong>hello world</p>');
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.options.set('paste_block_drop', true));
    await drop();
    expect(await getContent(page)).toBe('<p><strong>dropped</strong>hello world</p>');
  });
});
