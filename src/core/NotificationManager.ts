import type { Editor } from './Editor';

/** Notification API (`editor.notificationManager`); the theme supplies rendering. */
export interface NotificationSpec {
  type?: 'info' | 'warning' | 'error' | 'success';
  text: string;
  icon?: string;
  progressBar?: boolean;
  timeout?: number;
  closeButton?: boolean;
}

export interface NotificationApi {
  close: () => void;
  progressBar: { value: (percent: number) => void };
  text: (text: string) => void;
  reposition: () => void;
  getEl: () => HTMLElement;
  settings: NotificationSpec;
}

export interface NotificationManagerImpl {
  open: (spec: NotificationSpec, closeCallback: () => void) => NotificationApi;
  close: <T extends NotificationApi>(notification: T) => void;
  getArgs: <T extends NotificationApi>(notification: T) => NotificationSpec;
}

export interface NotificationManager {
  open: (spec: NotificationSpec) => NotificationApi;
  close: () => void;
  getNotifications: () => NotificationApi[];
}

const fallbackImpl: NotificationManagerImpl = {
  open: (spec) => {
    const method = spec.type === 'error' ? 'error' : spec.type === 'warning' ? 'warn' : 'log';
    // eslint-disable-next-line no-console
    console[method]('kHtmlEditor notification:', spec.text);
    const el = document.createElement('div');
    return { close: () => {}, progressBar: { value: () => {} }, text: () => {}, reposition: () => {}, getEl: () => el, settings: spec };
  },
  close: () => {},
  getArgs: (n) => n.settings,
};

export const createNotificationManager = (editor: Editor): NotificationManager => {
  let notifications: NotificationApi[] = [];

  const getImplementation = (): NotificationManagerImpl => {
    const theme = editor.theme;
    return theme && theme.getNotificationManagerImpl ? theme.getNotificationManagerImpl() : fallbackImpl;
  };

  const reposition = () => notifications.forEach((n) => n.reposition());

  const addNotification = (notification: NotificationApi) => {
    notifications.push(notification);
  };

  const closeNotification = (notification: NotificationApi) => {
    notifications = notifications.filter((n) => n !== notification);
  };

  const open = (spec: NotificationSpec): NotificationApi => {
    if (editor.removed) {
      return fallbackImpl.open(spec, () => {});
    }
    const eventArgs = editor.dispatch('BeforeOpenNotification', { notification: spec });
    const notificationSpec = eventArgs.notification;
    const existing = notifications.find((n) => getImplementation().getArgs(n).text === notificationSpec.text && getImplementation().getArgs(n).type === notificationSpec.type);
    if (existing) {
      return existing;
    }
    const notification = getImplementation().open(notificationSpec, () => {
      closeNotification(notification);
      reposition();
    });
    addNotification(notification);
    reposition();
    editor.dispatch('OpenNotification', { notification: { ...notification } });
    return notification;
  };

  const close = () => {
    const top = notifications[notifications.length - 1];
    if (top) {
      getImplementation().close(top);
      closeNotification(top);
      reposition();
    }
  };

  editor.on('remove', () => {
    notifications.slice().forEach((n) => getImplementation().close(n));
    notifications = [];
  });
  editor.on('ResizeEditor ResizeWindow NodeChange', () => {
    requestAnimationFrame(reposition);
  });

  return { open, close, getNotifications: () => notifications };
};
