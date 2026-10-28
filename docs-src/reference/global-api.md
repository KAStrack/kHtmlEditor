---
title: Global API
description: The kHtmlEditor global (also available as tinymce / tinyMCE through the shim).
---
# Global API

The script defines `window.kHtmlEditor`, an `EditorManager`. The ESM build exports it as the default export. With the shim it is also `window.tinymce` and `window.tinyMCE`.

| Member | Description |
|---|---|
| `init(options)` | Creates editors for `options.selector` / `options.target`. Returns `Promise<Editor[]>`. |
| `get(id?)` | Editor by id (string) or index (number); all editors when omitted. |
| `remove(selector?)` | Removes editors by selector, instance or all. |
| `activeEditor` | The editor with focus (or the last one). |
| `editors` | Array of editors (also indexable by id). |
| `triggerSave()` | Writes every editor's content to its textarea. |
| `execCommand(cmd, ui?, value?)` | Runs a command on the active editor (also `mceAddEditor`, `mceRemoveEditor`, `mceFocus`). |
| `createEditor(id, options)` | Creates an editor without rendering it (`editor.render()`). |
| `overrideDefaults(options)` | Defaults merged into every subsequent `init()`. |
| `addI18n(code, items)` / `translate(text)` / `i18n` | Localisation. |
| `on` / `off` / `once` / `dispatch` | Manager events: `AddEditor`, `RemoveEditor`, `BeforeUnload`. |
| `PluginManager.add(name, fn)` / `ThemeManager` | Register plugins and themes. |
| `DOM`, `dom.DOMUtils`, `Env`, `util.Tools`, `util.URI`, `util.I18n`, `ScriptLoader`, `Editor` | Utility classes, as in TinyMCE. |
| `each`, `map`, `grep`, `inArray`, `extend`, `walk`, `resolve`, `makeMap`, `toArray`, `trim`, `explode`, `is`, `isArray`, `hasOwn` | Legacy `tinymce.*` helpers. |
| `majorVersion`, `minorVersion` | `'7'`, `'0.0'`: the TinyMCE API level emulated. |
| `version`, `releaseDate` | The real kHtmlEditor version. |
| `isKHtmlEditor` | `true`; lets code tell the two apart. |
| `baseURL`, `documentBaseURL`, `suffix` | Paths derived from the script location. |

```js
kHtmlEditor.init({ selector: 'textarea' }).then((editors) => {
  editors[0].setContent('<p>Ready</p>');
});
kHtmlEditor.on('AddEditor', (e) => console.log('created', e.editor.id));
```
