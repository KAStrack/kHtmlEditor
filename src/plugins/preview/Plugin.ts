import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';
import { encodeRaw } from '../../html/Entities';

/** Preview plugin: shows the content with the editor's content CSS in a sandboxed iframe dialog. */
export const getPreviewHtml = (editor: Editor): string => {
  let head = '';
  const base = editor.documentBaseURI ? String(editor.documentBaseURI.getURI ? editor.documentBaseURI.getURI() : editor.documentBaseURI) : document.baseURI;
  head += `<base href="${encodeRaw(base, true)}">`;
  (editor.contentCSS || []).forEach((url) => {
    head += `<link type="text/css" rel="stylesheet" href="${encodeRaw(editor.documentBaseURI && editor.documentBaseURI.toAbsolute ? editor.documentBaseURI.toAbsolute(url) : url, true)}">`;
  });
  const inlineStyles = Array.from(editor.getDoc().querySelectorAll('style[data-khe-content-css], style#mceDefaultStyles')).map((s) => s.textContent || '');
  inlineStyles.forEach((css) => {
    head += `<style>${css}</style>`;
  });
  const bodyId = (editor.options.get('body_id') as string) || 'tinymce';
  const bodyClass = (editor.options.get('body_class') as string) || '';
  const dir = (editor.options.get('directionality') as string) || '';
  return `<!DOCTYPE html><html${dir ? ` dir="${dir}"` : ''}><head>${head}</head><body id="${encodeRaw(bodyId, true)}" class="mce-content-body ${encodeRaw(bodyClass, true)}"${dir ? ` dir="${dir}"` : ''}>${editor.getContent()}</body></html>`;
};

const register = (editor: Editor): void => {
  editor.editorCommands.addCommands({
    mcePreview: () => {
      editor.windowManager.open({
        title: 'Preview',
        size: 'large',
        body: { type: 'panel', items: [{ type: 'iframe', name: 'preview', sandboxed: true, transparent: false }] },
        buttons: [{ type: 'cancel', name: 'close', text: 'Close', primary: true }],
        initialData: { preview: getPreviewHtml(editor) },
      } as any);
    },
  });
  editor.ui.registry.addButton('preview', { icon: 'preview', tooltip: 'Preview', onAction: () => editor.execCommand('mcePreview') });
  editor.ui.registry.addMenuItem('preview', { icon: 'preview', text: 'Preview', onAction: () => editor.execCommand('mcePreview') });
};

PluginManager.add('preview', register);
export default register;
