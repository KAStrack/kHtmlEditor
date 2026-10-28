import type { Editor } from './Editor';
import { createDomParser, DomParser, ParserArgs, ParserFilterCallback } from '../html/HtmlParser';
import { createHtmlSerializer } from '../html/HtmlSerializer';
import { getParserSettings } from './EditorParser';
import { isElement } from '../html/Empty';
import * as NodeType from '../dom/NodeType';

/**
 * Content serializer (`editor.serializer`): clones the DOM, strips editor internals, re-filters
 * through the schema and writes HTML. Node/attribute filters run on the clone.
 */
export interface DomSerializer {
  schema: Editor['schema'];
  addNodeFilter: (name: string, callback: ParserFilterCallback) => void;
  addAttributeFilter: (name: string, callback: ParserFilterCallback) => void;
  getNodeFilters: () => ReturnType<DomParser['getNodeFilters']>;
  getAttributeFilters: () => ReturnType<DomParser['getAttributeFilters']>;
  removeNodeFilter: (name: string, callback?: ParserFilterCallback) => void;
  removeAttributeFilter: (name: string, callback?: ParserFilterCallback) => void;
  serialize: (node: Node, args?: ParserArgs) => string;
  addTempAttr: (name: string) => void;
  getTempAttrs: () => string[];
  /** Internal: filters a cloned subtree without serialising it (used by the pretty source view). */
  filterClone: (node: Node, args?: ParserArgs) => Element;
}

