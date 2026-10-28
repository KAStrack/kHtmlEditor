# Changelog

All notable changes to kHtmlEditor are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses semantic
versioning.

## [Unreleased]

(nothing yet)

## [1.0.0] - 2026-10-28

First release. kHtmlEditor is a from-scratch, dependency-free rich text editor that is a drop-in
replacement for TinyMCE 6/7 (open-source feature set).

### Added
- Content pipeline: TinyMCE-compatible schema (`valid_elements` grammar, `html5`/`html4`/`html5-strict`),
  entity encoding, style parser, always-on XSS sanitiser (tested against a vector corpus, idempotent),
  DOM parser with whitespace/invalid-child/root-block handling, writer and serializer with TinyMCE's
  formatting rules, URL conversion.
- Editor core: options registry with TinyMCE defaults, `Editor`/`EditorManager` API, iframe init, form
  integration, snapshot undo manager with typing coalescing, selection and bookmarks, commands,
  shortcuts, modes, event forwarding, placeholder, dirty tracking, i18n with TinyMCE language packs.
- Editing engine: Enter/Backspace/Delete at structural boundaries, lists with nesting and Tab,
  text patterns, inline boundaries, object (fake) selection, resize handles, tables with cell
  selection and column resizing.
- Formatter: TinyMCE format model (inline/block/selector/wrapper formats, caret formats, merging,
  `formatChanged`, previews) and all default formats.
- Clipboard: paste with Word, Google Docs and WebKit clean-up, plain-text paste, image file paste,
  smart paste, internal copy marker, drag and drop of files and content, `paste_*` options.
- Uploads: TinyMCE's upload contract, `images_upload_handler`, `automatic_uploads`, `uploadImages()`,
  undo-stack rewriting, base64 replacement on `getContent()`, and video/audio uploads via
  `media_upload_url`/`media_upload_handler` (extension).
- UI: toolbar (wrap/sliding/floating/scrolling, sticky, groups), menubar, status bar, context menu,
  context toolbars and forms, quick toolbars, autocompleter, notifications, colour pickers, declarative
  dialogs (`windowManager.open`) with every TinyMCE component type, `openUrl`, `alert`, `confirm`,
  light and dark skins driven by CSS variables, SVG icon set with TinyMCE names, keyboard navigation.
- Plugins: advlist, anchor, autolink, autoresize, autosave, charmap, code (with `code_view: 'inline'`
  extension), codesample, directionality, emoticons, fullscreen, help, image, importcss,
  insertdatetime, link, lists, media, nonbreaking, pagebreak, preview, quickbars, save,
  searchreplace, table, visualblocks, visualchars, wordcount.
- Compatibility: `khtmleditor.tinymce-shim.js` aliasing `window.tinymce`/`window.tinyMCE`,
  translation of TinyMCE 4/5 option and button names, acceptance of removed/core plugin names,
  `tests/compat/` running real `tinymce.init()` configurations through the shim.
- Distribution: IIFE (`dist/khtmleditor.js`, `.min.js`), ESM (`.esm.js`), TypeScript declarations
  (`dist/types`), bundled skins; documentation site in `docs/` built from `docs-src/` Markdown with
  generated option/button/menu references, live demo, fourteen examples and PHP/Node upload servers.

### Not included
- `inline: true` editing mode (planned for a later release).
- The `accordion` plugin and all TinyMCE premium features.

### Known issues
- WebKit (Safari) is covered by the Playwright configuration but was not run in the release
  environment (missing system libraries); Chromium and Firefox pass the full suite.


### Decisions / assumptions

- Bundle size budget raised from 400 KB to 700 KB (minified IIFE with every bundled plugin); the table plugin pushed the core past 400 KB and the image/media/paste/Tier-2 batches are still to come. Tracked by `scripts/build.mjs`.
- Zero runtime dependencies; own schema-driven HTML sanitiser.
- iframe-based editing surface (TinyMCE classic mode); `inline` mode planned post-1.0.
- Global name `kHtmlEditor`; optional `khtmleditor.tinymce-shim.js` aliases `window.tinymce`/`window.tinyMCE`.
- Internal marker attributes use TinyMCE's `data-mce-*` names and the content body carries the
  `mce-content-body` class so existing content CSS and plugin code keep matching (the plan said `data-k-*`).
- The shim reports `majorVersion` `'7'` (the API emulated); the real version is `kHtmlEditor.version`.
- Output indentation uses TinyMCE's exact `indent_before`/`indent_after` element lists (including `ul`, `ol`, `li`, `dl`, `details`), so nested lists serialise as `<li>a\n<ul>\n<li>b</li>\n</ul>\n</li>`.
- `textarea`, `select` and `button` count as non-empty elements so a block containing only a form control is not padded away.

