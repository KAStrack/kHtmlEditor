---
title: Dialog specification
description: The declarative dialog format accepted by windowManager.open().
---
# Dialog specification

```js
editor.windowManager.open({
  title: string,
  size: 'normal' | 'medium' | 'large',
  body: Panel | TabPanel,
  buttons: Button[],
  initialData: Record<string, any>,
  onSubmit, onCancel, onClose, onChange, onAction, onTabChange
}, { inline: 'toolbar' | 'cursor' });   // optional: render as a popup instead of a modal
```

## Body

- `{ type: 'panel', items: Item[], classes?: string[] }`
- `{ type: 'tabpanel', tabs: [{ name, title, items: Item[] }] }`

## Items

| Type | Properties | Value in `getData()` |
|---|---|---|
| `input` | `name`, `label`, `placeholder`, `inputMode`, `maximized`, `enabled` | string |
| `textarea` | `name`, `label`, `placeholder`, `maximized`, `spellcheck` | string |
| `selectbox` / `listbox` | `name`, `label`, `items: [{ text, value }]` (listbox items may nest `{ text, items }`), `size` | string |
| `checkbox` | `name`, `label`, `enabled` | boolean |
| `urlinput` | `name`, `label`, `filetype: 'image' \| 'media' \| 'file'` (enables `file_picker_callback`), `picker_text` | `{ value, meta }` |
| `sizeinput` | `name`, `label`, `constrain` | `{ width, height }` |
| `colorinput` | `name`, `label`, `storageKey` | hex string |
| `colorpicker` | `name`, `label` | hex string |
| `dropzone` | `name`, `label`, `accept`, `multiple` | `File[]` |
| `iframe` | `name`, `label`, `sandboxed`, `transparent`, `border`, `streamContent` | HTML string (`srcdoc`) |
| `imagepreview` | `name`, `height` | `{ url, zoom, cachedWidth, cachedHeight }` |
| `htmlpanel` | `html`, `presets: 'presentation' \| 'document'` | — |
| `button` | `name`, `text`, `icon`, `primary`, `borderless`, `buttonType`, `enabled`, `active` | — (fires `onAction`) |
| `collection` | `name`, `columns: number \| 'auto'`, `label` | items `[{ value, text, icon }]`; clicks fire `onAction` with `details.value` |
| `table` | `header: string[]`, `cells: string[][]` | — |
| `slider` | `name`, `label`, `min`, `max` | number |
| `alertbanner` | `level: 'info' \| 'warn' \| 'error' \| 'success'`, `text`, `icon`, `url` | — |
| `grid` | `columns`, `items` | — |
| `bar` | `items` (laid out in a row) | — |
| `label` | `label`, `items`, `align`, `for` | — |
| `customeditor` | `name`, `tag`, `init(el) => api` | string via `api.getValue()` |
| `tree` | `items`, `onLeafAction` | — |

## Footer buttons

`{ type: 'submit' | 'cancel' | 'custom' | 'menu' | 'togglebutton', name, text, icon, primary, align: 'start' | 'end', enabled, buttonType: 'primary' | 'secondary' | 'toolbar' }`. A `menu` button takes `items` (menu item specs); `submit` triggers `onSubmit`, `cancel` triggers `onCancel` and closes, `custom` triggers `onAction(api, { name })`.

## Callbacks

| Callback | Arguments |
|---|---|
| `onSubmit(api)` | Submit button or Enter in a single-line field. Call `api.close()` yourself. |
| `onCancel(api)` | Cancel button, Escape or the close icon (before closing). |
| `onClose()` | After the dialog closed. |
| `onChange(api, { name })` | A field changed. |
| `onAction(api, { name, value })` | A `custom` button, body button or collection item. |
| `onTabChange(api, { newTabName, oldTabName })` | Tab switched. |

## Dialog instance API

`getData()`, `setData(partial)`, `setEnabled(name, state)`, `focus(name)`, `showTab(name)`, `redial(spec)`, `block(message)`, `unblock()`, `toggleFullscreen()`, `close()`.

## URL dialogs

`editor.windowManager.openUrl({ title, url, width, height, buttons, onAction, onMessage, onCancel, onClose })` loads a page in an iframe; the page can call `window.parent.postMessage({ mceAction: 'insertContent', content })` with actions `insertContent`, `setContent`, `execCommand`, `close`, `block`, `unblock`.
