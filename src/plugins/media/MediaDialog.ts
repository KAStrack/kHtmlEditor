import type { Editor } from '../../core/Editor';
import type { MediaData } from './MediaTypes';
import { emptyData, guessMime } from './MediaTypes';
import { dataToHtml } from './DataToHtml';
import { htmlToData } from './HtmlToData';
import { getMediaNode, getOriginalMarkup } from './Nodes';
import { cacheBlob } from '../../content/BlobScanner';
import { isFunction } from '../../util/Type';

interface DialogData {
  source: { value: string; meta?: Record<string, any> };
  altsource?: { value: string; meta?: Record<string, any> };
  poster?: { value: string; meta?: Record<string, any> };
  dimensions?: { width: string; height: string };
  embed?: string;
  fileinput?: File[];
}

const toDialog = (d: MediaData): DialogData => ({
  source: { value: d.source },
  altsource: { value: d.altsource },
  poster: { value: d.poster },
  dimensions: { width: d.width, height: d.height },
  embed: d.embed,
});

const fromDialog = (d: DialogData, prev: MediaData): MediaData => ({
  ...prev,
  source: d.source?.value ?? '',
  altsource: d.altsource?.value ?? '',
  poster: d.poster?.value ?? '',
  width: d.dimensions?.width ?? '',
  height: d.dimensions?.height ?? '',
  embed: d.embed ?? '',
});

const resolveUrl = (editor: Editor, data: MediaData): Promise<string> => {
  const resolver = editor.options.get('media_url_resolver');
  if (isFunction(resolver)) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (html: string) => {
        if (!settled) {
          settled = true;
          resolve(html);
        }
      };
      try {
        const maybe = resolver({ url: data.source }, (result: { html: string }) => done(result && result.html ? result.html : dataToHtml(editor, data)), () => done(dataToHtml(editor, data)));
        if (maybe && isFunction(maybe.then)) {
          maybe.then((result: { html: string }) => done(result && result.html ? result.html : dataToHtml(editor, data)), () => done(dataToHtml(editor, data)));
        }
      } catch {
        done(dataToHtml(editor, data));
      }
    });
  }
  return Promise.resolve(dataToHtml(editor, data));
};

const insertMedia = (editor: Editor, html: string, existing: HTMLElement | null): void => {
  if (!html.trim()) {
    return;
  }
  editor.undoManager.transact(() => {
    if (existing && existing.isConnected) {
      // Replace the selected media with the new markup.
      const rng = editor.dom.createRng();
      rng.selectNode(existing);
      editor.selection.setRng(rng);
      editor.selection.setContent(html);
    } else {
      editor.insertContent(html);
    }
  });
  const node = editor.selection.getNode();
  const media = getMediaNode(editor, node) ?? (editor.getBody().querySelectorAll('[data-mce-object]').item(editor.getBody().querySelectorAll('[data-mce-object]').length - 1) as HTMLElement | null);
  if (media) {
    editor.selection.select(media);
    media.setAttribute('data-mce-selected', '1');
  }
  editor.nodeChanged();
};

