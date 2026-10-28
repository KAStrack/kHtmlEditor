---
title: Formats
description: The format model behind bold, blocks, alignment, custom styles and the Formats menu.
---
# Formats

A *format* describes how a style is represented in the document. The formatter applies, removes, toggles and matches formats by name; toolbar buttons, menu items, text patterns and the `formats` / `style_formats` options all speak this language. The model is TinyMCE's.

## Format kinds

```js
{ inline: 'strong' }                                            // wrap text in an inline element
{ inline: 'span', styles: { color: '%value' } }                 // with a variable
{ block: 'h1' }                                                 // rename the block
{ block: 'blockquote', wrapper: true }                          // wrap blocks
{ selector: 'img', styles: { float: 'left' }, collapsed: false } // style matching elements
{ selector: 'p,h1,h2,td', styles: { textAlign: 'center' } }
```

Common properties: `styles`, `attributes`, `classes` (space separated), `exact`, `remove: 'all' | 'none' | 'empty'`, `split`, `deep`, `expand`, `block_expand`, `wrapper`, `preview` (`false` or a list of CSS properties shown in menus), `onmatch`, `onformat`, `clear_child_styles`, `merge_siblings`, `merge_with_parents`, `ceFalseOverride`, `defaultBlock`. A format name can map to an array of variants; the first applicable one is used.

## Built-in formats

`bold`, `italic`, `underline`, `strikethrough`, `superscript`, `subscript`, `code`, `link`, `removeformat`, `forecolor`, `hilitecolor`, `fontname`, `fontsize`, `lineheight`, `lang`, `alignleft`, `aligncenter`, `alignright`, `alignjustify`, `p`, `h1`–`h6`, `div`, `address`, `pre`, `blockquote`, `valigntop`, `valignmiddle`, `valignbottom`, and the list formats used by the lists plugin.

## Custom formats

```js
formats: {
  highlight: { inline: 'mark', classes: 'highlight' },
  callout: { block: 'div', classes: 'callout', wrapper: true },
  smallcaps: { inline: 'span', styles: { fontVariant: 'small-caps' } }
},
style_formats: [
  { title: 'Highlight', format: 'highlight' },
  { title: 'Callout', format: 'callout' },
  { title: 'Inline', items: [
    { title: 'Small caps', format: 'smallcaps' },
    { title: 'Red text', inline: 'span', styles: { color: '#c00' } }   // inline definitions work too
  ] }
],
style_formats_merge: true,      // append to the default list instead of replacing it
style_formats_autohide: false   // hide formats that cannot be applied at the caret
```

Related options: `block_formats` (`'Paragraph=p; Heading 1=h1; …'`), `font_family_formats`, `font_size_formats`, `line_height_formats`, `color_map`, `preview_styles`, `keep_styles`, `inline_boundaries`, `inline_boundaries_selector`.

## API

```js
editor.formatter.register('highlight', { inline: 'mark' });
editor.formatter.apply('highlight');
editor.formatter.apply('forecolor', { value: '#c00' });
editor.formatter.remove('highlight');
editor.formatter.toggle('bold');
editor.formatter.match('bold');                 // true/false at the selection
editor.formatter.matchAll(['bold', 'italic']);  // ['bold']
editor.formatter.canApply('h1');
editor.formatter.formatChanged('bold', (state, data) => button.setActive(state)); // returns { unbind }
editor.formatter.getCssText('h1');              // preview CSS for menus
```

## Text patterns

Markdown-style patterns convert while typing (`text_patterns`): `*text*`, `**text**`, `` `code` `` inline; `#`–`######`, `*`/`-`, `1.`, `---` at the start of a line. `text_patterns_lookup` adds dynamic patterns.
