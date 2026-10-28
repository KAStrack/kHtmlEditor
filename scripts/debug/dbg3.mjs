import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()));
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:8787/tests/e2e/harness.html');
await page.evaluate(async () => { await window.kHtmlEditor.init({ selector: '#editor' }); });
const body = () => page.evaluate(() => window.kHtmlEditor.activeEditor.getBody().innerHTML);
// link
await page.evaluate(() => {
  const ed = window.kHtmlEditor.activeEditor;
  ed.setContent('<p>click here now</p>');
  const t = ed.getBody().querySelector('p').firstChild;
  const rng = ed.getDoc().createRange(); rng.setStart(t, 6); rng.setEnd(t, 10);
  ed.focus(); ed.selection.setRng(rng);
  ed.formatter.apply('link', { href: 'https://example.com/' });
});
console.log('after apply link:', JSON.stringify(await body()));
await page.evaluate(() => {
  const ed = window.kHtmlEditor.activeEditor;
  ed.setContent('<p>click here now</p>');
  const t = ed.getBody().querySelector('p').firstChild;
  const rng = ed.getDoc().createRange(); rng.setStart(t, 6); rng.setEnd(t, 10);
  ed.focus(); ed.selection.setRng(rng);
  ed.formatter.remove('link');
  console.log('after remove link sel:', ed.selection.getRng().startContainer.data, ed.selection.getRng().startOffset, ed.selection.getRng().endOffset, JSON.stringify(ed.getBody().innerHTML));
  ed.formatter.apply('link', { href: 'https://example.com/' });
});
console.log('after remove+apply link:', JSON.stringify(await body()));
// blockquote
await page.evaluate(() => {
  const ed = window.kHtmlEditor.activeEditor;
  ed.setContent('<p>a</p><p>b</p>');
  const a = ed.getBody().querySelector('p').firstChild;
  const b = ed.getBody().querySelector('p:nth-child(2)').firstChild;
  const rng = ed.getDoc().createRange(); rng.setStart(a, 0); rng.setEnd(b, 1);
  ed.focus(); ed.selection.setRng(rng);
  ed.execCommand('mceBlockQuote');
});
console.log('after blockquote:', JSON.stringify(await body()), JSON.stringify(await page.evaluate(() => window.kHtmlEditor.activeEditor.getContent())));
await page.evaluate(() => window.kHtmlEditor.activeEditor.execCommand('mceBlockQuote'));
console.log('after toggle off:', JSON.stringify(await body()), JSON.stringify(await page.evaluate(() => window.kHtmlEditor.activeEditor.getContent())));
await browser.close();
