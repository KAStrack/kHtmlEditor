/**
 * Drop-in shim: exposes kHtmlEditor under the `tinymce` and `tinyMCE` globals so existing pages
 * can keep calling `tinymce.init({...})` without any code changes. Load it after khtmleditor.js.
 */
(() => {
  const g = window as any;
  if (!g.kHtmlEditor) {
    console.error('kHtmlEditor TinyMCE shim: load khtmleditor.js before the shim.');
    return;
  }
  if (g.tinymce && !g.tinymce.isKHtmlEditor) {
    console.warn('kHtmlEditor TinyMCE shim: a real TinyMCE global is already present; not overriding it.');
    return;
  }
  g.tinymce = g.kHtmlEditor;
  g.tinyMCE = g.kHtmlEditor;
})();
