---
title: Theming and skins
description: Skins, CSS variables, content CSS and icons.
---
# Theming and skins

## Skins

Two UI skins ship in the bundle and need no extra files: `oxide` (light, default) and `oxide-dark`. `skin: 'auto'` follows the operating system preference.

```js
skin: 'oxide-dark',
content_css: 'dark'
```

`skin: false` disables the bundled skin so you can provide your own CSS; `skin_url` points at a directory containing `skin.min.css` and `content.min.css`, matching TinyMCE's layout.

## CSS variables

The UI is styled through custom properties on the editor container (`.khe-container`), so a palette is a few lines:

```css
.khe-container {
  --khe-bg: #ffffff;            /* UI background */
  --khe-bg-subtle: #f7f8fa;     /* toolbar / status bar background */
  --khe-fg: #222f3e;            /* UI text */
  --khe-fg-muted: #6b7280;
  --khe-border: #e1e3e8;
  --khe-accent: #2f6fed;        /* active state, focus rings, primary buttons */
  --khe-accent-fg: #ffffff;
  --khe-hover: #e8ecf3;         /* button hover */
  --khe-active: #dde3ee;        /* pressed toggle buttons */
  --khe-menu-hover: #e8ecf3;
  --khe-focus: #2f6fed;
  --khe-content-bg: #ffffff;    /* source view and dialog text areas */
  --khe-radius: 6px;
  --khe-font: system-ui, sans-serif;
  --khe-font-size: 14px;
}
```

Element classes are prefixed `khe-` (`khe-toolbar`, `khe-tbtn`, `khe-menubar`, `khe-statusbar`, `khe-dialog`, `khe-menu`, `khe-notification`); each toolbar button carries `data-khe-name="bold"` for targeting. The content body keeps TinyMCE's `mce-content-body` class and `data-mce-*` attributes so existing content CSS works.

## Content CSS

`content_css` accepts `'default'`, `'dark'`, `false` or one or more URLs (string, comma separated string or array); `content_style` adds inline CSS; `body_class` and `body_id` set the body attributes inside the iframe. `font_css` loads font stylesheets into the UI as well as the content. With the `importcss` plugin, class selectors from the content stylesheets appear in the Formats menu.

## Icons

Icons are inline SVG strings keyed by TinyMCE's icon names (`bold`, `image`, `table-insert-row-above`, and so on). Add or override one:

```js
editor.ui.registry.addIcon('shout', '<svg width="24" height="24"><path d="..."/></svg>');
```

`icons` and `icons_url` are accepted for compatibility and ignored; use `addIcon` to replace individual icons.

## Sizing

`height`, `width`, `min_height` and `max_height` size the container; the `resize` handle lets users adjust it; the `autoresize` plugin grows the editor with its content; the `fullscreen` plugin fills the viewport. `ResizeEditor` fires after any of these.
