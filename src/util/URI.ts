import { Optional } from './Optional';
import { Env } from './Env';

/**
 * URI parsing/resolution (port of the classic parseUri approach TinyMCE uses) so that
 * `convert_urls`, `relative_urls` and `remove_script_host` produce the same output as TinyMCE.
 */

const queryParts = 'source protocol authority userInfo user password host port relative path directory file query anchor'.split(' ');
const DEFAULT_PORTS: Record<string, number> = { ftp: 21, http: 80, https: 443, mailto: 25 };

const safeSvgDataUrlElements = ['img', 'video'];

const blockSvgDataUris = (allowSvgDataUrls: boolean | undefined, tagName?: string): boolean => {
  if (allowSvgDataUrls !== undefined && allowSvgDataUrls !== null) {
    return !allowSvgDataUrls;
  }
  return tagName !== undefined && !safeSvgDataUrlElements.includes(tagName);
};

const decodeUri = (encodedUri: string): string => {
  try {
    return decodeURIComponent(encodedUri);
  } catch {
    return unescape(encodedUri);
  }
};

export interface URISettings {
  base_uri?: URI;
}

export interface SafeUriOptions {
  allow_html_data_urls?: boolean;
  allow_script_urls?: boolean;
  allow_svg_data_urls?: boolean;
}

