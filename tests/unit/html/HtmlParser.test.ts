import { describe, it, expect } from 'vitest';
import { createPipeline } from '../helpers/pipeline';

const { roundTrip, parser, serializer } = createPipeline();

const cases: Array<[string, string, string?]> = [
  ['two paragraphs get newline separated', '<p>a</p><p>b</p>', '<p>a</p>\n<p>b</p>'],
  ['loose text is wrapped in root block', 'text', '<p>text</p>'],
  ['inline at root is wrapped', '<b>x</b>', '<p><strong>x</strong></p>'],
  ['mixed root content', '<p>a</p>b<p>c</p>', '<p>a</p>\n<p>b</p>\n<p>c</p>'],
  ['br at root stays inline', 'a<br>b', '<p>a<br>b</p>'],
  ['trailing br is removed', '<p>a<br></p>', '<p>a</p>'],
  ['double trailing br is kept', '<p>a<br><br></p>', '<p>a<br><br></p>'],
  ['lonely br becomes nbsp', '<p><br></p>', '<p>&nbsp;</p>'],
  ['empty block is padded', '<p></p>', '<p>&nbsp;</p>'],
  ['empty inline in block', '<p><strong><em><br></em></strong></p>', '<p><strong><em>&nbsp;</em></strong></p>'],
  ['whitespace collapses', '<p>  a   b  </p>', '<p>a b</p>'],
  ['whitespace between blocks removed', '<p>a</p>\n\n  <p>b</p>', '<p>a</p>\n<p>b</p>'],
  ['space between inline elements kept', '<p><b>a</b> <i>b</i></p>', '<p><strong>a</strong> <em>b</em></p>'],
  ['space at inline edge inside block trimmed', '<p><b> a</b></p>', '<p><strong>a</strong></p>'],
  ['space before inline kept', '<p>a <b>b</b> c</p>', '<p>a <strong>b</strong> c</p>'],
  ['pre preserved', '<pre>  a\n  b</pre>', '<pre>  a\n  b</pre>'],
  ['empty span removed', '<span></span>', ''],
  ['attribute-less span unwrapped', '<p><span>a</span></p>', '<p>a</p>'],
  ['styled span kept', '<p><span style="color: red;">a</span></p>', '<p><span style="color: red;">a</span></p>'],
  ['style normalised and rgb to hex', '<p style="color:rgb(255, 0, 0)">a</p>', '<p style="color: #ff0000;">a</p>'],
  ['b and i converted', '<p><b>a</b><i>b</i></p>', '<p><strong>a</strong><em>b</em></p>'],
  ['font converted to span', '<font face="Arial" size="3" color="red">x</font>', '<p><span style="font-family: Arial; font-size: medium; color: red;">x</span></p>'],
  ['strike converted to s', '<p><strike>x</strike></p>', '<p><s>x</s></p>'],
  ['align attribute to style', '<p align="center">x</p>', '<p style="text-align: center;">x</p>'],
  ['img align to float', '<p><img src="a.png" align="left"></p>', '<p><img src="a.png" style="float: left;"></p>'],
  ['entities encoded named', '<p>café © a&nbsp;b &amp; c &lt; d</p>', '<p>caf&eacute; &copy; a&nbsp;b &amp; c &lt; d</p>'],
  ['data attributes kept', '<p data-foo="1" aria-label="x">a</p>', '<p data-foo="1" aria-label="x">a</p>'],
  ['unknown attributes removed', '<p foo="1">a</p>', '<p>a</p>'],
  ['named anchor kept', '<p><a name="x"></a>b</p>', '<p><a name="x"></a>b</p>'],
  ['empty anchor removed', '<p><a href="x"></a>b</p>', '<p>b</p>'],
  ['comments kept', '<p>a</p><!-- c --><p>b</p>', '<p>a</p>\n<!-- c -->\n<p>b</p>'],
  ['table gets tbody', '<table><tr><td>a</td></tr></table>', '<table>\n<tbody>\n<tr>\n<td>a</td>\n</tr>\n</tbody>\n</table>'],
  ['empty cell padded', '<table><tbody><tr><td></td></tr></tbody></table>', '<table>\n<tbody>\n<tr>\n<td>&nbsp;</td>\n</tr>\n</tbody>\n</table>'],
  ['lists', '<ul><li>a</li><li>b<ul><li>c</li></ul></li></ul>', '<ul>\n<li>a</li>\n<li>b<ul>\n<li>c</li>\n</ul></li>\n</ul>'],
  ['text in list wrapped in li', '<ul>text</ul>', '<ul>\n<li>text</li>\n</ul>'],
  ['loose li wrapped', '<li>a</li>', '<ul>\n<li>a</li>\n</ul>'],
  ['paragraph inside li allowed in html5', '<ul><li><p>a</p><p>b</p></li></ul>', '<ul>\n<li>\n<p>a</p>\n<p>b</p>\n</li>\n</ul>'],
  ['block inside heading split out', '<h1>a<div>b</div>c</h1>', '<h1>a</h1>\n<div>b</div>\n<h1>c</h1>'],
  ['p inside p (browser semantics)', '<p><div>x</div></p>', '<p>&nbsp;</p>\n<div>x</div>\n<p>&nbsp;</p>'],
  ['unknown element unwrapped', '<p><custom>a</custom></p>', '<p>a</p>'],
  ['boolean attributes', '<p><input type="checkbox" checked></p>', '<p><input type="checkbox" checked="checked"></p>'],
  ['div with br', '<div>a<br>b</div>', '<div>a<br>b</div>'],
  ['hr at root', '<hr>', '<hr>'],
  ['heading and paragraph', '<h2>Title</h2><p>Body</p>', '<h2>Title</h2>\n<p>Body</p>'],
  ['nbsp only paragraph kept', '<p>&nbsp;</p>', '<p>&nbsp;</p>'],
  ['img at root wrapped', '<img src="a.png" alt="">', '<p><img src="a.png" alt=""></p>'],
  ['blockquote', '<blockquote><p>a</p></blockquote>', '<blockquote>\n<p>a</p>\n</blockquote>'],
  ['figure', '<figure class="image"><img src="a.png"><figcaption>c</figcaption></figure>', '<figure class="image"><img src="a.png">\n<figcaption>c</figcaption>\n</figure>'],
  ['link target blank gets noopener', '<a href="http://x" target="_blank">x</a>', '<p><a href="http://x" target="_blank" rel="noopener">x</a></p>'],
  ['iframe sandboxed', '<iframe src="https://evil.com/"></iframe>', '<p><iframe src="https://evil.com/" sandbox=""></iframe></p>'],
  ['youtube iframe not sandboxed', '<iframe src="https://www.youtube.com/embed/x" width="560" height="315"></iframe>', '<p><iframe src="https://www.youtube.com/embed/x" width="560" height="315"></iframe></p>'],
  ['uppercase tags', '<P>a <B>b</B></P>', '<p>a <strong>b</strong></p>'],
  ['nested empty inline removed', '<p>a<span><span></span></span>b</p>', '<p>ab</p>'],
  ['data uri image kept', '<p><img src="data:image/png;base64,AAAA"></p>', '<p><img src="data:image/png;base64,AAAA"></p>'],
  ['stray head elements dropped', '<title>x</title><meta charset="utf-8"><p>a</p>', '<p>a</p>'],
];

