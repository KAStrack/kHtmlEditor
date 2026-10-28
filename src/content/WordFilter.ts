import { parseInert } from './PasteUtils';

/**
 * Cleans HTML copied from Microsoft Word/Outlook: strips Office namespaces, conditional comments
 * and `mso-*` styles, converts list paragraphs to real lists and keeps only a small set of
 * presentational styles. A pragmatic port of TinyMCE's WordFilter.
 */
const KEEP_STYLES = new Set(['text-align', 'color', 'background-color', 'text-decoration', 'vertical-align', 'font-weight', 'font-style', 'width', 'height']);

const preProcess = (html: string): string =>
  html
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<!\[if\s[^\]]*\]>|<!\[endif\]>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<xml[\s\S]*?<\/xml>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?(?:o|w|v|m|st1|x):[^>]*>/gi, '')
    .replace(/<\/?(?:meta|link|title|head|html|body)[^>]*>/gi, '');

const bulletInfo = (text: string): { tag: 'ul' | 'ol'; style?: string } | null => {
  const t = text.replace(/[\s ]+/g, '');
  if (!t) {
    return null;
  }
  if (/^[•·§●■▪–—\-o*➢✔❖]$/.test(t)) {
    return { tag: 'ul' };
  }
  if (/^\d+[.)]?$/.test(t)) {
    return { tag: 'ol' };
  }
  if (/^[ivxlcdm]+[.)]$/.test(t)) {
    return { tag: 'ol', style: 'lower-roman' };
  }
  if (/^[IVXLCDM]+[.)]$/.test(t)) {
    return { tag: 'ol', style: 'upper-roman' };
  }
  if (/^[a-z][.)]$/.test(t)) {
    return { tag: 'ol', style: 'lower-alpha' };
  }
  if (/^[A-Z][.)]$/.test(t)) {
    return { tag: 'ol', style: 'upper-alpha' };
  }
  if (/^\(?\d+\)$/.test(t) || /^\d+(\.\d+)+\.?$/.test(t)) {
    return { tag: 'ol' };
  }
  return null;
};

const listLevel = (p: Element): number => {
  const m = /mso-list:[^;"]*level(\d+)/i.exec(p.getAttribute('style') || '');
  return m ? Math.max(1, parseInt(m[1], 10)) : 1;
};

const isListParagraph = (el: Element): boolean => {
  const style = el.getAttribute('style') || '';
  const cls = el.getAttribute('class') || '';
  if (/mso-list:\s*none/i.test(style)) {
    return false;
  }
  return /mso-list:/i.test(style) || /MsoListParagraph/i.test(cls);
};

/** Removes the bullet/number text Word emits at the start of a list paragraph and returns it. */
const extractBullet = (p: Element): string => {
  const ignore = Array.from(p.querySelectorAll('span')).find((s) => /mso-list:\s*ignore/i.test(s.getAttribute('style') || ''));
  if (ignore) {
    const text = ignore.textContent || '';
    // Word nests the Ignore span inside a symbol-font span; drop that wrapper when it becomes empty.
    let target: Element = ignore;
    while (target.parentElement && target.parentElement !== p && target.parentElement.childNodes.length === 1) {
      target = target.parentElement;
    }
    target.remove();
    return text;
  }
  // No marker span: look at the leading text.
  const walker = p.ownerDocument.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  const first = walker.nextNode() as Text | null;
  if (first) {
    const m = /^([\s ]*(?:[•·§●■▪–\-o*]|\d+[.)]|[a-zA-Z][.)]|[ivxlcdmIVXLCDM]+[.)])[\s ]+)/.exec(first.data);
    if (m) {
      first.data = first.data.slice(m[1].length);
      return m[1];
    }
  }
  return '';
};

