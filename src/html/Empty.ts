import { Schema, SchemaMap } from './Schema';

const whitespaceOnly = /^[ \t\r\n]*$/;

export const isWhitespaceText = (text: string): boolean => whitespaceOnly.test(text);

export const isElement = (n: Node | null | undefined): n is Element => !!n && n.nodeType === 1;
export const isText = (n: Node | null | undefined): n is Text => !!n && n.nodeType === 3;
export const isComment = (n: Node | null | undefined): n is Comment => !!n && n.nodeType === 8;
export const nodeName = (n: Node): string => (n.nodeType === 1 ? (n as Element).localName.toLowerCase() : n.nodeType === 3 ? '#text' : n.nodeType === 8 ? '#comment' : n.nodeName.toLowerCase());

export const isBogus = (n: Node): boolean => isElement(n) && n.hasAttribute('data-mce-bogus');
export const isBogusAll = (n: Node): boolean => isElement(n) && n.getAttribute('data-mce-bogus') === 'all';
export const isBookmark = (n: Node): boolean => isElement(n) && n.getAttribute('data-mce-type') === 'bookmark';

/**
 * Port of TinyMCE's AstNode.isEmpty: an element is empty when it contains no non-whitespace
 * text, no comments, no non-empty elements (img, br…), and no anchors with names/bookmarks.
 */
export const isEmptyNode = (
  schema: Schema,
  node: Node,
  nonEmptyElements: SchemaMap = schema.getNonEmptyElements(),
  whitespaceElements: SchemaMap = schema.getWhitespaceElements(),
  predicate?: (n: Node) => boolean,
): boolean => {
  if (isElement(node)) {
    // Named anchors, bookmarks and id-only empty elements count as content (TinyMCE behaviour).
    const isNamedAnchor = node.localName === 'a' && !node.hasAttribute('href') && node.hasAttribute('id');
    if (node.hasAttribute('name') || (node.hasAttribute('id') && !node.firstChild) || node.hasAttribute('data-mce-bookmark') || isNamedAnchor) {
      return false;
    }
  }
  const walker = node.ownerDocument!.createTreeWalker(node, 0xffffffff);
  let current = walker.nextNode();
  while (current) {
    if (isElement(current)) {
      if (!current.hasAttribute('data-mce-bogus')) {
        if (nonEmptyElements[current.localName.toLowerCase()]) {
          return false;
        }
        const attrs = current.attributes;
        for (let i = 0; i < attrs.length; i++) {
          const name = attrs[i].name;
          if (name === 'name' || name.indexOf('data-mce-bookmark') === 0) {
            return false;
          }
        }
      }
    } else if (isComment(current)) {
      return false;
    } else if (isText(current)) {
      const value = current.data;
      if (!isWhitespaceText(value)) {
        return false;
      }
      const parent = current.parentNode;
      if (parent && isElement(parent) && whitespaceElements[parent.localName.toLowerCase()] && isWhitespaceText(value)) {
        return false;
      }
    }
    if (predicate && predicate(current)) {
      return false;
    }
    current = walker.nextNode();
  }
  return true;
};

/** True when the element contains only a single `br` child. */
export const hasOnlyChild = (node: Element, name: string): boolean => {
  const first = node.firstChild;
  return !!first && first === node.lastChild && nodeName(first) === name;
};
