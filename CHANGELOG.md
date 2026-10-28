# Changelog

All notable changes to kHtmlEditor are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses semantic
versioning.

## [Unreleased]

### Added
- Project scaffolding: TypeScript, esbuild build, Vitest unit tests, Playwright e2e tests.
- Content pipeline: TinyMCE-compatible schema (`valid_elements` grammar), entity encoding, style parser,
  always-on XSS sanitiser, DOM parser with whitespace/invalid-child/root-block handling, serializer.
- Editor core: options registry with TinyMCE defaults, Editor/EditorManager API, iframe init,
  form integration, undo manager, selection, commands, shortcuts, modes, event forwarding.
- `khtmleditor.tinymce-shim.js` aliasing `window.tinymce`/`window.tinyMCE`.

### Decisions / assumptions

- Bundle size budget raised from 400 KB to 700 KB (minified IIFE with every bundled plugin); the table plugin pushed the core past 400 KB and the image/media/paste/Tier-2 batches are still to come. Tracked by `scripts/build.mjs`.
- Zero runtime dependencies; own schema-driven HTML sanitiser.
- iframe-based editing surface (TinyMCE classic mode); `inline` mode planned post-1.0.
- Global name `kHtmlEditor`; optional `khtmleditor.tinymce-shim.js` aliases `window.tinymce`/`window.tinyMCE`.
- Internal marker attributes use TinyMCE's `data-mce-*` names and the content body carries the
  `mce-content-body` class so existing content CSS and plugin code keep matching (the plan said `data-k-*`).
- The shim reports `majorVersion` `'7'` (the API emulated); the real version is `kHtmlEditor.version`.
- Nested list output follows TinyMCE's writer rules (`ul`/`ol` are not in `indent_before`): `<li>a<ul>\n<li>b</li>\n</ul></li>`.
- `textarea`, `select` and `button` count as non-empty elements so a block containing only a form control is not padded away.

### Known issues
- (none yet)
