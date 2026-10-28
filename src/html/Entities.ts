import { Tools } from '../util/Tools';

/**
 * Entity encoding/decoding with TinyMCE-compatible behaviour and defaults
 * (`entity_encoding: 'named' | 'numeric' | 'raw' | 'named+numeric'`).
 */

export type EntitiesMap = Record<string, string>;
export type EncodeFunc = (text: string, attr?: boolean) => string;

const attrsCharsRegExp = /[&<>"`~-퟿-￯]|[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
const textCharsRegExp = /[<>&~-퟿-￯]|[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
const rawCharsRegExp = /[<>&"']/g;
const entityRegExp = /&#([a-z0-9]+);?|&([a-z0-9]+);/gi;

const asciiMap: Record<number, string> = {
  128: '€', 130: '‚', 131: 'ƒ', 132: '„', 133: '…', 134: '†', 135: '‡', 136: 'ˆ',
  137: '‰', 138: 'Š', 139: '‹', 140: 'Œ', 142: 'Ž', 145: '‘', 146: '’', 147: '“',
  148: '”', 149: '•', 150: '–', 151: '—', 152: '˜', 153: '™', 154: 'š', 155: '›',
  156: 'œ', 158: 'ž', 159: 'Ÿ',
};

const baseEntities: EntitiesMap = {
  '"': '&quot;',
  "'": '&#39;',
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  '`': '&#96;',
};

const reverseEntities: EntitiesMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&apos;': "'",
};

/** TinyMCE's default `entities` option. */
export const DEFAULT_ENTITIES =
  '160,nbsp,161,iexcl,162,cent,163,pound,164,curren,165,yen,166,brvbar,167,sect,168,uml,169,copy,170,ordf,171,laquo,172,not,' +
  '173,shy,174,reg,175,macr,176,deg,177,plusmn,178,sup2,179,sup3,180,acute,181,micro,182,para,183,middot,184,cedil,185,sup1,' +
  '186,ordm,187,raquo,188,frac14,189,frac12,190,frac34,191,iquest,192,Agrave,193,Aacute,194,Acirc,195,Atilde,196,Auml,197,Aring,' +
  '198,AElig,199,Ccedil,200,Egrave,201,Eacute,202,Ecirc,203,Euml,204,Igrave,205,Iacute,206,Icirc,207,Iuml,208,ETH,209,Ntilde,' +
  '210,Ograve,211,Oacute,212,Ocirc,213,Otilde,214,Ouml,215,times,216,Oslash,217,Ugrave,218,Uacute,219,Ucirc,220,Uuml,221,Yacute,' +
  '222,THORN,223,szlig,224,agrave,225,aacute,226,acirc,227,atilde,228,auml,229,aring,230,aelig,231,ccedil,232,egrave,233,eacute,' +
  '234,ecirc,235,euml,236,igrave,237,iacute,238,icirc,239,iuml,240,eth,241,ntilde,242,ograve,243,oacute,244,ocirc,245,otilde,' +
  '246,ouml,247,divide,248,oslash,249,ugrave,250,uacute,251,ucirc,252,uuml,253,yacute,254,thorn,255,yuml,402,fnof,913,Alpha,' +
  '914,Beta,915,Gamma,916,Delta,917,Epsilon,918,Zeta,919,Eta,920,Theta,921,Iota,922,Kappa,923,Lambda,924,Mu,925,Nu,926,Xi,' +
  '927,Omicron,928,Pi,929,Rho,931,Sigma,932,Tau,933,Upsilon,934,Phi,935,Chi,936,Psi,937,Omega,945,alpha,946,beta,947,gamma,' +
  '948,delta,949,epsilon,950,zeta,951,eta,952,theta,953,iota,954,kappa,955,lambda,956,mu,957,nu,958,xi,959,omicron,960,pi,' +
  '961,rho,962,sigmaf,963,sigma,964,tau,965,upsilon,966,phi,967,chi,968,psi,969,omega,977,thetasym,978,upsih,982,piv,8226,bull,' +
  '8230,hellip,8242,prime,8243,Prime,8254,oline,8260,frasl,8472,weierp,8465,image,8476,real,8482,trade,8501,alefsym,8592,larr,' +
  '8593,uarr,8594,rarr,8595,darr,8596,harr,8629,crarr,8656,lArr,8657,uArr,8658,rArr,8659,dArr,8660,hArr,8704,forall,8706,part,' +
  '8707,exist,8709,empty,8711,nabla,8712,isin,8713,notin,8715,ni,8719,prod,8721,sum,8722,minus,8727,lowast,8730,radic,8733,prop,' +
  '8734,infin,8736,ang,8743,and,8744,or,8745,cap,8746,cup,8747,int,8756,there4,8764,sim,8773,cong,8776,asymp,8800,ne,8801,equiv,' +
  '8804,le,8805,ge,8834,sub,8835,sup,8836,nsub,8838,sube,8839,supe,8853,oplus,8855,otimes,8869,perp,8901,sdot,8968,lceil,' +
  '8969,rceil,8970,lfloor,8971,rfloor,9001,lang,9002,rang,9674,loz,9824,spades,9827,clubs,9829,hearts,9830,diams,338,OElig,' +
  '339,oelig,352,Scaron,353,scaron,376,Yuml,710,circ,732,tilde,8194,ensp,8195,emsp,8201,thinsp,8204,zwnj,8205,zwj,8206,lrm,' +
  '8207,rlm,8211,ndash,8212,mdash,8216,lsquo,8217,rsquo,8218,sbquo,8220,ldquo,8221,rdquo,8222,bdquo,8224,dagger,8225,Dagger,' +
  '8240,permil,8249,lsaquo,8250,rsaquo,8364,euro';

/** Builds a `char → &name;` lookup from the TinyMCE `code,name,code,name` format. */
const buildEntitiesLookup = (items: string | undefined, radix: number = 10): EntitiesMap | undefined => {
  if (!items) {
    return undefined;
  }
  const lookup: EntitiesMap = {};
  const parts = items.split(',');
  for (let i = 0; i < parts.length; i += 2) {
    const chr = String.fromCharCode(parseInt(parts[i], radix));
    if (!baseEntities[chr]) {
      const entity = '&' + parts[i + 1] + ';';
      lookup[chr] = entity;
      lookup[entity] = chr;
    }
  }
  return lookup;
};

const namedEntities: EntitiesMap = buildEntitiesLookup(DEFAULT_ENTITIES, 10) as EntitiesMap;

const surrogateToCodePoint = (chr: string): number => (chr.charCodeAt(0) - 0xd800) * 0x400 + (chr.charCodeAt(1) - 0xdc00) + 0x10000;

export const encodeRaw: EncodeFunc = (text, attr) => text.replace(attr ? attrsCharsRegExp : textCharsRegExp, (chr) => baseEntities[chr] || chr);

/** Encodes `& < > " '` – used for attribute values that must never contain markup. */
export const encodeAllRaw = (text: string): string => ('' + text).replace(rawCharsRegExp, (chr) => baseEntities[chr] || chr);

export const encodeNumeric: EncodeFunc = (text, attr) =>
  text.replace(attr ? attrsCharsRegExp : textCharsRegExp, (chr) => {
    if (chr.length > 1) {
      return '&#' + surrogateToCodePoint(chr) + ';';
    }
    return baseEntities[chr] || '&#' + chr.charCodeAt(0) + ';';
  });

export const encodeNamed = (text: string, attr?: boolean, entities?: EntitiesMap): string => {
  const ents = entities || namedEntities;
  return text.replace(attr ? attrsCharsRegExp : textCharsRegExp, (chr) => baseEntities[chr] || ents[chr] || chr);
};

/** Returns the encoder for an `entity_encoding` value and optional custom `entities` list. */
export const getEncodeFunc = (name: string, entities?: string): EncodeFunc => {
  const entitiesMap = buildEntitiesLookup(entities) || namedEntities;

  const encodeNamedAndNumeric: EncodeFunc = (text, attr) =>
    text.replace(attr ? attrsCharsRegExp : textCharsRegExp, (chr) => {
      if (baseEntities[chr] !== undefined) {
        return baseEntities[chr];
      }
      if (entitiesMap[chr] !== undefined) {
        return entitiesMap[chr];
      }
      if (chr.length > 1) {
        return '&#' + surrogateToCodePoint(chr) + ';';
      }
      return '&#' + chr.charCodeAt(0) + ';';
    });

  const encodeCustomNamed: EncodeFunc = (text, attr) => encodeNamed(text, attr, entitiesMap);

  const nameMap = Tools.makeMap((name || '').replace(/\+/g, ','));
  if (nameMap.named && nameMap.numeric) {
    return encodeNamedAndNumeric;
  }
  if (nameMap.named) {
    return entities ? encodeCustomNamed : (t, a) => encodeNamed(t, a);
  }
  if (nameMap.numeric) {
    return encodeNumeric;
  }
  return encodeRaw;
};

let decoderEl: HTMLTextAreaElement | null = null;
const nativeDecode = (text: string): string => {
  if (typeof document === 'undefined') {
    return text;
  }
  if (!decoderEl) {
    decoderEl = document.createElement('textarea');
  }
  decoderEl.innerHTML = text;
  return decoderEl.value;
};

/** Decodes all entities (named, numeric, hex) in the text. */
export const decode = (text: string): string =>
  text.replace(entityRegExp, (all, numeric: string | undefined) => {
    if (numeric) {
      let code: number;
      if (numeric.charAt(0).toLowerCase() === 'x') {
        code = parseInt(numeric.substr(1), 16);
      } else {
        code = parseInt(numeric, 10);
      }
      if (Number.isNaN(code)) {
        return all;
      }
      if (code > 0xffff) {
        code -= 0x10000;
        return String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
      }
      return asciiMap[code] || String.fromCharCode(code);
    }
    return reverseEntities[all] || namedEntities[all] || nativeDecode(all);
  });

export const Entities = {
  encodeRaw,
  encodeAllRaw,
  encodeNumeric,
  encodeNamed,
  getEncodeFunc,
  decode,
};
