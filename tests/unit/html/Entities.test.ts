import { describe, it, expect } from 'vitest';
import { Entities } from '../../../src/html/Entities';

describe('Entities', () => {
  it('encodes base entities raw', () => {
    expect(Entities.encodeRaw('<a href="x">&</a>')).toBe('&lt;a href="x"&gt;&amp;&lt;/a&gt;');
    expect(Entities.encodeRaw('"x"', true)).toBe('&quot;x&quot;');
    expect(Entities.encodeAllRaw('<"\'&>')).toBe('&lt;&quot;&#39;&amp;&gt;');
  });

  it('encodes named entities by default list', () => {
    expect(Entities.encodeNamed('café   ©')).toBe('caf&eacute; &nbsp; &copy;');
    expect(Entities.encodeNamed('中')).toBe('中');
  });

  it('encodes numeric', () => {
    expect(Entities.encodeNumeric('é ')).toBe('&#233;&#160;');
    expect(Entities.encodeNumeric('😀')).toBe('&#128512;');
  });

  it('getEncodeFunc respects modes', () => {
    expect(Entities.getEncodeFunc('raw')('é<')).toBe('é&lt;');
    expect(Entities.getEncodeFunc('named')('é')).toBe('&eacute;');
    expect(Entities.getEncodeFunc('numeric')('é')).toBe('&#233;');
    expect(Entities.getEncodeFunc('named+numeric')('é中')).toBe('&eacute;&#20013;');
    expect(Entities.getEncodeFunc('named', '160,nbsp')('é ')).toBe('é&nbsp;');
  });

  it('decodes entities', () => {
    expect(Entities.decode('&lt;&amp;&#233;&#x41;&eacute;&nbsp;')).toBe('<&éAé ');
    expect(Entities.decode('&#128512;')).toBe('😀');
    expect(Entities.decode('&#150;')).toBe('–');
  });
});