const uriRegExp =
  /^(?:(?![^:@]+:[^:@/]*@)([^:/?#.]+):)?(?:\/\/)?((?:(([^:@/]*):?([^:@/]*))?@)?(\[[a-zA-Z0-9:.%]+\]|[^:/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#/]*\.[^?#/.]+(?:[?#]|$)))*\/?)?([^?#/]*))(?:\?([^#]*))?(?:#(.*))?)/;

export class URI {
  source!: string;
  protocol!: string | undefined;
  authority!: string | undefined;
  userInfo!: string | undefined;
  user!: string | undefined;
  password!: string | undefined;
  host!: string | undefined;
  port!: string | undefined;
  relative!: string | undefined;
  path!: string;
  directory!: string | undefined;
  file!: string | undefined;
  query!: string | undefined;
  anchor!: string | undefined;
  settings: URISettings;

  constructor(url: string, settings: URISettings = {}) {
    url = (url ?? '').trim();
    this.settings = settings;
    const baseUri = settings.base_uri;

    // Strange app protocol that isn't http/https or local anchor e.g. mailto:
    if (/^([\w\-]+):([^\/]{2})/i.test(url) || /^\s*#/.test(url)) {
      this.source = url;
      this.path = '';
      return;
    }

    const isProtocolRelative = url.indexOf('//') === 0;
    if (url.indexOf('/') === 0 && !isProtocolRelative) {
      url = (baseUri ? baseUri.protocol || 'http' : 'http') + '://mce_host' + url;
    }

    // Relative path http:// or protocol relative //path
    if (!/^[\w\-]*:?\/\//.test(url)) {
      const baseUrl = baseUri ? baseUri.path : new URI(typeof document !== 'undefined' ? document.location.href : 'http://mce_host/').directory;
      if (baseUri?.protocol === '') {
        url = '//mce_host' + URI.resolvePath(baseUrl ?? '', url);
      } else {
        const match = /([^#?]*)([#?]?.*)/.exec(url) as RegExpExecArray;
        url = (baseUri && baseUri.protocol ? baseUri.protocol : 'http') + '://mce_host' + URI.resolvePath(baseUrl ?? '', match[1]) + match[2];
      }
    }

    url = url.replace(/@@/g, '(mce_at)');

    const parts = uriRegExp.exec(url);
    for (let i = 0; i < queryParts.length; i++) {
      let part = parts ? parts[i] : undefined;
      if (part) {
        part = part.replace(/\(mce_at\)/g, '@@');
      }
      (this as any)[queryParts[i]] = part;
    }
    this.path = this.path ?? '';

    if (baseUri) {
      if (!this.protocol) {
        this.protocol = baseUri.protocol;
      }
      if (!this.userInfo) {
        this.userInfo = baseUri.userInfo;
      }
      if (!this.port && this.host === 'mce_host') {
        this.port = baseUri.port;
      }
      if (!this.host || this.host === 'mce_host') {
        this.host = baseUri.host;
      }
      this.source = '';
    }

    if (isProtocolRelative) {
      this.protocol = '';
    }
  }

  static parseDataUri(uri: string): { type: string | undefined; data: string } {
    let type: string | undefined;
    const uriComponents = decodeURIComponent(uri).split(',');
    const matches = /data:([^;]+)/.exec(uriComponents[0]);
    if (matches) {
      type = matches[1];
    }
    return { type, data: uriComponents[1] };
  }

  static isDomSafe(uri: string, context?: string, options: SafeUriOptions = {}): boolean {
    if (options.allow_script_urls) {
      return true;
    }
    const decoded = decodeUri(uri).replace(/[\s\u0000-\u001F]+/g, '');
    try {
      // Decode entities and strip hidden characters used to bypass filters.
      const decodedEntities = decodeURIComponent(decoded);
      return isSafeScheme(decodedEntities, context, options);
    } catch {
      return isSafeScheme(decoded, context, options);
    }
  }

  static getDocumentBaseUrl(loc: { protocol: string; host?: string; href?: string; pathname?: string }): string {
    let baseUrl: string;
    if (loc.protocol.indexOf('http') !== 0 && loc.protocol !== 'file:') {
      baseUrl = loc.href ?? '';
    } else {
      baseUrl = loc.protocol + '//' + (loc.host ?? '') + (loc.pathname ?? '');
    }
    if (/^[^:]+:\/\/\/?[^\/]+\//.test(baseUrl)) {
      baseUrl = baseUrl.replace(/[\?#].*$/, '').replace(/[\/\\][^\/]+$/, '');
      if (!/[\/\\]$/.test(baseUrl)) {
        baseUrl += '/';
      }
    }
    return baseUrl;
  }

  static resolvePath(base: string, path: string): string {
    const tr = /\/$/;
    const resolved = URI.toAbsPath(base, path);
    return resolved.replace(/\/+/g, '/').replace(tr, '/');
  }

  setPath(path: string): void {
    const pathMatch = /^(.*?)\/?(\w+)?$/.exec(path);
    if (pathMatch) {
      this.path = pathMatch[0];
      this.directory = pathMatch[1];
      this.file = pathMatch[2];
    }
    this.source = '';
    this.getURI();
  }

  toRelative(uri: string): string {
    if (uri === './') {
      return uri;
    }
    const relativeUri = new URI(uri, { base_uri: this });
    if ((relativeUri.host !== 'mce_host' && this.host !== relativeUri.host && relativeUri.host) || this.port !== relativeUri.port || (this.protocol !== relativeUri.protocol && relativeUri.protocol !== '')) {
      return relativeUri.getURI();
    }
    const tu = this.getURI();
    const uu = relativeUri.getURI();
    if (tu === uu || (tu.charAt(tu.length - 1) === '/' && tu.substr(0, tu.length - 1) === uu)) {
      return tu;
    }
    let output = URI.toRelPath(this.path, relativeUri.path);
    if (relativeUri.query) {
      output += '?' + relativeUri.query;
    }
    if (relativeUri.anchor) {
      output += '#' + relativeUri.anchor;
    }
    return output;
  }

  toAbsolute(uri: string, noHost?: boolean): string {
    const absoluteUri = new URI(uri, { base_uri: this });
    return absoluteUri.getURI(noHost && this.isSameOrigin(absoluteUri));
  }

  isSameOrigin(uri: URI): boolean {
    if (this.host === uri.host && this.protocol === uri.protocol) {
      if (this.port === uri.port) {
        return true;
      }
      const defaultPort = this.protocol ? DEFAULT_PORTS[this.protocol] : undefined;
      if (defaultPort && (Number(this.port || defaultPort) === defaultPort) && (Number(uri.port || defaultPort) === defaultPort)) {
        return true;
      }
    }
    return false;
  }

  static toRelPath(base: string, path: string): string {
    let breakPoint = 0;
    let out = '';
    const normalizedBase = base.substring(0, base.lastIndexOf('/')).split('/');
    const items = path.split('/');
    if (normalizedBase.length >= items.length) {
      for (let i = 0; i < normalizedBase.length; i++) {
        if (i >= items.length || normalizedBase[i] !== items[i]) {
          breakPoint = i + 1;
          break;
        }
      }
    }
    if (normalizedBase.length < items.length) {
      for (let i = 0; i < items.length; i++) {
        if (i >= normalizedBase.length || normalizedBase[i] !== items[i]) {
          breakPoint = i + 1;
          break;
        }
      }
    }
    if (breakPoint === 1) {
      return path;
    }
    for (let i = 0, l = normalizedBase.length - (breakPoint - 1); i < l; i++) {
      out += '../';
    }
    for (let i = breakPoint - 1, l = items.length; i < l; i++) {
      out += i !== breakPoint - 1 ? '/' + items[i] : items[i];
    }
    return out;
  }

  static toAbsPath(base: string, path: string): string {
    let nb = 0;
    let o: string[] = [];
    let outPath: string;

    const tr = /\/$/.test(path) ? '/' : '';
    let normalizedBase = base.split('/');
    const normalizedPath = path.split('/');

    normalizedBase = normalizedBase.filter((k) => k.length > 0);
    const baseParts: string[] = [];
    for (const k of normalizedBase) {
      baseParts.push(k);
    }
    normalizedBase = baseParts;

    for (let i = normalizedPath.length - 1; i >= 0; i--) {
      if (normalizedPath[i].length === 0 || normalizedPath[i] === '.') {
        continue;
      }
      if (normalizedPath[i] === '..') {
        nb++;
        continue;
      }
      if (nb > 0) {
        nb--;
        continue;
      }
      o.push(normalizedPath[i]);
    }

    const i = normalizedBase.length - nb;
    if (i <= 0) {
      outPath = o.reverse().join('/');
    } else {
      outPath = normalizedBase.slice(0, i).join('/') + '/' + o.reverse().join('/');
    }
    if (outPath.indexOf('/') !== 0) {
      outPath = '/' + outPath;
    }
    if (tr && outPath.lastIndexOf('/') !== outPath.length - 1) {
      outPath += tr;
    }
    return outPath;
  }

  getURI(noProtoHost: boolean = false): string {
    let s: string;
    if (!this.source || noProtoHost) {
      s = '';
      if (!noProtoHost) {
        if (this.protocol) {
          s += this.protocol + '://';
        } else {
          s += '//';
        }
        if (this.userInfo) {
          s += this.userInfo + '@';
        }
        if (this.host) {
          s += this.host;
        }
        if (this.port) {
          s += ':' + this.port;
        }
      }
      if (this.path) {
        s += this.path;
      }
      if (this.query) {
        s += '?' + this.query;
      }
      if (this.anchor) {
        s += '#' + this.anchor;
      }
      this.source = s;
    }
    return this.source;
  }
}

const isSafeScheme = (decoded: string, context: string | undefined, options: SafeUriOptions): boolean => {
  const normalized = decoded.replace(/[\s\u0000-\u001F​-‍﻿]+/g, '').toLowerCase();
  // Scheme check: anything before the first ':' that is not a known safe scheme.
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(normalized);
  if (m) {
    const scheme = m[1];
    if (scheme === 'javascript' || scheme === 'vbscript' || scheme === 'livescript' || scheme === 'mocha' || scheme === 'jscript') {
      return false;
    }
    if (scheme === 'data') {
      const dataMatch = /^data:([^;,]*)/.exec(normalized);
      const mime = dataMatch ? dataMatch[1] : '';
      if (mime === 'image/svg+xml') {
        return !blockSvgDataUris(options.allow_svg_data_urls, context);
      }
      if (/^image\/(png|gif|jpe?g|webp|avif|bmp|x-icon|vnd\.microsoft\.icon|apng|tiff)$/.test(mime)) {
        // Raster images are allowed on src-like attributes only.
        return context === undefined || context !== 'a';
      }
      return !!options.allow_html_data_urls;
    }
  }
  return true;
};

export const getBaseUri = (): Optional<URI> => {
  try {
    return typeof document !== 'undefined' ? Optional.some(new URI(URI.getDocumentBaseUrl(document.location))) : Optional.none();
  } catch {
    return Optional.none();
  }
};

export const isMac = Env.mac;
