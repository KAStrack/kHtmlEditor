import { Entities, EncodeFunc } from './Entities';
import { Tools } from '../util/Tools';

export interface WriterSettings {
  element_format?: 'xhtml' | 'html';
  entities?: string;
  entity_encoding?: string;
  indent?: boolean;
  indent_after?: string;
  indent_before?: string;
}

export interface Writer {
  start: (name: string, attrs?: Array<{ name: string; value: string }>, empty?: boolean) => void;
  end: (name: string) => void;
  text: (text: string, raw?: boolean) => void;
  cdata: (text: string) => void;
  comment: (text: string) => void;
  pi: (name: string, text?: string) => void;
  doctype: (text: string) => void;
  reset: () => void;
  getContent: () => string;
}

export const DEFAULT_INDENT_ELEMENTS =
  'p h1 h2 h3 h4 h5 h6 blockquote div title style pre script td th ul ol li dl dt dd area table thead tfoot tbody tr section details summary article hgroup aside figure figcaption option optgroup datalist';

/** Streaming HTML writer – port of TinyMCE's Writer so output formatting (newlines, xhtml) matches. */
export const createWriter = (settings: WriterSettings = {}): Writer => {
  const html: string[] = [];
  const indent = settings.indent !== false;
  const indentBefore = Tools.makeMap(settings.indent_before ?? DEFAULT_INDENT_ELEMENTS, ' ');
  const indentAfter = Tools.makeMap(settings.indent_after ?? DEFAULT_INDENT_ELEMENTS, ' ');
  const encode: EncodeFunc = Entities.getEncodeFunc(settings.entity_encoding || 'raw', settings.entities);
  const htmlOutput = settings.element_format !== 'xhtml';

  const newlineIfNeeded = () => {
    if (html.length > 0) {
      const value = html[html.length - 1];
      if (value.length > 0 && value !== '\n') {
        html.push('\n');
      }
    }
  };

  return {
    start: (name, attrs, empty) => {
      if (indent && indentBefore[name] && html.length > 0) {
        newlineIfNeeded();
      }
      html.push('<', name);
      if (attrs) {
        for (let i = 0, l = attrs.length; i < l; i++) {
          const attr = attrs[i];
          html.push(' ', attr.name, '="', encode(attr.value, true), '"');
        }
      }
      if (!empty || htmlOutput) {
        html[html.length] = '>';
      } else {
        html[html.length] = ' />';
      }
      if (empty && indent && indentAfter[name] && html.length > 0) {
        newlineIfNeeded();
      }
    },
    end: (name) => {
      html.push('</', name, '>');
      if (indent && indentAfter[name] && html.length > 0) {
        newlineIfNeeded();
      }
    },
    text: (text, raw) => {
      if (text.length > 0) {
        html[html.length] = raw ? text : encode(text);
      }
    },
    cdata: (text) => {
      html.push('<![CDATA[', text, ']]>');
    },
    comment: (text) => {
      html.push('<!--', text, '-->');
    },
    pi: (name, text) => {
      if (text) {
        html.push('<?', name, ' ', encode(text), '?>');
      } else {
        html.push('<?', name, '?>');
      }
      if (indent) {
        html.push('\n');
      }
    },
    doctype: (text) => {
      html.push('<!DOCTYPE', text, '>', indent ? '\n' : '');
    },
    reset: () => {
      html.length = 0;
    },
    getContent: () => html.join('').replace(/\n$/, ''),
  };
};
