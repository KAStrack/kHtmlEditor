import type { Page } from '@playwright/test';

export const openHarness = async (page: Page): Promise<void> => {
  await page.goto('/tests/e2e/harness.html');
  await page.waitForFunction(() => !!(window as any).kHtmlEditor);
};

export const initEditor = async (page: Page, config: Record<string, any> = {}): Promise<void> => {
  await page.evaluate(async (cfg) => {
    const k = (window as any).kHtmlEditor;
    await k.init({ selector: '#editor', ...cfg });
  }, config);
};

export const getContent = (page: Page, args?: Record<string, any>): Promise<string> =>
  page.evaluate((a) => (window as any).kHtmlEditor.activeEditor.getContent(a), args);

export const setContent = (page: Page, html: string): Promise<void> =>
  page.evaluate((h) => {
    (window as any).kHtmlEditor.activeEditor.setContent(h);
  }, html);

export const getBodyHtml = (page: Page): Promise<string> => page.evaluate(() => (window as any).kHtmlEditor.activeEditor.getBody().innerHTML);

export const editorFrame = (page: Page) => page.frameLocator('#editor_ifr');

export const focusEditor = (page: Page): Promise<void> => page.evaluate(() => (window as any).kHtmlEditor.activeEditor.focus());

export const setCaret = async (page: Page, selector: string, offset: number, textIndex = 0): Promise<void> => {
  await page.evaluate(
    ({ selector, offset, textIndex }) => {
      const ed = (window as any).kHtmlEditor.activeEditor;
      const el = ed.getBody().querySelector(selector);
      const walker = ed.getDoc().createTreeWalker(el, 4);
      let text = walker.nextNode();
      for (let i = 0; i < textIndex && text; i++) {
        text = walker.nextNode();
      }
      const rng = ed.getDoc().createRange();
      rng.setStart(text || el, offset);
      rng.collapse(true);
      ed.focus();
      ed.selection.setRng(rng);
    },
    { selector, offset, textIndex },
  );
};

export const selectText = async (page: Page, selector: string, start: number, end: number): Promise<void> => {
  await page.evaluate(
    ({ selector, start, end }) => {
      const ed = (window as any).kHtmlEditor.activeEditor;
      const el = ed.getBody().querySelector(selector);
      const walker = ed.getDoc().createTreeWalker(el, 4);
      const text = walker.nextNode();
      const rng = ed.getDoc().createRange();
      rng.setStart(text, start);
      rng.setEnd(text, end);
      ed.focus();
      ed.selection.setRng(rng);
    },
    { selector, start, end },
  );
};
