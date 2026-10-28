# kHtmlEditor

A from-scratch, dependency-free rich text HTML editor for the browser, built as a
**drop-in replacement for TinyMCE**. Keep your existing `tinymce.init({...})`
configuration, content API calls, custom toolbar buttons and image upload
endpoint — swap the script tag and rename the global.

> Status: pre-1.0, under active development. See `CHANGELOG.md`.

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

## Documentation

The documentation and live demo live in the `docs/` folder and are published with
GitHub Pages.

## License

MIT — see `LICENSE`.
