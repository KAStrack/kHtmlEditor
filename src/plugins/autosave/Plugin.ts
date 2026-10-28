import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';

/** Autosave plugin: drafts in localStorage with restore button and unload warning. */
const parseTime = (value: unknown, defaultValue: number): number => {
  if (typeof value === 'number') {
    return value;
  }
  const m = /^(\d+)([smhd]?)$/.exec(String(value ?? '').trim());
  if (!m) {
    return defaultValue;
  }
  const n = parseInt(m[1], 10);
  const unit = m[2] || 's';
  return n * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 } as Record<string, number>)[unit];
};

const register = (editor: Editor): Record<string, any> => {
  const r = editor.options.register;
  r('autosave_ask_before_unload', { processor: 'boolean', default: true });
  r('autosave_prefix', { processor: 'string', default: 'tinymce-autosave-{path}{query}{hash}-{id}-' });
  r('autosave_restore_when_empty', { processor: 'boolean', default: false });
  r('autosave_interval', { processor: 'string', default: '30s' });
  r('autosave_retention', { processor: 'string', default: '20m' });

  const storage = (): Storage | null => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  };
  const prefix = (): string => {
    const p = editor.options.get('autosave_prefix') as string;
    return p.replace(/{path}/g, document.location.pathname).replace(/{query}/g, document.location.search).replace(/{hash}/g, document.location.hash).replace(/{id}/g, editor.id);
  };
  const interval = () => parseTime(editor.options.get('autosave_interval'), 30000);
  const retention = () => parseTime(editor.options.get('autosave_retention'), 20 * 60000);

  const isEmpty = (html?: string): boolean => {
    const content = html ?? (editor.getContent({ format: 'raw', no_events: true }) as string);
    const forcedRootBlock = (editor.options.get('forced_root_block') as string) || 'p';
    const re = new RegExp(`^(<${forcedRootBlock}[^>]*>((\\u00a0|&nbsp;|[ \\t]|<br[^>]*>)+?|)<\\/${forcedRootBlock}>|<br>)$`, 'i');
    return content.replace(/\s+/g, ' ').trim() === '' || re.test(content.trim());
  };

  const hasDraft = (): boolean => {
    const s = storage();
    if (!s) {
      return false;
    }
    const time = parseInt(s.getItem(prefix() + 'time') || '0', 10);
    if (!time) {
      return false;
    }
    if (Date.now() - time > retention()) {
      removeDraft(false);
      return false;
    }
    return true;
  };

  const removeDraft = (dispatch = true): void => {
    const s = storage();
    if (s) {
      s.removeItem(prefix() + 'draft');
      s.removeItem(prefix() + 'time');
    }
    if (dispatch) {
      editor.dispatch('RemoveDraft');
    }
  };

  const storeDraft = (): void => {
    const s = storage();
    if (!s) {
      return;
    }
    if (!isEmpty() && editor.isDirty()) {
      const content = editor.getContent({ format: 'raw', no_events: true }) as string;
      try {
        s.setItem(prefix() + 'draft', content);
        s.setItem(prefix() + 'time', String(Date.now()));
      } catch {
        return;
      }
      editor.dispatch('StoreDraft', { content });
    }
  };

  const restoreDraft = (): void => {
    const s = storage();
    if (!s || !hasDraft()) {
      return;
    }
    const content = s.getItem(prefix() + 'draft') || '';
    editor.setContent(content, { format: 'raw' });
    editor.dispatch('RestoreDraft', { content });
  };

  let timer: ReturnType<typeof setInterval> | null = null;
  editor.on('init', () => {
    timer = setInterval(storeDraft, interval());
    if (editor.options.get('autosave_restore_when_empty') && isEmpty() && hasDraft()) {
      restoreDraft();
    }
  });
  editor.on('remove', () => {
    if (timer) {
      clearInterval(timer);
    }
  });
  editor.editorManager.on('BeforeUnload', (e: any) => {
    if (editor.options.get('autosave_ask_before_unload') && editor.isDirty() && !editor.removed) {
      storeDraft();
      e.preventDefault();
      e.returnValue = editor.translate('You have unsaved changes are you sure you want to navigate away?');
    }
  });

  editor.editorCommands.addCommands({ mceRestoreDraft: () => restoreDraft() });
  const setup = (api: { setEnabled: (s: boolean) => void }) => {
    const update = () => api.setEnabled(hasDraft());
    editor.on('StoreDraft RestoreDraft RemoveDraft', update);
    update();
    return () => editor.off('StoreDraft RestoreDraft RemoveDraft', update);
  };
  editor.ui.registry.addButton('restoredraft', { icon: 'restore-draft', tooltip: 'Restore last draft', onAction: () => restoreDraft(), onSetup: setup });
  editor.ui.registry.addMenuItem('restoredraft', { icon: 'restore-draft', text: 'Restore last draft', onAction: () => restoreDraft(), onSetup: setup as any });

  return { hasDraft, storeDraft, restoreDraft, removeDraft, isEmpty };
};

PluginManager.add('autosave', register);
export default register;
