---
title: Sanitisation and output
description: How content is cleaned on the way in, and how the HTML you get back is formatted.
---
# Sanitisation and output

Every piece of HTML that enters the editor (`setContent`, `insertContent`, paste, drop, the source code dialog, `external_plugins` content) passes through two layers before it reaches the document.

## 1. The schema

The schema decides which elements, attributes, styles and classes are allowed and how invalid nesting is repaired. It is configured exactly like TinyMCE:

```js
schema: 'html5',                       // 'html5' (default), 'html4', 'html5-strict'
valid_elements: 'p,strong/b,em/i,a[href|target=_blank],ul,ol,li,img[src|alt|width|height]',
extended_valid_elements: 'iframe[src|width|height|allowfullscreen],script[src]',
invalid_elements: 'font,center',
valid_children: '+body[style],-li[p]',
valid_styles: { '*': 'color,font-size,text-align' },
invalid_styles: { '*': 'position,z-index' },
valid_classes: { '*': 'intro,callout', p: 'lead' },
custom_elements: 'my-widget,~my-inline-thing'
```

The `valid_elements` grammar supports aliases (`strong/b`), required attributes (`!href`), default values (`target=_blank`), forced values (`rel:noopener`), value lists (`target<_blank?_self`), wildcards (`*[*]`, `@[class]`) and the `+`/`-`/`#` prefixes. Elements not in the schema are removed and their text kept; invalid children are fixed by splitting the parent around them (TinyMCE behaviour); stray text at the root is wrapped in `forced_root_block` (`p`).

## 2. The XSS layer

The second layer cannot be turned off by schema settings. It removes `script`, `style` (unless explicitly allowed), `object`/`embed` (converted to `img`/`video`/`audio`/`iframe` when `convert_unsafe_embeds` is on), `template`, `meta`, `link`, `base`, `frameset` and friends; strips all `on*` event handler attributes (after decoding tricks such as `on&#x63;lick`), `formaction`, `srcdoc`, `xmlns`, `is` and `nonce`; rejects `javascript:`, `vbscript:` and similar URLs in every URL attribute and inside `srcset`; allows `data:` URLs only for raster images (and `data:video/*`/`data:audio/*` on media elements awaiting upload); adds `rel="noopener"` to `target="_blank"` links; sandboxes `iframe` elements except for the hosts in `sandbox_iframes_exclusions`; drops `id`/`name` values that would clobber `document` or form properties; and filters CSS for `expression()`, `behavior`, `-moz-binding`, `@import` and unsafe `url()` values. Comments that contain markup are removed.

The layer is regression tested against a corpus of published XSS vectors (`tests/xss/vectors.json`) and is idempotent: sanitising already sanitised content changes nothing.

Options: `allow_script_urls`, `allow_html_data_urls`, `allow_svg_data_urls`, `allow_unsafe_link_target`, `allow_conditional_comments`, `allow_html_in_comments`, `convert_unsafe_embeds`, `sandbox_iframes`, `sandbox_iframes_exclusions`.

## Output formatting

`getContent()` serialises the document with TinyMCE's writer rules so existing round-trip expectations hold:

- block elements on their own lines (`indent`, `indent_before`, `indent_after`),
- `entity_encoding: 'named'` by default (`&nbsp;`, `&euro;`, `&copy;`), or `'numeric'`, `'raw'`, `'named+numeric'` with `entities`,
- `element_format: 'html'` (or `'xhtml'`),
- empty blocks padded with `&nbsp;`, trailing `<br>` removed (`remove_trailing_brs`),
- URLs converted according to `convert_urls`, `relative_urls`, `remove_script_host`, `document_base_url` and `urlconverter_callback`,
- internal markers (`data-mce-*`, bogus elements, resize handles, caret containers) never appear in the output.

```js
editor.getContent();                     // formatted HTML
editor.getContent({ format: 'text' });   // plain text
editor.getContent({ format: 'raw' });    // the live DOM, unformatted
editor.getContent({ format: 'tree' });   // a DOM fragment
```

## Hooks

- `BeforeSetContent` / `SetContent` / `BeforeGetContent` / `GetContent` events can inspect or rewrite `e.content`.
- `editor.parser.addNodeFilter(names, fn)` and `addAttributeFilter(names, fn)` run on parsed DOM nodes when content enters; `editor.serializer.addNodeFilter` / `addAttributeFilter` run on a clone when content leaves.
- `PastePreProcess` / `PastePostProcess` and the `paste_preprocess` / `paste_postprocess` options target pasted content specifically. See [uploads and paste](uploads.html).
