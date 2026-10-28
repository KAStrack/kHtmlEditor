/**
 * Normalises TinyMCE 4/5 option names and values to their 6/7 equivalents and strips options that
 * have no meaning here (cloud/licensing). Runs once on the raw init config.
 */
import { isString, isArray, isPlainObject } from '../util/Type';

const renamedOptions: Record<string, string> = {
  toolbar_drawer: 'toolbar_mode',
  insert_toolbar: 'quickbars_insert_toolbar',
  selection_toolbar: 'quickbars_selection_toolbar',
  font_formats: 'font_family_formats',
  fontsize_formats: 'font_size_formats',
  lineheight_formats: 'line_height_formats',
  paste_filter_drop: 'paste_block_drop',
  table_responsive_width: 'table_sizing_mode',
  gecko_spellcheck: 'browser_spellcheck',
};

const renamedButtons: Record<string, string> = {
  fontselect: 'fontfamily',
  fontsizeselect: 'fontsize',
  formatselect: 'blocks',
  styleselect: 'styles',
  lineheightselect: 'lineheight',
  mceimage: 'image',
  mcelink: 'link',
};

/** Plugins that no longer exist as separate plugins (merged into core or premium-only). */
export const removedPlugins: Record<string, string> = {
  paste: 'core',
  textcolor: 'core',
  colorpicker: 'core',
  contextmenu: 'core',
  hr: 'core',
  textpattern: 'core',
  print: 'core',
  noneditable: 'core',
  tabfocus: 'removed',
  legacyoutput: 'removed',
  bbcode: 'removed',
  spellchecker: 'premium',
  imagetools: 'premium',
  toc: 'premium',
  template: 'premium',
  fullpage: 'premium',
};

const renameTokens = (value: string): string => value.split(/(\s+|\|)/).map((token) => renamedButtons[token.toLowerCase()] ?? token).join('');

const renameToolbarButtons = (value: unknown): unknown => {
  if (isString(value)) {
    return renameTokens(value);
  }
  if (isArray(value)) {
    return value.map(renameToolbarButtons);
  }
  if (isPlainObject(value)) {
    const out: Record<string, any> = {};
    for (const k of Object.keys(value)) {
      out[k] = k === 'items' ? renameToolbarButtons(value[k]) : value[k];
    }
    return out;
  }
  return value;
};

export const normalizeOptions = (raw: Record<string, any>): Record<string, any> => {
  const out: Record<string, any> = {};
  for (const key of Object.keys(raw)) {
    const target = renamedOptions[key] ?? key;
    if (target !== key && raw[target] !== undefined) {
      continue;
    }
    out[target] = raw[key];
  }

  if (out.forced_root_block === false || out.forced_root_block === '') {
    out.forced_root_block = 'p';
  }

  for (const key of Object.keys(out)) {
    if (key === 'toolbar' || /^toolbar\d+$/.test(key) || key === 'quickbars_selection_toolbar' || key === 'quickbars_insert_toolbar' || key === 'quickbars_image_toolbar' || key === 'table_toolbar') {
      out[key] = renameToolbarButtons(out[key]);
    }
  }

  if (isPlainObject(out.menu)) {
    const menu: Record<string, any> = {};
    for (const k of Object.keys(out.menu)) {
      const m = out.menu[k];
      menu[k] = isPlainObject(m) && isString(m.items) ? { ...m, items: renameTokens(m.items) } : m;
    }
    out.menu = menu;
  }

  if (isString(out.plugins)) {
    out.plugins = out.plugins.split(/[\s,]+/).filter((p: string) => p.length > 0);
  }
  if (isArray(out.plugins)) {
    out.plugins = (out.plugins as unknown[]).flatMap((p) => (isString(p) ? p.split(/[\s,]+/) : [])).filter((p: string) => p.length > 0);
  }

  if (out.content_css === 'false') {
    out.content_css = false;
  }

  return out;
};

export const describeRemovedPlugin = (name: string): string | null => {
  const where = removedPlugins[name];
  if (!where) {
    return null;
  }
  if (where === 'core') {
    return `The "${name}" plugin is now part of the core and no longer needs to be loaded.`;
  }
  if (where === 'premium') {
    return `The "${name}" plugin is a TinyMCE premium feature and is not available in kHtmlEditor.`;
  }
  return `The "${name}" plugin has been removed and is ignored.`;
};
