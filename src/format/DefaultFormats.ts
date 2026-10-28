import type { Editor } from '../core/Editor';
import type { Formats } from './Formatter';
import * as NodeType from '../dom/NodeType';

/** TinyMCE's default format registry. */
export const getDefaultFormats = (editor: Editor): Formats => {
  const dom = editor.dom;
  const alignElements = 'figure,p,h1,h2,h3,h4,h5,h6,td,th,tr,div,ul,ol,li,pre';
  const formats: Formats = {
    valigntop: [{ selector: 'td,th', styles: { verticalAlign: 'top' } }],
    valignmiddle: [{ selector: 'td,th', styles: { verticalAlign: 'middle' } }],
    valignbottom: [{ selector: 'td,th', styles: { verticalAlign: 'bottom' } }],

    alignleft: [
      { selector: 'figure.image', collapsed: false, classes: 'align-left', ceFalseOverride: true, preview: 'font-family font-size' },
      { selector: alignElements, styles: { textAlign: 'left' }, inherit: false, preview: false },
      { selector: 'img,audio,video', collapsed: false, styles: { float: 'left' }, preview: 'font-family font-size' },
      {
        selector: 'table',
        collapsed: false,
        styles: { marginLeft: '0px', marginRight: 'auto' },
        onformat: (table: Element) => {
          dom.setStyle(table, 'float', null);
        },
        preview: 'font-family font-size',
      },
      { selector: '.mce-preview-object,[data-ephox-embed-iri]', ceFalseOverride: true, styles: { float: 'left' } },
    ],
    aligncenter: [
      { selector: 'figure.image', collapsed: false, classes: 'align-center', ceFalseOverride: true, preview: 'font-family font-size' },
      { selector: alignElements, styles: { textAlign: 'center' }, inherit: false, preview: 'font-family font-size' },
      { selector: 'img,audio,video', collapsed: false, styles: { display: 'block', marginLeft: 'auto', marginRight: 'auto' }, preview: false },
      { selector: 'table', collapsed: false, styles: { marginLeft: 'auto', marginRight: 'auto' }, preview: 'font-family font-size' },
      { selector: '.mce-preview-object', ceFalseOverride: true, styles: { display: 'table', marginLeft: 'auto', marginRight: 'auto' }, preview: false },
    ],
    alignright: [
      { selector: 'figure.image', collapsed: false, classes: 'align-right', ceFalseOverride: true, preview: 'font-family font-size' },
      { selector: alignElements, styles: { textAlign: 'right' }, inherit: false, preview: 'font-family font-size' },
      { selector: 'img,audio,video', collapsed: false, styles: { float: 'right' }, preview: 'font-family font-size' },
      {
        selector: 'table',
        collapsed: false,
        styles: { marginRight: '0px', marginLeft: 'auto' },
        onformat: (table: Element) => {
          dom.setStyle(table, 'float', null);
        },
        preview: 'font-family font-size',
      },
      { selector: '.mce-preview-object,[data-ephox-embed-iri]', ceFalseOverride: true, styles: { float: 'right' }, preview: false },
    ],
    alignjustify: [{ selector: alignElements, styles: { textAlign: 'justify' }, inherit: false, preview: 'font-family font-size' }],

    bold: [
      { inline: 'strong', remove: 'all', preserve_attributes: ['class', 'style'] },
      { inline: 'span', styles: { fontWeight: 'bold' } },
      { inline: 'b', remove: 'all', preserve_attributes: ['class', 'style'] },
    ],
    italic: [
      { inline: 'em', remove: 'all', preserve_attributes: ['class', 'style'] },
      { inline: 'span', styles: { fontStyle: 'italic' } },
      { inline: 'i', remove: 'all', preserve_attributes: ['class', 'style'] },
    ],
    underline: [
      { inline: 'span', styles: { textDecoration: 'underline' }, exact: true },
      { inline: 'u', remove: 'all', preserve_attributes: ['class', 'style'] },
    ],
    strikethrough: [
      { inline: 's', remove: 'all', preserve_attributes: ['class', 'style'] },
      { inline: 'span', styles: { textDecoration: 'line-through' }, exact: true },
      { inline: 'strike', remove: 'all', preserve_attributes: ['class', 'style'] },
    ],

    forecolor: { inline: 'span', styles: { color: '%value' }, links: true, remove_similar: true, clear_child_styles: true },
    hilitecolor: { inline: 'span', styles: { backgroundColor: '%value' }, links: true, remove_similar: true, clear_child_styles: true },
    fontname: { inline: 'span', toggle: false, styles: { fontFamily: '%value' }, clear_child_styles: true },
    fontsize: { inline: 'span', toggle: false, styles: { fontSize: '%value' }, clear_child_styles: true },
    lineheight: { selector: 'h1,h2,h3,h4,h5,h6,p,li,td,th,div', styles: { lineHeight: '%value' } },
    fontsize_class: { inline: 'span', attributes: { class: '%value' } },
    blockquote: { block: 'blockquote', wrapper: true, remove: 'all' },
    subscript: { inline: 'sub' },
    superscript: { inline: 'sup' },
    code: { inline: 'code' },

    link: {
      inline: 'a',
      selector: 'a',
      remove: 'all',
      split: true,
      deep: true,
      onmatch: (node: Node) => NodeType.isElement(node) && node.hasAttribute('href'),
      onformat: (elm: Element, _fmt, vars) => {
        if (vars) {
          for (const key of Object.keys(vars)) {
            dom.setAttrib(elm, key, vars[key]);
          }
        }
      },
    },

    lang: {
      inline: 'span',
      clear_child_styles: true,
      remove_similar: true,
      attributes: {
        lang: '%value',
        'data-mce-lang': ((vars?: Record<string, any>) => vars?.customValue ?? null) as any,
      },
    },

    removeformat: [
      { selector: 'b,strong,em,i,font,u,strike,s,sub,sup,dfn,code,samp,kbd,var,cite,mark,q,del,ins,small', remove: 'all', split: true, expand: false, block_expand: true, deep: true },
      { selector: 'span', attributes: ['style', 'class'] as any, remove: 'empty', split: true, expand: false, deep: true },
      { selector: '*', attributes: ['style', 'class'] as any, split: false, expand: false, deep: true },
    ],
  };

  for (const name of 'p h1 h2 h3 h4 h5 h6 div address pre dt dd samp'.split(' ')) {
    formats[name] = { block: name, remove: 'all' };
  }
  return formats;
};
