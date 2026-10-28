---
title: Writing plugins
description: Package editor extensions as plugins with options, commands, UI and events.
---
# Writing plugins

A plugin is a function that receives the editor. Register it with `kHtmlEditor.PluginManager.add(name, fn)` (or `tinymce.PluginManager.add` through the shim) before `init()`, then name it in `plugins`.

```js
kHtmlEditor.PluginManager.add('highlighter', (editor) => {
  // 1. Options with types and defaults
  editor.options.register('highlighter_color', { processor: 'string', default: '#fff3bf' });

  // 2. Formats
  editor.on('PreInit', () => {
    editor.formatter.register('marker', { inline: 'mark', styles: { backgroundColor: '%color' } });
  });

  // 3. Commands
  editor.addCommand('mceToggleMarker', () => {
    editor.formatter.toggle('marker', { color: editor.options.get('highlighter_color') });
    editor.nodeChanged();
  });

  // 4. UI
  editor.ui.registry.addToggleButton('marker', {
    icon: 'highlight-bg-color',
    tooltip: 'Marker',
    onAction: () => editor.execCommand('mceToggleMarker'),
    onSetup: (api) => editor.formatter.formatChanged('marker', api.setActive).unbind
  });
  editor.ui.registry.addMenuItem('marker', { text: 'Marker', icon: 'highlight-bg-color', onAction: () => editor.execCommand('mceToggleMarker') });

  // 5. Content filters (optional)
  editor.on('PreInit', () => {
    editor.parser.addNodeFilter('mark', (nodes) => nodes.forEach((n) => n.setAttribute('data-mce-marker', '1')));
    editor.serializer.addAttributeFilter('data-mce-marker', (nodes) => nodes.forEach((n) => n.removeAttribute('data-mce-marker')));
  });

  // 6. Public API available as editor.plugins.highlighter
  return {
    getMetadata: () => ({ name: 'Highlighter', url: 'https://example.com' }),
    toggle: () => editor.execCommand('mceToggleMarker')
  };
});
```

## Lifecycle

Plugins are created after options are resolved and before the UI renders, so they can register buttons the toolbar will use. Useful events, in order: `PreInit` (parser, serializer, formatter and selection exist; register filters and formats here), `PostRender` (UI rendered), `init` (editor usable; content loaded), `remove`.

## Loading plugins from files

`external_plugins: { highlighter: '/js/highlighter.js' }` loads the script and expects it to call `PluginManager.add('highlighter', ...)`. The plugin receives `(editor, url)` where `url` is the script's base URL.

## Autocompleters

```js
editor.ui.registry.addAutocompleter('mentions', {
  trigger: '@',
  minChars: 1,
  columns: 1,
  fetch: (pattern) => fetch('/api/users?q=' + encodeURIComponent(pattern)).then((r) => r.json())
    .then((users) => users.map((u) => ({ type: 'autocompleteitem', value: u.id, text: u.name, icon: '👤' }))),
  onAction: (api, rng, value) => {
    editor.selection.setRng(rng);
    editor.insertContent(`<span class="mention" data-user="${value}">@${value}</span>&nbsp;`);
    api.hide();
  }
});
```

## Non-editable and object content

Give elements `contenteditable="false"` (or the `noneditable_class`, default `mceNonEditable`) to make them selectable units that keyboard navigation and deletion treat as one object. Mark helper elements that must never be saved with `data-mce-bogus="1"` (unwrapped on output) or `data-mce-bogus="all"` (removed with their content).

## Writing tests

The repository uses Vitest for the content pipeline and Playwright for everything that needs a browser; `tests/e2e/harness.html` is a blank page that loads `dist/khtmleditor.js`. Plugin specs live in `tests/e2e/plugins/`.
