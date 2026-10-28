import { describe, it, expect } from 'vitest';
import { createStyles } from '../../../src/html/StyleParser';
import { createSchema } from '../../../src/html/Schema';

describe('StyleParser', () => {
  const styles = createStyles({});

  it('parses and serialises', () => {
    expect(styles.parse('color:red;font-size: 12px')).toEqual({ color: 'red', 'font-size': '12px' });
    expect(styles.serialize({ color: 'red', 'font-size': '12px' })).toBe('color: red; font-size: 12px;');
    expect(styles.serialize(styles.parse('  color : red ;; '))).toBe('color: red;');
  });

  it('converts rgb to hex', () => {
    expect(styles.parse('color: rgb(255, 0, 0)')).toEqual({ color: '#ff0000' });
    expect(styles.parse('color: rgba(255, 0, 0, 0.5)')).toEqual({ color: 'rgba(255, 0, 0, 0.5)' });
  });

  it('handles urls and quotes', () => {
    expect(styles.parse('background-image: url( "a;b.png" )')).toEqual({ 'background-image': "url('a;b.png')" });
    expect(styles.parse("font-family: 'Times New Roman', serif")).toEqual({ 'font-family': "'Times New Roman', serif" });
    expect(styles.parse('background: url(javascript:alert(1))')).toEqual({});
    expect(styles.parse('background: url("java\\73 cript:alert(1)")')).toEqual({});
    expect(styles.parse('background: url("\\6A avascript:alert(1)")')).toEqual({});
    expect(styles.parse('background: url(data:image/png;base64,AAAA)')).toEqual({ background: "url('data:image/png;base64,AAAA')" });
  });

  it('drops dangerous values', () => {
    expect(styles.parse('width: expression(alert(1))')).toEqual({});
    expect(styles.parse('behavior: url(x.htc)')).toEqual({});
    expect(styles.parse('-moz-binding: url(x.xml#x)')).toEqual({});
    expect(styles.parse('color: red; xss: \\65 xpression(alert(1))')).toEqual({ color: 'red' });
  });

  it('respects valid_styles and invalid_styles', () => {
    const schema = createSchema({ valid_styles: { '*': 'color', a: 'text-decoration' } });
    const s = createStyles({}, schema);
    expect(s.serialize({ color: 'red', 'font-size': '1px', 'text-decoration': 'underline' }, 'a')).toBe('color: red; text-decoration: underline;');
    expect(s.serialize({ color: 'red', 'font-size': '1px' }, 'p')).toBe('color: red;');
    const schema2 = createSchema({ invalid_styles: { '*': 'color', p: 'margin' } });
    const s2 = createStyles({}, schema2);
    expect(s2.serialize({ color: 'red', margin: '0', padding: '1px' }, 'p')).toBe('padding: 1px;');
    expect(s2.serialize({ color: 'red', margin: '0' }, 'span')).toBe('margin: 0;');
  });

  it('uses url converter', () => {
    const s = createStyles({ url_converter: (url) => 'converted/' + url });
    expect(s.parse('background: url(a.png)')).toEqual({ background: "url('converted/a.png')" });
  });
});
