import { Schema } from './Schema';
import { createWriter, WriterSettings } from './Writer';
import { isElement, isText, isComment } from './Empty';

export interface HtmlSerializerSettings extends WriterSettings {
  inner?: boolean;
}

export interface HtmlSerializer {
  /** Serialises a DOM node (or fragment) to an HTML string. `inner` writes only the children. */
  serialize: (node: Node, inner?: boolean) => string;
}

/** Elements whose text content is written raw (no entity encoding). */
const rawTextElements = new Set(['script', 'style', 'xmp', 'plaintext', 'noscript', 'noembed', 'noframes', 'iframe', 'textarea', 'title']);

export const createHtmlSerializer = (settings: HtmlSerializerSettings = {}, schema: Schema): HtmlSerializer => {
  const voidElements = schema.getVoidElements();

  const serialize = (node: Node, inner?: boolean): string => {
    const writer = createWriter(settings);

    const walk = (n: Node, raw: boolean): void => {
      if (isText(n)) {
        writer.text(n.data, raw);
        return;
      }
      if (isComment(n)) {
        writer.comment(n.data);
        return;
      }
      if (n.nodeType === 4) {
        writer.cdata((n as CharacterData).data);
        return;
      }
      if (n.nodeType === 7) {
        writer.pi((n as ProcessingInstruction).target, (n as ProcessingInstruction).data);
        return;
      }
      if (n.nodeType === 10) {
        writer.doctype(' ' + (n as DocumentType).name);
        return;
      }
      if (n.nodeType === 11) {
        for (let c = n.firstChild; c; c = c.nextSibling) {
          walk(c, raw);
        }
        return;
      }
      if (!isElement(n)) {
        return;
      }
      const name = n.localName.toLowerCase();
      const isVoid = !!voidElements[name] || (isElement(n) && n.namespaceURI === 'http://www.w3.org/2000/svg' && n.childNodes.length === 0 && false);
      const attrs: Array<{ name: string; value: string }> = [];
      const attributes = n.attributes;
      for (let i = 0; i < attributes.length; i++) {
        attrs.push({ name: attributes[i].name, value: attributes[i].value });
      }
      writer.start(name, attrs, isVoid);
      if (!isVoid) {
        const childRaw = raw || rawTextElements.has(name);
        for (let c = n.firstChild; c; c = c.nextSibling) {
          walk(c, childRaw);
        }
        writer.end(name);
      }
    };

    if (inner || settings.inner) {
      for (let c = node.firstChild; c; c = c.nextSibling) {
        walk(c, false);
      }
    } else {
      walk(node, false);
    }
    return writer.getContent();
  };

  return { serialize };
};
