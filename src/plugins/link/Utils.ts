import type { Editor } from '../../core/Editor';
import * as NodeType from '../../dom/NodeType';
import { isString, isArray, isFunction } from '../../util/Type';

export interface LinkAttrs {
  href: string;
  text?: string;
  title?: string;
  target?: string;
  rel?: string;
  class?: string;
}

export interface ListItem {
  text: string;
  value: string;
}

export const getAnchorElement = (editor: Editor, selectedElm?: Node | null): HTMLAnchorElement | null => {
  const node = selectedElm ?? editor.selection.getNode();
  if (isImageFigure(node)) {
    return editor.dom.select('a[href]', node as HTMLElement)[0] as HTMLAnchorElement | undefined ?? null;
  }
  return editor.dom.getParent(node, 'a[href]') as HTMLAnchorElement | null;
};

export const isImageFigure = (node: Node | null): boolean => !!node && node.nodeName === 'FIGURE' && /\bimage\b/.test((node as HTMLElement).className);

export const isLink = (node: Node | null): node is HTMLAnchorElement => !!node && node.nodeName === 'A' && !!(node as HTMLAnchorElement).getAttribute('href');

export const hasLinks = (nodes: Node[]): boolean => nodes.some((n) => isLink(n));

export const isInAnchor = (editor: Editor, node: Node | null): boolean => !!getAnchorElement(editor, node);

/** True when the selection holds only text (no images or non-editable blocks), so a "Text to display" field makes sense. */
export const isOnlyTextSelected = (editor: Editor): boolean => {
  const rng = editor.selection.getRng();
  if (rng.collapsed) {
    return true;
  }
  const frag = rng.cloneContents();
  const walker = frag.ownerDocument.createTreeWalker(frag, NodeFilter.SHOW_ELEMENT);
  let n = walker.nextNode();
  while (n) {
    if (/^(IMG|VIDEO|AUDIO|IFRAME|TABLE|HR|FIGURE)$/.test(n.nodeName) || (n as Element).getAttribute('contenteditable') === 'false') {
      return false;
    }
    n = walker.nextNode();
  }
  return true;
};

export const getLinkText = (editor: Editor, anchor: HTMLAnchorElement | null): string => {
  if (anchor) {
    return anchor.textContent ?? '';
  }
  return editor.selection.getContent({ format: 'text' }) as string;
};

const toList = (items: unknown): ListItem[] => (isArray(items) ? items.map((i: any) => ({ text: i.text ?? i.title ?? i.value ?? '', value: i.value ?? '' })) : []);

export const getLinkList = (editor: Editor): Promise<ListItem[] | null> => {
  const list = editor.options.get('link_list');
  if (!list) {
    return Promise.resolve(null);
  }
  if (isArray(list)) {
    return Promise.resolve(toList(list));
  }
  if (isFunction(list)) {
    return new Promise((resolve) => list((items: unknown) => resolve(toList(items))));
  }
  if (isString(list)) {
    return fetch(list)
      .then((r) => r.json())
      .then((items) => toList(items))
      .catch(() => null);
  }
  return Promise.resolve(null);
};

export const getTargetList = (editor: Editor): ListItem[] | null => {
  const list = editor.options.get('link_target_list');
  if (list === false) {
    return null;
  }
  if (isArray(list)) {
    return toList(list);
  }
  return [
    { text: 'None', value: '' },
    { text: 'New window', value: '_blank' },
  ];
};

export const getRelList = (editor: Editor): ListItem[] | null => {
  const list = editor.options.get('link_rel_list');
  return isArray(list) && list.length ? toList(list) : null;
};

export const getClassList = (editor: Editor): ListItem[] | null => {
  const list = editor.options.get('link_class_list');
  return isArray(list) && list.length ? toList(list) : null;
};

export const getAnchors = (editor: Editor): ListItem[] | null => {
  const anchors = editor.dom.select('a:not([href])', editor.getBody()).filter((a) => a.getAttribute('name') || a.id);
  if (!anchors.length) {
    return null;
  }
  return anchors.map((a) => {
    const id = a.getAttribute('name') || a.id;
    return { text: id, value: '#' + id };
  });
};

export const applyRelTargetRules = (editor: Editor, rel: string | undefined, target: string | undefined): string | undefined => {
  if (target === '_blank' && !editor.options.get('allow_unsafe_link_target')) {
    const parts = (rel || '').split(/\s+/).filter(Boolean);
    if (!parts.includes('noopener')) {
      parts.push('noopener');
    }
    return parts.join(' ');
  }
  return rel || undefined;
};

export const isAbsoluteLike = (url: string): boolean => /^(?:[a-z][a-z0-9+.-]*:|\/|#|\?|\.\/|\.\.\/)/i.test(url);
export const looksLikeExternal = (url: string): boolean => /^(www\.|[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$))/i.test(url) && !/\s/.test(url);
export const looksLikeEmail = (url: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url);

export const unlink = (editor: Editor): void => {
  editor.undoManager.transact(() => {
    editor.execCommand('unlink');
  });
};

export const openLink = (editor: Editor, anchor: HTMLAnchorElement | null): void => {
  const a = anchor ?? getAnchorElement(editor);
  if (!a) {
    return;
  }
  const href = a.getAttribute('data-mce-href') || a.getAttribute('href') || '';
  if (!href || /^javascript:/i.test(href)) {
    return;
  }
  const win = window.open(href, '_blank', 'noopener');
  if (win) {
    (win as any).opener = null;
  }
};

export const isCaretInsideText = (editor: Editor): boolean => NodeType.isText(editor.selection.getRng().startContainer);
