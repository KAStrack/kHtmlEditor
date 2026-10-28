import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPipeline } from '../helpers/pipeline';

interface Vector {
  name: string;
  input: string;
  forbidden: string[];
  required?: string[];
}

const vectors: Vector[] = JSON.parse(readFileSync(resolve(__dirname, '../../xss/vectors.json'), 'utf8'));
const { roundTrip } = createPipeline();

describe('XSS corpus', () => {
  for (const v of vectors) {
    it(v.name, () => {
      const out = roundTrip(v.input);
      const lower = out.toLowerCase();
      for (const f of v.forbidden) {
        expect(lower, `output contained ${JSON.stringify(f)}: ${out}`).not.toContain(f.toLowerCase());
      }
      for (const r of v.required ?? []) {
        expect(out, `output missing ${JSON.stringify(r)}: ${out}`).toContain(r);
      }
      // Sanitisation must be idempotent.
      expect(roundTrip(out)).toBe(out);
      // No event handler attributes of any kind.
      expect(out).not.toMatch(/\son[a-z]+\s*=/i);
    });
  }

  it('honours allow_script_urls', () => {
    const p = createPipeline({ allow_script_urls: true });
    expect(p.roundTrip('<a href="javascript:void(0)">x</a>')).toBe('<p><a href="javascript:void(0)">x</a></p>');
  });

  it('honours allow_html_data_urls', () => {
    const p = createPipeline({ allow_html_data_urls: true });
    expect(p.roundTrip('<a href="data:text/plain,hi">x</a>')).toBe('<p><a href="data:text/plain,hi">x</a></p>');
  });

  it('honours allow_unsafe_link_target', () => {
    const p = createPipeline({ allow_unsafe_link_target: true });
    expect(p.roundTrip('<a href="http://x" target="_blank">x</a>')).toBe('<p><a href="http://x" target="_blank">x</a></p>');
  });

  it('honours sandbox_iframes false', () => {
    const p = createPipeline({ sandbox_iframes: false });
    expect(p.roundTrip('<iframe src="https://example.com/"></iframe>')).toBe('<p><iframe src="https://example.com/"></iframe></p>');
  });

  it('honours sandbox_iframes_exclusions', () => {
    const p = createPipeline({ sandbox_iframes_exclusions: ['example.com'] });
    expect(p.roundTrip('<iframe src="https://www.example.com/"></iframe>')).toBe('<p><iframe src="https://www.example.com/"></iframe></p>');
    expect(p.roundTrip('<iframe src="https://youtube.com/embed/x"></iframe>')).toBe('<p><iframe src="https://youtube.com/embed/x" sandbox=""></iframe></p>');
  });

  it('allows svg data uris on img by default but not when disabled', () => {
    expect(roundTrip('<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">')).toContain('data:image/svg');
    const p = createPipeline({ allow_svg_data_urls: false });
    expect(p.roundTrip('<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">')).toBe('<p><img></p>');
  });

  it('keeps svg only when explicitly allowed and still strips scripts', () => {
    const p = createPipeline({ extended_valid_elements: 'svg[*],circle[*],script[*]' });
    const out = p.roundTrip('<svg viewBox="0 0 10 10"><circle r="1" onclick="alert(1)"></circle><script>alert(1)</script></svg>');
    expect(out).toContain('<svg');
    expect(out).toContain('<circle');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('onclick');
  });

  it('allows comments with html when configured', () => {
    const p = createPipeline({ allow_html_in_comments: true });
    expect(p.roundTrip('<p>a</p><!-- <b>x</b> -->')).toBe('<p>a</p>\n<!-- <b>x</b> -->');
  });
});
