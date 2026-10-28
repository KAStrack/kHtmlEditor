import kHtmlEditor from './index';

declare global {
  interface Window {
    kHtmlEditor: typeof kHtmlEditor;
  }
}

window.kHtmlEditor = kHtmlEditor;