const convertLists = (body: HTMLElement): void => {
  const doc = body.ownerDocument;
  let stack: Array<{ list: HTMLElement; level: number }> = [];
  const children = Array.from(body.children);
  for (const el of children) {
    if (!/^(P|H[1-6]|DIV)$/.test(el.nodeName) || !isListParagraph(el)) {
      stack = [];
      continue;
    }
    const level = listLevel(el);
    const bullet = extractBullet(el);
    const info = bulletInfo(bullet) ?? { tag: 'ul' as const };
    // Pop deeper levels.
    while (stack.length && stack[stack.length - 1].level > level) {
      stack.pop();
    }
    let current = stack.length ? stack[stack.length - 1] : null;
    if (!current || current.level < level) {
      const list = doc.createElement(info.tag);
      if (info.style) {
        list.setAttribute('style', 'list-style-type: ' + info.style + ';');
      }
      if (!current) {
        el.parentNode?.insertBefore(list, el);
      } else {
        // Nest inside the last item of the parent list.
        let li = current.list.lastElementChild;
        if (!li) {
          li = doc.createElement('li');
          current.list.appendChild(li);
        }
        li.appendChild(list);
      }
      current = { list, level };
      stack.push(current);
    } else if (current.level === level && current.list.nodeName.toLowerCase() !== info.tag && stack.length === 1) {
      // Different list type at the root level: start a sibling list.
      const list = doc.createElement(info.tag);
      if (info.style) {
        list.setAttribute('style', 'list-style-type: ' + info.style + ';');
      }
      el.parentNode?.insertBefore(list, el);
      current = { list, level };
      stack = [current];
    }
    const li = doc.createElement('li');
    while (el.firstChild) {
      li.appendChild(el.firstChild);
    }
    current.list.appendChild(li);
    el.remove();
  }
};

const filterStyle = (el: Element): void => {
  const style = el.getAttribute('style');
  if (!style) {
    return;
  }
  const kept: string[] = [];
  style.split(';').forEach((decl) => {
    const idx = decl.indexOf(':');
    if (idx === -1) {
      return;
    }
    let name = decl.slice(0, idx).trim().toLowerCase();
    let value = decl.slice(idx + 1).trim();
    if (!name || !value || name.startsWith('mso-')) {
      if (name === 'mso-highlight') {
        name = 'background-color';
      } else {
        return;
      }
    }
    if (name === 'background') {
      name = 'background-color';
    }
    if (name === 'font-weight' && !/^(bold|[6-9]00)$/i.test(value)) {
      return;
    }
    if (name === 'font-style' && !/^(italic|oblique)$/i.test(value)) {
      return;
    }
    if (name === 'text-decoration' && /^none$/i.test(value)) {
      return;
    }
    if (name === 'color' && /^(windowtext|black|#000000)$/i.test(value)) {
      return;
    }
    if ((name === 'width' || name === 'height') && !/^(TABLE|TD|TH|IMG|COL)$/.test(el.nodeName)) {
      return;
    }
    if (!KEEP_STYLES.has(name)) {
      return;
    }
    value = value.replace(/\s+!important/i, '');
    kept.push(name + ': ' + value);
  });
  if (kept.length) {
    el.setAttribute('style', kept.join('; ') + ';');
  } else {
    el.removeAttribute('style');
  }
};

const cleanElements = (body: HTMLElement): void => {
  Array.from(body.querySelectorAll('*')).forEach((el) => {
    if (!el.isConnected) {
      return;
    }
    const name = el.nodeName;
    if (name === 'A' && !el.getAttribute('href')) {
      // Word bookmarks (_Toc, _GoBack ...): unwrap.
      unwrap(el);
      return;
    }
    if (/^(FONT)$/.test(name)) {
      unwrap(el);
      return;
    }
    // Attributes: keep href, name, src, alt, colspan, rowspan, width, height, start, type, style.
    Array.from(el.attributes).forEach((attr) => {
      const an = attr.name.toLowerCase();
      if (an === 'align' && /^(P|H[1-6]|DIV|TD|TH)$/.test(name)) {
        const prev = el.getAttribute('style') || '';
        el.setAttribute('style', prev + (prev && !prev.trim().endsWith(';') ? ';' : '') + 'text-align: ' + attr.value + ';');
        el.removeAttribute(attr.name);
        return;
      }
      if (an === 'style') {
        return;
      }
      if (!/^(href|name|src|alt|title|colspan|rowspan|width|height|start|type|border|cellpadding|cellspacing)$/.test(an)) {
        el.removeAttribute(attr.name);
      }
    });
    filterStyle(el);
    if (name === 'SPAN' && el.attributes.length === 0) {
      unwrap(el);
    }
  });
  // Remove empty paragraphs Word uses as spacers (only nbsp).
  Array.from(body.querySelectorAll('p')).forEach((p) => {
    if (!p.querySelector('img,br,table') && (p.textContent || '').replace(/[\s ]+/g, '') === '' && p.nextElementSibling && p.previousElementSibling) {
      p.remove();
    }
  });
};

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

export const filterWordContent = (html: string): string => {
  const body = parseInert(preProcess(html));
  convertLists(body);
  cleanElements(body);
  return body.innerHTML;
};
