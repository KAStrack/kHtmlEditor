import type { Editor } from '../core/Editor';
import { Env } from '../util/Env';
import { parseInert, isGoogleDocsContent } from './PasteUtils';

/**
 * Browser/Google Docs clean-up for pasted HTML (TinyMCE paste_webkit_styles behaviour plus
 * conversion of styled spans into semantic inline elements so bold/italic survive style removal).
 */
const unwrap = (el: Element): void => {
  const parent = el.parentNode;
  if (!parent) {
    return;
  }
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  parent.removeChild(el);
};

const wrapChildren = (el: Element, tag: string): void => {
  const w = el.ownerDocument.createElement(tag);
  while (el.firstChild) {
    w.appendChild(el.firstChild);
  }
  el.appendChild(w);
};

const parseDecls = (style: string): Array<[string, string]> =>
  style
    .split(';')
    .map((d) => {
      const i = d.indexOf(':');
      return i === -1 ? null : ([d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()] as [string, string]);
    })
    .filter((d): d is [string, string] => !!d && !!d[0] && !!d[1]);

/** Converts font-weight/font-style/text-decoration spans into strong/em/u/s/sub/sup. */
export const semanticizeSpans = (body: HTMLElement): void => {
  Array.from(body.querySelectorAll('span[style]')).forEach((span) => {
    const decls = parseDecls(span.getAttribute('style') || '');
    const remaining: Array<[string, string]> = [];
    const wrappers: string[] = [];
    decls.forEach(([name, value]) => {
      const v = value.toLowerCase();
      if (name === 'font-weight' && /^(bold|bolder|[6-9]00)$/.test(v)) {
        wrappers.push('strong');
      } else if (name === 'font-style' && /^(italic|oblique)$/.test(v)) {
        wrappers.push('em');
      } else if (name === 'text-decoration' || name === 'text-decoration-line') {
        if (/underline/.test(v)) {
          wrappers.push('u');
        }
        if (/line-through/.test(v)) {
          wrappers.push('s');
        }
        if (!/underline|line-through/.test(v)) {
          remaining.push([name, value]);
        }
      } else if (name === 'vertical-align' && /^(sub|super)$/.test(v)) {
        wrappers.push(v === 'sub' ? 'sub' : 'sup');
      } else if ((name === 'font-weight' && /^(normal|[1-5]00)$/.test(v)) || (name === 'font-style' && v === 'normal')) {
        // drop
      } else {
        remaining.push([name, value]);
      }
    });
    if (wrappers.length === 0) {
      return;
    }
    wrappers.forEach((tag) => wrapChildren(span, tag));
    if (remaining.length) {
      span.setAttribute('style', remaining.map(([n, v]) => n + ': ' + v).join('; ') + ';');
    } else {
      span.removeAttribute('style');
      if (span.attributes.length === 0) {
        unwrap(span);
      }
    }
  });
};

export const removeGoogleDocsWrapper = (body: HTMLElement): void => {
  Array.from(body.querySelectorAll('b[id^="docs-internal-guid"]')).forEach(unwrap);
  Array.from(body.querySelectorAll('[dir="ltr"]')).forEach((el) => el.removeAttribute('dir'));
};

const removeStyles = (body: HTMLElement, webkitStyles: string): void => {
  const keep = webkitStyles === 'none' ? [] : webkitStyles.split(/[ ,]+/).filter(Boolean);
  Array.from(body.querySelectorAll('[style]')).forEach((el) => {
    if (keep.length === 0) {
      el.removeAttribute('style');
      return;
    }
    const kept = parseDecls(el.getAttribute('style') || '').filter(([n]) => keep.includes(n));
    if (kept.length) {
      el.setAttribute('style', kept.map(([n, v]) => n + ': ' + v).join('; ') + ';');
    } else {
      el.removeAttribute('style');
    }
  });
  // Spans that carried only styles are now pointless.
  Array.from(body.querySelectorAll('span')).forEach((span) => {
    if (span.attributes.length === 0) {
      unwrap(span);
    }
  });
};

export const filterBrowserContent = (editor: Editor, html: string, internal: boolean, isWord: boolean): string => {
  if (internal || isWord) {
    return html;
  }
  const body = parseInert(html);
  const gdocs = isGoogleDocsContent(html);
  if (gdocs) {
    removeGoogleDocsWrapper(body);
  }
  const webkitStyles = String(editor.options.get('paste_webkit_styles') ?? 'none');
  const shouldRemove = (editor.options.get('paste_remove_styles_if_webkit') as boolean) && (Env.browser.isChromium() || Env.browser.isSafari() || Env.browser.isEdge() || gdocs);
  if (shouldRemove && webkitStyles !== 'all') {
    semanticizeSpans(body);
    removeStyles(body, webkitStyles);
  } else if (gdocs) {
    semanticizeSpans(body);
  }
  // Remove Apple/Chrome wrapper spans and empty inline leftovers.
  Array.from(body.querySelectorAll('span.Apple-converted-space')).forEach((s) => {
    s.replaceWith(s.ownerDocument.createTextNode(s.textContent || ' '));
  });
  Array.from(body.querySelectorAll('span[class]')).forEach((s) => {
    if (/^(Apple-|docs-|gmail)/.test(s.className)) {
      unwrap(s);
    }
  });
  Array.from(body.querySelectorAll('a > u, a > font')).forEach(unwrap);
  return body.innerHTML;
};
