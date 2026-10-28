import { Schema } from './Schema';
import { URI } from '../util/URI';
import { has } from '../util/Obj';

/**
 * Parses and serialises inline `style` attributes without touching the live CSSOM. This is the
 * single place where CSS text is interpreted, so URL and expression filtering lives here.
 */

export interface StyleSettings {
  allow_script_urls?: boolean;
  allow_svg_data_urls?: boolean;
  allow_html_data_urls?: boolean;
  url_converter?: (url: string, name: string, elm?: string | Element) => string;
  url_converter_scope?: any;
}

export interface StyleMap {
  [name: string]: string;
}

export interface Styles {
  parse: (css: string | null | undefined) => StyleMap;
  serialize: (styles: StyleMap, elementName?: string) => string;
  toHex: (color: string) => string;
}

const rgbRegExp = /rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/gi;
const hexToNumber = (n: number): string => {
  const h = n.toString(16);
  return h.length === 1 ? '0' + h : h;
};

/** Decodes CSS escapes like `\65` or `\000065 ` into their characters. */
const decodeCssEscapes = (value: string): string =>
  value.replace(/\\([0-9a-fA-F]{1,6})\s?|\\(.)/g, (_m, hex: string | undefined, chr: string | undefined) => {
    if (hex) {
      const code = parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    return chr ?? '';
  });

/** Splits CSS declarations at `;` outside of quotes and parentheses. */
const splitDeclarations = (css: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (quote) {
      current += ch;
      if (ch === '\\' && i + 1 < css.length) {
        current += css[++i];
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
      current += ch;
    } else if (ch === ';' && depth === 0) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim().length) {
    out.push(current);
  }
  return out;
};

const dangerousValue = /(expression\s*\(|-moz-binding|@import|javascript:|vbscript:|livescript:|mocha:)/i;
const dangerousProperty = /^(behavior|-ms-behavior|-moz-binding|binding|filter|-ms-filter)$/i;
const urlRegExp = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi;

export const createStyles = (settings: StyleSettings = {}, schema?: Schema): Styles => {
  const validStyles = schema?.getValidStyles();
  const invalidStyles = schema?.getInvalidStyles();
  const urlConverter = settings.url_converter;
  const urlConverterScope = settings.url_converter_scope ?? undefined;

  const toHex = (color: string): string =>
    color.replace(rgbRegExp, (_m, r: string, g: string, b: string) => '#' + hexToNumber(Number(r)) + hexToNumber(Number(g)) + hexToNumber(Number(b)));

  const isSafeUrl = (url: string): boolean => URI.isDomSafe(url, 'style', settings);

  const processUrls = (value: string): string | null => {
    let unsafe = false;
    const converted = value.replace(urlRegExp, (_m, dq: string | undefined, sq: string | undefined, bare: string | undefined) => {
      let url = (dq ?? sq ?? bare ?? '').trim();
      url = decodeCssEscapes(url);
      if (!isSafeUrl(url)) {
        unsafe = true;
        return '';
      }
      if (urlConverter) {
        url = urlConverter.call(urlConverterScope, url, 'style');
      }
      return "url('" + url.replace(/'/g, "\\'") + "')";
    });
    return unsafe ? null : converted;
  };

  const parse = (css: string | null | undefined): StyleMap => {
    const styles: StyleMap = {};
    if (!css) {
      return styles;
    }
    const declarations = splitDeclarations(css);
    for (const decl of declarations) {
      const idx = decl.indexOf(':');
      if (idx === -1) {
        continue;
      }
      const name = decodeCssEscapes(decl.slice(0, idx)).trim().toLowerCase();
      let value = decl.slice(idx + 1).trim();
      if (!name || !value || !/^[-a-z_][-a-z0-9_]*$/i.test(name)) {
        continue;
      }
      const decodedValue = decodeCssEscapes(value);
      if (dangerousProperty.test(name) || dangerousValue.test(decodedValue.replace(/\s+/g, ''))) {
        continue;
      }
      if (/url\s*\(/i.test(decodedValue)) {
        const processed = processUrls(decodedValue);
        if (processed === null) {
          continue;
        }
        value = processed;
      } else {
        value = decodedValue;
      }
      value = toHex(value);
      // Collapse internal whitespace but keep quoted strings intact.
      value = value.replace(/\s+/g, ' ');
      if (value.length) {
        styles[name] = value;
      }
    }
    return styles;
  };

  const serialize = (styles: StyleMap, elementName?: string): string => {
    let css = '';

    const serializeStyles = (elemName: string, validStyleList: Record<string, string[]>) => {
      const styleList = validStyleList[elemName];
      if (styleList) {
        for (let i = 0, l = styleList.length; i < l; i++) {
          const name = styleList[i];
          const value = styles[name];
          if (value) {
            css += (css.length > 0 ? ' ' : '') + name + ': ' + value + ';';
          }
        }
      }
    };

    const isValid = (name: string, elemName?: string): boolean => {
      if (!invalidStyles || !elemName) {
        return true;
      }
      let list = invalidStyles['*'];
      if (list && has(list, name)) {
        return false;
      }
      list = invalidStyles[elemName];
      if (list && has(list, name)) {
        return false;
      }
      return true;
    };

    if (elementName && validStyles) {
      serializeStyles('*', validStyles);
      serializeStyles(elementName, validStyles);
    } else {
      for (const name of Object.keys(styles)) {
        const value = styles[name];
        if (value && isValid(name, elementName)) {
          css += (css.length > 0 ? ' ' : '') + name + ': ' + value + ';';
        }
      }
    }
    return css;
  };

  return { parse, serialize, toHex };
};
