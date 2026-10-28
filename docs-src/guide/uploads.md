---
title: Image and media uploads
description: Connecting the editor to your upload endpoint, handling paste and drop, and uploading video.
---
# Image and media uploads

## The contract

When an image is pasted, dropped, picked in the image dialog's Upload tab or inserted as a `data:` URI, it is held in a blob cache and uploaded:

- `POST` to `images_upload_url` as `multipart/form-data` with a single field named `file`.
- Cookies are sent when `images_upload_credentials: true`.
- The server answers `200` with JSON `{"location": "/uploads/abc.png"}`.
- The `src` of the image is replaced with the location, prefixed by `images_upload_base_path` when the location is relative.
- Any other status, or a non-JSON body, is reported in a notification and the image keeps its local data.

This is TinyMCE's contract, so an existing server-side handler keeps working. Reference implementations in PHP and Node are in the repository under `docs/examples/server/`.

```js
kHtmlEditor.init({
  selector: 'textarea',
  plugins: 'image media',
  images_upload_url: '/upload.php',
  images_upload_base_path: '/',
  images_upload_credentials: true,
  automatic_uploads: true,            // default: upload as soon as the image appears
  images_file_types: 'jpeg,jpg,png,gif,webp'
});
```

## Custom upload handler

Replace the XHR with your own code (for example to use `fetch`, signed URLs or a CDN). Return a promise that resolves with the URL; reject with a string or `{ message, remove: true }` to show an error and optionally remove the image.

```js
images_upload_handler: (blobInfo, progress) => fetch('/api/upload', {
  method: 'POST',
  body: blobInfo.blob(),
  headers: { 'Content-Type': blobInfo.blob().type, 'X-Filename': blobInfo.filename() }
}).then((r) => {
  if (!r.ok) { throw { message: 'Upload failed: ' + r.status, remove: true }; }
  return r.json().then((json) => json.url);
})
```

`blobInfo` exposes `id()`, `name()`, `filename()`, `blob()`, `base64()`, `blobUri()` and `uri()`.

## Manual uploads

With `automatic_uploads: false`, images stay as `data:` URIs in `getContent()` until you call:

```js
editor.uploadImages().then((results) => {
  // results: [{ element, status, uploadUri, blobInfo, removed }]
  form.submit();
});
```

The undo history is rewritten with the uploaded URLs so undo never brings a blob URL back.

## Video and audio (extension)

The media plugin's dialog gets an Upload tab when `media_upload_url` or `media_upload_handler` is set (it falls back to the image options). Dropped or pasted video and audio files become `<video>`/`<audio>` elements whose `<source>` is uploaded with the same contract.

```js
plugins: 'media',
media_upload_url: '/upload.php',
media_file_types: 'mp4,webm,mp3,ogg'
```

## The image dialog

`image_caption` enables figure captions, `image_advtab` the style/spacing tab, `image_uploadtab` the upload tab, `image_list` a dropdown of predefined images, `image_class_list` a class dropdown, `image_title` and `image_description` the title and alt fields, `image_dimensions` the size fields. `file_picker_callback(callback, value, meta)` adds a browse button to URL fields (`meta.filetype` is `'image'`, `'media'` or `'file'`).

Selected images can be resized by dragging the corner handles (`object_resizing`, `resize_img_proportional`). `ObjectResizeStart` can veto a resize and `ObjectResized` reports the new size.

## Paste and drop

Pasted content is cleaned according to its source: Microsoft Word markup becomes real lists and semantic inline elements, Google Docs wrappers are removed and styled spans are converted to `strong`/`em`/`u`, and Chrome/Safari inline styles are removed unless `paste_webkit_styles` lists properties to keep (`paste_remove_styles_if_webkit`). Plain text becomes paragraphs with `<br>` for single newlines (`paste_tab_spaces` controls tabs). `smart_paste` turns a pasted URL into a link or image.

- `paste_as_text: true` or the `pastetext` toolbar toggle (`mceTogglePlainTextPaste`) pastes plain text.
- `paste_data_images: false` ignores pasted image files.
- `paste_block_drop: true` ignores drops.
- `paste_preprocess(editor, args)` runs on the HTML string (`args.content`); `paste_postprocess(editor, args)` on the parsed node (`args.node`). The `PastePreProcess` and `PastePostProcess` events expose the same data and can be cancelled.
- Copying inside the editor marks the clipboard as internal so formatting survives a paste back into the editor unchanged.