export const createDomSerializer = (editor: Editor): DomSerializer => {
  const tempAttrs: string[] = ['data-mce-selected'];
  const parser = createDomParser(getParserSettings(editor), editor.schema);
  const get = <T = any>(name: string) => editor.options.get<T>(name);

  const serializerSettings = () => ({
    element_format: get<'html' | 'xhtml'>('element_format'),
    entities: get<string | undefined>('entities'),
    entity_encoding: get<string>('entity_encoding'),
    indent: get<boolean>('indent'),
    indent_after: (get<string>('indent_after') || '').replace(/,/g, ' '),
    indent_before: (get<string>('indent_before') || '').replace(/,/g, ' '),
  });

  // --- serializer filters (TinyMCE DomSerializerFilters) ---
  parser.addAttributeFilter('data-mce-tabindex', (nodes, name) => {
    for (const node of nodes) {
      node.setAttribute('tabindex', node.getAttribute(name) as string);
      node.removeAttribute(name);
    }
  });

  parser.addAttributeFilter('src,href,style', (nodes, name) => {
    const internalName = 'data-mce-' + name;
    for (const node of nodes) {
      const internal = node.getAttribute(internalName);
      if (internal !== null) {
        if (internal.length > 0) {
          node.setAttribute(name, internal);
        } else {
          node.removeAttribute(name);
        }
        node.removeAttribute(internalName);
      } else {
        let value = node.getAttribute(name) || '';
        if (name === 'style') {
          value = editor.dom.serializeStyle(editor.dom.parseStyle(value), node.nodeName.toLowerCase());
        } else {
          value = editor.convertURL(value, name, node.nodeName.toLowerCase());
        }
        if (value.length > 0) {
          node.setAttribute(name, value);
        } else {
          node.removeAttribute(name);
        }
      }
    }
  });

  parser.addAttributeFilter('class', (nodes) => {
    for (const node of nodes) {
      const value = (node.getAttribute('class') || '').replace(/(?:^|\s)mce-item-\w+(?!\S)/g, '').trim();
      if (value.length > 0) {
        node.setAttribute('class', value);
      } else {
        node.removeAttribute('class');
      }
    }
  });

  parser.addAttributeFilter('data-mce-type', (nodes, _name, args) => {
    for (const node of nodes) {
      const type = node.getAttribute('data-mce-type');
      if (type === 'bookmark' && !args.cleanup) {
        node.parentNode?.removeChild(node);
      } else if (type === 'protected') {
        const content = node.getAttribute('data-mce-content') || '';
        const comment = node.ownerDocument.createComment('mce:protected ' + content);
        node.parentNode?.replaceChild(comment, node);
      } else if (type === 'format-caret') {
        while (node.firstChild) {
          node.parentNode?.insertBefore(node.firstChild, node);
        }
        node.parentNode?.removeChild(node);
      }
    }
  });

  parser.addNodeFilter('script,style', (nodes) => {
    for (const node of nodes) {
      const type = (node.getAttribute('type') || 'no/type').replace(/^mce-/, '');
      if (type !== 'no/type') {
        node.setAttribute('type', type);
      } else {
        node.removeAttribute('type');
      }
    }
  });

  parser.addNodeFilter('input', (nodes) => {
    for (const node of nodes) {
      if (!node.hasAttribute('type')) {
        node.setAttribute('type', 'text');
      }
    }
  });

  parser.addAttributeFilter('data-mce-src,data-mce-href,data-mce-style,data-mce-selected,data-mce-expando,data-mce-block,data-mce-type,data-mce-resize,data-mce-placeholder,data-mce-contenteditable,data-mce-caret,data-mce-fragment,data-mce-id', (nodes, name) => {
    for (const node of nodes) {
      node.removeAttribute(name);
    }
  });

  // --- pre-processing of the clone before filtering ---
  const stripInternals = (root: Element): void => {
    // Remove bogus "all" elements, unwrap bogus "1" elements, drop internal selection/resize UI.
    const bogus = Array.from(root.querySelectorAll('[data-mce-bogus]'));
    for (const el of bogus) {
      if (el.getAttribute('data-mce-bogus') === 'all') {
        el.parentNode?.removeChild(el);
      } else {
        while (el.firstChild) {
          el.parentNode?.insertBefore(el.firstChild, el);
        }
        el.parentNode?.removeChild(el);
      }
    }
    for (const attr of tempAttrs) {
      root.querySelectorAll('[' + attr + ']').forEach((el) => el.removeAttribute(attr));
    }
    // Restore contenteditable states stored while editing.
    root.querySelectorAll('[data-mce-contenteditable]').forEach((el) => {
      const state = el.getAttribute('data-mce-contenteditable');
      if (state && state !== 'inherit') {
        el.setAttribute('contenteditable', state);
      } else {
        el.removeAttribute('contenteditable');
      }
      el.removeAttribute('data-mce-contenteditable');
    });
    // Remove zero width no-break spaces used by caret containers.
    const walker = root.ownerDocument.createTreeWalker(root, 4);
    const texts: Text[] = [];
    let t = walker.nextNode() as Text | null;
    while (t) {
      if (t.data.indexOf(NodeType.ZWSP) !== -1) {
        texts.push(t);
      }
      t = walker.nextNode() as Text | null;
    }
    for (const text of texts) {
      const cleaned = NodeType.removeZwsp(text.data);
      if (cleaned.length) {
        text.data = cleaned;
      } else {
        text.parentNode?.removeChild(text);
      }
    }
  };

  const filterClone = (node: Node, args: ParserArgs = {}): Element => {
    const doc = editor.dom.doc;
    const container = doc.createElement('body');
    const clone = node.cloneNode(true);
    if (isElement(clone) && clone.nodeName === 'BODY') {
      while (clone.firstChild) {
        container.appendChild(clone.firstChild);
      }
    } else if (args.getInner && isElement(clone)) {
      while (clone.firstChild) {
        container.appendChild(clone.firstChild);
      }
    } else {
      container.appendChild(clone);
    }
    stripInternals(container);
    editor.dispatch('PreProcess', { ...args, node: container });
    parser.filter(container, { ...args, get: true, format: args.format ?? 'html', context: undefined });
    return container;
  };

  const serialize = (node: Node, args: ParserArgs = {}): string => {
    const settings = serializerSettings();
    const htmlSerializer = createHtmlSerializer(settings, editor.schema);
    const container = filterClone(node, args);
    let html = htmlSerializer.serialize(container, true);
    const postArgs = { ...args, content: html, node: container };
    if (!args.no_events) {
      editor.dispatch('PostProcess', postArgs);
    }
    html = postArgs.content;
    return html.replace(/^\n+/, '').replace(/\n+$/, '');
  };

  return {
    schema: editor.schema,
    addNodeFilter: parser.addNodeFilter,
    addAttributeFilter: parser.addAttributeFilter,
    getNodeFilters: parser.getNodeFilters,
    getAttributeFilters: parser.getAttributeFilters,
    removeNodeFilter: parser.removeNodeFilter,
    removeAttributeFilter: parser.removeAttributeFilter,
    serialize,
    addTempAttr: (name) => {
      if (!tempAttrs.includes(name)) {
        tempAttrs.push(name);
      }
    },
    getTempAttrs: () => tempAttrs,
    filterClone,
  };
};