describe('HtmlParser round trips', () => {
  for (const [name, input, expected] of cases) {
    it(name, () => {
      expect(roundTrip(input)).toBe(expected);
    });
  }

  it('is idempotent', () => {
    for (const [, input] of cases) {
      const once = roundTrip(input);
      expect(roundTrip(once)).toBe(once);
    }
  });

  it('honours forced_root_block false', () => {
    const p = createPipeline({ forced_root_block: false });
    expect(p.roundTrip('a<b>b</b>')).toBe('a<strong>b</strong>');
  });

  it('honours forced_root_block div with attrs', () => {
    const p = createPipeline({ forced_root_block: 'div', forced_root_block_attrs: { class: 'x' } });
    expect(p.roundTrip('text')).toBe('<div class="x">text</div>');
  });

  it('pads with br when configured', () => {
    const p = createPipeline({ pad_empty_with_br: true });
    expect(p.roundTrip('<p></p>')).toBe('<p><br></p>');
  });

  it('supports xhtml output and raw encoding', () => {
    const p = createPipeline({ element_format: 'xhtml', entity_encoding: 'raw' });
    expect(p.roundTrip('<p>a<br>é</p><img src="x">')).toBe('<p>a<br />é</p>\n<p><img src="x" /></p>');
  });

  it('supports no indent', () => {
    const p = createPipeline({ indent: false });
    expect(p.roundTrip('<p>a</p><p>b</p>')).toBe('<p>a</p><p>b</p>');
  });

  it('applies valid_elements', () => {
    const p = createPipeline({ valid_elements: 'p,strong,a[href]' });
    expect(p.roundTrip('<p class="x">a <em>b</em> <a href="y" title="t">c</a></p>')).toBe('<p>a b <a href="y">c</a></p>');
  });

  it('applies valid_children', () => {
    const p = createPipeline({ valid_children: '-li[p]' });
    expect(p.roundTrip('<ul><li><p>a</p></li></ul>')).toBe('<ul>\n<li>a</li>\n</ul>');
    expect(p.roundTrip('<ul><li><p>a</p><p>b</p></li></ul>')).toBe('<ul>\n<li>a</li>\n<li>b</li>\n</ul>');
  });

  it('applies invalid_elements', () => {
    const p = createPipeline({ invalid_elements: 'strong,em' });
    expect(p.roundTrip('<p><strong>a</strong> <em>b</em></p>')).toBe('<p>a b</p>');
  });

  it('applies valid_classes', () => {
    const p = createPipeline({ valid_classes: 'keep' });
    expect(p.roundTrip('<p class="keep drop">a</p><p class="drop">b</p>')).toBe('<p class="keep">a</p>\n<p>b</p>');
  });

  it('applies valid_styles', () => {
    const p = createPipeline({ valid_styles: { '*': 'color' } });
    expect(p.roundTrip('<p style="color: red; font-size: 1px;">a</p>')).toBe('<p style="color: red;">a</p>');
  });

  it('keeps custom elements', () => {
    const p = createPipeline({ custom_elements: 'my-block,~my-inline' });
    expect(p.roundTrip('<my-block>a <my-inline>b</my-inline></my-block>')).toBe('<my-block>a <my-inline>b</my-inline></my-block>');
  });

  it('parses in context', () => {
    const frag = parser.parse('<li>a</li>', { context: 'ul' });
    expect(serializer.serialize(frag, true)).toBe('<li>a</li>');
    const args = { context: 'p' };
    parser.parse('<div>a</div>', args);
    expect((args as any).invalid).toBe(true);
  });

  it('runs node and attribute filters', () => {
    const p = createPipeline();
    const seen: string[] = [];
    p.parser.addNodeFilter('img', (nodes, name) => {
      seen.push(name + ':' + nodes.length);
      nodes.forEach((n) => n.setAttribute('alt', 'filtered'));
    });
    p.parser.addAttributeFilter('data-x', (nodes, name) => {
      seen.push(name + ':' + nodes.length);
      nodes.forEach((n) => n.removeAttribute('data-x'));
    });
    expect(p.roundTrip('<p><img src="a"><img src="b" data-x="1"></p>')).toBe('<p><img src="a" alt="filtered"><img src="b" alt="filtered"></p>');
    expect(seen).toEqual(['img:2', 'data-x:1']);
  });

  it('filters an existing DOM subtree', () => {
    const doc = parser.getDocument();
    const div = doc.createElement('div');
    div.innerHTML = '<p>a<span></span></p><script>x</script>';
    parser.filter(div);
    expect(div.innerHTML).toBe('<p>a</p>');
  });
});
