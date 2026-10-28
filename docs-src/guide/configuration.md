---
title: Configuration
description: The options you will reach for first, and how options work.
---
# Configuration

Options are passed to `kHtmlEditor.init()` and can be read and changed at runtime through `editor.options`. Every option has a registered type and default; unknown options are kept so plugins and `setup` code can read them.

```js
kHtmlEditor.init({
  selector: 'textarea.rich',   // CSS selector, or `target: element`
  height: 400,                 // number of pixels or any CSS length
  min_height: 200,
  max_height: 800,
  plugins: 'lists link image table code',
  menubar: 'file edit view insert format tools table help',
  toolbar: 'undo redo | blocks | bold italic | link image table | code',
  placeholder: 'Start typing...',
  language: 'en',
  skin: 'oxide',               // or 'oxide-dark'
  content_css: 'default',      // 'default', 'dark', false, or URL(s)
  content_style: 'body { font-family: Georgia, serif; }',
  readonly: false,
  browser_spellcheck: true,
  setup: (editor) => {
    editor.on('init', () => console.log('ready'));
  }
});
```

## Reading and changing options

```js
editor.options.get('toolbar_mode');          // 'wrap'
editor.options.set('smart_paste', false);
editor.options.isRegistered('image_caption'); // true when the image plugin is loaded
editor.options.register('my_option', { processor: 'string', default: 'x' });
```

`editor.getParam(name)` and `editor.settings` are kept as deprecated aliases.

## Defaults for every editor

```js
kHtmlEditor.overrideDefaults({ height: 300, menubar: false, promotion: false });
```

## Common groups of options

| Area | Options |
|---|---|
| Surface | `height`, `width`, `min_height`, `max_height`, `resize`, `placeholder`, `auto_focus`, `readonly`, `disabled` |
| UI | `toolbar`, `toolbar_mode`, `toolbar_sticky`, `toolbar_location`, `toolbar_groups`, `menubar`, `menu`, `removed_menuitems`, `statusbar`, `elementpath`, `branding`, `contextmenu`, `skin`, `icons`, `ui_mode` |
| Formatting | `formats`, `style_formats`, `block_formats`, `font_family_formats`, `font_size_formats`, `line_height_formats`, `color_map`, `color_cols`, `custom_colors` |
| Content | `content_css`, `content_style`, `body_class`, `body_id`, `forced_root_block`, `keep_styles`, `text_patterns`, `inline_boundaries` |
| Filtering | `schema`, `valid_elements`, `extended_valid_elements`, `invalid_elements`, `valid_children`, `valid_styles`, `invalid_styles`, `valid_classes`, `custom_elements`, `protect` |
| Output | `entity_encoding`, `entities`, `element_format`, `indent`, `remove_trailing_brs`, `convert_urls`, `relative_urls`, `remove_script_host`, `urlconverter_callback` |
| Uploads | `images_upload_url`, `images_upload_handler`, `images_upload_base_path`, `images_upload_credentials`, `automatic_uploads`, `images_file_types`, `media_upload_url`, `media_upload_handler`, `media_file_types`, `file_picker_callback`, `file_picker_types` |
| Paste | `paste_as_text`, `paste_data_images`, `paste_block_drop`, `paste_preprocess`, `paste_postprocess`, `paste_webkit_styles`, `paste_remove_styles_if_webkit`, `smart_paste` |
| Forms | `hidden_input`, `add_form_submit_trigger`, `submit_patch`, `add_unload_trigger` |

The complete generated list, with types and defaults, is in the [options reference](../reference/options.html).

## Plugins

`plugins` accepts a space- or comma-separated string or an array. All plugins ship in the bundle; naming one simply activates it. `external_plugins` loads additional scripts by URL; each should call `kHtmlEditor.PluginManager.add(name, fn)` (or `tinymce.PluginManager.add` through the shim).

Available: `advlist anchor autolink autoresize autosave charmap code codesample directionality emoticons fullscreen help image importcss insertdatetime link lists media nonbreaking pagebreak preview quickbars save searchreplace table visualblocks visualchars wordcount`.

## Multiple editors

One `init()` call creates an editor for every element matched by `selector`. Address them with `kHtmlEditor.get(id)`, `kHtmlEditor.editors`, or `kHtmlEditor.activeEditor`.
