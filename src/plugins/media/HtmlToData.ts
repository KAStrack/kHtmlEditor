import type { MediaData } from './MediaTypes';
import { emptyData, guessMime } from './MediaTypes';

/** Extracts the dialog data from an embed snippet (first media element wins). */
export const htmlToData = (html: string): MediaData => {
  const data = emptyData();
  data.embed = html;
  const body = new DOMParser().parseFromString('<!doctype html><html><body>' + html + '</body></html>', 'text/html').body;
  const el = body.querySelector('video,audio,iframe,object,embed,script') as HTMLElement | null;
  if (!el) {
    return data;
  }
  const name = el.nodeName.toLowerCase() as MediaData['type'];
  data.type = name;
  const attrOrStyle = (n: 'width' | 'height') => el.getAttribute(n) || (el.style && el.style[n] ? el.style[n].replace(/px$/, '') : '');
  data.width = attrOrStyle('width');
  data.height = attrOrStyle('height');
  if (name === 'video' || name === 'audio') {
    const sources = Array.from(el.querySelectorAll('source'));
    data.source = el.getAttribute('src') || (sources[0] ? sources[0].getAttribute('src') || '' : '');
    data.sourcemime = (sources[0] && sources[0].getAttribute('type')) || guessMime(data.source);
    const altIndex = el.getAttribute('src') ? 0 : 1;
    const alt = sources[altIndex];
    data.altsource = alt ? alt.getAttribute('src') || '' : '';
    data.altsourcemime = alt ? alt.getAttribute('type') || guessMime(data.altsource) : undefined;
    data.poster = el.getAttribute('poster') || '';
  } else if (name === 'object') {
    data.source = el.getAttribute('data') || '';
  } else {
    data.source = el.getAttribute('src') || '';
    data.allowfullscreen = el.hasAttribute('allowfullscreen') || el.hasAttribute('allowFullscreen');
    data.title = el.getAttribute('title') || undefined;
  }
  return data;
};
