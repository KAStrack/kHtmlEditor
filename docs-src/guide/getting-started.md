---
title: Getting started
description: Install kHtmlEditor, initialise it on a textarea and read the content back.
---
# Getting started

<p class="lead">kHtmlEditor is a rich text HTML editor built from scratch as a drop-in replacement for TinyMCE. One script, no dependencies, MIT licensed.</p>

## Install

kHtmlEditor is one script. There is nothing else to load: the UI skin, the content stylesheet and every plugin are bundled. Load it from the jsDelivr CDN, pinned to a release tag:

```html
<script src="https://cdn.jsdelivr.net/gh/KAStrack/kHtmlEditor@v0.1.0/docs/dist/khtmleditor.min.js"></script>
```

or download [`docs/dist/khtmleditor.min.js`](https://github.com/KAStrack/kHtmlEditor/blob/main/docs/dist/khtmleditor.min.js) from the repository and serve it yourself:

```html
<script src="/js/khtmleditor.min.js"></script>
```

The TinyMCE shim, `khtmleditor.tinymce-shim.js`, sits in the same folder.

### Building from source

kHtmlEditor is not published to npm yet. For the ES module build and the TypeScript declarations, build it from a clone of the repository (Node 22):

```bash
npm install
npm run build && npm run build:types   # dist/khtmleditor.min.js, dist/khtmleditor.esm.js, dist/types/
```

```js
import kHtmlEditor from './dist/khtmleditor.esm.js';
```

## Initialise

Turn a textarea into an editor with `kHtmlEditor.init()`. The options are the same as TinyMCE's.

```html
<textarea id="editor"><p>Hello world</p></textarea>
<script>
  kHtmlEditor.init({
    selector: '#editor',
    height: 400,
    plugins: 'lists link image table code',
    toolbar: 'undo redo | blocks | bold italic | alignleft aligncenter alignright | bullist numlist | link image table | code'
  });
</script>
```

`init()` returns a promise that resolves with the created editors once they are ready.

## Read and write content

```js
const editor = kHtmlEditor.get('editor');   // by element id
editor.getContent();                          // '<p>Hello world</p>'
editor.setContent('<h1>Title</h1><p>Body</p>');
editor.insertContent('<strong>at the caret</strong>');
editor.getContent({ format: 'text' });        // plain text
```

Content is cleaned on the way in and on the way out: unknown elements, event handler attributes and dangerous URLs never reach the document. See [Sanitisation and output](sanitisation.html).

## Forms

When the textarea is inside a form, the editor writes its HTML back to the textarea when the form is submitted, so a normal `POST` works unchanged. Call `kHtmlEditor.triggerSave()` to do the same by hand (for example before an AJAX request).

## Next steps

- [Migrating from TinyMCE](migration-from-tinymce.html) if you have an existing integration.
- [Configuration](configuration.html) for the most common options.
- [Toolbar and menus](toolbar-and-menus.html) to shape the UI.
- [Image and media uploads](uploads.html) to connect your server.
- The [live demo](../demo/) and [examples](../examples/) to see it running.
