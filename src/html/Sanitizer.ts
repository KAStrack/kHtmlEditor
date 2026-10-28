import { URI } from '../util/URI';
import { isElement } from './Empty';

/**
 * Always-on XSS layer applied by the HtmlParser before schema validation. It mirrors the
 * protections TinyMCE gets from DOMPurify plus TinyMCE's own url/embed/iframe policies.
 */

export interface SanitizerSettings {
  allow_html_data_urls?: boolean;
  allow_svg_data_urls?: boolean;
  allow_script_urls?: boolean;
  allow_unsafe_link_target?: boolean;
  allow_conditional_comments?: boolean;
  allow_html_in_comments?: boolean;
  convert_unsafe_embeds?: boolean;
  sandbox_iframes?: boolean;
  sandbox_iframes_exclusions?: string[];
}

export const XHTML_NS = 'http://www.w3.org/1999/xhtml';
export const SVG_NS = 'http://www.w3.org/2000/svg';
export const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/** Elements removed with their content regardless of the schema. */
export const forbiddenElements = new Set(
  'script noscript template style head title meta link base applet frame frameset xmp plaintext listing noembed noframes slot basefont bgsound isindex keygen command'.split(' '),
);

/** Attributes removed regardless of the schema. */
const forbiddenAttributes = new Set(['formaction', 'srcdoc', 'xmlns', 'is', 'nonce', 'http-equiv', 'slot', 'ping', 'xlink:actuate', 'xml:base', 'onbegin', 'onend', 'onrepeat']);

/** Attributes whose value is a URL and must pass the scheme policy. */
export const urlAttributes = new Set(['href', 'src', 'srcset', 'poster', 'cite', 'action', 'data', 'xlink:href', 'background', 'usemap', 'longdesc', 'manifest', 'codebase', 'classid', 'archive', 'dynsrc', 'lowsrc']);

const svgForbidden = new Set(['script', 'foreignobject', 'set', 'animate', 'animatemotion', 'animatetransform', 'handler', 'listener', 'use', 'iframe', 'style', 'a']);

const clobberBlocklist = /^(__proto__|constructor|prototype)$/i;

export const DEFAULT_IFRAME_EXCLUSIONS = ['youtube.com', 'youtu.be', 'vimeo.com', 'player.vimeo.com', 'dailymotion.com', 'embed.music.apple.com', 'open.spotify.com', 'giphy.com', 'dai.ly', 'codepen.io'];

const attrNameNoise = new RegExp('[\\u0000-\\u0020\\u007f-\\u009f\\u00a0\\u200b-\\u200f\\u2028-\\u202f\\ufeff]', 'g');
const normalizeAttrName = (name: string): string => name.toLowerCase().replace(attrNameNoise, '');

const isEventHandler = (name: string): boolean => /^on/i.test(normalizeAttrName(name));

/** Property names on window/document/forms that `id`/`name` values must not shadow. */
const protectedNames = (): Set<string> => {
  if (cachedProtected) {
    return cachedProtected;
  }
  const names = new Set<string>();
  const collect = (obj: any) => {
    if (!obj) {
      return;
    }
    let cur = obj;
    let guard = 0;
    while (cur && guard++ < 12) {
      for (const n of Object.getOwnPropertyNames(cur)) {
        names.add(n.toLowerCase());
      }
      cur = Object.getPrototypeOf(cur);
    }
  };
  if (typeof document !== 'undefined') {
    collect(document);
  }
  if (typeof window !== 'undefined') {
    collect(window);
  }
  if (typeof HTMLFormElement !== 'undefined') {
    collect(HTMLFormElement.prototype);
  }
  // Common clobber targets even if the host doesn't enumerate them.
  'cookie domain location body head forms images links anchors scripts documentelement referrer url write writeln open close createelement getelementbyid getelementsbytagname queryselector queryselectorall implementation currentscript activeelement nodetype nodename ownerdocument parentnode children childnodes firstchild lastchild nextsibling previoussibling textcontent innerhtml outerhtml attributes action method enctype target elements length submit reset'
    .split(' ')
    .forEach((n) => names.add(n));
  cachedProtected = names;
  return names;
};
let cachedProtected: Set<string> | null = null;

export const isClobberingValue = (value: string): boolean => {
  const v = value.trim().toLowerCase();
  return clobberBlocklist.test(v) || protectedNames().has(v);
};

