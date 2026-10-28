---
title: Menu items
description: Every menu item name usable in the menu and contextmenu options.
---
# Menu items

<p class="lead">Use these names in `menu`, `removed_menuitems`, `contextmenu` and in `getSubmenuItems` strings. Generated from the source at build time.</p>

The default menubar is:

```js
menu: {
  file:   { title: 'File',   items: 'newdocument restoredraft | preview | print' },
  edit:   { title: 'Edit',   items: 'undo redo | cut copy paste pastetext | selectall | searchreplace' },
  view:   { title: 'View',   items: 'code | visualaid visualchars visualblocks | preview fullscreen' },
  insert: { title: 'Insert', items: 'image link media codesample inserttable | charmap emoticons hr | pagebreak nonbreaking anchor | insertdatetime' },
  format: { title: 'Format', items: 'bold italic underline strikethrough superscript subscript codeformat | styles blocks fontfamily fontsize align lineheight | forecolor backcolor | language | removeformat' },
  tools:  { title: 'Tools',  items: 'code wordcount' },
  table:  { title: 'Table',  items: 'inserttable | cell row column | advtablesort | tableprops deletetable' },
  help:   { title: 'Help',   items: 'help' }
}
```

Items whose plugin is not loaded are skipped silently, as in TinyMCE.

<!-- MENU_ITEMS_TABLE -->
