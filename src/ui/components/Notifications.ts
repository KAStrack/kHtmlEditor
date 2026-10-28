import type { Editor } from '../../core/Editor';
import type { NotificationManagerImpl, NotificationSpec, NotificationApi } from '../../core/NotificationManager';
import { h, svgEl } from './Dom';
import { getIcon } from '../Icons';

/** Notification rendering stacked at the top of the editor container. */
export const createNotificationManagerImpl = (editor: Editor, getContainer: () => HTMLElement | null): NotificationManagerImpl => {
  let region: HTMLElement | null = null;
  const ensureRegion = (): HTMLElement => {
    const container = getContainer();
    if (!region || !region.isConnected) {
      region = h('div', { class: 'khe-notifications', role: 'region', 'aria-label': editor.translate('Notifications'), 'aria-live': 'polite' });
      (container ?? document.body).appendChild(region);
    }
    return region;
  };
  const iconFor = (type: string | undefined): string => {
    switch (type) {
      case 'error':
        return 'warning';
      case 'warning':
        return 'warning';
      case 'success':
        return 'checkmark';
      default:
        return 'info';
    }
  };

  return {
    open: (spec: NotificationSpec, closeCallback: () => void): NotificationApi => {
      const type = spec.type || 'info';
      const el = h('div', { class: 'khe-notification khe-notification--' + type, role: type === 'error' ? 'alert' : 'status' });
      const icon = h('span', { class: 'khe-notification__icon' });
      icon.appendChild(svgEl(getIcon(spec.icon || iconFor(type))));
      el.appendChild(icon);
      const text = h('div', { class: 'khe-notification__text' }, spec.text);
      el.appendChild(text);
      let bar: HTMLElement | null = null;
      if (spec.progressBar) {
        const progress = h('div', { class: 'khe-notification__progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' });
        bar = h('div', { class: 'khe-notification__progress-bar' });
        progress.appendChild(bar);
        el.appendChild(progress);
      }
      let timer: number | null = null;
      const close = () => {
        if (timer !== null) {
          clearTimeout(timer);
        }
        el.remove();
        closeCallback();
        if (region && region.childElementCount === 0) {
          region.remove();
          region = null;
        }
      };
      if (spec.closeButton !== false) {
        const closeBtn = h('button', { type: 'button', class: 'khe-notification__close', 'aria-label': editor.translate('Close') });
        closeBtn.appendChild(svgEl(getIcon('close')));
        closeBtn.addEventListener('click', close);
        el.appendChild(closeBtn);
      }
      ensureRegion().appendChild(el);
      if (spec.timeout && spec.timeout > 0) {
        timer = setTimeout(close, spec.timeout) as unknown as number;
      }
      const api: NotificationApi = {
        close,
        progressBar: {
          value: (percent) => {
            if (bar) {
              bar.style.width = Math.max(0, Math.min(100, percent)) + '%';
              bar.parentElement?.setAttribute('aria-valuenow', String(Math.round(percent)));
            }
          },
        },
        text: (t) => {
          text.textContent = t;
        },
        reposition: () => {},
        getEl: () => el,
        settings: spec,
      };
      return api;
    },
    close: (notification) => notification.close(),
    getArgs: (notification) => notification.settings,
  };
};