export const hostOf = (url: string): string | null => {
  try {
    const m = /^(?:[a-z][a-z0-9+.-]*:)?\/\/([^/?#:]+)/i.exec(url.trim());
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
};

export const isHostExcluded = (url: string, exclusions: string[]): boolean => {
  const host = hostOf(url);
  if (!host) {
    return false;
  }
  return exclusions.some((ex) => {
    const e = ex.toLowerCase().replace(/^www\./, '');
    const h = host.replace(/^www\./, '');
    return h === e || h.endsWith('.' + e);
  });
};

export const isSafeUrl = (value: string, context: string, settings: SanitizerSettings): boolean => URI.isDomSafe(value, context, settings);

export const isSafeSrcset = (value: string, context: string, settings: SanitizerSettings): boolean =>
  value
    .split(',')
    .map((c) => c.trim().split(/\s+/)[0])
    .filter((u) => u.length > 0)
    .every((u) => isSafeUrl(u, context, settings));

/** Comments that could be re-interpreted as markup are dropped. */
export const isSafeComment = (data: string, settings: SanitizerSettings): boolean => {
  // Bogus comments produced from `<?…>`, `<!…>` and CDATA sections are never meaningful content.
  if (/^\s*[?!]|^\s*\[CDATA\[/i.test(data)) {
    return false;
  }
  if (/^\[if\b|^\[endif\]|<!\[endif\]/i.test(data.trim())) {
    return !!settings.allow_conditional_comments;
  }
  if (/[<>]|--/.test(data)) {
    return !!settings.allow_html_in_comments;
  }
  return true;
};

/**
 * Sanitises an element that lives in a foreign namespace (svg/math). Returns false when the
 * whole subtree must be removed.
 */
export const sanitizeForeignSubtree = (root: Element, settings: SanitizerSettings): boolean => {
  const ns = root.namespaceURI;
  if (ns !== SVG_NS && ns !== MATHML_NS) {
    return false;
  }
  const doc = root.ownerDocument!;
  const walker = doc.createTreeWalker(root, 1);
  const toRemove: Element[] = [];
  let el: Element | null = root;
  while (el) {
    const name = el.localName.toLowerCase();
    if (el !== root && el.namespaceURI !== ns) {
      toRemove.push(el);
    } else if (ns === SVG_NS && svgForbidden.has(name)) {
      toRemove.push(el);
    } else if (ns === MATHML_NS && (name === 'annotation-xml' || name === 'maction')) {
      toRemove.push(el);
    } else {
      const attrs = Array.from(el.attributes);
      for (const attr of attrs) {
        const an = normalizeAttrName(attr.name);
        if (isEventHandler(an) || forbiddenAttributes.has(an) || an === 'style' && /url\s*\(|expression|@import/i.test(attr.value)) {
          el.removeAttribute(attr.name);
        } else if (an === 'href' || an === 'xlink:href' || an === 'src' || an === 'from' || an === 'to' || an === 'values') {
          if (!isSafeUrl(attr.value, name, settings) || /^\s*(https?:)?\/\//i.test(attr.value) && an !== 'href' && an !== 'xlink:href') {
            el.removeAttribute(attr.name);
          }
        }
      }
    }
    el = walker.nextNode() as Element | null;
  }
  toRemove.forEach((n) => n.parentNode?.removeChild(n));
  return true;
};

/**
 * Converts `object`/`embed` into `img`/`video`/`audio`/`iframe` based on the declared type.
 * Mirrors TinyMCE's `convert_unsafe_embeds` option.
 */
export const convertUnsafeEmbed = (el: Element): Element | null => {
  const doc = el.ownerDocument!;
  const name = el.localName.toLowerCase();
  const src = (name === 'object' ? el.getAttribute('data') : el.getAttribute('src')) || '';
  const type = (el.getAttribute('type') || '').toLowerCase();
  const width = el.getAttribute('width');
  const height = el.getAttribute('height');
  let replacement: Element;
  if (type.startsWith('image/')) {
    replacement = doc.createElement('img');
  } else if (type.startsWith('video/')) {
    replacement = doc.createElement('video');
    replacement.setAttribute('controls', 'controls');
  } else if (type.startsWith('audio/')) {
    replacement = doc.createElement('audio');
    replacement.setAttribute('controls', 'controls');
  } else {
    replacement = doc.createElement('iframe');
  }
  if (src) {
    replacement.setAttribute('src', src);
  }
  if (width) {
    replacement.setAttribute('width', width);
  }
  if (height) {
    replacement.setAttribute('height', height);
  }
  el.parentNode?.replaceChild(replacement, el);
  return replacement;
};

export interface AttributeDecision {
  action: 'keep' | 'remove' | 'set';
  value?: string;
}

/** Decides what happens to a single attribute before schema validation. */
export const sanitizeAttribute = (el: Element, name: string, value: string, settings: SanitizerSettings): AttributeDecision => {
  const an = normalizeAttrName(name);
  const elName = el.localName.toLowerCase();
  if (an !== name.toLowerCase() || isEventHandler(an) || forbiddenAttributes.has(an)) {
    return { action: 'remove' };
  }
  if (an === 'id' || an === 'name') {
    if (isClobberingValue(value)) {
      return { action: 'remove' };
    }
  }
  if (an === 'srcset') {
    return isSafeSrcset(value, elName, settings) ? { action: 'keep' } : { action: 'remove' };
  }
  if (urlAttributes.has(an)) {
    return isSafeUrl(value, elName, settings) ? { action: 'keep' } : { action: 'remove' };
  }
  return { action: 'keep' };
};

export const applyLinkAndIframePolicies = (el: Element, settings: SanitizerSettings): void => {
  const name = el.localName.toLowerCase();
  if (name === 'a' || name === 'area' || name === 'form') {
    if (!settings.allow_unsafe_link_target && el.getAttribute('target') === '_blank') {
      const rel = (el.getAttribute('rel') || '').split(/\s+/).filter((r) => r.length > 0);
      if (!rel.includes('noopener') && !rel.includes('noreferrer')) {
        rel.push('noopener');
      }
      el.setAttribute('rel', rel.join(' '));
    }
  }
  if (name === 'iframe') {
    el.removeAttribute('srcdoc');
    if (settings.sandbox_iframes !== false) {
      const src = el.getAttribute('src') || '';
      const exclusions = settings.sandbox_iframes_exclusions ?? DEFAULT_IFRAME_EXCLUSIONS;
      if (!isHostExcluded(src, exclusions)) {
        el.setAttribute('sandbox', '');
      }
    }
  }
};

export const isForeign = (el: Element): boolean => isElement(el) && el.namespaceURI !== XHTML_NS && el.namespaceURI !== null;
