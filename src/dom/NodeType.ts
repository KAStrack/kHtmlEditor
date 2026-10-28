/** Node type predicates used throughout the editor. */

export const isNode = (n: unknown): n is Node => !!n && typeof (n as Node).nodeType === 'number';
export const isElement = (n: Node | null | undefined): n is HTMLElement => !!n && n.nodeType === 1;
export const isText = (n: Node | null | undefined): n is Text => !!n && n.nodeType === 3;
export const isComment = (n: Node | null | undefined): n is Comment => !!n && n.nodeType === 8;
export const isDocument = (n: Node | null | undefined): n is Document => !!n && n.nodeType === 9;
export const isDocumentFragment = (n: Node | null | undefined): n is DocumentFragment => !!n && n.nodeType === 11;

const matchName = (names: string[]) => {
  const map = new Set(names.map((n) => n.toLowerCase()));
  return (n: Node | null | undefined): n is HTMLElement => isElement(n) && map.has(n.nodeName.toLowerCase());
};

export const isBr = matchName(['br']);
export const isImg = matchName(['img']);
export const isHr = matchName(['hr']);
export const isAnchor = matchName(['a']);
export const isListItem = matchName(['li']);
export const isList = matchName(['ul', 'ol']);
export const isTable = matchName(['table']);
export const isTableCell = matchName(['td', 'th']);
export const isTableRow = matchName(['tr']);
export const isTableSection = matchName(['tbody', 'thead', 'tfoot']);
export const isDetails = matchName(['details']);
export const isSummary = matchName(['summary']);
export const isPre = matchName(['pre']);
export const isFigure = matchName(['figure']);
export const isMedia = matchName(['video', 'audio', 'object', 'embed', 'iframe']);
export const isSvg = (n: Node | null | undefined): boolean => isElement(n) && n.namespaceURI === 'http://www.w3.org/2000/svg';
export const isTextareaOrInput = matchName(['textarea', 'input']);
export const isBlockquote = matchName(['blockquote']);

export const isBogus = (n: Node | null | undefined): boolean => isElement(n) && n.hasAttribute('data-mce-bogus');
export const isBogusAll = (n: Node | null | undefined): boolean => isElement(n) && n.getAttribute('data-mce-bogus') === 'all';
export const isBookmarkNode = (n: Node | null | undefined): boolean => isElement(n) && n.getAttribute('data-mce-type') === 'bookmark';
export const isCaretContainer = (n: Node | null | undefined): boolean => isElement(n) && n.hasAttribute('data-mce-caret');
export const isInternal = (n: Node | null | undefined): boolean => isElement(n) && (n.hasAttribute('data-mce-type') || n.hasAttribute('data-mce-bogus'));

export const isContentEditableTrue = (n: Node | null | undefined): n is HTMLElement => isElement(n) && n.getAttribute('contenteditable') === 'true';
export const isContentEditableFalse = (n: Node | null | undefined): n is HTMLElement => isElement(n) && n.getAttribute('contenteditable') === 'false';
export const hasContentEditableState = (n: Node | null | undefined, value: string): boolean => isElement(n) && n.getAttribute('contenteditable') === value;

export const isRestrictedNode = (n: Node | null | undefined): boolean => !!n && !!(n.nodeType === 1 && /^(IFRAME|SCRIPT|STYLE|TEXTAREA|SELECT|INPUT|BUTTON|VIDEO|AUDIO|OBJECT|EMBED)$/.test(n.nodeName));

export const name = (n: Node): string => n.nodeName.toLowerCase();
export const isNamedAnchor = (n: Node | null | undefined): boolean => isAnchor(n) && !n.hasAttribute('href') && (n.hasAttribute('id') || n.hasAttribute('name'));
export const isZwsp = (text: string): boolean => text === '﻿';
export const ZWSP = '﻿';
export const isZwspText = (n: Node | null | undefined): boolean => isText(n) && n.data === ZWSP;
export const removeZwsp = (text: string): string => text.replace(/﻿/g, '');
export const isWhitespaceText = (text: string): boolean => /^[ \t\r\n]*$/.test(text);
export const isNbsp = (c: string): boolean => c === ' ';
export const NBSP = ' ';
