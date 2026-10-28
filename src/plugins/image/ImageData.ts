import type { Editor } from '../../core/Editor';

/**
 * Reads and writes the attributes of an image (and its optional `<figure class="image">`
 * wrapper with caption) as a flat data object used by the image dialog. Port of TinyMCE's
 * image plugin ImageData.
 */
export interface ImageData {
  src: string;
  alt: string | null;
  title: string;
  width: string;
  height: string;
  class: string;
  style: string;
  caption: boolean;
  hspace: string;
  vspace: string;
  border: string;
  borderStyle: string;
  isDecorative: boolean;
}

const DOM_ATTRS = ['src', 'alt', 'title', 'width', 'height', 'class', 'style'] as const;

export const isFigure = (el: Node | null): el is HTMLElement => !!el && el.nodeName === 'FIGURE';
export const isImage = (el: Node | null): el is HTMLImageElement => !!el && el.nodeName === 'IMG';

export const removePixelSuffix = (v: string): string => (v ? v.replace(/px$/, '') : v);
export const addPixelSuffix = (v: string): string => (v && /^\d+$/.test(v) ? v + 'px' : v);

const getAttrib = (el: Element, name: string): string => el.getAttribute(name) ?? '';

const getStyleValue = (editor: Editor, el: Element, name: string): string => removePixelSuffix(editor.dom.getStyle(el, name) || '');

const normalizeCss = (editor: Editor, css: string): string => {
  const styles = editor.dom.parseStyle(css);
  return editor.dom.serializeStyle(styles);
};

export const defaultData = (): ImageData => ({
  src: '',
  alt: '',
  title: '',
  width: '',
  height: '',
  class: '',
  style: '',
  caption: false,
  hspace: '',
  vspace: '',
  border: '',
  borderStyle: '',
  isDecorative: false,
});

const getHspace = (editor: Editor, img: Element): string => {
  const left = getStyleValue(editor, img, 'margin-left');
  const right = getStyleValue(editor, img, 'margin-right');
  return left && left === right ? left : '';
};
const getVspace = (editor: Editor, img: Element): string => {
  const top = getStyleValue(editor, img, 'margin-top');
  const bottom = getStyleValue(editor, img, 'margin-bottom');
  return top && top === bottom ? top : '';
};
const getBorder = (editor: Editor, img: Element): string => getStyleValue(editor, img, 'border-width');
const getBorderStyle = (editor: Editor, img: Element): string => editor.dom.getStyle(img, 'border-style') || '';

export const read = (editor: Editor, image: HTMLImageElement): ImageData => {
  const figure = isFigure(image.parentNode) && (image.parentNode as HTMLElement).classList.contains('image') ? (image.parentNode as HTMLElement) : null;
  const src = image.getAttribute('data-mce-src') || getAttrib(image, 'src');
  const widthAttr = getAttrib(image, 'width') || getStyleValue(editor, image, 'width');
  const heightAttr = getAttrib(image, 'height') || getStyleValue(editor, image, 'height');
  const alt = image.hasAttribute('alt') ? getAttrib(image, 'alt') : null;
  return {
    src,
    alt,
    title: getAttrib(image, 'title'),
    width: widthAttr,
    height: heightAttr,
    class: getAttrib(image, 'class'),
    style: normalizeCss(editor, image.getAttribute('data-mce-style') || getAttrib(image, 'style')),
    caption: !!figure && !!figure.querySelector('figcaption'),
    hspace: getHspace(editor, image),
    vspace: getVspace(editor, image),
    border: getBorder(editor, image),
    borderStyle: getBorderStyle(editor, image),
    isDecorative: alt === '' && getAttrib(image, 'role') === 'presentation',
  };
};

const setAttrib = (el: Element, name: string, value: string | null) => {
  if (value === null || value === '') {
    el.removeAttribute(name);
  } else {
    el.setAttribute(name, value);
  }
};

const applyStyle = (editor: Editor, image: HTMLElement, data: ImageData) => {
  const dom = editor.dom;
  const styles = dom.parseStyle(data.style);
  if (data.hspace) {
    styles['margin-left'] = addPixelSuffix(data.hspace);
    styles['margin-right'] = addPixelSuffix(data.hspace);
  } else {
    delete styles['margin-left'];
    delete styles['margin-right'];
  }
  if (data.vspace) {
    styles['margin-top'] = addPixelSuffix(data.vspace);
    styles['margin-bottom'] = addPixelSuffix(data.vspace);
  } else {
    delete styles['margin-top'];
    delete styles['margin-bottom'];
  }
  if (data.border) {
    styles['border-width'] = addPixelSuffix(data.border);
  } else {
    delete styles['border-width'];
  }
  if (data.borderStyle) {
    styles['border-style'] = data.borderStyle;
  } else {
    delete styles['border-style'];
  }
  // Width/height live in attributes, not styles.
  delete styles.width;
  delete styles.height;
  const css = dom.serializeStyle(styles);
  if (css) {
    image.setAttribute('style', css);
    image.setAttribute('data-mce-style', css);
  } else {
    image.removeAttribute('style');
    image.removeAttribute('data-mce-style');
  }
};

export const write = (editor: Editor, image: HTMLImageElement, data: ImageData): void => {
  setAttrib(image, 'src', data.src);
  image.setAttribute('data-mce-src', data.src);
  if (data.isDecorative) {
    image.setAttribute('alt', '');
    image.setAttribute('role', 'presentation');
  } else {
    setAttrib(image, 'alt', data.alt === null ? null : data.alt);
    image.removeAttribute('role');
  }
  setAttrib(image, 'title', data.title);
  setAttrib(image, 'width', removePixelSuffix(data.width));
  setAttrib(image, 'height', removePixelSuffix(data.height));
  setAttrib(image, 'class', data.class);
  applyStyle(editor, image, data);
};

/** Builds a `<figure class="image">` with caption around a fresh image. */
export const createFigure = (editor: Editor, image: HTMLImageElement): HTMLElement => {
  const dom = editor.dom;
  const figure = dom.create('figure', { class: 'image', contenteditable: 'false' });
  figure.appendChild(image);
  const caption = dom.create('figcaption', { contenteditable: 'true' }, editor.translate('Caption'));
  figure.appendChild(caption);
  return figure;
};

export const toggleCaption = (editor: Editor, image: HTMLImageElement, caption: boolean): HTMLElement => {
  const parent = image.parentNode as HTMLElement | null;
  const inFigure = isFigure(parent) && parent.classList.contains('image');
  if (caption && !inFigure) {
    const figure = createFigure(editor, image.cloneNode(true) as HTMLImageElement);
    // Figures are blocks: split the paragraph around the image.
    const block = editor.dom.getParent(image, (n) => n.nodeType === 1 && editor.dom.isBlock(n) && n !== editor.getBody(), editor.getBody()) as HTMLElement | null;
    if (block && block.parentNode) {
      editor.dom.split(block, image);
      // split() replaces the image with itself at root level; put the figure in its place.
      image.parentNode?.replaceChild(figure, image);
    } else {
      image.parentNode?.replaceChild(figure, image);
    }
    return figure;
  }
  if (!caption && inFigure && parent) {
    const img = image;
    const p = editor.dom.create(editor.options.get('forced_root_block') as string);
    p.appendChild(img);
    parent.parentNode?.replaceChild(p, parent);
    return img;
  }
  return inFigure && parent ? parent : image;
};

export { DOM_ATTRS };
