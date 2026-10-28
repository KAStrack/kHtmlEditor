import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';
import { openDialog, insertLink } from './LinkDialog';
import * as Utils from './Utils';

/**
 * Link plugin: insert/edit dialog with link lists, anchors, targets, rel and class lists,
 * external-target prefixing, unlink, open link, Ctrl/Cmd+K, the quicklink context form and the
 * link context menu.
 */
const registerOptions = (editor: Editor) => {
  const r = editor.options.register;
  r('link_assume_external_targets', { processor: (v: unknown) => (typeof v === 'boolean' || v === 'http' || v === 'https' ? { valid: true, value: v } : { valid: false, message: 'Must be a boolean, "http" or "https".' }), default: false });
  r('link_context_toolbar', { processor: 'boolean', default: false });
  r('link_list', { processor: (v: unknown) => (v === false || typeof v === 'string' || Array.isArray(v) || typeof v === 'function' ? { valid: true, value: v } : { valid: false, message: 'Must be false, a string, an array or a function.' }), default: false });
  r('link_default_target', { processor: 'string' });
  r('link_default_protocol', { processor: 'string', default: 'https' });
  r('link_target_list', { processor: (v: unknown) => (typeof v === 'boolean' || Array.isArray(v) ? { valid: true, value: v } : { valid: false, message: 'Must be a boolean or an array.' }), default: true });
  r('link_rel_list', { processor: 'object[]', default: [] });
  r('link_class_list', { processor: 'object[]', default: [] });
  r('link_title', { processor: 'boolean', default: true });
  r('link_quicklink', { processor: 'boolean', default: false });
  r('link_attributes_postprocess', { processor: 'function' });
};

const register = (editor: Editor): Record<string, any> => {
  registerOptions(editor);

  editor.editorCommands.addCommands({
    mceLink: (_cmd, _ui, value) => {
      if (editor.options.get('link_quicklink') && !(value && value.dialog)) {
        editor.dispatch('ContextFormLaunch', { name: 'quicklink' });
        return;
      }
      openDialog(editor);
    },
    mceOpenLink: () => Utils.openLink(editor, null),
  });
  editor.addShortcut('Meta+K', 'Insert/edit link', () => editor.execCommand('mceLink'));

  const inLink = () => Utils.isInAnchor(editor, editor.selection.getNode()) || Utils.hasLinks(Array.from(editor.selection.getRng().cloneContents().querySelectorAll('a[href]')));
  const linkSetup = (api: { setEnabled: (s: boolean) => void; setActive?: (s: boolean) => void }) => {
    const update = () => {
      api.setEnabled(!editor.readonly && editor.selection.isEditable());
      if (api.setActive) {
        api.setActive(inLink());
      }
    };
    editor.on('NodeChange SwitchMode', update);
    update();
    return () => editor.off('NodeChange SwitchMode', update);
  };
  const needsLinkSetup = (api: { setEnabled: (s: boolean) => void }) => {
    const update = () => api.setEnabled(!editor.readonly && inLink());
    editor.on('NodeChange SwitchMode', update);
    update();
    return () => editor.off('NodeChange SwitchMode', update);
  };

  editor.ui.registry.addToggleButton('link', { icon: 'link', tooltip: 'Insert/edit link', shortcut: 'Meta+K', onAction: () => editor.execCommand('mceLink'), onSetup: linkSetup });
  editor.ui.registry.addButton('openlink', { icon: 'new-tab', tooltip: 'Open link', onAction: () => Utils.openLink(editor, null), onSetup: needsLinkSetup });
  editor.ui.registry.addButton('unlink', { icon: 'unlink', tooltip: 'Remove link', onAction: () => Utils.unlink(editor), onSetup: needsLinkSetup });
  editor.ui.registry.addMenuItem('link', { icon: 'link', text: 'Link...', shortcut: 'Meta+K', onAction: () => editor.execCommand('mceLink'), onSetup: linkSetup as any });
  editor.ui.registry.addMenuItem('openlink', { icon: 'new-tab', text: 'Open link', onAction: () => Utils.openLink(editor, null), onSetup: needsLinkSetup as any });
  editor.ui.registry.addMenuItem('unlink', { icon: 'unlink', text: 'Remove link', onAction: () => Utils.unlink(editor), onSetup: needsLinkSetup as any });
  editor.ui.registry.addContextMenu('link', {
    update: (node) => (Utils.isInAnchor(editor, node) ? 'link unlink openlink' : 'link'),
  });

  // Quick link form: launched from toolbars (quickbars) or shown on links when link_context_toolbar is on.
  editor.ui.registry.addContextForm('quicklink', {
    launch: { type: 'contextformtogglebutton', icon: 'link', tooltip: 'Link' },
    label: 'Link',
    placeholder: 'Enter URL...',
    predicate: (node) => !!editor.options.get('link_context_toolbar') && Utils.isInAnchor(editor, node),
    initValue: () => {
      const a = Utils.getAnchorElement(editor);
      return a ? a.getAttribute('data-mce-href') || a.getAttribute('href') || '' : '';
    },
    commands: [
      {
        type: 'contextformtogglebutton',
        icon: 'link',
        tooltip: 'Link',
        primary: true,
        onSetup: (api) => {
          api.setActive(inLink());
          return () => {};
        },
        onAction: (formApi) => {
          const value = formApi.getValue().trim();
          const anchor = Utils.getAnchorElement(editor);
          if (!value) {
            if (anchor) {
              Utils.unlink(editor);
            }
          } else {
            const text = Utils.isOnlyTextSelected(editor) && editor.selection.isCollapsed() && !anchor ? value : undefined;
            insertLink(editor, { href: value }, anchor, text, text ?? '');
          }
          formApi.hide();
          editor.focus();
        },
      },
      {
        type: 'contextformbutton',
        icon: 'unlink',
        tooltip: 'Remove link',
        onSetup: (api) => {
          api.setEnabled(inLink());
          return () => {};
        },
        onAction: (formApi) => {
          Utils.unlink(editor);
          formApi.hide();
          editor.focus();
        },
      },
    ],
  });

  // Ctrl/Cmd+click opens links (TinyMCE behaviour).
  editor.on('click', (e) => {
    const anchor = Utils.getAnchorElement(editor, e.target as Node);
    if (anchor && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      Utils.openLink(editor, anchor);
    }
  });
  editor.on('keydown', (e) => {
    if (e.keyCode === 13 && (e.ctrlKey || e.metaKey) && !e.isDefaultPrevented()) {
      const anchor = Utils.getAnchorElement(editor);
      if (anchor) {
        e.preventDefault();
        Utils.openLink(editor, anchor);
      }
    }
  });

  return {
    showDialog: () => openDialog(editor),
  };
};

PluginManager.add('link', register);
export default register;
