---
title: Editor API
description: Methods and sub-APIs of an editor instance.
---
# Editor API

An `Editor` instance is returned by `kHtmlEditor.get(id)`, `kHtmlEditor.activeEditor`, the `init()` promise and the `setup` callback. Method names and signatures follow TinyMCE.

## Content

| Method | Description |
|---|---|
| `getContent(args?)` | Serialised HTML. `args.format`: `'html'` (default), `'text'`, `'raw'`, `'tree'`. `args.no_events` skips the events. |
| `setContent(html, args?)` | Replaces the content (sanitised). `args.format: 'raw'` skips formatting, `args.no_events` skips events. |
| `insertContent(html, args?)` | Inserts at the caret, replacing the selection. |
| `resetContent(html?)` | Sets content, clears undo history and dirty state. |
| `save(args?)` / `load(args?)` | Writes to / reads from the underlying textarea. |
| `uploadImages()` | Uploads cached images and media; resolves with results. |
| `isDirty()` / `setDirty(state)` | Dirty tracking; `dirty` event fires when it becomes true. |
| `startContent` | The content at init, used by `resetContent()`. |

## Commands and formatting

| Method | Description |
|---|---|
| `execCommand(cmd, ui?, value?, args?)` | Runs a command (`Bold`, `FormatBlock`, `mceInsertContent`, `mceInsertLink`, `mceInsertTable`, `mceImage`, `JustifyCenter`, `InsertUnorderedList`, …). |
| `queryCommandState(cmd)` / `queryCommandValue(cmd)` / `queryCommandSupported(cmd)` | Command state queries. |
| `addCommand(name, fn, scope?)` / `addQueryStateHandler` / `addQueryValueHandler` | Register commands. |
| `addShortcut(pattern, description, command, scope?)` | Keyboard shortcuts (`'meta+shift+s'`, `'access+1'`, `'alt+F9'`). |
| `formatter` | `apply`, `remove`, `toggle`, `match`, `matchAll`, `matchNode`, `canApply`, `register`, `get`, `has`, `formatChanged(name, cb)`, `closest`, `getCssText`. |
| `undoManager` | `add`, `undo`, `redo`, `clear`, `reset`, `hasUndo`, `hasRedo`, `transact(fn)`, `ignore(fn)`, `extra(fn1, fn2)`, `typing`, `data`. |

## Selection and DOM

| Method | Description |
|---|---|
| `selection` | `getContent`, `setContent`, `getRng`, `setRng`, `getNode`, `getStart`, `getEnd`, `select`, `collapse`, `isCollapsed`, `setCursorLocation`, `getBookmark`, `moveToBookmark`, `getSelectedBlocks`, `scrollIntoView`, `selectorChanged`, `getBoundingClientRect`, `placeCaretAt`, `isEditable`. |
| `dom` | TinyMCE's `DOMUtils`: `create`, `createHTML`, `add`, `remove`, `select`, `is`, `getParent`, `getParents`, `setAttrib`, `getAttrib`, `setStyle`, `getStyle`, `addClass`, `hasClass`, `encode`, `decode`, `isBlock`, `isEmpty`, `split`, `rename`, `getPos`, `createRng`, `nodeIndex`, `bind`, `unbind`, … |
| `schema` / `parser` / `serializer` | Schema queries, `parser.addNodeFilter/addAttributeFilter/parse`, `serializer.addNodeFilter/addAttributeFilter/serialize`. |
| `getBody()` / `getDoc()` / `getWin()` | The content body, document and window. |
| `getContainer()` / `getContentAreaContainer()` / `getElement()` / `iframeElement` | UI elements. |
| `nodeChanged()` | Fires `NodeChange` so toolbar states refresh. |
| `addVisual(elm?)` | Applies visual aid classes. |
| `convertURL(url, name, elm?)` | URL conversion per the URL options. |

## State and UI

| Method | Description |
|---|---|
| `focus(skipFocus?)` / `hasFocus()` | Focus management. |
| `mode.set(name)` / `mode.get()` / `mode.register(name, api)` / `mode.isReadOnly()` | `'design'` or `'readonly'`; `readonly` property mirrors it. |
| `show()` / `hide()` / `isHidden()` | Toggle the editor UI, restoring the textarea. |
| `remove()` / `destroy()` | Tear down. |
| `setProgressState(state, time?)` | Progress overlay (`ProgressState` event). |
| `ui.registry` | `addButton`, `addToggleButton`, `addMenuButton`, `addSplitButton`, `addGroupToolbarButton`, `addMenuItem`, `addNestedMenuItem`, `addToggleMenuItem`, `addContextToolbar`, `addContextForm`, `addContextMenu`, `addAutocompleter`, `addIcon`, `addSidebar`, `addView`, `getAll()`. |
| `windowManager` | `open(spec, params?)`, `openUrl(spec)`, `alert(msg, cb?)`, `confirm(msg, cb?)`, `close()`. |
| `notificationManager` | `open({ text, type, timeout, progressBar, closeButton })`, `close()`, `getNotifications()`. |
| `options` | `get`, `set`, `register`, `isRegistered`, `isSet`, `unset`, `debug`. `getParam()` and `settings` are deprecated aliases. |
| `translate(text)` / `announce(message)` | i18n and screen reader announcements. |
| `plugins` | Plugin instances by name, e.g. `editor.plugins.wordcount.body.getWordCount()`. |
| `editorUpload` | `blobCache`, `uploadImages`, `uploadImagesAuto`, `scanForImages`. |
| `theme`, `editorManager`, `id`, `initialized`, `removed`, `inline` (always `false`), `contentCSS`, `contentStyles`, `documentBaseURI`, `baseURI`, `formElement`, `hasPlugin(name)`, `hasEditableRoot()`, `setEditableRoot(state)`. |

## Events

`on(name, callback, prepend?)`, `once(name, callback)`, `off(name?, callback?)`, `dispatch(name, args?)` (and the deprecated alias `fire`), `hasEventListeners(name)`. Space-separated names register several events at once. See [Events](events.html).
