import type { Editor } from '../../core/Editor';
import * as ImageData from './ImageData';
import { cacheBlob, blobToDataUri } from '../../content/BlobScanner';
import { isFunction, isString, isArray } from '../../util/Type';

/** TinyMCE-compatible image dialog (General / Upload / Advanced tabs). */
interface ListItem {
  text: string;
  value: string;
}

const getImageList = (editor: Editor): Promise<ListItem[] | null> => {
  const list = editor.options.get('image_list');
  if (!list) {
    return Promise.resolve(null);
  }
  if (isArray(list)) {
    return Promise.resolve(normalizeList(list));
  }
  if (isFunction(list)) {
    return new Promise((resolve) => list((items: any[]) => resolve(normalizeList(items))));
  }
  if (isString(list)) {
    return fetch(list)
      .then((r) => r.json())
      .then((items) => normalizeList(items))
      .catch(() => null);
  }
  return Promise.resolve(null);
};

const normalizeList = (items: any[]): ListItem[] => items.map((i) => ({ text: i.text || i.title || i.value || i.url || '', value: i.value || i.url || '' }));

const classList = (editor: Editor): ListItem[] | null => {
  const list = editor.options.get('image_class_list');
  return isArray(list) && list.length ? list.map((i: any) => ({ text: i.title ?? i.text ?? i.value, value: i.value ?? '' })) : null;
};

/** Measures the natural size of an image URL inside the editor document. */
export const getImageSize = (editor: Editor, url: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const img = editor.getDoc().createElement('img');
    const done = () => {
      img.remove();
    };
    img.onload = () => {
      const size = { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
      done();
      resolve(size);
    };
    img.onerror = () => {
      done();
      reject(new Error('Failed to load image'));
    };
    img.style.cssText = 'position:absolute;left:-9999px;visibility:hidden;';
    img.setAttribute('data-mce-bogus', 'all');
    img.src = url;
    editor.getBody().appendChild(img);
  });

interface DialogData {
  src: { value: string; meta?: Record<string, any> };
  images?: string;
  alt?: string;
  title?: string;
  dimensions?: { width: string; height: string };
  classes?: string;
  caption?: boolean;
  isDecorative?: boolean;
  fileinput?: File[];
  style?: string;
  vspace?: string;
  hspace?: string;
  border?: string;
  borderstyle?: string;
}

const toDialogData = (data: ImageData.ImageData): DialogData => ({
  src: { value: data.src },
  images: '',
  alt: data.alt ?? '',
  title: data.title,
  dimensions: { width: data.width, height: data.height },
  classes: data.class,
  caption: data.caption,
  isDecorative: data.isDecorative,
  style: data.style,
  vspace: data.vspace,
  hspace: data.hspace,
  border: data.border,
  borderstyle: data.borderStyle,
});

const fromDialogData = (editor: Editor, d: DialogData, hasAlt: boolean): ImageData.ImageData => ({
  src: d.src.value,
  alt: hasAlt || d.alt ? d.alt ?? '' : null,
  title: d.title ?? '',
  width: d.dimensions?.width ?? '',
  height: d.dimensions?.height ?? '',
  class: d.classes ?? '',
  style: d.style ?? '',
  caption: !!d.caption,
  hspace: d.hspace ?? '',
  vspace: d.vspace ?? '',
  border: d.border ?? '',
  borderStyle: d.borderstyle ?? '',
  isDecorative: !!d.isDecorative && !!editor.options.get('a11y_advanced_options'),
});

const insertOrUpdate = (editor: Editor, image: HTMLImageElement | null, data: ImageData.ImageData): void => {
  const dom = editor.dom;
  editor.undoManager.transact(() => {
    if (!data.src) {
      if (image) {
        const figure = ImageData.isFigure(image.parentNode) ? (image.parentNode as HTMLElement) : null;
        dom.remove(figure ?? image);
        editor.nodeChanged();
      }
      return;
    }
    if (image) {
      ImageData.write(editor, image, data);
      const target = ImageData.toggleCaption(editor, image, data.caption);
      editor.selection.select(target.nodeName === 'FIGURE' ? target : image);
      editor.nodeChanged();
      return;
    }
    const img = dom.create('img') as HTMLImageElement;
    ImageData.write(editor, img, data);
    img.setAttribute('data-mce-id', '__kheNewImage');
    if (data.caption) {
      const figure = ImageData.createFigure(editor, img);
      editor.insertContent(figure.outerHTML);
    } else {
      editor.insertContent(img.outerHTML);
    }
    const inserted = editor.getBody().querySelector('img[data-mce-id="__kheNewImage"]') as HTMLImageElement | null;
    if (inserted) {
      inserted.removeAttribute('data-mce-id');
      const parent = inserted.parentNode as HTMLElement;
      editor.selection.select(ImageData.isFigure(parent) ? parent : inserted);
    }
    editor.nodeChanged();
  });
};

