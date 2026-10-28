import { describe, it, expect } from 'vitest';
import { createSchema } from '../../../src/html/Schema';

describe('Schema', () => {
  it('has html5 defaults', () => {
    const s = createSchema();
    expect(s.isValid('p')).toBe(true);
    expect(s.isValid('p', 'class')).toBe(true);
    expect(s.isValid('p', 'onclick')).toBe(false);
    expect(s.isValid('p', 'data-anything')).toBe(true);
    expect(s.isValid('p', 'aria-label')).toBe(true);
    expect(s.isValid('script')).toBe(false);
    expect(s.isValid('svg')).toBe(false);
    expect(s.isValid('article')).toBe(true);
    expect(s.isValid('font')).toBe(true);
    expect(s.getElementRule('b')?.outputName).toBe('strong');
    expect(s.getElementRule('i')?.outputName).toBe('em');
  });

  it('knows children', () => {
    const s = createSchema();
    expect(s.isValidChild('p', 'strong')).toBe(true);
    expect(s.isValidChild('p', 'div')).toBe(false);
    expect(s.isValidChild('ul', 'li')).toBe(true);
    expect(s.isValidChild('ul', 'ul')).toBe(true);
    expect(s.isValidChild('ul', '#text')).toBe(false);
    expect(s.isValidChild('li', 'p')).toBe(true);
    expect(s.isValidChild('body', 'p')).toBe(true);
    expect(s.isValidChild('a', 'div')).toBe(true);
    expect(s.isValidChild('caption', 'table')).toBe(false);
  });

  it('classifies elements', () => {
    const s = createSchema();
    expect(s.isBlock('p')).toBe(true);
    expect(s.isBlock('li')).toBe(true);
    expect(s.isBlock('span')).toBe(false);
    expect(s.isInline('span')).toBe(true);
    expect(s.isInline('div')).toBe(false);
    expect(s.getVoidElements().br).toBeDefined();
    expect(s.getNonEmptyElements().img).toBeDefined();
    expect(s.getNonEmptyElements().td).toBeDefined();
    expect(s.getWhitespaceElements().pre).toBeDefined();
    expect(s.getBoolAttrs().checked).toBeDefined();
    expect(s.getTextBlockElements().h1).toBeDefined();
    expect(s.getTextInlineElements().strong).toBeDefined();
  });

  it('parses valid_elements rules', () => {
    const s = createSchema({ valid_elements: 'a[href|target=_blank|rel~noopener|!title],strong/b,-span[class],#p,div[align<left?right]' });
    expect(s.isValid('a', 'href')).toBe(true);
    expect(s.isValid('a', 'id')).toBe(false);
    expect(s.isValid('em')).toBe(false);
    expect(s.getElementRule('b')?.outputName).toBe('strong');
    expect(s.getElementRule('span')?.removeEmpty).toBe(true);
    expect(s.getElementRule('p')?.paddEmpty).toBe(true);
    const a = s.getElementRule('a')!;
    expect(a.attributesDefault).toEqual([{ name: 'target', value: '_blank' }]);
    expect(a.attributesForced).toEqual([{ name: 'rel', value: 'noopener' }]);
    expect(a.attributesRequired).toEqual(['title']);
    expect(s.getElementRule('div')?.attributes.align.validValues).toEqual({ left: {}, right: {} });
  });

  it('supports global @ rule and wildcards', () => {
    const s = createSchema({ valid_elements: '@[id|class],p,span[data-*],*[*]' });
    expect(s.isValid('p', 'id')).toBe(true);
    expect(s.isValid('span', 'data-x')).toBe(true);
    expect(s.isValid('custom-thing')).toBe(true);
    expect(s.isValid('custom-thing', 'anything')).toBe(true);
  });

  it('extends and invalidates', () => {
    const s = createSchema({ extended_valid_elements: 'script[src],my-tag[foo]', invalid_elements: 'em,u' });
    expect(s.isValid('script')).toBe(true);
    expect(s.isValid('my-tag', 'foo')).toBe(true);
    expect(s.isValid('em')).toBe(false);
    expect(s.isValid('u')).toBe(false);
  });

  it('adds custom elements', () => {
    const s = createSchema({ custom_elements: 'mycustom,~myinline' });
    expect(s.isValid('mycustom')).toBe(true);
    expect(s.isBlock('mycustom')).toBe(true);
    expect(s.isInline('myinline')).toBe(true);
    expect(s.isValidChild('body', 'mycustom')).toBe(true);
    expect(s.isValidChild('p', 'myinline')).toBe(true);
    expect(s.isValidChild('mycustom', 'p')).toBe(true);
    expect(s.getCustomElements()).toEqual({ mycustom: 'div', myinline: 'span' });
  });

  it('applies valid_children', () => {
    const s = createSchema({ valid_children: '-li[p],+p[div],body[section]' });
    expect(s.isValidChild('li', 'p')).toBe(false);
    expect(s.isValidChild('p', 'div')).toBe(true);
    expect(s.isValidChild('body', 'section')).toBe(true);
    expect(s.isValidChild('body', 'p')).toBe(false);
  });

  it('compiles style/class maps', () => {
    const s = createSchema({ valid_styles: { '*': 'color,font-size', a: 'text-decoration' }, valid_classes: 'a b', invalid_styles: 'color' });
    expect(s.getValidStyles()).toEqual({ '*': ['color', 'font-size'], a: ['text-decoration'] });
    expect(s.getValidClasses()).toEqual({ '*': { a: {}, b: {} } });
    expect(s.getInvalidStyles()).toEqual({ '*': { color: {} } });
  });

  it('supports html4 and strict schemas', () => {
    expect(createSchema({ schema: 'html4' }).isValid('article')).toBe(false);
    expect(createSchema({ schema: 'html4' }).isValid('center')).toBe(true);
    expect(createSchema({ schema: 'html5-strict' }).isValid('font')).toBe(false);
    expect(createSchema({ schema: 'html5-strict' }).isValid('p', 'align')).toBe(false);
  });
});
