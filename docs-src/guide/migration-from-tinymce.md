---
title: Migrating from TinyMCE
description: Replace TinyMCE with kHtmlEditor without changing your configuration.
---
# Migrating from TinyMCE

<p class="lead">kHtmlEditor implements TinyMCE's configuration, content API, event model, UI registry and dialog specification. For most sites migration is a script tag swap.</p>

## Option A: rename the global

Replace the TinyMCE script with `khtmleditor.min.js` and change `tinymce.init` to `kHtmlEditor.init`. Everything inside the configuration object stays as it is.

```html
<!-- before -->
<script src="https://cdn.tiny.cloud/1/your-key/tinymce/7/tinymce.min.js"></script>
<script>tinymce.init({ selector: 'textarea', plugins: 'lists link image table' });</script>

<!-- after -->
<script src="/js/khtmleditor.min.js"></script>
<script>kHtmlEditor.init({ selector: 'textarea', plugins: 'lists link image table' });</script>
```

## Option B: the shim (zero code changes)

Load the shim after the main script. It aliases `window.tinymce` and `window.tinyMCE` to `kHtmlEditor`, so untouched integrations, custom plugins registered with `tinymce.PluginManager.add()` and third-party code calling `tinymce.get()` keep working.

```html
<script src="/js/khtmleditor.min.js"></script>
<script src="/js/khtmleditor.tinymce-shim.js"></script>
```

The shim refuses to override a real TinyMCE global if one is already present, so loading both by accident does not break anything.

## What stays the same

- **Options**: every open-source TinyMCE 6/7 option name, including `toolbar`, `menubar`, `plugins`, `content_css`, `valid_elements`, `images_upload_url`, `file_picker_callback`, `setup`, `init_instance_callback`. See the [options reference](../reference/options.html).
- **Toolbar syntax**: `'undo redo | bold italic'`, arrays, `toolbar1..9`, `toolbar_mode`, `toolbar_sticky`, `toolbar_groups`.
- **Editor API**: `getContent`, `setContent`, `insertContent`, `execCommand`, `queryCommandState`, `on`/`off`/`dispatch` (and `fire`), `selection`, `dom`, `formatter`, `undoManager`, `windowManager`, `notificationManager`, `uploadImages`, `isDirty`, `save`, `remove` and the rest of the [Editor API](../reference/editor-api.html).
- **UI registry**: `editor.ui.registry.addButton`, `addToggleButton`, `addMenuButton`, `addSplitButton`, `addMenuItem`, `addNestedMenuItem`, `addToggleMenuItem`, `addContextToolbar`, `addContextForm`, `addContextMenu`, `addAutocompleter`, `addIcon`.
- **Dialogs**: `editor.windowManager.open(spec)` with panels, tab panels and every component type listed in the [dialog specification](../reference/dialog-spec.html); `alert`, `confirm`, `openUrl`.
- **Upload contract**: multipart `POST` with a `file` field answered with `{"location": "..."}`, `images_upload_handler(blobInfo, progress)`, `automatic_uploads`, `images_upload_base_path`, `images_upload_credentials`.
- **Events**: `init`, `change`, `input`, `NodeChange`, `SetContent`, `GetContent`, `PastePreProcess`, `ExecCommand`, `ObjectResized`, `TableModified`, and so on. See [Events](../reference/events.html).
- **Markup**: internal attributes use TinyMCE's `data-mce-*` names and the content body carries `mce-content-body`, so existing content CSS and plugin code keep matching.

## Deprecated names are translated

TinyMCE 4/5 option and button names are mapped to their 6/7 equivalents with a console warning: `toolbar_drawer`, `font_formats`, `fontsize_formats`, `lineheight_formats`, `paste_filter_drop`, `fontselect`, `fontsizeselect`, `formatselect`, `styleselect`, `lineheightselect`. Plugins that TinyMCE merged into the core (`paste`, `textcolor`, `colorpicker`, `contextmenu`, `hr`, `textpattern`, `print`, `noneditable`) are accepted and ignored; premium-only plugin names produce a warning and are skipped.

## Differences to know about

- There is no cloud, licence key or `promotion` banner. `license_key`, `promotion`, `branding` (default on, points at this project) and `cloud_*` options are accepted and ignored where meaningless.
- `inline: true` is not available yet (planned). Every editor renders in an iframe.
- Premium plugins (comments, AI, PowerPaste, spell checker, export, mentions, etc.) are not available. `accordion` is not included yet.
- `kHtmlEditor.majorVersion` reports `'7'` (the API emulated); the real version is `kHtmlEditor.version`.
- `code_view: 'inline'` is an extension: the source code button can swap the editing area for a textarea instead of opening a dialog.
- Video and audio file uploads are an extension: `media_upload_url` / `media_upload_handler` (falling back to the image options).

## Verifying a migration

The repository's `tests/compat/` folder runs real `tinymce.init({...})` configurations through the shim with Playwright. Drop copies of your own configurations into `tests/compat/configs/` to cover them. See the [compatibility matrix](../reference/compat-matrix.html) for the complete list of options, buttons and events.
