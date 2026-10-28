import type { Editor } from './Editor';
import type { WindowManagerImpl } from './WindowManager';
import type { NotificationManagerImpl } from './NotificationManager';

/** Contract between the core and a UI theme (the `ui/` layer registers one with ThemeManager). */
export interface RenderUIResult {
  editorContainer: HTMLElement;
  iframeContainer: HTMLElement;
  api?: Partial<EditorUiApi>;
  height?: number;
  iframeHeight?: number;
}

export interface EditorUiApi {
  show: () => void;
  hide: () => void;
  setEnabled: (state: boolean) => void;
  isEnabled: () => boolean;
}

export interface Theme {
  renderUI: () => RenderUIResult;
  getWindowManagerImpl?: () => WindowManagerImpl;
  getNotificationManagerImpl?: () => NotificationManagerImpl;
  /** Returns bundled content CSS for a `content_css` keyword (default, dark, …). */
  getContentCss?: (name: string) => string | undefined;
  destroy?: () => void;
}

export type ThemeFactory = (editor: Editor, url?: string) => Theme;

/** Minimal theme used when no UI layer is registered (tests, headless use). */
export const createBareTheme = (editor: Editor): Theme => ({
  renderUI: () => {
    const doc = document;
    const container = doc.createElement('div');
    container.className = 'khe-container khe-bare';
    container.setAttribute('role', 'application');
    const iframeContainer = doc.createElement('div');
    iframeContainer.className = 'khe-edit-area';
    container.appendChild(iframeContainer);
    const target = editor.getElement();
    target?.parentNode?.insertBefore(container, target.nextSibling);
    return { editorContainer: container, iframeContainer };
  },
});