export const openDialog = (editor: Editor): void => {
  const existing = getMediaNode(editor, editor.selection.getNode());
  const initial: MediaData = existing ? htmlToData(getOriginalMarkup(existing)) : emptyData();
  const hasDimensions = editor.options.get('media_dimensions') !== false;
  const hasAlt = editor.options.get('media_alt_source') !== false;
  const hasPoster = editor.options.get('media_poster') !== false;
  const hasUpload = editor.options.get('media_uploadtab') !== false && (!!editor.options.get('media_upload_url') || !!editor.options.get('media_upload_handler') || !!editor.options.get('images_upload_url') || !!editor.options.get('images_upload_handler'));

  const general: any[] = [{ type: 'urlinput', name: 'source', label: 'Source', filetype: 'media' }];
  if (hasDimensions) {
    general.push({ type: 'sizeinput', name: 'dimensions', label: 'Dimensions' });
  }
  const tabs: any[] = [
    { name: 'general', title: 'General', items: general },
    { name: 'embed', title: 'Embed', items: [{ type: 'textarea', name: 'embed', label: 'Paste your embed code below:' }] },
  ];
  if (hasUpload) {
    tabs.push({ name: 'upload', title: 'Upload', items: [{ type: 'dropzone', name: 'fileinput', accept: 'video/*,audio/*', multiple: false }] });
  }
  const advanced: any[] = [];
  if (hasAlt) {
    advanced.push({ type: 'urlinput', name: 'altsource', label: 'Alternative source URL', filetype: 'media' });
  }
  if (hasPoster) {
    advanced.push({ type: 'urlinput', name: 'poster', label: 'Media poster (Image URL)', filetype: 'image' });
  }
  if (advanced.length) {
    tabs.push({ name: 'advanced', title: 'Advanced', items: advanced });
  }

  let current: MediaData = { ...initial };
  let updating = false;

  const refreshEmbed = (api: any) => {
    const d = api.getData() as DialogData;
    current = fromDialog(d, current);
    return resolveUrl(editor, current).then((html) => {
      if (updating) {
        return;
      }
      // The resolved HTML is authoritative: read dims/type back from it.
      const parsed = htmlToData(html);
      current = { ...current, embed: html, type: parsed.type, width: parsed.width || current.width, height: parsed.height || current.height, allowfullscreen: parsed.allowfullscreen };
      updating = true;
      api.setData({ embed: html, dimensions: { width: current.width, height: current.height } });
      updating = false;
    });
  };

  const embedChanged = (api: any) => {
    const d = api.getData() as DialogData;
    const parsed = htmlToData(d.embed ?? '');
    current = { ...parsed, embed: d.embed ?? '' };
    updating = true;
    api.setData({ source: { value: parsed.source }, altsource: { value: parsed.altsource }, poster: { value: parsed.poster }, dimensions: { width: parsed.width, height: parsed.height } });
    updating = false;
  };

  editor.windowManager.open({
    title: 'Insert/Edit Media',
    size: 'normal',
    body: { type: 'tabpanel', tabs },
    buttons: [
      { type: 'cancel', name: 'cancel', text: 'Cancel' },
      { type: 'submit', name: 'save', text: 'Save', primary: true },
    ],
    initialData: toDialog(initial) as any,
    onChange: (api: any, details: { name: string }) => {
      if (updating) {
        return;
      }
      switch (details.name) {
        case 'source':
        case 'altsource':
        case 'poster':
        case 'dimensions':
          void refreshEmbed(api);
          break;
        case 'embed':
          embedChanged(api);
          break;
        case 'fileinput': {
          const d = api.getData() as DialogData;
          const file = d.fileinput && d.fileinput[0];
          if (!file) {
            break;
          }
          api.block(editor.translate('Uploading media'));
          const name = (file.name || '').replace(/\.[^.]+$/, '') || undefined;
          cacheBlob(editor.editorUpload.blobCache, file, name, file.name || undefined)
            .then((info) => {
              current = { ...current, source: info.blobUri(), sourcemime: file.type || guessMime(file.name), type: file.type.startsWith('audio/') ? 'audio' : 'video' };
              updating = true;
              api.setData({ source: { value: info.blobUri() }, fileinput: [] });
              updating = false;
              api.showTab('general');
              api.unblock();
              return refreshEmbed(api);
            })
            .catch(() => api.unblock());
          break;
        }
        default:
          break;
      }
    },
    onSubmit: (api: any) => {
      const d = api.getData() as DialogData;
      const data = fromDialog(d, current);
      const finish = (html: string) => {
        insertMedia(editor, html, existing);
        api.close();
      };
      if (data.embed && current.embed === data.embed && data.source === current.source) {
        finish(data.embed);
      } else {
        resolveUrl(editor, data).then(finish);
      }
    },
  } as any);
};
