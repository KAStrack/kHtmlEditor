---
title: Events
description: Editor and manager events with their payloads.
---
# Events

Subscribe with `editor.on(name, handler)`; several names can be space separated. Handlers receive an event object with `type`, `target`, `preventDefault()`, `isDefaultPrevented()`, `stopPropagation()`, `stopImmediatePropagation()` and the payload fields listed. Event names are case-insensitive.

## Native events (forwarded from the content document)

`click`, `dblclick`, `mousedown`, `mouseup`, `mousemove`, `mouseover`, `mouseout`, `mouseenter`, `mouseleave`, `contextmenu`, `keydown`, `keypress`, `keyup`, `input`, `beforeinput`, `compositionstart`, `compositionupdate`, `compositionend`, `focus`, `blur`, `focusin`, `focusout`, `copy`, `cut`, `paste`, `beforepaste`, `dragstart`, `dragend`, `dragover`, `drop`, `drag`, `wheel`, `touchstart`, `touchmove`, `touchend`, `touchcancel`, `selectionchange`, `submit`, `reset`.

## Lifecycle

| Event | Payload / notes |
|---|---|
| `ScriptsLoaded` | External plugins and language loaded. |
| `BeforeRenderUI`, `PostRender`, `SkinLoaded` | UI rendering. |
| `PreInit` | Parser, serializer, formatter, selection ready. Register filters here. |
| `LoadContent`, `init` | Content loaded; editor usable. |
| `activate` / `deactivate` | Active editor changed (`e.relatedTarget`). |
| `show` / `hide` | `editor.show()` / `hide()`. |
| `SwitchMode` | `{ mode }` |
| `remove`, `detach` | Teardown. |
| `ResizeEditor` | UI size changed (`{ height, delta }` from autoresize). |
| `ProgressState` | `{ state, time }` |

## Content

| Event | Payload / notes |
|---|---|
| `BeforeSetContent` / `SetContent` | `{ content, format, set, selection, paste, source_view }`; `content` can be rewritten before. |
| `BeforeGetContent` / `GetContent` | `{ content, format, get, selection }`; `content` can be rewritten after. |
| `PreProcess` / `PostProcess` | Serializer hooks with `{ node }` / `{ content }`. |
| `SaveContent`, `RawSaveContent`, `LoadContent` | `save()` / `load()`. |
| `change` | A new undo level was added (content changed). |
| `dirty` | The editor became dirty. |
| `input` | Native input. |
| `NodeChange` | `{ element, parents, selectionChange, initial }` |
| `SelectionChange` | Selection moved. |
| `ExecCommand` / `BeforeExecCommand` | `{ command, ui, value }`; the latter is cancelable. |
| `FormatApply` / `FormatRemove` | `{ format, node, vars }` |
| `NewBlock` | `{ newBlock }` after Enter. |
| `ObjectSelected` / `BeforeObjectSelected` | Fake selection of an image or non-editable block. |
| `ObjectResizeStart` (cancelable) / `ObjectResized` | `{ target, width, height, origin }` |
| `ShowCaret`, `SetSelectionRange`, `AfterSetSelectionRange`, `ScrollIntoView`, `AfterScrollIntoView` | Selection internals. |
| `SetAttrib` | `{ attrElm, attrName, attrValue }` from `dom.setAttrib`. |
| `ResolveName` | `{ name, target }` for the status bar path. |

## Undo

`BeforeAddUndo` (cancelable, `{ level, lastLevel, originalEvent }`), `AddUndo`, `Undo`, `Redo`, `TypingUndo`, `ClearUndos`.

## Paste and uploads

`PastePreProcess` (`{ content, internal, wordContent }`, cancelable), `PastePostProcess` (`{ node, internal }`, cancelable), `PastePlainTextToggle` (`{ state }`), `UploadImages` (`{ results }`).

## UI

`OpenWindow` / `CloseWindow` (`{ dialog }`), `BeforeOpenNotification` / `OpenNotification` (`{ notification }`), `ToolbarOverflowToggle`, `StyleFormatsChanged`, `ContextFormLaunch`, `VisualAid`.

## Plugins

| Event | Plugin |
|---|---|
| `TableModified` (`{ table, structure, style }`), `NewRow`, `NewCell`, `TableSelectionChange`, `TableSelectionClear` | table |
| `ImageResized` | image |
| `FullscreenStateChanged` (`{ state }`) | fullscreen |
| `VisualBlocks`, `VisualChars` (`{ state }`) | visualblocks, visualchars |
| `WordCountUpdate` (`{ wordCount: { words, characters, charactersWithoutSpaces } }`) | wordcount |
| `StoreDraft`, `RestoreDraft`, `RemoveDraft` | autosave |
| `SourceViewChange` (`{ state }`) | code (inline view) |
| `insertCustomChar` (`{ chr }`) | charmap |
| `AutocompleterStart` / `AutocompleterUpdate` / `AutocompleterEnd` | autocompleter |

## Manager events

`kHtmlEditor.on('AddEditor' | 'RemoveEditor' | 'BeforeUnload', fn)`.
