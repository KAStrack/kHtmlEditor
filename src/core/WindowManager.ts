import type { Editor } from './Editor';

/**
 * Dialog API (`editor.windowManager`). The theme supplies the implementation; this wrapper
 * fires OpenWindow/CloseWindow and keeps a stack so the UI can restore focus/selection.
 */
export interface DialogInstanceApi<T = any> {
  getData: () => T;
  setData: (data: Partial<T>) => void;
  setEnabled: (name: string, state: boolean) => void;
  focus: (name: string) => void;
  showTab: (name: string) => void;
  redial: (spec: DialogSpec<any>) => void;
  block: (message: string) => void;
  unblock: () => void;
  close: () => void;
  toggleFullscreen: () => void;
}

export interface DialogSpec<T = any> {
  title: string;
  size?: 'normal' | 'medium' | 'large';
  body: { type: 'panel'; items: any[]; classes?: string[] } | { type: 'tabpanel'; tabs: Array<{ name?: string; title: string; items: any[] }> };
  buttons?: any[];
  initialData?: Partial<T>;
  onSubmit?: (api: DialogInstanceApi<T>) => void;
  onChange?: (api: DialogInstanceApi<T>, details: { name: string }) => void;
  onAction?: (api: DialogInstanceApi<T>, details: { name: string; value?: any }) => void;
  onClose?: () => void;
  onCancel?: (api: DialogInstanceApi<T>) => void;
  onTabChange?: (api: DialogInstanceApi<T>, details: { newTabName: string; oldTabName: string }) => void;
}

export interface UrlDialogSpec {
  title: string;
  url: string;
  width?: number;
  height?: number;
  buttons?: any[];
  onAction?: (api: UrlDialogInstanceApi, details: { name: string }) => void;
  onCancel?: (api: UrlDialogInstanceApi) => void;
  onClose?: () => void;
  onMessage?: (api: UrlDialogInstanceApi, details: any) => void;
}

export interface UrlDialogInstanceApi {
  block: (message: string) => void;
  unblock: () => void;
  close: () => void;
  sendMessage: (msg: any) => void;
}

export interface WindowParams {
  inline?: 'cursor' | 'toolbar' | 'bottom';
  ariaAttrs?: Record<string, string>;
  persistent?: boolean;
}

export interface WindowManagerImpl {
  open: <T>(config: DialogSpec<T>, params: WindowParams | undefined, closeWindow: (dialog: DialogInstanceApi<T>) => void) => DialogInstanceApi<T>;
  openUrl: (config: UrlDialogSpec, closeWindow: (dialog: UrlDialogInstanceApi) => void) => UrlDialogInstanceApi;
  alert: (message: string, callback: () => void) => void;
  confirm: (message: string, callback: (state: boolean) => void) => void;
  close: (dialog: DialogInstanceApi<any> | UrlDialogInstanceApi) => void;
}

export interface WindowManager {
  open: <T>(config: DialogSpec<T>, params?: WindowParams) => DialogInstanceApi<T>;
  openUrl: (config: UrlDialogSpec) => UrlDialogInstanceApi;
  alert: (message: string, callback?: () => void, scope?: any) => void;
  confirm: (message: string, callback?: (state: boolean) => void, scope?: any) => void;
  close: () => void;
}

const fallbackImpl: WindowManagerImpl = {
  open: () => {
    throw new Error('kHtmlEditor: no theme is registered; dialogs are not available.');
  },
  openUrl: () => {
    throw new Error('kHtmlEditor: no theme is registered; dialogs are not available.');
  },
  alert: (message, callback) => {
    window.alert(message);
    callback();
  },
  confirm: (message, callback) => callback(window.confirm(message)),
  close: () => {},
};

export const createWindowManager = (editor: Editor): WindowManager => {
  let dialogs: Array<DialogInstanceApi<any> | UrlDialogInstanceApi> = [];

  const getImplementation = (): WindowManagerImpl => {
    const theme = editor.theme;
    return theme && theme.getWindowManagerImpl ? theme.getWindowManagerImpl() : fallbackImpl;
  };

  const funcBind = <T extends (...args: any[]) => any>(scope: any, f: T | undefined): T | undefined => (f ? (((...args: any[]) => f.apply(scope, args)) as T) : undefined);

  const fireOpenEvent = (dialog: any) => editor.dispatch('OpenWindow', { dialog });
  const fireCloseEvent = (dialog: any) => editor.dispatch('CloseWindow', { dialog });

  const addDialog = <T extends DialogInstanceApi<any> | UrlDialogInstanceApi>(dialog: T): T => {
    dialogs.push(dialog);
    fireOpenEvent(dialog);
    return dialog;
  };

  const closeDialog = (dialog: DialogInstanceApi<any> | UrlDialogInstanceApi) => {
    fireCloseEvent(dialog);
    dialogs = dialogs.filter((d) => d !== dialog);
    if (dialogs.length === 0) {
      editor.focus();
    }
  };

  const getTopDialog = () => dialogs[dialogs.length - 1];

  const storeSelectionAndOpenDialog = <T extends DialogInstanceApi<any> | UrlDialogInstanceApi>(openDialog: () => T): T => {
    editor.editorManager.setActive(editor);
    try {
      editor.selection?.getBookmark(3);
    } catch {
      /* no selection yet */
    }
    return addDialog(openDialog());
  };

  return {
    open: (args, params) => storeSelectionAndOpenDialog(() => getImplementation().open(args, params, closeDialog)),
    openUrl: (args) => storeSelectionAndOpenDialog(() => getImplementation().openUrl(args, closeDialog)),
    alert: (message, callback, scope) => {
      const windowManagerImpl = getImplementation();
      windowManagerImpl.alert(message, funcBind(scope ?? windowManagerImpl, callback) ?? (() => {}));
    },
    confirm: (message, callback, scope) => {
      const windowManagerImpl = getImplementation();
      windowManagerImpl.confirm(message, funcBind(scope ?? windowManagerImpl, callback) ?? (() => {}));
    },
    close: () => {
      const top = getTopDialog();
      if (top) {
        getImplementation().close(top);
        closeDialog(top);
      }
    },
  };
};
