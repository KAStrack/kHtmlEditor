let counter = 0;

const seed = (): string => {
  const now = Date.now().toString(32);
  const rnd = Math.floor(Math.random() * 0x7fffffff).toString(32);
  return now + rnd;
};

/** Short unique id with a prefix – used for internal element ids (bookmarks, editor ids…). */
export const uuid = (prefix: string = 'khe'): string => `${prefix}_${seed()}${(counter++).toString(32)}`;

/** RFC4122 v4 UUID (uses the platform generator when available). */
export const uuidV4 = (): string => {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
