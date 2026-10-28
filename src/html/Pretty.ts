import { Schema } from './Schema';
import { Entities, EncodeFunc } from './Entities';
import { isElement, isText, isComment } from './Empty';

/**
 * Pretty-prints HTML for the source code view: block level elements on their own lines with
 * nested indentation, inline content left untouched, preformatted content preserved verbatim.
 */
export interface PrettySettings {
  indent?: string;
  entity_encoding?: string;
  entities?: string;
  element_format?: 'html' | 'xhtml';
}

const alwaysBlock = new Set('html head body ul ol dl table thead tbody tfoot tr colgroup figure details blockquote div section article aside header footer nav main form fieldset address hr'.split(' '));
const preformatted = new Set(['pre', 'textarea', 'script', 'style', 'xmp', 'plaintext', 'listing']);
const rawText = new Set(['script', 'style', 'xmp', 'plaintext', 'noscript', 'textarea', 'title', 'iframe']);

export const prettyPrint = (root: Node, schema: Schema, settings: PrettySettings = {}): string => {
  const indentUnit = settings.indent ?? '  ';
  const encode: EncodeFunc = Entities.getEncodeFunc(settings.entity_encoding || 'named', settings.entities);
  const voidElements = schema.getVoidElements();
  const blocks = schema.getBlockElements();
  const xhtml = settings.element_format === 'xhtml';
  const out: string[] = [];

  const isBlockName = (name: string) => alwaysBlock.has(name) || !!blocks[name];
  const hasBlockChild = (el: Element): boolean => {
    for (let c = el.firstChild; c; c = c.nextSibling) {
      if (isElement(c) && isBlockName(c.localName.toLowerCase())) {
        return true;
      }
    }
    return false;
  };

  const newline = (depth: number) => {
    if (out.length && out[out.length - 1] !== '\n') {
      out.push('\n');
    }
    if (depth > 0) {
      out.push(indentUnit.repeat(depth));
    }
  };

  const openTag = (el: Element, name: string, isVoid: boolean): string => {
    let s = '<' + name;
    const attrs = el.attributes;
    for (let i = 0; i < attrs.length; i++) {
      s += ' ' + attrs[i].name + '="' + encode(attrs[i].value, true) + '"';
    }
    s += isVoid && xhtml ? ' />' : '>';
    return s;
  };

  const writeInline = (node: Node, raw: boolean): void => {
    if (isText(node)) {
      out.push(raw ? node.data : encode(node.data));
    } else if (isComment(node)) {
      out.push('<!--' + node.data + '-->');
    } else if (isElement(node)) {
      const name = node.localName.toLowerCase();
      const isVoid = !!voidElements[name];
      out.push(openTag(node, name, isVoid));
      if (!isVoid) {
        const childRaw = raw || rawText.has(name);
        for (let c = node.firstChild; c; c = c.nextSibling) {
          writeInline(c, childRaw);
        }
        out.push('</' + name + '>');
      }
    }
  };

  const writeNode = (node: Node, depth: number, inBlockContext: boolean): void => {
    if (isElement(node)) {
      const name = node.localName.toLowerCase();
      if (isBlockName(name)) {
        const isVoid = !!voidElements[name];
        newline(depth);
        out.push(openTag(node, name, isVoid));
        if (isVoid) {
          return;
        }
        if (preformatted.has(name)) {
          const raw = rawText.has(name);
          for (let c = node.firstChild; c; c = c.nextSibling) {
            writeInline(c, raw);
          }
          out.push('</' + name + '>');
          return;
        }
        if (hasBlockChild(node)) {
          for (let c = node.firstChild; c; c = c.nextSibling) {
            writeNode(c, depth + 1, true);
          }
          newline(depth);
        } else {
          for (let c = node.firstChild; c; c = c.nextSibling) {
            writeInline(c, false);
          }
        }
        out.push('</' + name + '>');
        return;
      }
      if (inBlockContext) {
        newline(depth);
      }
      writeInline(node, false);
      return;
    }
    if (isText(node)) {
      if (inBlockContext && /^[ \t\r\n]*$/.test(node.data)) {
        return;
      }
      if (inBlockContext) {
        newline(depth);
      }
      out.push(encode(node.data));
      return;
    }
    if (isComment(node)) {
      if (inBlockContext) {
        newline(depth);
      }
      out.push('<!--' + node.data + '-->');
    }
  };

  for (let c = root.firstChild; c; c = c.nextSibling) {
    writeNode(c, 0, true);
  }
  return out.join('').replace(/^\n/, '').replace(/\n$/, '');
};
