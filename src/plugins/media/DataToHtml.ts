import type { Editor } from '../../core/Editor';
import type { MediaData } from './MediaTypes';
import { guessMime } from './MediaTypes';
import { matchPattern } from './UrlPatterns';
import { encodeRaw } from '../../html/Entities';
import { isFunction } from '../../util/Type';

const attr = (name: string, value: string | undefined | null): string => (value ? ` ${name}="${encodeRaw(value, true)}"` : '');

const getIframeHtml = (data: MediaData): string => `<iframe src="${encodeRaw(data.source, true)}"${attr('width', data.width)}${attr('height', data.height)}${data.allowfullscreen ? ' allowfullscreen="allowfullscreen"' : ''}${attr('title', data.title)}></iframe>`;

const getVideoHtml = (data: MediaData): string =>
  `<video controls="controls"${attr('width', data.width)}${attr('height', data.height)}${attr('poster', data.poster)}>\n<source src="${encodeRaw(data.source, true)}"${attr('type', data.sourcemime)}>` +
  (data.altsource ? `\n<source src="${encodeRaw(data.altsource, true)}"${attr('type', data.altsourcemime)}>` : '') +
  `</video>`;

const getAudioHtml = (data: MediaData): string =>
  `<audio controls="controls">\n<source src="${encodeRaw(data.source, true)}"${attr('type', data.sourcemime)}>` + (data.altsource ? `\n<source src="${encodeRaw(data.altsource, true)}"${attr('type', data.altsourcemime)}>` : '') + `</audio>`;

export const dataToHtml = (editor: Editor, input: MediaData): string => {
  const data: MediaData = { ...input };
  if (!data.source) {
    data.source = data.altsource;
    data.altsource = '';
    data.sourcemime = data.altsourcemime;
    data.altsourcemime = undefined;
  }
  if (!data.source) {
    return '';
  }
  const pattern = matchPattern(data.source);
  if (pattern) {
    Object.assign(data, pattern, { width: data.width || pattern.width, height: data.height || pattern.height });
  } else if (!data.type || data.type === 'iframe' || data.type === 'video' || data.type === 'audio') {
    const mime = guessMime(data.source);
    if (mime && mime.startsWith('video/')) {
      data.type = 'video';
    } else if (mime && mime.startsWith('audio/')) {
      data.type = 'audio';
    } else if (data.type !== 'iframe') {
      data.type = data.type || 'iframe';
    }
  }
  data.sourcemime = data.sourcemime || guessMime(data.source);
  data.altsourcemime = data.altsourcemime || (data.altsource ? guessMime(data.altsource) : undefined);
  const videoCb = editor.options.get('video_template_callback');
  const audioCb = editor.options.get('audio_template_callback');
  const iframeCb = editor.options.get('iframe_template_callback');
  switch (data.type) {
    case 'video':
      return isFunction(videoCb) ? videoCb(data) : getVideoHtml(data);
    case 'audio':
      return isFunction(audioCb) ? audioCb(data) : getAudioHtml(data);
    case 'iframe':
      return isFunction(iframeCb) ? iframeCb(data) : getIframeHtml(data);
    default:
      return data.embed || getIframeHtml(data);
  }
};
