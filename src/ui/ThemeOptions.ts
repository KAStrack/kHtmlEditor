import type { Editor } from '../core/Editor';
import { isString, isBoolean, isArray, isObject } from '../util/Type';

/** Theme level options (toolbar, menubar, skin, colours, formats dropdowns…) with TinyMCE defaults. */
export const registerThemeOptions = (editor: Editor): void => {
  const register = editor.options.register;
  const stringOrBool = (value: unknown) => (isString(value) || isBoolean(value) ? { valid: true as const, value } : { valid: false as const, message: 'Must be a string or boolean.' });
  const toolbarProcessor = (value: unknown) =>
    isString(value) || isBoolean(value) || (isArray(value) && value.every((v) => isString(v) || (isObject(v) && isArray((v as any).items)))) ? { valid: true as const, value } : { valid: false as const, message: 'Must be a string, boolean or array.' };

  register('menubar', { processor: stringOrBool, default: true });
  register('menu', { processor: 'object', default: {} });
  register('removed_menuitems', { processor: 'string', default: '' });
  register('toolbar', { processor: toolbarProcessor, default: true });
  for (let i = 1; i <= 9; i++) {
    register('toolbar' + i, { processor: 'string' });
  }
  register('toolbar_mode', { processor: (value: unknown) => (isString(value) && ['wrap', 'floating', 'sliding', 'scrolling'].includes(value) ? { valid: true, value } : { valid: false, message: 'Must be one of: wrap, floating, sliding, scrolling.' }), default: 'floating' });
  register('toolbar_sticky', { processor: 'boolean', default: false });
  register('toolbar_sticky_offset', { processor: 'number', default: 0 });
  register('toolbar_location', { processor: (value: unknown) => (isString(value) && ['top', 'bottom', 'auto'].includes(value) ? { valid: true, value } : { valid: false, message: 'Must be top, bottom or auto.' }), default: 'auto' });
  register('toolbar_groups', { processor: 'object', default: {} });
  register('toolbar_persist', { processor: 'boolean', default: false });
  register('fixed_toolbar_container', { processor: 'string', default: '' });
  register('ui_mode', { processor: 'string', default: 'combined' });
  register('statusbar', { processor: 'boolean', default: true });
  register('elementpath', { processor: 'boolean', default: true });
  register('resize', { processor: (value: unknown) => (isBoolean(value) || value === 'both' ? { valid: true, value } : { valid: false, message: 'Must be true, false or "both".' }), default: true });
  register('skin', { processor: stringOrBool, default: 'oxide' });
  register('skin_url', { processor: 'string' });
  register('contextmenu', { processor: (value: unknown) => (value === false || isString(value) || (isArray(value) && value.every(isString)) ? { valid: true, value: isArray(value) ? value.join(' ') : value } : { valid: false, message: 'Must be a string, array or false.' }), default: 'link linkchecker image editimage table spellchecker configurepermanentpen' });
  register('contextmenu_never_use_native', { processor: 'boolean', default: false });
  register('color_map', { processor: 'string[]' });
  register('color_map_foreground', { processor: 'string[]' });
  register('color_map_background', { processor: 'string[]' });
  register('color_cols', { processor: 'number' });
  register('color_cols_foreground', { processor: 'number' });
  register('color_cols_background', { processor: 'number' });
  register('custom_colors', { processor: 'boolean', default: true });
  register('color_default_foreground', { processor: 'string', default: '#000000' });
  register('color_default_background', { processor: 'string', default: '#FFFF00' });
  register('block_formats', { processor: 'string', default: 'Paragraph=p;Heading 1=h1;Heading 2=h2;Heading 3=h3;Heading 4=h4;Heading 5=h5;Heading 6=h6;Preformatted=pre' });
  register('font_family_formats', {
    processor: 'string',
    default:
      'Andale Mono=andale mono,monospace;Arial=arial,helvetica,sans-serif;Arial Black=arial black,sans-serif;Book Antiqua=book antiqua,palatino,serif;Comic Sans MS=comic sans ms,sans-serif;Courier New=courier new,courier,monospace;Georgia=georgia,palatino,serif;Helvetica=helvetica,arial,sans-serif;Impact=impact,sans-serif;Symbol=symbol;Tahoma=tahoma,arial,helvetica,sans-serif;Terminal=terminal,monaco,monospace;Times New Roman=times new roman,times,serif;Trebuchet MS=trebuchet ms,geneva,sans-serif;Verdana=verdana,geneva,sans-serif;Webdings=webdings;Wingdings=wingdings,zapf dingbats',
  });
  register('font_size_formats', { processor: 'string', default: '8pt 10pt 12pt 14pt 18pt 24pt 36pt' });
  register('font_size_input_default_unit', { processor: 'string', default: 'pt' });
  register('line_height_formats', { processor: 'string', default: '1 1.1 1.2 1.3 1.4 1.5 2' });
  register('style_formats', { processor: 'object[]' });
  register('style_formats_merge', { processor: 'boolean', default: false });
  register('style_formats_autohide', { processor: 'boolean', default: false });
  register('draggable_modal', { processor: 'boolean', default: false });
  register('help_accessibility', { processor: 'boolean', default: true });
  register('a11y_advanced_options', { processor: 'boolean', default: false });
};
