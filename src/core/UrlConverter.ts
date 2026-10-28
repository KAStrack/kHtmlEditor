import type { Editor } from './Editor';
import { URI } from '../util/URI';
import * as Options from './EditorOptions';

/** Implements `editor.convertURL` (convert_urls / relative_urls / remove_script_host / urlconverter_callback). */
export const convertURL = (editor: Editor, url: string, name: string, elm?: string | Element): string => {
  const callback = Options.getUrlConverterCallback(editor);
  if (callback) {
    return callback.call(editor, url, elm as any, true, name);
  }
  const nodeName = typeof elm === 'string' ? elm.toUpperCase() : elm ? elm.nodeName : '';
  if (!Options.shouldConvertUrls(editor) || nodeName === 'LINK' || url.indexOf('file:') === 0 || url.length === 0) {
    return url;
  }
  const urlObject = new URI(url);
  const protocol = urlObject.protocol;
  if (protocol !== 'http' && protocol !== 'https' && protocol !== '' && protocol !== undefined) {
    return url;
  }
  if (Options.shouldUseRelativeUrls(editor)) {
    return editor.documentBaseURI.toRelative(url);
  }
  return editor.documentBaseURI.toAbsolute(url, Options.shouldRemoveScriptHost(editor));
};
