import type { Editor } from '../../core/Editor';
import type { ChoiceMenuItemSpec } from '../../core/UiTypes';
import { h, svgEl } from './Dom';
import { getIcon } from '../Icons';

/**
 * Colour palette handling: `color_map`, custom colours (persisted per editor in localStorage),
 * the swatch grid and the custom colour picker dialog.
 */
export const DEFAULT_COLOR_MAP = [
  '#BFEDD2', 'Light Green',
  '#FBEEB8', 'Light Yellow',
  '#F8CAC6', 'Light Red',
  '#ECCAFA', 'Light Purple',
  '#C2E0F4', 'Light Blue',
  '#2DC26B', 'Green',
  '#F1C40F', 'Yellow',
  '#E03E2D', 'Red',
  '#B96AD9', 'Purple',
  '#3598DB', 'Blue',
  '#169179', 'Dark Turquoise',
  '#E67E23', 'Orange',
  '#BA372A', 'Dark Red',
  '#843FA1', 'Dark Purple',
  '#236FA1', 'Dark Blue',
  '#ECF0F1', 'Light Gray',
  '#CED4D9', 'Medium Gray',
  '#95A5A6', 'Gray',
  '#7E8C8D', 'Dark Gray',
  '#34495E', 'Navy Blue',
  '#000000', 'Black',
  '#ffffff', 'White',
];

export interface ColorEntry {
  value: string;
  text: string;
}

const storageKey = (editor: Editor, id: string) => 'khtmleditor-custom-colors-' + id + '-' + (editor.options.get('color_default_foreground') ? '' : '');

export const getColorMap = (editor: Editor, id: 'forecolor' | 'hilitecolor' | string = 'forecolor'): ColorEntry[] => {
  const specific = editor.options.get(id === 'hilitecolor' ? 'color_map_background' : 'color_map_foreground') as string[] | undefined;
  const map = specific ?? ((editor.options.get('color_map') as string[] | undefined) || DEFAULT_COLOR_MAP);
  const out: ColorEntry[] = [];
  for (let i = 0; i < map.length; i += 2) {
    out.push({ value: map[i], text: map[i + 1] ?? map[i] });
  }
  return out;
};

export const getColorCols = (editor: Editor, id: string): number => {
  const specific = editor.options.get(id === 'hilitecolor' ? 'color_cols_background' : 'color_cols_foreground') as number | undefined;
  const cols = specific ?? (editor.options.get('color_cols') as number | undefined);
  if (cols && cols > 0) {
    return cols;
  }
  return Math.max(5, Math.round(Math.sqrt(getColorMap(editor, id).length)));
};

export const getCustomColors = (editor: Editor, id: string): string[] => {
  try {
    const raw = localStorage.getItem(storageKey(editor, id));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
};

export const addCustomColor = (editor: Editor, id: string, color: string): void => {
  const colors = getCustomColors(editor, id).filter((c) => c.toLowerCase() !== color.toLowerCase());
  colors.unshift(color);
  try {
    localStorage.setItem(storageKey(editor, id), JSON.stringify(colors.slice(0, 10)));
  } catch {
    /* storage unavailable */
  }
};

/** Builds the choice items for a colour menu including "Remove colour" and "Custom colour". */
export const colorMenuItems = (editor: Editor, id: string): ChoiceMenuItemSpec[] => {
  const items: ChoiceMenuItemSpec[] = getColorMap(editor, id).map((c) => ({ type: 'choiceitem', text: c.text, value: c.value, icon: 'checkmark' }));
  const custom = getCustomColors(editor, id);
  for (const c of custom) {
    items.push({ type: 'choiceitem', text: c, value: c, icon: 'checkmark' });
  }
  items.push({ type: 'choiceitem', text: 'Remove color', value: 'remove', icon: 'color-swatch-remove-color', meta: { special: 'remove' } });
  if (editor.options.get('custom_colors') !== false) {
    items.push({ type: 'choiceitem', text: 'Custom color', value: 'custom', icon: 'color-picker', meta: { special: 'custom' } });
  }
  return items;
};

const isDark = (hex: string): boolean => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) {
    return false;
  }
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
};

/** Renders the swatch grid for a colour menu. */
export const renderSwatches = (editor: Editor, items: ChoiceMenuItemSpec[], cols: number, current: string | null, onPick: (value: string, item: ChoiceMenuItemSpec) => void): HTMLElement => {
  const grid = h('div', { class: 'khe-swatches', role: 'listbox', 'aria-label': editor.translate('Colors') });
  grid.style.gridTemplateColumns = `repeat(${cols}, 22px)`;
  const swatches: HTMLElement[] = [];
  for (const item of items) {
    const special = (item.meta as any)?.special as string | undefined;
    const btn = h('button', { type: 'button', role: 'option', class: 'khe-swatch' + (special ? ' khe-swatch--' + special : ''), 'aria-label': editor.translate(item.text ?? item.value ?? ''), title: editor.translate(item.text ?? item.value ?? ''), tabindex: '-1' });
    if (!special) {
      btn.style.setProperty('--khe-swatch-color', item.value ?? '');
      if (current && item.value && current.toLowerCase() === item.value.toLowerCase()) {
        btn.classList.add('khe-swatch--selected');
        btn.setAttribute('aria-selected', 'true');
        const check = svgEl(getIcon('checkmark'));
        check.style.color = isDark(item.value) ? '#fff' : '#000';
        btn.appendChild(check);
      }
    } else {
      btn.appendChild(svgEl(getIcon(special === 'remove' ? 'color-swatch-remove-color' : 'color-picker')));
      if (special === 'custom') {
        btn.appendChild(document.createTextNode(editor.translate('Custom...')));
      }
    }
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => onPick(item.value ?? '', item));
    swatches.push(btn);
    grid.appendChild(btn);
  }
  grid.addEventListener('keydown', (e) => {
    const idx = swatches.indexOf(document.activeElement as HTMLElement);
    let next = idx;
    if (e.key === 'ArrowRight') {
      next = Math.min(swatches.length - 1, idx + 1);
    } else if (e.key === 'ArrowLeft') {
      next = Math.max(0, idx - 1);
    } else if (e.key === 'ArrowDown') {
      next = Math.min(swatches.length - 1, idx + cols);
    } else if (e.key === 'ArrowUp') {
      next = Math.max(0, idx - cols);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      (document.activeElement as HTMLElement)?.click();
      return;
    } else {
      return;
    }
    e.preventDefault();
    swatches[next]?.focus();
  });
  if (swatches[0]) {
    swatches[0].tabIndex = 0;
  }
  return grid;
};

/** Opens the custom colour dialog and resolves with the chosen hex colour. */
export const openCustomColorDialog = (editor: Editor, initial: string, onChoose: (color: string) => void): void => {
  editor.windowManager.open({
    title: 'Color Picker',
    size: 'normal',
    body: {
      type: 'panel',
      items: [{ type: 'colorpicker', name: 'colorpicker', label: 'Color' }],
    },
    buttons: [
      { type: 'cancel', name: 'cancel', text: 'Cancel' },
      { type: 'submit', name: 'save', text: 'Save', primary: true },
    ],
    initialData: { colorpicker: initial && /^#[0-9a-f]{6}$/i.test(initial) ? initial : '#000000' },
    onSubmit: (api) => {
      const value = (api.getData() as any).colorpicker as string;
      if (/^#[0-9a-f]{6}$/i.test(value)) {
        onChoose(value.toLowerCase());
        api.close();
      } else {
        editor.windowManager.alert(editor.translate('Invalid hex color code: {0}').replace('{0}', value));
      }
    },
  });
};
