import type { Editor } from '../core/Editor';
import { encodeRaw } from '../html/Entities';

/** Shared helpers for the paste pipeline. */
export const INTERNAL_MARKER = '<!-- x-tinymce/html -->';

export const markInternal = (html: string): string => INTERNAL_MARKER + html;
export const isMarkedInternal = (html: string): boolean => html.indexOf(INTERNAL_MARKER) !== -1;
export const unmarkInternal = (html: string): string => html.replace(INTERNAL_MARKER, '');

export const isWordContent = (html: string): boolean =>
  /class="?Mso|style="[^"]*\bmso-|w:WordDocument|<o:p>|urn:schemas-microsoft-com:office/i.test(html) || /<meta[^>]+content=["']?Microsoft (Word|Excel)/i.test(html);

export const isGoogleDocsContent = (html: string): boolean => /<b[^>]*id="?docs-internal-guid/i.test(html);

export const isWebkitContent = (html: string): boolean => /<meta charset=['"]utf-8['"]>/i.test(html) || /webkit-/i.test(html);

/** Strips the wrapper markup browsers add around copied fragments. */
export const trimHtml = (html: string): string =>
  html
    .replace(/<!--StartFragment-->|<!--EndFragment-->/g, '')
    .replace(/^[\s\S]*?<body[^>]*>/i, '')
    .replace(/<\/body>[\s\S]*$/i, '')
    .replace(/^\s*<meta[^>]*>\s*/i, '')
    .trim();

export const parseInert = (html: string): HTMLElement => new DOMParser().parseFromString('<!doctype html><html><body>' + html + '</body></html>', 'text/html').body;

export const innerText = (html: string): string => parseInert(html).textContent ?? '';

/**
 * Plain text to HTML: paragraphs on blank lines, `<br>` on single newlines, tabs as nbsp runs
 * and alternating nbsp/space for repeated spaces (TinyMCE Newlines behaviour).
 */
export const convertPlainTextToHtml = (editor: Editor, text: string): string => {
  const blockName = (editor.options.get('forced_root_block') as string) || 'p';
  const tabSpaces = Math.max(0, Number(editor.options.get('paste_tab_spaces')) || 0);
  const encode = (s: string) =>
    encodeRaw(s, false)
      .replace(/\t/g, ' '.repeat(tabSpaces))
      .replace(/ {2,}/g, (m) => m.split('').map((_c, i) => (i % 2 === 0 ? ' ' : ' ')).join(''))
      .replace(/^ /, ' ')
      .replace(/ $/, ' ')
      .replace(/ /g, '&nbsp;');
  const normalized = text.replace(/\r\n?/g, '\n');
  const paragraphs = normalized.split(/\n{2,}/);
  const html = paragraphs
    .filter((p) => p.length > 0)
    .map((p) => `<${blockName}>${p.split('\n').map(encode).join('<br>')}</${blockName}>`)
    .join('\n');
  if (paragraphs.length === 1 && normalized.indexOf('\n') === -1) {
    // Single-line text pastes inline.
    return encode(normalized);
  }
  return html;
};

export const isAbsoluteUrl = (s: string): boolean => /^(https?|ftp):\/\/[^\s"'<>]+$/i.test(s.trim());
export const isImageUrl = (editor: Editor, s: string): boolean => {
  const types = (editor.options.get('images_file_types') as string).split(',').map((t) => t.trim()).filter(Boolean);
  const re = new RegExp('\\.(' + types.join('|') + ')(\\?[^#]*)?(#.*)?$', 'i');
  return isAbsoluteUrl(s) && re.test(s.trim());
};

export const getFiles = (dt: DataTransfer | null): File[] => {
  if (!dt) {
    return [];
  }
  const out: File[] = [];
  if (dt.items) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i];
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) {
          out.push(f);
        }
      }
    }
  }
  if (out.length === 0 && dt.files) {
    for (let i = 0; i < dt.files.length; i++) {
      out.push(dt.files[i]);
    }
  }
  return out;
};

