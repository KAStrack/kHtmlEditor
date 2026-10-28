import { test, expect } from '@playwright/test';
import { openHarness, initEditor, getContent, setContent, getBodyHtml, editorFrame } from '../helpers';

test.describe('editor init', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page);
  });

  test('replaces the textarea with an iframe and loads its content', async ({ page }) => {
    await initEditor(page);
    await expect(page.locator('#editor_ifr')).toBeVisible();
    await expect(page.locator('#editor')).toBeHidden();
    await expect(editorFrame(page).locator('body')).toHaveAttribute('contenteditable', 'true');
    expect(await getBodyHtml(page)).toBe('<p>Initial <strong>content</strong></p>');
    expect(await getContent(page)).toBe('<p>Initial <strong>content</strong></p>');
  });

  test('exposes the TinyMCE-compatible global API', async ({ page }) => {
    await initEditor(page);
    const api = await page.evaluate(() => {
      const k = (window as any).kHtmlEditor;
      const ed = k.get('editor');
      return {
        isSame: ed === k.activeEditor,
        count: k.editors.length,
        byIndex: k.get(0) === ed,
        majorVersion: k.majorVersion,
        hasInit: ed.initialized,
        id: ed.id,
        methods: ['getContent', 'setContent', 'insertContent', 'save', 'load', 'isDirty', 'setDirty', 'focus', 'on', 'off', 'execCommand', 'queryCommandState', 'addCommand', 'addShortcut', 'getBody', 'getDoc', 'getWin', 'getContainer', 'getElement', 'remove', 'destroy', 'uploadImages', 'nodeChanged', 'translate'].every((m) => typeof ed[m] === 'function'),
        subApis: ['dom', 'selection', 'formatter', 'undoManager', 'schema', 'parser', 'serializer', 'mode', 'options', 'ui', 'windowManager', 'notificationManager', 'plugins', 'editorUpload'].every((p) => !!ed[p]),
        registry: typeof ed.ui.registry.addButton === 'function',
      };
    });
    expect(api).toEqual({ isSame: true, count: 1, byIndex: true, majorVersion: '7', hasInit: true, id: 'editor', methods: true, subApis: true, registry: true });
  });

  test('setContent and getContent round trip through the sanitiser', async ({ page }) => {
    await initEditor(page);
    await setContent(page, '<p>Hello <b>world</b></p><script>alert(1)</script><p onclick="x()">x<br></p>');
    expect(await getContent(page)).toBe('<p>Hello <strong>world</strong></p>\n<p>x</p>');
    expect(await getBodyHtml(page)).toBe('<p>Hello <strong>world</strong></p><p>x</p>');
  });

  test('empty content keeps a padded root block', async ({ page }) => {
    await initEditor(page);
    await setContent(page, '');
    expect(await getBodyHtml(page)).toBe('<p><br data-mce-bogus="1"></p>');
    expect(await getContent(page)).toBe('');
  });

  test('fires init, SetContent, GetContent and change events', async ({ page }) => {
    const events = await page.evaluate(async () => {
      const k = (window as any).kHtmlEditor;
      const log: string[] = [];
      await k.init({
        selector: '#editor',
        setup: (ed: any) => {
          ed.on('init', () => log.push('init'));
          ed.on('PreInit', () => log.push('preinit'));
          ed.on('PostRender', () => log.push('postrender'));
          ed.on('BeforeSetContent', (e: any) => log.push('beforesetcontent:' + e.content));
          ed.on('SetContent', () => log.push('setcontent'));
          ed.on('GetContent', (e: any) => log.push('getcontent:' + e.content));
          ed.on('change', () => log.push('change'));
          ed.on('dirty', () => log.push('dirty'));
        },
      });
      const ed = k.activeEditor;
      ed.setContent('<p>a</p>');
      ed.getContent();
      ed.undoManager.add();
      return { log, dirty: ed.isDirty() };
    });
    expect(events.log.slice(0, 3)).toEqual(['preinit', 'postrender', 'beforesetcontent:<p>Initial <strong>content</strong></p>']);
    expect(events.log).toContain('init');
    expect(events.log).toContain('beforesetcontent:<p>a</p>');
    expect(events.log).toContain('getcontent:<p>a</p>');
    expect(events.log).toContain('change');
    expect(events.log).toContain('dirty');
    expect(events.dirty).toBe(true);
  });

  test('saves back to the textarea on form submit and triggerSave', async ({ page }) => {
    await initEditor(page);
    await setContent(page, '<p>Saved</p>');
    await page.evaluate(() => (window as any).kHtmlEditor.triggerSave());
    expect(await page.inputValue('#editor')).toBe('<p>Saved</p>');
    await setContent(page, '<p>Submitted</p>');
    await page.evaluate(() => (document.getElementById('form') as HTMLFormElement).requestSubmit());
    expect(await page.inputValue('#editor')).toBe('<p>Submitted</p>');
  });

  test('init on a div creates a hidden input and remove restores the element', async ({ page }) => {
    await initEditor(page, { selector: '#divEditor' });
    expect(await page.locator('input[type="hidden"][name="divEditor"]').count()).toBe(1);
    await page.evaluate(() => {
      const ed = (window as any).kHtmlEditor.get('divEditor');
      ed.setContent('<p>Changed</p>');
      ed.remove();
    });
    expect(await page.locator('#divEditor_ifr').count()).toBe(0);
    await expect(page.locator('#divEditor')).toBeVisible();
    expect(await page.locator('#divEditor').innerHTML()).toBe('<p>Changed</p>');
    expect(await page.evaluate(() => (window as any).kHtmlEditor.get('divEditor'))).toBeNull();
  });

  test('readonly option and mode switching', async ({ page }) => {
    await initEditor(page, { readonly: true });
    await expect(editorFrame(page).locator('body')).toHaveAttribute('contenteditable', 'false');
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.mode.set('design'));
    await expect(editorFrame(page).locator('body')).toHaveAttribute('contenteditable', 'true');
    expect(await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.mode.get())).toBe('design');
  });

  test('insertContent inserts inline and block content at the caret', async ({ page }) => {
    await initEditor(page);
    await setContent(page, '<p>ab</p>');
    await page.evaluate(() => {
      const ed = (window as any).kHtmlEditor.activeEditor;
      const text = ed.getBody().firstChild.firstChild;
      const rng = ed.getDoc().createRange();
      rng.setStart(text, 1);
      rng.collapse(true);
      ed.focus();
      ed.selection.setRng(rng);
      ed.insertContent('<em>X</em>');
    });
    expect(await getContent(page)).toBe('<p>a<em>X</em>b</p>');
    await page.evaluate(() => {
      const ed = (window as any).kHtmlEditor.activeEditor;
      ed.insertContent('<h2>Title</h2>');
    });
    expect(await getContent(page)).toBe('<p>a<em>X</em></p>\n<h2>Title</h2>\n<p>b</p>');
  });

  test('undo and redo restore content', async ({ page }) => {
    await initEditor(page);
    await page.evaluate(() => {
      const ed = (window as any).kHtmlEditor.activeEditor;
      ed.setContent('<p>one</p>');
      ed.undoManager.add();
      ed.setContent('<p>two</p>');
      ed.undoManager.add();
    });
    expect(await getContent(page)).toBe('<p>two</p>');
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.execCommand('Undo'));
    expect(await getContent(page)).toBe('<p>one</p>');
    await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.execCommand('Redo'));
    expect(await getContent(page)).toBe('<p>two</p>');
    expect(await page.evaluate(() => (window as any).kHtmlEditor.activeEditor.queryCommandState('Undo'))).toBe(true);
  });

  test('custom commands and shortcuts work from setup', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const k = (window as any).kHtmlEditor;
      let fired = 0;
      await k.init({
        selector: '#editor',
        setup: (ed: any) => {
          ed.addCommand('myCommand', (_ui: boolean, value: string) => {
            fired++;
            ed.setContent('<p>' + value + '</p>');
          });
          ed.addShortcut('meta+shift+9', 'test', 'myCommand');
        },
      });
      const ed = k.activeEditor;
      ed.execCommand('myCommand', false, 'via command');
      return { fired, content: ed.getContent(), supported: ed.queryCommandSupported('myCommand') };
    });
    expect(result).toEqual({ fired: 1, content: '<p>via command</p>', supported: true });
  });

  test('tinymce shim aliases the global', async ({ page }) => {
    await page.addScriptTag({ url: '/dist/khtmleditor.tinymce-shim.js' });
    const same = await page.evaluate(() => (window as any).tinymce === (window as any).kHtmlEditor && (window as any).tinyMCE === (window as any).kHtmlEditor);
    expect(same).toBe(true);
    await page.evaluate(async () => {
      await (window as any).tinymce.init({ selector: '#editor' });
    });
    expect(await page.evaluate(() => (window as any).tinymce.activeEditor.getContent())).toBe('<p>Initial <strong>content</strong></p>');
  });
});
