import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';
import { Env } from '../../util/Env';
import { isString, isObject } from '../../util/Type';

/** Help plugin: dialog with shortcuts, keyboard navigation, installed plugins and version tabs. */
const SHORTCUTS: Array<{ shortcuts: string[]; action: string }> = [
  { shortcuts: ['Meta+B'], action: 'Bold' },
  { shortcuts: ['Meta+I'], action: 'Italic' },
  { shortcuts: ['Meta+U'], action: 'Underline' },
  { shortcuts: ['Meta+A'], action: 'Select all' },
  { shortcuts: ['Meta+Y', 'Meta+Shift+Z'], action: 'Redo' },
  { shortcuts: ['Meta+Z'], action: 'Undo' },
  { shortcuts: ['Access+1'], action: 'Heading 1' },
  { shortcuts: ['Access+2'], action: 'Heading 2' },
  { shortcuts: ['Access+3'], action: 'Heading 3' },
  { shortcuts: ['Access+4'], action: 'Heading 4' },
  { shortcuts: ['Access+5'], action: 'Heading 5' },
  { shortcuts: ['Access+6'], action: 'Heading 6' },
  { shortcuts: ['Access+7'], action: 'Paragraph' },
  { shortcuts: ['Access+8'], action: 'Div' },
  { shortcuts: ['Access+9'], action: 'Address' },
  { shortcuts: ['Alt+0'], action: 'Open help dialog' },
  { shortcuts: ['Alt+F9'], action: 'Focus to menubar' },
  { shortcuts: ['Alt+F10'], action: 'Focus to toolbar' },
  { shortcuts: ['Alt+F11'], action: 'Focus to element path' },
  { shortcuts: ['Alt+F12'], action: 'Focus to editor' },
  { shortcuts: ['Meta+K'], action: 'Insert link (if link plugin activated)' },
  { shortcuts: ['Meta+S'], action: 'Save (if save plugin activated)' },
  { shortcuts: ['Meta+F'], action: 'Find (if searchreplace plugin activated)' },
  { shortcuts: ['Meta+Shift+F'], action: 'Switch to or from fullscreen mode' },
];

const convertShortcut = (text: string): string => {
  const mac = Env.mac;
  return text
    .replace(/Meta/g, mac ? '⌘' : 'Ctrl')
    .replace(/Access/g, mac ? '⌃⌥' : 'Shift+Alt')
    .replace(/Shift/g, mac ? '⇧' : 'Shift')
    .replace(/Alt/g, mac ? '⌥' : 'Alt')
    .replace(/\+/g, mac ? '' : '+');
};

const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const register = (editor: Editor): void => {
  editor.options.register('help_tabs', { processor: 'array' });
  if (!editor.options.isRegistered('help_accessibility')) {
    editor.options.register('help_accessibility', { processor: 'boolean', default: true });
  }

  const shortcutsTab = () => ({
    name: 'shortcuts',
    title: 'Handy Shortcuts',
    items: [{ type: 'table', header: ['Action', 'Shortcut'], cells: SHORTCUTS.map((s) => [editor.translate(s.action), s.shortcuts.map(convertShortcut).join(' ' + editor.translate('or') + ' ')]) }],
  });
  const keyboardNavTab = () => ({
    name: 'keyboardnav',
    title: 'Keyboard Navigation',
    items: [
      {
        type: 'htmlpanel',
        presets: 'document',
        html:
          `<h1>${escape(editor.translate('Editor UI keyboard navigation'))}</h1>` +
          `<h2>${escape(editor.translate('Activating keyboard navigation'))}</h2>` +
          `<p>${escape(editor.translate('The sections of the outer UI of the editor - the menubar, toolbar, sidebar and footer - are all keyboard navigable. As such, there are multiple ways to activate keyboard navigation:'))}</p>` +
          `<ul><li>${escape(editor.translate('Focus the menubar: Alt+F9'))}</li><li>${escape(editor.translate('Focus the toolbar: Alt+F10'))}</li><li>${escape(editor.translate('Focus the footer: Alt+F11'))}</li><li>${escape(editor.translate('Return focus to the editor: Alt+F12 or Escape'))}</li></ul>` +
          `<h2>${escape(editor.translate('Moving between UI sections'))}</h2>` +
          `<p>${escape(editor.translate('Use Tab and Shift+Tab to move between groups; Left and Right arrows move within a toolbar; Up and Down arrows move within menus; Enter or Space activates; Escape closes menus and dialogs.'))}</p>`,
      },
    ],
  });
  const pluginsTab = () => {
    const names = Object.keys(editor.plugins).sort();
    const list = names.length ? `<ul>${names.map((n) => `<li>${escape(n)}</li>`).join('')}</ul>` : `<p>${escape(editor.translate('No plugins installed'))}</p>`;
    return { name: 'plugins', title: 'Plugins', items: [{ type: 'htmlpanel', presets: 'document', html: `<h2>${escape(editor.translate('Installed plugins'))}</h2>${list}` }] };
  };
  const versionTab = () => ({
    name: 'versions',
    title: 'Version',
    items: [{ type: 'htmlpanel', presets: 'document', html: `<p>kHtmlEditor ${escape(editor.editorManager.version)} &mdash; ${escape(editor.translate('TinyMCE-compatible API version'))} ${escape(editor.editorManager.majorVersion)}.${escape(editor.editorManager.minorVersion)}</p><p><a href="https://github.com/KAStrack/kHtmlEditor" target="_blank" rel="noopener">github.com/KAStrack/kHtmlEditor</a></p>` }],
  });

  const buildTabs = (): any[] => {
    const builtIn: Record<string, () => any> = { shortcuts: shortcutsTab, keyboardnav: keyboardNavTab, plugins: pluginsTab, versions: versionTab };
    const custom = editor.options.get('help_tabs') as Array<string | Record<string, any>> | undefined;
    const names: Array<string | Record<string, any>> = custom && custom.length ? custom : ['shortcuts', 'keyboardnav', 'plugins', 'versions'];
    return names
      .map((t) => {
        if (isString(t)) {
          if (t === 'keyboardnav' && !editor.options.get('help_accessibility')) {
            return null;
          }
          return builtIn[t] ? builtIn[t]() : null;
        }
        return isObject(t) ? t : null;
      })
      .filter((t): t is any => !!t);
  };

  const openDialog = () => {
    editor.windowManager.open({
      title: 'Help',
      size: 'medium',
      body: { type: 'tabpanel', tabs: buildTabs() },
      buttons: [{ type: 'cancel', name: 'close', text: 'Close', primary: true }],
    } as any);
  };
  editor.editorCommands.addCommands({ mceHelp: () => openDialog() });
  editor.addShortcut('Alt+0', 'Open help dialog', () => editor.execCommand('mceHelp'));
  editor.ui.registry.addButton('help', { icon: 'help', tooltip: 'Help', shortcut: 'Alt+0', onAction: () => editor.execCommand('mceHelp') });
  editor.ui.registry.addMenuItem('help', { icon: 'help', text: 'Help', shortcut: 'Alt+0', onAction: () => editor.execCommand('mceHelp') });
};

PluginManager.add('help', register);
export default register;
