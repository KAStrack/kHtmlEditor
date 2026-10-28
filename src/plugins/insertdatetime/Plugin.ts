import type { Editor } from '../../core/Editor';
import type { MenuItemAnySpec } from '../../core/UiTypes';
import { PluginManager } from '../../core/AddOnManager';

/** Insert date/time plugin with strftime-style formats, optionally wrapped in `<time>`. */
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number): string => (n < 10 ? '0' + n : String(n));

export const formatDate = (editor: Editor, fmt: string, date: Date = new Date()): string => {
  const t = (s: string) => editor.translate(s);
  return fmt
    .replace(/%D/g, '%m/%d/%Y')
    .replace(/%r/g, '%I:%M:%S %p')
    .replace(/%Y/g, String(date.getFullYear()))
    .replace(/%y/g, String(date.getFullYear()).slice(-2))
    .replace(/%m/g, pad(date.getMonth() + 1))
    .replace(/%d/g, pad(date.getDate()))
    .replace(/%e/g, String(date.getDate()))
    .replace(/%H/g, pad(date.getHours()))
    .replace(/%I/g, pad(date.getHours() % 12 || 12))
    .replace(/%M/g, pad(date.getMinutes()))
    .replace(/%S/g, pad(date.getSeconds()))
    .replace(/%p/g, date.getHours() < 12 ? t('AM') : t('PM'))
    .replace(/%B/g, t(MONTHS_LONG[date.getMonth()]))
    .replace(/%b/g, t(MONTHS_SHORT[date.getMonth()]))
    .replace(/%A/g, t(DAYS_LONG[date.getDay()]))
    .replace(/%a/g, t(DAYS_SHORT[date.getDay()]))
    .replace(/%%/g, '%');
};

const register = (editor: Editor): void => {
  const r = editor.options.register;
  r('insertdatetime_dateformat', { processor: 'string', default: '%Y-%m-%d' });
  r('insertdatetime_timeformat', { processor: 'string', default: '%H:%M:%S' });
  r('insertdatetime_formats', { processor: 'string[]', default: ['%H:%M:%S', '%Y-%m-%d', '%I:%M:%S %p', '%D'] });
  r('insertdatetime_element', { processor: 'boolean', default: false });

  const formats = () => editor.options.get('insertdatetime_formats') as string[];
  let lastFormat = formats()[0] ?? '%Y-%m-%d';

  const insert = (fmt: string) => {
    const text = formatDate(editor, fmt);
    lastFormat = fmt;
    editor.undoManager.transact(() => {
      if (editor.options.get('insertdatetime_element')) {
        const iso = /%[HMSIp]/.test(fmt) ? new Date().toISOString() : new Date().toISOString().slice(0, 10);
        const existing = editor.dom.getParent(editor.selection.getStart(), 'time') as HTMLElement | null;
        if (existing) {
          existing.setAttribute('datetime', iso);
          existing.textContent = text;
          editor.selection.select(existing);
          editor.selection.collapse(false);
        } else {
          editor.insertContent(`<time datetime="${iso}">${text}</time>`);
        }
      } else {
        editor.insertContent(text);
      }
    });
    editor.nodeChanged();
  };

  editor.editorCommands.addCommands({
    mceInsertDate: (_cmd, _ui, value) => insert(typeof value === 'string' && value ? value : (editor.options.get('insertdatetime_dateformat') as string)),
    mceInsertTime: (_cmd, _ui, value) => insert(typeof value === 'string' && value ? value : (editor.options.get('insertdatetime_timeformat') as string)),
  });

  const items = (): MenuItemAnySpec[] => formats().map((fmt) => ({ type: 'menuitem', text: formatDate(editor, fmt), onAction: () => insert(fmt) }) as MenuItemAnySpec);
  editor.ui.registry.addSplitButton('insertdatetime', {
    icon: 'insert-time',
    tooltip: 'Insert date/time',
    select: (value: string) => value === lastFormat,
    fetch: (callback) => callback(formats().map((fmt) => ({ type: 'choiceitem', text: formatDate(editor, fmt), value: fmt }))),
    onAction: () => insert(lastFormat),
    onItemAction: (_api, value) => insert(value),
  });
  editor.ui.registry.addNestedMenuItem('insertdatetime', { icon: 'insert-time', text: 'Date/time', getSubmenuItems: items });
};

PluginManager.add('insertdatetime', register);
export default register;
