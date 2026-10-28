import { isString, isArray, isObject, isFunction } from '../util/Type';

/**
 * Translation registry compatible with TinyMCE language packs (`tinymce.addI18n(code, items)`).
 */

export type TranslatedString = string;
export type Untranslated = string | [string, ...any[]] | { raw: string } | null | undefined;

const data: Record<string, Record<string, string>> = {};
let code = 'en';

const isRaw = (str: unknown): str is { raw: string } => isObject(str) && isString((str as any).raw);
const isTokenised = (str: unknown): str is [string, ...any[]] => isArray(str) && str.length > 1;

const getLangData = (langCode: string): Record<string, string> => data[langCode] || {};

const translate = (text: Untranslated): TranslatedString => {
  const langData = getLangData(code);
  const toString = (obj: unknown): string => {
    if (isFunction(obj)) {
      return Object.prototype.toString.call(obj);
    }
    return !isEmpty(obj) ? '' + obj : '';
  };
  const isEmpty = (text: unknown): boolean => text === '' || text === null || text === undefined;
  const getLangValue = (text: string): string => {
    const textstr = toString(text);
    return Object.prototype.hasOwnProperty.call(langData, textstr) ? toString(langData[textstr]) : textstr;
  };
  const removeContext = (str: string): string => str.replace(/{context:\w+}$/, '');

  if (isEmpty(text)) {
    return '';
  }
  if (isRaw(text)) {
    return toString(text.raw);
  }
  if (isTokenised(text)) {
    const values = text.slice(1);
    const substitued = getLangValue(text[0]).replace(/\{([0-9]+)\}/g, (match, index) => (Object.prototype.hasOwnProperty.call(values, index) ? toString(values[index]) : match));
    return removeContext(substitued);
  }
  return removeContext(getLangValue(text as string));
};

export const I18n = {
  getData: (): Record<string, Record<string, string>> => data,
  setCode: (newCode: string): void => {
    if (newCode) {
      code = newCode;
    }
  },
  getCode: (): string => code,
  add: (langCode: string, items: Record<string, string>): void => {
    const langData = data[langCode] || (data[langCode] = {});
    for (const k of Object.keys(items)) {
      langData[k] = items[k];
    }
  },
  translate,
  isRtl: (): boolean => {
    const langData = getLangData(code);
    return Object.prototype.hasOwnProperty.call(langData, '_dir') && langData._dir === 'rtl';
  },
  hasCode: (langCode: string): boolean => Object.prototype.hasOwnProperty.call(data, langCode),
};