export const openDialog = (editor: Editor, image?: HTMLImageElement | null): void => {
  const existing = image ?? (ImageData.isImage(editor.selection.getNode()) ? (editor.selection.getNode() as HTMLImageElement) : null);
  const fromFigure = !existing && ImageData.isFigure(editor.selection.getNode()) ? (editor.selection.getNode().querySelector('img') as HTMLImageElement | null) : null;
  const target = existing ?? fromFigure;
  const initial = target ? ImageData.read(editor, target) : ImageData.defaultData();
  const hasAlt = !!target && target.hasAttribute('alt');
  const hasDimensions = editor.options.get('image_dimensions') !== false;
  const hasAdvTab = !!editor.options.get('image_advtab');
  const hasUploadTab = editor.options.get('image_uploadtab') !== false && (!!editor.options.get('images_upload_url') || !!editor.options.get('images_upload_handler') || !!editor.options.get('image_uploadtab'));
  const hasDescription = editor.options.get('image_description') !== false;
  const hasTitle = !!editor.options.get('image_title');
  const hasCaption = !!editor.options.get('image_caption');
  const hasDecorative = !!editor.options.get('a11y_advanced_options');
  const prependUrl = (editor.options.get('image_prepend_url') as string) || '';
  const classes = classList(editor);

  getImageList(editor).then((imageList) => {
    if (editor.removed) {
      return;
    }
    const general: any[] = [];
    general.push({ type: 'urlinput', name: 'src', label: 'Source', filetype: 'image' });
    if (imageList && imageList.length) {
      general.push({ type: 'listbox', name: 'images', label: 'Image list', items: [{ text: '', value: '' }, ...imageList] });
    }
    if (hasDescription) {
      general.push({ type: 'input', name: 'alt', label: 'Alternative description', enabled: !initial.isDecorative });
    }
    if (hasDecorative) {
      general.push({ type: 'checkbox', name: 'isDecorative', label: 'Image is decorative' });
    }
    if (hasTitle) {
      general.push({ type: 'input', name: 'title', label: 'Image title' });
    }
    if (hasDimensions) {
      general.push({ type: 'sizeinput', name: 'dimensions', label: 'Dimensions' });
    }
    if (classes) {
      general.push({ type: 'listbox', name: 'classes', label: 'Class', items: classes });
    }
    if (hasCaption) {
      general.push({ type: 'checkbox', name: 'caption', label: 'Show caption' });
    }
    const advanced: any[] = [
      { type: 'input', name: 'style', label: 'Style' },
      { type: 'grid', columns: 2, items: [{ type: 'input', name: 'vspace', label: 'Vertical space', inputMode: 'numeric' }, { type: 'input', name: 'hspace', label: 'Horizontal space', inputMode: 'numeric' }] },
      { type: 'grid', columns: 2, items: [{ type: 'input', name: 'border', label: 'Border width', inputMode: 'numeric' }, { type: 'listbox', name: 'borderstyle', label: 'Border style', items: [{ text: 'Select...', value: '' }, { text: 'Solid', value: 'solid' }, { text: 'Dotted', value: 'dotted' }, { text: 'Dashed', value: 'dashed' }, { text: 'Double', value: 'double' }, { text: 'Groove', value: 'groove' }, { text: 'Ridge', value: 'ridge' }, { text: 'Inset', value: 'inset' }, { text: 'Outset', value: 'outset' }, { text: 'None', value: 'none' }, { text: 'Hidden', value: 'hidden' }] }] },
    ];
    const tabs: any[] = [{ name: 'general', title: 'General', items: general }];
    if (hasUploadTab) {
      tabs.push({ name: 'upload', title: 'Upload', items: [{ type: 'dropzone', name: 'fileinput' }] });
    }
    if (hasAdvTab) {
      tabs.push({ name: 'advanced', title: 'Advanced', items: advanced });
    }
    const body = tabs.length > 1 ? { type: 'tabpanel', tabs } : { type: 'panel', items: general };

    let lastSrc = initial.src;
    const updateStyleFields = (api: any) => {
      const d = api.getData() as DialogData;
      const data = fromDialogData(editor, d, hasAlt);
      // Normalise the style string through the same writer the image uses.
      const tmp = editor.dom.create('img') as HTMLImageElement;
      ImageData.write(editor, tmp, { ...data, src: 'x' });
      const read = ImageData.read(editor, tmp);
      api.setData({ style: read.style, vspace: read.vspace, hspace: read.hspace, border: read.border, borderstyle: read.borderStyle });
    };
    const styleChanged = (api: any) => {
      const d = api.getData() as DialogData;
      const tmp = editor.dom.create('img') as HTMLImageElement;
      tmp.setAttribute('style', d.style ?? '');
      const read = ImageData.read(editor, tmp);
      api.setData({ vspace: read.vspace, hspace: read.hspace, border: read.border, borderstyle: read.borderStyle, style: read.style });
    };
    const srcChanged = (api: any) => {
      const d = api.getData() as DialogData;
      let src = d.src.value;
      if (prependUrl && src && !/^(?:[a-z]+:|\/|#)/i.test(src) && !src.startsWith(prependUrl)) {
        src = prependUrl + src;
        api.setData({ src: { value: src, meta: d.src.meta } });
      }
      const meta = d.src.meta || {};
      const patch: Record<string, any> = {};
      if (meta.alt !== undefined) {
        patch.alt = meta.alt;
      }
      if (meta.title !== undefined) {
        patch.title = meta.title;
      }
      if (meta.width !== undefined || meta.height !== undefined) {
        patch.dimensions = { width: String(meta.width ?? d.dimensions?.width ?? ''), height: String(meta.height ?? d.dimensions?.height ?? '') };
      }
      if (meta.class !== undefined) {
        patch.classes = meta.class;
      }
      if (meta.style !== undefined) {
        patch.style = meta.style;
      }
      if (meta.caption !== undefined) {
        patch.caption = !!meta.caption;
      }
      if (Object.keys(patch).length) {
        api.setData(patch);
      }
      if (src !== lastSrc) {
        lastSrc = src;
        const dims = api.getData().dimensions as { width: string; height: string } | undefined;
        if (hasDimensions && src && dims && !dims.width && !dims.height && !meta.width && !meta.height) {
          getImageSize(editor, src)
            .then((size) => {
              if (api.getData().src.value === src) {
                api.setData({ dimensions: { width: String(size.width), height: String(size.height) } });
              }
            })
            .catch(() => undefined);
        }
      }
    };

    const api = editor.windowManager.open({
      title: 'Insert/Edit Image',
      size: 'normal',
      body,
      buttons: [
        { type: 'cancel', name: 'cancel', text: 'Cancel' },
        { type: 'submit', name: 'save', text: 'Save', primary: true },
      ],
      initialData: toDialogData(initial) as any,
      onChange: (dialogApi: any, details: { name: string }) => {
        switch (details.name) {
          case 'src':
            srcChanged(dialogApi);
            break;
          case 'images': {
            const d = dialogApi.getData() as DialogData;
            if (d.images) {
              dialogApi.setData({ src: { value: d.images, meta: {} } });
              srcChanged(dialogApi);
            }
            break;
          }
          case 'isDecorative': {
            const d = dialogApi.getData() as DialogData;
            dialogApi.setEnabled('alt', !d.isDecorative);
            break;
          }
          case 'vspace':
          case 'hspace':
          case 'border':
          case 'borderstyle':
            updateStyleFields(dialogApi);
            break;
          case 'style':
            styleChanged(dialogApi);
            break;
          case 'fileinput': {
            const d = dialogApi.getData() as DialogData;
            const file = d.fileinput && d.fileinput[0];
            if (!file) {
              break;
            }
            dialogApi.block(editor.translate('Uploading image'));
            const blobCache = editor.editorUpload.blobCache;
            const name = (file.name || '').replace(/\.[^.]+$/, '') || undefined;
            cacheBlob(blobCache, file, name, file.name || undefined)
              .then((info) => {
                dialogApi.setData({ src: { value: info.blobUri(), meta: {} }, fileinput: [] });
                dialogApi.showTab('general');
                dialogApi.unblock();
                srcChanged(dialogApi);
                dialogApi.focus('src');
              })
              .catch(() => dialogApi.unblock());
            break;
          }
          default:
            break;
        }
      },
      onSubmit: (dialogApi: any) => {
        const d = dialogApi.getData() as DialogData;
        const data = fromDialogData(editor, d, hasAlt || !!d.alt);
        if (!hasDimensions) {
          data.width = initial.width;
          data.height = initial.height;
        }
        if (!hasCaption) {
          data.caption = initial.caption;
        }
        if (!hasAdvTab) {
          data.style = initial.style;
          data.hspace = initial.hspace;
          data.vspace = initial.vspace;
          data.border = initial.border;
          data.borderStyle = initial.borderStyle;
        }
        insertOrUpdate(editor, target, data);
        dialogApi.close();
      },
    } as any);
    void blobToDataUri;
    void api;
  });
};
