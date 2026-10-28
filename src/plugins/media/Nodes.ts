import type { Editor } from '../../core/Editor';
import { Env } from '../../util/Env';

/**
 * In-editor representation of media. Live embeds (video/audio/iframe) are wrapped in a
 * non-editable `span.mce-preview-object` with a transparent shim so they can be selected; other
 * media (or everything when `media_live_embeds` is off) becomes an `img.mce-object` placeholder
 * carrying the original attributes as `data-mce-p-*` and the inner HTML as `data-mce-html`.
 * Both are converted back on output.
 */
const MEDIA_SELECTOR = 'video,audio,iframe,object,embed';

const isLiveEmbed = (editor: Editor, name: string): boolean => !!editor.options.get('media_live_embeds') && /^(video|audio|iframe)$/.test(name);

const createPreviewNode = (node: Element): Element => {
  const doc = node.ownerDocument;
  const name = node.nodeName.toLowerCase();
  const span = doc.createElement('span');
  span.setAttribute('class', 'mce-preview-object mce-object-' + name);
  span.setAttribute('contenteditable', 'false');
  span.setAttribute('data-mce-object', name);
  node.parentNode?.insertBefore(span, node);
  span.appendChild(node);
  const shim = doc.createElement('span');
  shim.setAttribute('class', 'mce-shim');
  span.appendChild(shim);
  // Iframes inside the editor are sandboxed by the sanitiser already; keep videos from autoplaying.
  if (name === 'video' || name === 'audio') {
    node.removeAttribute('autoplay');
  }
  return span;
};

const createPlaceholderNode = (node: Element): Element => {
  const doc = node.ownerDocument;
  const name = node.nodeName.toLowerCase();
  const img = doc.createElement('img');
  img.setAttribute('src', Env.transparentSrc);
  img.setAttribute('class', 'mce-object mce-object-' + name);
  img.setAttribute('data-mce-object', name);
  Array.from(node.attributes).forEach((a) => {
    img.setAttribute('data-mce-p-' + a.name, a.value);
  });
  const width = node.getAttribute('width') || (node as HTMLElement).style?.width?.replace(/px$/, '') || '';
  const height = node.getAttribute('height') || (node as HTMLElement).style?.height?.replace(/px$/, '') || '';
  if (width) {
    img.setAttribute('width', width);
  }
  if (height) {
    img.setAttribute('height', height);
  }
  if (node.innerHTML) {
    img.setAttribute('data-mce-html', encodeURIComponent(node.innerHTML));
  }
  node.parentNode?.replaceChild(img, node);
  return img;
};

const restorePlaceholder = (img: Element): Element => {
  const doc = img.ownerDocument;
  const name = img.getAttribute('data-mce-object') as string;
  const el = doc.createElement(name);
  Array.from(img.attributes).forEach((a) => {
    if (a.name.startsWith('data-mce-p-')) {
      el.setAttribute(a.name.slice('data-mce-p-'.length), a.value);
    }
  });
  const width = img.getAttribute('width');
  const height = img.getAttribute('height');
  if (width && !el.getAttribute('width')) {
    el.setAttribute('width', width);
  }
  if (height && !el.getAttribute('height')) {
    el.setAttribute('height', height);
  }
  const inner = img.getAttribute('data-mce-html');
  if (inner) {
    el.innerHTML = decodeURIComponent(inner);
  }
  img.parentNode?.replaceChild(el, img);
  return el;
};

export const isMediaNode = (node: Node | null): node is HTMLElement => !!node && node.nodeType === 1 && (node as Element).hasAttribute('data-mce-object');

export const getMediaNode = (editor: Editor, node: Node | null): HTMLElement | null => {
  if (!node) {
    return null;
  }
  if (isMediaNode(node)) {
    return node;
  }
  return editor.dom.getParent(node, '[data-mce-object]', editor.getBody()) as HTMLElement | null;
};

/** Returns the original media element (inside a preview wrapper) or restores it from a placeholder clone. */
export const getOriginalMarkup = (node: HTMLElement): string => {
  if (node.nodeName === 'IMG') {
    const clone = node.cloneNode(true) as Element;
    const holder = node.ownerDocument.createElement('div');
    holder.appendChild(clone);
    restorePlaceholder(clone);
    return holder.innerHTML;
  }
  const inner = node.querySelector(MEDIA_SELECTOR);
  return inner ? inner.outerHTML : '';
};

export const setupNodes = (editor: Editor): void => {
  editor.on('PreInit', () => {
    editor.parser.addNodeFilter(MEDIA_SELECTOR, (nodes, _name, args) => {
      if ((args as any).format === 'raw') {
        return;
      }
      nodes.forEach((node) => {
        // Nodes live in a detached fragment here, so check the parent rather than isConnected.
        if (!node.parentNode || node.hasAttribute('data-mce-object') || node.parentElement?.hasAttribute('data-mce-object')) {
          return;
        }
        if (node.parentElement && node.parentElement.classList.contains('mce-preview-object')) {
          return;
        }
        const name = node.nodeName.toLowerCase();
        if (isLiveEmbed(editor, name)) {
          createPreviewNode(node);
        } else {
          createPlaceholderNode(node);
        }
      });
    });
    editor.serializer.addAttributeFilter('data-mce-object', (nodes) => {
      nodes.forEach((node) => {
        if (node.nodeName === 'IMG') {
          restorePlaceholder(node);
          return;
        }
        // Preview wrapper: unwrap the real element.
        const inner = node.querySelector(MEDIA_SELECTOR);
        if (inner && node.parentNode) {
          node.parentNode.replaceChild(inner, node);
        } else {
          node.remove();
        }
      });
    });
  });

  // Resizing the wrapper/placeholder resizes the embedded element.
  editor.on('ObjectResized', (e) => {
    const target = e.target as HTMLElement;
    if (!isMediaNode(target)) {
      return;
    }
    if (target.nodeName === 'IMG') {
      target.setAttribute('data-mce-p-width', String(e.width));
      target.setAttribute('data-mce-p-height', String(e.height));
      return;
    }
    const inner = target.querySelector(MEDIA_SELECTOR) as HTMLElement | null;
    if (inner) {
      inner.setAttribute('width', String(e.width));
      inner.setAttribute('height', String(e.height));
      editor.dom.setStyle(inner, 'width', '');
      editor.dom.setStyle(inner, 'height', '');
    }
    editor.dom.setStyle(target, 'width', '');
    editor.dom.setStyle(target, 'height', '');
    if (!target.getAttribute('style')) {
      target.removeAttribute('style');
    }
  });
};
