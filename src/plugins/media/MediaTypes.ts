export interface MediaData {
  source: string;
  altsource: string;
  poster: string;
  width: string;
  height: string;
  embed: string;
  type: 'video' | 'audio' | 'iframe' | 'embed' | 'object' | 'script';
  allowfullscreen: boolean;
  sourcemime?: string;
  altsourcemime?: string;
  title?: string;
}

export const emptyData = (): MediaData => ({ source: '', altsource: '', poster: '', width: '', height: '', embed: '', type: 'iframe', allowfullscreen: false });

const VIDEO_EXT: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', ogg: 'video/ogg', mov: 'video/quicktime' };
const AUDIO_EXT: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', oga: 'audio/ogg', weba: 'audio/webm', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac' };

export const guessMime = (url: string): string | undefined => {
  const m = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(url.trim());
  if (!m) {
    return undefined;
  }
  const ext = m[1].toLowerCase();
  return VIDEO_EXT[ext] ?? AUDIO_EXT[ext];
};

export const guessType = (url: string): 'video' | 'audio' | 'iframe' => {
  const mime = guessMime(url);
  if (mime && mime.startsWith('video/')) {
    return 'video';
  }
  if (mime && mime.startsWith('audio/')) {
    return 'audio';
  }
  return 'iframe';
};
