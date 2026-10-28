const nav = typeof navigator !== 'undefined' ? navigator : ({ userAgent: '', platform: '', maxTouchPoints: 0 } as Navigator);
const ua = nav.userAgent || '';
const win = typeof window !== 'undefined' ? window : undefined;

const isEdge = /Edg\//.test(ua);
const isOpera = /OPR\//.test(ua);
const isChromium = (/Chrome\//.test(ua) || /CriOS\//.test(ua)) && !/Edge\//.test(ua);
const isFirefox = /Firefox\//.test(ua) || /FxiOS\//.test(ua);
const isSafari = /Safari\//.test(ua) && !isChromium && !isFirefox && !isEdge && !isOpera && /Apple/.test(ua);
const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
const isAndroid = /Android/.test(ua);
const isMacOS = /Mac OS X|Macintosh/.test(ua) && !isIOS;
const isWindows = /Windows/.test(ua);
const isLinux = /Linux/.test(ua) && !isAndroid;
const isTouch = !!win && ('ontouchstart' in win || nav.maxTouchPoints > 0);
const isPhone = isTouch && /Mobi|iPhone|iPod/.test(ua);
const isTablet = isTouch && !isPhone && (/iPad|Tablet/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1) || (isAndroid && !/Mobile/.test(ua)));

export const Env = {
  browser: {
    isChromium: () => isChromium,
    isChrome: () => isChromium,
    isEdge: () => isEdge,
    isFirefox: () => isFirefox,
    isSafari: () => isSafari,
    isOpera: () => isOpera,
    isIE: () => false,
  },
  os: {
    isMacOS: () => isMacOS,
    isiOS: () => isIOS,
    isAndroid: () => isAndroid,
    isWindows: () => isWindows,
    isLinux: () => isLinux,
    isChromeOS: () => /CrOS/.test(ua),
  },
  deviceType: {
    isTouch: () => isTouch,
    isPhone: () => isPhone,
    isTablet: () => isTablet,
    isDesktop: () => !isPhone && !isTablet,
    isiPad: () => isIOS && isTablet,
    isiPhone: () => isIOS && isPhone,
    isWebView: () => false,
  },
  /** Primary modifier key used for shortcuts (⌘ on macOS/iOS, Ctrl elsewhere). */
  mac: isMacOS || isIOS,
  /** Whether `beforeinput` is the reliable primary input signal (true on all supported engines). */
  transparentSrc: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  cacheSuffix: null as string | null,
  container: null as HTMLElement | null,
  canHaveCSP: true,
  windowsPhone: false,
  userAgent: ua,
};
