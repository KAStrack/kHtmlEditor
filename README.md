# kHtmlEditor

A from-scratch, dependency-free rich text HTML editor for the browser, built as a
**drop-in replacement for TinyMCE**. Keep your existing `tinymce.init({...})`
configuration, content API calls, custom toolbar buttons, dialogs and image upload
endpoint; swap the script tag and rename the global (or load the one-line shim).

- **One file, zero dependencies.** UI skin, content CSS, icons and every plugin are bundled.
- **TinyMCE 6/7 API.** Same options, toolbar syntax, `editor.*` methods, events, `ui.registry`
  and `windowManager` dialog specification. TinyMCE 4/5 names are translated with a warning.
- **Safe by default.** Schema allowlist plus an always-on XSS layer tested against a vector corpus.
- **Uploads.** TinyMCE's exact contract (`POST file` → `{"location"}`) for images, plus video and
  audio uploads, drag and drop, paste, progress and `uploadImages()`.
- **Everything you expect.** Tables with cell selection and resizing, images with captions and
  resize handles, media embeds, lists, links, source view (dialog or inline), search and replace,
  word count, autosave, fullscreen, emoji, special characters, code samples, quick toolbars and more.
- **Accessible.** Keyboard-navigable toolbar, menus and dialogs with ARIA roles.
- **MIT licensed.**

Documentation, demo and examples: **https://kastrack.github.io/kHtmlEditor/**

## Quick start

```html
<textarea id="editor"><p>Hello world</p></textarea>
<script src="dist/khtmleditor.min.js"></script>
<script>
  kHtmlEditor.init({
    selector: '#editor',
    plugins: 'lists link image table code',
    toolbar: 'undo redo | blocks | bold italic | alignleft aligncenter alignright | bullist numlist | link image table | code'
  });
</script>
```

Migrating from TinyMCE with zero code changes:

```html
<script src="dist/khtmleditor.min.js"></script>
<script src="dist/khtmleditor.tinymce-shim.js"></script>
<!-- your existing tinymce.init({...}) keeps working -->
```

With npm: `npm install khtmleditor`, then `import kHtmlEditor from 'khtmleditor'`.

## Plugins

`advlist anchor autolink autoresize autosave charmap code codesample directionality emoticons
fullscreen help image importcss insertdatetime link lists media nonbreaking pagebreak preview
quickbars save searchreplace table visualblocks visualchars wordcount` are all included; name
them in `plugins` to activate them. Custom plugins register with `kHtmlEditor.PluginManager.add()`.

## Documentation

- [Getting started](docs/guide/getting-started.md) · [Migrating from TinyMCE](docs/guide/migration-from-tinymce.md)
- [Configuration](docs/guide/configuration.md) · [Toolbar and menus](docs/guide/toolbar-and-menus.md) · [Sanitisation and output](docs/guide/sanitisation.md)
- [Image and media uploads](docs/guide/uploads.md) · [Dialogs and custom buttons](docs/guide/dialogs-and-custom-buttons.md) · [Writing plugins](docs/guide/writing-plugins.md)
- Reference: [options](docs/reference/options.md), [toolbar buttons](docs/reference/toolbar-buttons.md), [menu items](docs/reference/menu-items.md), [editor API](docs/reference/editor-api.md), [events](docs/reference/events.md), [dialog spec](docs/reference/dialog-spec.md), [compatibility matrix](docs/reference/compat-matrix.md)
- [Live demo](https://kastrack.github.io/kHtmlEditor/demo/) and [examples](https://kastrack.github.io/kHtmlEditor/examples/), including PHP and Node upload handlers.

The sources of the documentation pages are Markdown files in `docs-src/`; `npm run build:docs`
renders them to `docs/` (served by GitHub Pages).

## Development

```bash
npm install                 # Node 22, npm 11 (pinned via corepack)
npm run build               # dist/khtmleditor.js, .min.js, .esm.js, .tinymce-shim.js, skins/
npm run build:types         # dist/types/*.d.ts
npm test                    # Vitest unit tests (schema, sanitiser, serializer, XSS corpus)
npm run e2e                 # Playwright (chromium, firefox, webkit) including tests/compat
npm run build:docs          # docs-src/**/*.md -> docs/**/*.html
npm run sync-docs           # copy dist/ into docs/dist/ for GitHub Pages
```

Playwright browsers: `npx playwright install` (WebKit additionally needs
`sudo npx playwright install-deps webkit` on Linux).

## Compatibility notes

- Targets the TinyMCE 6 and 7/8 open-source API. `kHtmlEditor.majorVersion` is `'7'`; the real
  version is `kHtmlEditor.version`.
- Not included: `inline: true` (planned), the `accordion` plugin, and every TinyMCE premium feature.
- Extensions beyond TinyMCE: video/audio uploads (`media_upload_url`, `media_upload_handler`) and
  `code_view: 'inline'`.

See `CHANGELOG.md` for details and the compatibility matrix in the docs for the full list.

## License

MIT — see `LICENSE`.
