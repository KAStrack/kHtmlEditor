---
title: TinyMCE compatibility matrix
description: What works unchanged, what is translated and what is not available.
---
# TinyMCE compatibility matrix

Target: the TinyMCE 6 and 7/8 open-source API (option names are identical between 6 and 7/8). TinyMCE 4/5 names are translated where they still have a meaning.

## Core

| Area | Status |
|---|---|
| `init()` options, `selector`/`target`, multiple editors, `overrideDefaults`, `defaultOptions` | ✅ |
| Toolbar syntax, `toolbar1..9`, arrays, `toolbar_mode` (wrap/sliding/floating/scrolling), `toolbar_sticky`, `toolbar_location`, `toolbar_groups` | ✅ |
| Menubar, `menu`, `removed_menuitems`, context menu | ✅ |
| Status bar, element path, resize handle, branding | ✅ |
| Formats, `style_formats`, `block_formats`, fonts, sizes, line height, colours, `color_map`, custom colours | ✅ |
| Undo manager, dirty tracking, `change` events, typing coalescing | ✅ |
| Keyboard shortcuts, `addShortcut`, `text_patterns` | ✅ |
| Schema options (`valid_elements` grammar, `extended_valid_elements`, `invalid_elements`, `valid_children`, `valid_styles`, `valid_classes`, `custom_elements`, `protect`) | ✅ |
| XSS sanitisation (`xss_sanitization` always on), `convert_unsafe_embeds`, `sandbox_iframes` | ✅ |
| Output options (`entity_encoding`, `element_format`, `indent*`, `remove_trailing_brs`), URL conversion | ✅ |
| Paste cleanup (Word, Google Docs, WebKit), `paste_*`, `smart_paste`, drag and drop | ✅ |
| Image upload contract, `images_upload_*`, `automatic_uploads`, `uploadImages()`, `file_picker_callback` | ✅ |
| Image resize handles, `object_resizing`, `resize_img_proportional` | ✅ |
| Forms: textarea sync, `hidden_input`, `add_form_submit_trigger`, `submit_patch` | ✅ |
| Modes: `readonly`, `disabled`, `mode.set/register`, `placeholder`, `auto_focus` | ✅ |
| `skin`, `skin_url`, `content_css`, `content_style`, `body_class`, `body_id`, `directionality` | ✅ |
| i18n: `language`, `language_url`, `addI18n`, TinyMCE language packs | ✅ |
| Events (see [Events](events.html)) | ✅ |
| `ui.registry.*`, `windowManager.open/openUrl/alert/confirm`, `notificationManager` | ✅ |
| `inline: true` | ❌ planned |
| Premium plugins and cloud features | ❌ |

## Plugins

| Plugin | Status | Notes |
|---|---|---|
| advlist, anchor, autolink, autoresize, autosave, charmap, code, codesample, directionality, emoticons, fullscreen, help, image, importcss, insertdatetime, link, lists, media, nonbreaking, pagebreak, preview, quickbars, save, searchreplace, table, visualblocks, visualchars, wordcount | ✅ | Options and command names as in TinyMCE |
| emoticons | ✅ | Built-in compact emoji set; `emoticons_database_url` for a full set |
| codesample | ✅ | Highlights with a page-provided `Prism` only; output is plain `pre.language-*` |
| media | ✅ + upload | Extra `media_upload_url` / `media_upload_handler` / upload tab |
| code | ✅ + inline | Extra `code_view: 'inline'` |
| accordion | ❌ | Not in 1.0 |
| paste, textcolor, colorpicker, contextmenu, hr, textpattern, print, noneditable | ⚠️ accepted | Core functionality; the plugin name is ignored |
| spellchecker, imagetools, toc, template, fullpage, tabfocus, legacyoutput, bbcode | ⚠️ warned | Not available; ignored |

## Translated TinyMCE 4/5 names

| Old | New |
|---|---|
| `toolbar_drawer` | `toolbar_mode` |
| `insert_toolbar` / `selection_toolbar` | `quickbars_insert_toolbar` / `quickbars_selection_toolbar` |
| `font_formats` / `fontsize_formats` / `lineheight_formats` | `font_family_formats` / `font_size_formats` / `line_height_formats` |
| `paste_filter_drop` | `paste_block_drop` |
| `table_responsive_width` | `table_sizing_mode` |
| `gecko_spellcheck` | `browser_spellcheck` |
| `forced_root_block: false` | `'p'` (TinyMCE 6 dropped `false`) |
| buttons `fontselect`, `fontsizeselect`, `formatselect`, `styleselect`, `lineheightselect` | `fontfamily`, `fontsize`, `blocks`, `styles`, `lineheight` |

## Markup conventions kept from TinyMCE

Internal attributes `data-mce-src`, `data-mce-href`, `data-mce-style`, `data-mce-bogus`, `data-mce-selected`, `data-mce-type="bookmark"`; body class `mce-content-body`; visual aid classes `mce-item-table`, `mce-item-anchor`; placeholder classes `mce-object`, `mce-preview-object`, `mce-pagebreak`; marker classes `mce-nbsp`, `mce-match-marker`. UI classes are prefixed `khe-` and the global is `kHtmlEditor` (`tinymce` through the shim).
