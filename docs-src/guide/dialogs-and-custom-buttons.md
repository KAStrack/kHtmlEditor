---
title: Dialogs and custom buttons
description: Add toolbar buttons, menu items, context toolbars and dialogs from the setup callback.
---
# Dialogs and custom buttons

Everything in this guide uses the same API as TinyMCE, so existing `setup` code runs unchanged.

## Buttons

```js
setup: (editor) => {
  editor.ui.registry.addButton('shout', {
    text: 'Shout',
    icon: 'comment',
    tooltip: 'Upper-case the selection',
    onAction: () => editor.insertContent(editor.selection.getContent({ format: 'text' }).toUpperCase()),
    onSetup: (api) => {
      const update = () => api.setEnabled(!editor.selection.isCollapsed());
      editor.on('NodeChange', update);
      return () => editor.off('NodeChange', update);
    }
  });

  editor.ui.registry.addToggleButton('highlight', {
    icon: 'highlight-bg-color',
    onAction: (api) => { editor.formatter.toggle('highlight'); api.setActive(!api.isActive()); },
    onSetup: (api) => editor.formatter.formatChanged('highlight', (state) => api.setActive(state)).unbind
  });

  editor.ui.registry.addMenuButton('insertblock', {
    text: 'Blocks',
    fetch: (callback) => callback([
      { type: 'menuitem', text: 'Note', onAction: () => editor.insertContent('<div class="note">Note</div>') },
      { type: 'nestedmenuitem', text: 'Alerts', getSubmenuItems: () => ['alert-info', 'alert-warn'] },
      { type: 'separator' },
      { type: 'togglemenuitem', text: 'Draft mode', active: false, onAction: () => {} }
    ])
  });

  editor.ui.registry.addSplitButton('insertdate', {
    icon: 'insert-time',
    onAction: () => editor.insertContent(new Date().toLocaleDateString()),
    onItemAction: (api, value) => editor.insertContent(value),
    fetch: (callback) => callback([{ type: 'choiceitem', text: 'ISO', value: new Date().toISOString() }])
  });
}
```

Then reference the names in `toolbar: 'shout highlight insertblock insertdate'`. `addMenuItem`, `addNestedMenuItem` and `addToggleMenuItem` register menubar/context menu entries the same way; `addIcon(name, svg)` adds or overrides icons.

Button and menu item specs accept `text`, `icon`, `tooltip`, `shortcut` (shown in tooltips/menus), `enabled`, `active`, `onAction`, `onSetup` (return a teardown function) and, for menu buttons, `fetch(callback)`.

## Context toolbars, forms and menus

```js
editor.ui.registry.addContextToolbar('imagealign', {
  predicate: (node) => node.nodeName === 'IMG',
  items: 'alignleft aligncenter alignright',
  position: 'node',          // 'node' | 'selection' | 'line'
  scope: 'node'              // 'node' checks ancestors too, 'editor' only the selection node
});

editor.ui.registry.addContextForm('quickalt', {
  launch: { type: 'contextformbutton', icon: 'image', tooltip: 'Alt text' },
  predicate: (node) => node.nodeName === 'IMG',
  initValue: () => editor.selection.getNode().getAttribute('alt') || '',
  commands: [{ type: 'contextformbutton', text: 'Set', primary: true, onAction: (formApi) => { editor.selection.getNode().setAttribute('alt', formApi.getValue()); formApi.hide(); } }]
});

editor.ui.registry.addContextMenu('mymenu', {
  update: (element) => element.nodeName === 'IMG' ? 'image | imagealign' : ''
});
```

## Dialogs

`editor.windowManager.open(spec)` renders a modal from a declarative specification. The body is a `panel` of items or a `tabpanel` of tabs; `buttons` go in the footer; `initialData` populates fields by `name`.

```js
editor.windowManager.open({
  title: 'Insert callout',
  size: 'normal',                       // 'normal' | 'medium' | 'large'
  body: {
    type: 'panel',
    items: [
      { type: 'input', name: 'title', label: 'Title' },
      { type: 'textarea', name: 'body', label: 'Text' },
      { type: 'listbox', name: 'tone', label: 'Tone', items: [{ text: 'Info', value: 'info' }, { text: 'Warning', value: 'warning' }] },
      { type: 'checkbox', name: 'closable', label: 'Closable' },
      { type: 'urlinput', name: 'link', label: 'Link', filetype: 'file' },
      { type: 'colorinput', name: 'color', label: 'Colour' },
      { type: 'sizeinput', name: 'size', label: 'Size' },
      { type: 'grid', columns: 2, items: [{ type: 'input', name: 'a' }, { type: 'input', name: 'b' }] },
      { type: 'htmlpanel', html: '<p>Any <strong>HTML</strong> (sanitised).</p>' }
    ]
  },
  buttons: [
    { type: 'cancel', text: 'Cancel' },
    { type: 'custom', name: 'preview', text: 'Preview' },
    { type: 'submit', text: 'Insert', primary: true }
  ],
  initialData: { title: '', body: '', tone: 'info', closable: true, link: { value: '' }, color: '#2f6fed', size: { width: '', height: '' } },
  onChange: (api, details) => { /* details.name changed; api.getData() */ },
  onAction: (api, details) => { if (details.name === 'preview') { api.block('Rendering...'); setTimeout(api.unblock, 500); } },
  onSubmit: (api) => {
    const data = api.getData();
    editor.insertContent(`<div class="callout ${data.tone}">${editor.dom.encode(data.title)}</div>`);
    api.close();
  },
  onClose: () => editor.focus()
});
```

The dialog API offers `getData`, `setData`, `setEnabled(name, state)`, `focus(name)`, `showTab(name)`, `redial(spec)`, `block(message)`, `unblock`, `toggleFullscreen` and `close`. All component types, including `dropzone`, `iframe`, `imagepreview`, `collection`, `table`, `slider`, `alertbanner`, `bar` and `label`, are documented in the [dialog specification](../reference/dialog-spec.html).

`editor.windowManager.alert(message, callback)`, `confirm(message, callback)` and `openUrl({ title, url })` cover the simple cases.

## Notifications

```js
editor.notificationManager.open({ text: 'Saved', type: 'success', timeout: 2000 });
const n = editor.notificationManager.open({ text: 'Uploading', type: 'info', progressBar: true });
n.progressBar.value(50);
n.close();
```

## Commands and shortcuts

```js
editor.addCommand('mceShout', (ui, value) => editor.insertContent(String(value).toUpperCase()));
editor.execCommand('mceShout', false, 'hello');
editor.addQueryStateHandler('mceShout', () => false);
editor.addShortcut('meta+shift+s', 'Shout', () => editor.execCommand('mceShout', false, 'hi'));
```
