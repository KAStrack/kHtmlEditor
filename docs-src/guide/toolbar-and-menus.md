---
title: Toolbar and menus
description: Toolbar strings, modes, groups, menubar configuration, context menus and quick toolbars.
---
# Toolbar and menus

## Toolbar

The `toolbar` option is a string of button names separated by spaces, with `|` for group separators. Arrays work too: each entry is one group or one row.

```js
toolbar: 'undo redo | blocks fontfamily fontsize | bold italic underline | bullist numlist | link image'
toolbar: ['undo redo | bold italic', 'link image table']   // two rows
toolbar1: 'undo redo | bold italic',                         // numbered rows
toolbar2: 'link image table',
toolbar: false                                               // no toolbar
```

Unknown button names are skipped with a console warning, so configurations written for plugins you do not load still initialise.

### Modes

`toolbar_mode` controls what happens when buttons do not fit:

- `wrap` (default): buttons wrap onto further rows.
- `sliding`: an overflow button reveals the remaining buttons below the toolbar.
- `floating`: an overflow button opens the remaining buttons in a popup.
- `scrolling`: the toolbar scrolls horizontally.

`toolbar_sticky` keeps the toolbar visible while scrolling long content; `toolbar_location: 'bottom'` moves it under the editing area.

### Groups

```js
toolbar: 'formatting | alignment',
toolbar_groups: {
  formatting: { icon: 'format', tooltip: 'Formatting', items: 'bold italic underline | superscript subscript' },
  alignment:  { icon: 'align-left', tooltip: 'Alignment', items: 'alignleft aligncenter alignright alignjustify' }
}
```

The full list of built-in buttons is in the [toolbar buttons reference](../reference/toolbar-buttons.html).

## Menubar

```js
menubar: 'file edit view insert format tools table help',   // default order; false hides it
menu: {
  file: { title: 'File', items: 'newdocument restoredraft | preview | print' },
  custom: { title: 'Custom', items: 'mybutton | undo redo' }
},
removed_menuitems: 'newdocument print'
```

Menu item names are listed in the [menu items reference](../reference/menu-items.html). Custom items come from `editor.ui.registry.addMenuItem()`.

## Context menu

Right-clicking (or long-pressing) shows the items of the `contextmenu` option that apply to the clicked element. Plugins register providers: `link`, `image`, `table`, `media`. Set `contextmenu: false` for the browser's native menu, or `contextmenu_never_use_native: true` to always show the editor's.

## Quick toolbars

The `quickbars` plugin shows toolbars next to the selection:

```js
plugins: 'quickbars link image table',
quickbars_selection_toolbar: 'bold italic | quicklink h2 h3 blockquote',
quickbars_insert_toolbar: 'quickimage quicktable',   // on empty lines
quickbars_image_toolbar: 'alignleft aligncenter alignright'
```

Set any of them to `false` to disable that toolbar. The `table` plugin has its own `table_toolbar` context toolbar; the `link` plugin's `link_context_toolbar: true` shows an inline URL form when the caret is inside a link.

## Status bar

The status bar shows the element path (`elementpath`), the word count when the `wordcount` plugin is loaded, the branding link (`branding: false` to hide) and the resize handle (`resize: false`, or `'both'` for horizontal resizing). `statusbar: false` removes it.

## Keyboard access

<kbd>Alt+F9</kbd> focuses the menubar, <kbd>Alt+F10</kbd> the toolbar, <kbd>Alt+F11</kbd> the element path and <kbd>Alt+F12</kbd> returns to the editor. Arrow keys move within a toolbar or menu, <kbd>Tab</kbd> between groups, <kbd>Esc</kbd> closes menus and dialogs.
