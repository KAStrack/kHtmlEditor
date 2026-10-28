---
title: Keyboard shortcuts
description: Editing and UI shortcuts.
---
# Keyboard shortcuts

<kbd>Meta</kbd> is <kbd>Ctrl</kbd> on Windows and Linux and <kbd>⌘</kbd> on macOS. <kbd>Access</kbd> is <kbd>Shift+Alt</kbd> on Windows and Linux and <kbd>⌃⌥</kbd> on macOS.

## Editing

| Shortcut | Action |
|---|---|
| <kbd>Meta+B</kbd> / <kbd>Meta+I</kbd> / <kbd>Meta+U</kbd> | Bold / Italic / Underline |
| <kbd>Meta+Z</kbd> / <kbd>Meta+Y</kbd> or <kbd>Meta+Shift+Z</kbd> | Undo / Redo |
| <kbd>Meta+A</kbd> | Select all |
| <kbd>Access+1</kbd> … <kbd>Access+6</kbd> | Heading 1 … 6 |
| <kbd>Access+7</kbd> / <kbd>Access+8</kbd> / <kbd>Access+9</kbd> | Paragraph / Div / Address |
| <kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> in a list | Indent / outdent the item |
| <kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> in a table | Next / previous cell (a new row at the end) |
| <kbd>Shift+Enter</kbd> | Line break |
| <kbd>Enter</kbd> on an empty list item | Leave the list |
| <kbd>Meta+Enter</kbd> or <kbd>Meta+click</kbd> on a link | Open the link |

## Plugins

| Shortcut | Action |
|---|---|
| <kbd>Meta+K</kbd> | Insert/edit link (link) |
| <kbd>Meta+F</kbd> | Find and replace (searchreplace) |
| <kbd>Meta+S</kbd> | Save (save) |
| <kbd>Meta+Shift+F</kbd> | Fullscreen (fullscreen) |
| <kbd>Meta+Shift+C</kbd> | Word count (wordcount) |
| <kbd>Alt+0</kbd> | Help (help) |
| `:` followed by a name | Emoji / special character autocompleter (emoticons, charmap) |

## UI navigation

| Shortcut | Action |
|---|---|
| <kbd>Alt+F9</kbd> | Focus the menubar |
| <kbd>Alt+F10</kbd> | Focus the toolbar |
| <kbd>Alt+F11</kbd> | Focus the element path |
| <kbd>Alt+F12</kbd> / <kbd>Esc</kbd> | Back to the editor |
| <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> | Move within toolbars and menus |
| <kbd>Enter</kbd> / <kbd>Space</kbd> | Activate |
| <kbd>Esc</kbd> | Close menus, popups and dialogs |

## Custom shortcuts

```js
editor.addShortcut('meta+shift+s', 'Shout', () => editor.execCommand('mceShout'));
editor.addShortcut('access+m', 'Marker', 'mceToggleMarker');          // command name
editor.addShortcut('meta+shift+1,meta+shift+2', 'Either', fn);      // alternatives
```
