import type { Editor } from '../core/Editor';
import type { Format } from './Formatter';
import * as FormatUtils from './FormatUtils';
import { isString, isArray } from '../util/Type';

/**
 * Generates CSS text that previews a format (used by the styles/blocks dropdown items).
 */
export const getCssText = (editor: Editor, format: string | Format): string => {
  const previewStyles = editor.options.get('preview_styles') as string;
  if (!previewStyles) {
    return '';
  }
  let fmt: Format | undefined;
  if (isString(format)) {
    const list = editor.formatter.get(format) as Format[] | undefined;
    fmt = list ? list[0] : undefined;
  } else {
    fmt = format;
  }
  if (!fmt) {
    return '';
  }
  if (isString(fmt.preview)) {
    return previewStylesFor(editor, fmt, fmt.preview);
  }
  if (fmt.preview === false) {
    return '';
  }
  return previewStylesFor(editor, fmt, previewStyles);
};

const removeVars = (val: unknown): string | null => (isString(val) ? val.replace(/%(\w+)/g, '') : null);

const previewStylesFor = (editor: Editor, format: Format, previewStyles: string): string => {
  const dom = editor.dom;
  let name = FormatUtils.isBlockFormat(format) ? format.block : FormatUtils.isInlineFormat(format) ? format.inline : 'div';
  let previewFrag: HTMLElement;
  let previewElm: HTMLElement;
  let parentFontSize: string | undefined;
  const items = previewStyles.split(' ');

  if (FormatUtils.isSelectorFormat(format)) {
    name = format.selector.split(/[ ,]/)[0].replace(/^[^a-z0-9]+|\[.*$/gi, '') || 'div';
    if (!/^[a-z][a-z0-9]*$/i.test(name)) {
      name = 'div';
    }
  }
  if (name === '*') {
    name = 'div';
  }
  const doc = dom.doc;
  previewFrag = previewElm = doc.createElement(name);
  const styles = format.styles && !isArray(format.styles) ? format.styles : {};
  for (const k of Object.keys(styles)) {
    const v = removeVars(styles[k]);
    if (v) {
      dom.setStyle(previewElm, k, v);
    }
  }
  const attributes = format.attributes && !isArray(format.attributes) ? format.attributes : {};
  for (const k of Object.keys(attributes)) {
    const v = removeVars(attributes[k]);
    if (v) {
      previewElm.setAttribute(k, v);
    }
  }
  const classes = format.classes ? (isArray(format.classes) ? format.classes : [format.classes]) : [];
  for (const cls of classes) {
    const v = removeVars(cls);
    if (v) {
      previewElm.classList.add(v);
    }
  }
  previewElm.appendChild(doc.createTextNode('a'));

  const body = editor.getBody();
  const parentContainer = doc.createElement('div');
  parentContainer.style.cssText = 'position:absolute;left:-9999px;top:0;';
  parentContainer.appendChild(previewFrag);
  body.appendChild(parentContainer);
  const previewCss: string[] = [];
  try {
    const computed = editor.getWin().getComputedStyle(previewElm);
    parentFontSize = editor.getWin().getComputedStyle(body).fontSize;
    for (const item of items) {
      let value = computed.getPropertyValue(item);
      if (item === 'background-color' && /transparent|rgba\s*\([^)]+,\s*0\)/.test(value)) {
        value = editor.getWin().getComputedStyle(body).backgroundColor;
        if (/transparent|rgba\s*\([^)]+,\s*0\)/.test(value)) {
          value = '#ffffff';
        }
      }
      if (item === 'color' && /transparent|rgba\s*\([^)]+,\s*0\)/.test(value)) {
        value = editor.getWin().getComputedStyle(body).color;
      }
      if (item === 'font-size' && parentFontSize) {
        // Convert to em relative to the body so previews scale in the toolbar.
        const px = parseFloat(value);
        const parentPx = parseFloat(parentFontSize);
        if (px && parentPx) {
          value = (px / parentPx).toFixed(2) + 'em';
        }
      }
      if (value) {
        previewCss.push(item + ':' + value);
      }
    }
  } finally {
    body.removeChild(parentContainer);
  }
  return previewCss.join(';');
};
