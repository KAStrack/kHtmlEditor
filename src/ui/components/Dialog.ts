import type { Editor } from '../../core/Editor';
import type { DialogSpec, DialogInstanceApi, WindowParams, WindowManagerImpl, UrlDialogSpec, UrlDialogInstanceApi } from '../../core/WindowManager';
import { h, svgEl, empty, focusable, uniqueId, isMobile } from './Dom';
import { getIcon } from '../Icons';
import { openPopup, PopupHandle } from './Popup';
import { openMenu, MenuItemLike } from './Menu';
import { renderSwatches, colorMenuItems, getColorCols, openCustomColorDialog, addCustomColor } from './ColorSwatches';
import { isString, isFunction, isArray, isObject } from '../../util/Type';

/**
 * Renders TinyMCE's declarative dialog specification (`editor.windowManager.open(spec)`).
 */

interface FieldHandle {
  name: string;
  el: HTMLElement;
  getValue: () => any;
  setValue: (v: any) => void;
  setEnabled: (state: boolean) => void;
  focus: () => void;
}

interface DialogContext {
  editor: Editor;
  themeRoot: () => HTMLElement | null;
  api: DialogInstanceApi<any>;
  fields: Map<string, FieldHandle>;
  onChange: (name: string) => void;
  onAction: (name: string, value?: any) => void;
  getData: () => Record<string, any>;
  submit: () => void;
  isInline: boolean;
}

const translate = (editor: Editor, text: any): string => (text === undefined || text === null ? '' : editor.translate(text));

const labelFor = (ctx: DialogContext, item: { label?: string; name?: string }, control: HTMLElement, inline = false): HTMLElement => {
  const field = h('div', { class: 'khe-field' + (inline ? ' khe-field--inline' : '') });
  if (item.label) {
    const id = control.id || (control.id = uniqueId('khe-field'));
    const label = h('label', { class: 'khe-label', for: id }, translate(ctx.editor, item.label));
    if (inline) {
      field.appendChild(control);
      field.appendChild(label);
    } else {
      field.appendChild(label);
      field.appendChild(control);
    }
  } else {
    field.appendChild(control);
  }
  return field;
};

const setControlEnabled = (el: HTMLElement, state: boolean) => {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el instanceof HTMLButtonElement) {
    el.disabled = !state;
  } else {
    el.querySelectorAll<HTMLElement>('input, textarea, select, button').forEach((c) => ((c as HTMLInputElement).disabled = !state));
  }
};

const renderInput = (ctx: DialogContext, item: any): HTMLElement => {
  const input = h('input', { type: 'text', class: 'khe-input', name: item.name, placeholder: item.placeholder ? translate(ctx.editor, item.placeholder) : null, inputmode: item.inputMode ?? null }) as HTMLInputElement;
  if (item.maximized) {
    input.classList.add('khe-input--maximized');
  }
  if (item.enabled === false) {
    input.disabled = true;
  }
  input.addEventListener('input', () => ctx.onChange(item.name));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      ctx.submit();
    }
  });
  ctx.fields.set(item.name, {
    name: item.name,
    el: input,
    getValue: () => input.value,
    setValue: (v) => {
      input.value = v === undefined || v === null ? '' : String(v);
    },
    setEnabled: (s) => (input.disabled = !s),
    focus: () => input.focus(),
  });
  return labelFor(ctx, item, input);
};

const renderTextarea = (ctx: DialogContext, item: any, monospace = false): HTMLElement => {
  const ta = h('textarea', { class: 'khe-textarea' + (monospace ? ' khe-textarea--code' : '') + (item.maximized ? ' khe-textarea--maximized' : ''), name: item.name, placeholder: item.placeholder ? translate(ctx.editor, item.placeholder) : null, spellcheck: monospace ? 'false' : null }) as HTMLTextAreaElement;
  if (item.enabled === false) {
    ta.disabled = true;
  }
  ta.addEventListener('input', () => ctx.onChange(item.name));
  ctx.fields.set(item.name, {
    name: item.name,
    el: ta,
    getValue: () => ta.value,
    setValue: (v) => {
      ta.value = v === undefined || v === null ? '' : String(v);
    },
    setEnabled: (s) => (ta.disabled = !s),
    focus: () => ta.focus(),
  });
  const field = labelFor(ctx, item, ta);
  if (item.maximized) {
    field.style.flex = '1 1 auto';
    field.style.display = 'flex';
    field.style.flexDirection = 'column';
  }
  return field;
};

const renderSelect = (ctx: DialogContext, item: any): HTMLElement => {
  const select = h('select', { class: 'khe-select', name: item.name, size: item.size && item.size > 1 ? String(item.size) : null }) as HTMLSelectElement;
  const addItems = (parent: HTMLSelectElement | HTMLOptGroupElement, items: any[]) => {
    for (const opt of items || []) {
      if (opt.items) {
        const group = h('optgroup', { label: translate(ctx.editor, opt.text) }) as HTMLOptGroupElement;
        addItems(group, opt.items);
        parent.appendChild(group);
      } else {
        parent.appendChild(h('option', { value: opt.value }, translate(ctx.editor, opt.text)));
      }
    }
  };
  addItems(select, item.items);
  if (item.enabled === false) {
    select.disabled = true;
  }
  select.addEventListener('change', () => ctx.onChange(item.name));
  ctx.fields.set(item.name, {
    name: item.name,
    el: select,
    getValue: () => select.value,
    setValue: (v) => {
      select.value = v === undefined || v === null ? '' : String(v);
      if (select.value !== String(v ?? '') && select.options.length) {
        // Unknown value: keep first option selected.
        select.selectedIndex = 0;
      }
    },
    setEnabled: (s) => (select.disabled = !s),
    focus: () => select.focus(),
  });
  return labelFor(ctx, item, select);
};

const renderCheckbox = (ctx: DialogContext, item: any): HTMLElement => {
  const input = h('input', { type: 'checkbox', name: item.name }) as HTMLInputElement;
  if (item.enabled === false) {
    input.disabled = true;
  }
  input.addEventListener('change', () => ctx.onChange(item.name));
  const label = h('label', { class: 'khe-checkbox' }, input, h('span', {}, translate(ctx.editor, item.label)));
  ctx.fields.set(item.name, {
    name: item.name,
    el: input,
    getValue: () => input.checked,
    setValue: (v) => (input.checked = !!v),
    setEnabled: (s) => (input.disabled = !s),
    focus: () => input.focus(),
  });
  return label;
};

const renderUrlInput = (ctx: DialogContext, item: any): HTMLElement => {
  const { editor } = ctx;
  const input = h('input', { type: 'url', class: 'khe-input', name: item.name, inputmode: 'url', placeholder: item.placeholder ? translate(editor, item.placeholder) : null }) as HTMLInputElement;
  let meta: Record<string, any> = {};
  const wrap = h('div', { class: 'khe-urlinput' }, input);
  const filetype = item.filetype || 'file';
  const picker = editor.options.get('file_picker_callback') as ((cb: (url: string, meta?: Record<string, any>) => void, value: string, meta: Record<string, any>) => void) | undefined;
  const types = editor.options.get('file_picker_types') as string | undefined;
  const allowed = !types || types.split(/[\s,]+/).includes(filetype);
  if (isFunction(picker) && allowed) {
    const browse = h('button', { type: 'button', class: 'khe-button khe-button--icon', 'aria-label': translate(editor, 'Browse for an image'), title: translate(editor, 'Browse files') });
    browse.appendChild(svgEl(getIcon('browse')));
    browse.addEventListener('click', () => {
      picker.call(
        editor,
        (url, pickedMeta) => {
          input.value = url;
          meta = { ...(pickedMeta || {}) };
          ctx.onChange(item.name);
        },
        input.value,
        { filetype, fieldname: item.name, ...ctx.getData() },
      );
    });
    wrap.appendChild(browse);
  }
  if (item.enabled === false) {
    input.disabled = true;
  }
  input.addEventListener('input', () => {
    meta = {};
    ctx.onChange(item.name);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      ctx.submit();
    }
  });
  ctx.fields.set(item.name, {
    name: item.name,
    el: wrap,
    getValue: () => ({ value: input.value, meta }),
    setValue: (v) => {
      if (isObject(v)) {
        input.value = v.value ?? '';
        meta = v.meta ?? {};
      } else {
        input.value = v === undefined || v === null ? '' : String(v);
        meta = {};
      }
    },
    setEnabled: (s) => setControlEnabled(wrap, s),
    focus: () => input.focus(),
  });
  return labelFor(ctx, item, wrap);
};

const renderSizeInput = (ctx: DialogContext, item: any): HTMLElement => {
  const { editor } = ctx;
  const width = h('input', { type: 'text', class: 'khe-input', 'aria-label': translate(editor, 'Width'), inputmode: 'numeric' }) as HTMLInputElement;
  const height = h('input', { type: 'text', class: 'khe-input', 'aria-label': translate(editor, 'Height'), inputmode: 'numeric' }) as HTMLInputElement;
  let constrain = item.constrain !== false;
  const lock = h('button', { type: 'button', class: 'khe-button khe-button--icon' + (constrain ? ' khe-button--active' : ''), 'aria-pressed': String(constrain), 'aria-label': translate(editor, 'Constrain proportions'), title: translate(editor, 'Constrain proportions') });
  const setLockIcon = () => {
    empty(lock);
    lock.appendChild(svgEl(getIcon(constrain ? 'lock' : 'unlock')));
  };
  setLockIcon();
  lock.addEventListener('click', () => {
    constrain = !constrain;
    lock.classList.toggle('khe-button--active', constrain);
    lock.setAttribute('aria-pressed', String(constrain));
    setLockIcon();
  });
  let ratio: number | null = null;
  const parse = (v: string): { num: number; unit: string } | null => {
    const m = /^\s*([\d.]+)\s*([a-z%]*)\s*$/i.exec(v);
    return m ? { num: parseFloat(m[1]), unit: m[2] } : null;
  };
  const updateRatio = () => {
    const w = parse(width.value);
    const hh = parse(height.value);
    ratio = w && hh && w.num > 0 && hh.num > 0 ? w.num / hh.num : null;
  };
  width.addEventListener('input', () => {
    if (constrain && ratio) {
      const w = parse(width.value);
      if (w) {
        height.value = Math.round(w.num / ratio) + (w.unit || (parse(height.value)?.unit ?? ''));
      }
    }
    ctx.onChange(item.name);
  });
  height.addEventListener('input', () => {
    if (constrain && ratio) {
      const hh = parse(height.value);
      if (hh) {
        width.value = Math.round(hh.num * ratio) + (hh.unit || (parse(width.value)?.unit ?? ''));
      }
    }
    ctx.onChange(item.name);
  });
  width.addEventListener('blur', updateRatio);
  height.addEventListener('blur', updateRatio);
  const wrap = h('div', { class: 'khe-sizeinput' }, width, h('span', { class: 'khe-sizeinput__x', 'aria-hidden': 'true' }, '×'), height, lock);
  ctx.fields.set(item.name, {
    name: item.name,
    el: wrap,
    getValue: () => ({ width: width.value, height: height.value }),
    setValue: (v) => {
      width.value = v?.width ?? '';
      height.value = v?.height ?? '';
      updateRatio();
    },
    setEnabled: (s) => setControlEnabled(wrap, s),
    focus: () => width.focus(),
  });
  return labelFor(ctx, item, wrap);
};

const renderColorInput = (ctx: DialogContext, item: any): HTMLElement => {
  const { editor } = ctx;
  const input = h('input', { type: 'text', class: 'khe-input', name: item.name, placeholder: '#000000' }) as HTMLInputElement;
  const swatch = h('button', { type: 'button', class: 'khe-colorinput__swatch', 'aria-label': translate(editor, 'Choose color') });
  const wrap = h('div', { class: 'khe-colorinput' }, input, swatch);
  const update = () => {
    swatch.style.setProperty('--khe-swatch-color', input.value || 'transparent');
  };
  input.addEventListener('input', () => {
    update();
    ctx.onChange(item.name);
  });
  let popup: PopupHandle | null = null;
  swatch.addEventListener('click', () => {
    if (popup) {
      popup.close();
      return;
    }
    const storage = item.storageKey || 'default';
    const items = colorMenuItems(editor, storage);
    const grid = renderSwatches(editor, items, getColorCols(editor, storage), input.value || null, (value, picked) => {
      popup?.close();
      const special = (picked.meta as any)?.special;
      if (special === 'custom') {
        openCustomColorDialog(editor, input.value, (color) => {
          addCustomColor(editor, storage, color);
          input.value = color;
          update();
          ctx.onChange(item.name);
        });
        return;
      }
      input.value = special === 'remove' ? '' : value;
      update();
      ctx.onChange(item.name);
    });
    popup = openPopup({
      anchor: swatch,
      content: grid,
      themeRoot: ctx.themeRoot(),
      onClose: () => {
        popup = null;
      },
    });
    (grid.querySelector('.khe-swatch') as HTMLElement | null)?.focus();
  });
  ctx.fields.set(item.name, {
    name: item.name,
    el: wrap,
    getValue: () => input.value,
    setValue: (v) => {
      input.value = v ?? '';
      update();
    },
    setEnabled: (s) => setControlEnabled(wrap, s),
    focus: () => input.focus(),
  });
  return labelFor(ctx, item, wrap);
};

const hsvToHex = (hue: number, s: number, v: number): string => {
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) {
    [r, g, b] = [c, x, 0];
  } else if (hue < 120) {
    [r, g, b] = [x, c, 0];
  } else if (hue < 180) {
    [r, g, b] = [0, c, x];
  } else if (hue < 240) {
    [r, g, b] = [0, x, c];
  } else if (hue < 300) {
    [r, g, b] = [x, 0, c];
  } else {
    [r, g, b] = [c, 0, x];
  }
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
};

const hexToHsv = (hex: string): { h: number; s: number; v: number } | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) {
    return null;
  }
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let hue = 0;
  if (d !== 0) {
    if (max === r) {
      hue = ((g - b) / d) % 6;
    } else if (max === g) {
      hue = (b - r) / d + 2;
    } else {
      hue = (r - g) / d + 4;
    }
    hue *= 60;
    if (hue < 0) {
      hue += 360;
    }
  }
  return { h: hue, s: max === 0 ? 0 : d / max, v: max };
};

const renderColorPicker = (ctx: DialogContext, item: any): HTMLElement => {
  const { editor } = ctx;
  let hsv = { h: 0, s: 1, v: 1 };
  const area = h('div', { class: 'khe-color-picker__area', role: 'slider', 'aria-label': translate(editor, 'Saturation and brightness'), tabindex: '0' });
  const areaThumb = h('div', { class: 'khe-color-picker__thumb' });
  area.appendChild(areaThumb);
  const hueBar = h('div', { class: 'khe-color-picker__hue', role: 'slider', 'aria-label': translate(editor, 'Hue'), tabindex: '0' });
  const hueThumb = h('div', { class: 'khe-color-picker__thumb' });
  hueBar.appendChild(hueThumb);
  const hexInput = h('input', { type: 'text', class: 'khe-input', 'aria-label': '#', maxlength: '7' }) as HTMLInputElement;
  const rInput = h('input', { type: 'number', class: 'khe-input', min: '0', max: '255', 'aria-label': 'R' }) as HTMLInputElement;
  const gInput = h('input', { type: 'number', class: 'khe-input', min: '0', max: '255', 'aria-label': 'G' }) as HTMLInputElement;
  const bInput = h('input', { type: 'number', class: 'khe-input', min: '0', max: '255', 'aria-label': 'B' }) as HTMLInputElement;
  const preview = h('div', { class: 'khe-color-picker__preview' });
  const fields = h('div', { class: 'khe-color-picker__fields' }, labelFor(ctx, { label: 'R' }, rInput), labelFor(ctx, { label: 'G' }, gInput), labelFor(ctx, { label: 'B' }, bInput), labelFor(ctx, { label: '#' }, hexInput), preview);
  const wrap = h('div', { class: 'khe-color-picker' }, area, hueBar, fields);

  const render = () => {
    const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
    area.style.setProperty('--khe-cp-hue', String(hsv.h));
    areaThumb.style.left = hsv.s * 100 + '%';
    areaThumb.style.top = (1 - hsv.v) * 100 + '%';
    hueThumb.style.left = '50%';
    hueThumb.style.top = (hsv.h / 360) * 100 + '%';
    preview.style.background = hex;
    hexInput.value = hex;
    const n = parseInt(hex.slice(1), 16);
    rInput.value = String((n >> 16) & 255);
    gInput.value = String((n >> 8) & 255);
    bInput.value = String(n & 255);
    ctx.onChange(item.name);
  };
  const drag = (el: HTMLElement, onMove: (x: number, y: number) => void) => {
    const handler = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      onMove(x, y);
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      handler(e);
      const move = (ev: PointerEvent) => handler(ev);
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    });
  };
  drag(area, (x, y) => {
    hsv = { ...hsv, s: x, v: 1 - y };
    render();
  });
  drag(hueBar, (_x, y) => {
    hsv = { ...hsv, h: Math.min(359.9, y * 360) };
    render();
  });
  area.addEventListener('keydown', (e) => {
    const step = 0.02;
    if (e.key === 'ArrowLeft') {
      hsv.s = Math.max(0, hsv.s - step);
    } else if (e.key === 'ArrowRight') {
      hsv.s = Math.min(1, hsv.s + step);
    } else if (e.key === 'ArrowUp') {
      hsv.v = Math.min(1, hsv.v + step);
    } else if (e.key === 'ArrowDown') {
      hsv.v = Math.max(0, hsv.v - step);
    } else {
      return;
    }
    e.preventDefault();
    render();
  });
  hueBar.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      hsv.h = (hsv.h + 354) % 360;
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      hsv.h = (hsv.h + 6) % 360;
    } else {
      return;
    }
    e.preventDefault();
    render();
  });
  const fromRgb = () => {
    const r = Math.max(0, Math.min(255, parseInt(rInput.value, 10) || 0));
    const g = Math.max(0, Math.min(255, parseInt(gInput.value, 10) || 0));
    const b = Math.max(0, Math.min(255, parseInt(bInput.value, 10) || 0));
    const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
    const parsed = hexToHsv(hex);
    if (parsed) {
      hsv = parsed;
      render();
    }
  };
  [rInput, gInput, bInput].forEach((i) => i.addEventListener('input', fromRgb));
  hexInput.addEventListener('input', () => {
    const parsed = hexToHsv(hexInput.value);
    if (parsed) {
      hsv = parsed;
      const pos = hexInput.selectionStart;
      render();
      hexInput.setSelectionRange(pos, pos);
    }
  });
  ctx.fields.set(item.name, {
    name: item.name,
    el: wrap,
    getValue: () => hexInput.value,
    setValue: (v) => {
      const parsed = hexToHsv(String(v ?? ''));
      if (parsed) {
        hsv = parsed;
      }
      render();
    },
    setEnabled: (s) => setControlEnabled(wrap, s),
    focus: () => hexInput.focus(),
  });
  render();
  return item.label ? labelFor(ctx, item, wrap) : wrap;
};

const renderDropzone = (ctx: DialogContext, item: any): HTMLElement => {
  const { editor } = ctx;
  const accept = (item.accept as string | undefined) || 'image/*';
  const isImageZone = /^image\//.test(accept);
  const dropLabel = isImageZone ? 'Drop an image here' : 'Drop a file here';
  const browseLabel = isImageZone ? 'Browse for an image' : 'Browse for a file';
  const input = h('input', { type: 'file', accept, multiple: item.multiple === false ? null : true }) as HTMLInputElement;
  const zone = h('div', { class: 'khe-dropzone', tabindex: '0', role: 'button', 'aria-label': translate(editor, dropLabel) }, h('div', {}, translate(editor, dropLabel)), h('div', { style: 'margin-top:6px' }, h('span', { class: 'khe-button' }, translate(editor, browseLabel))), input);
  let files: File[] = [];
  const setFiles = (list: FileList | File[] | null) => {
    files = list ? Array.from(list) : [];
    ctx.onChange(item.name);
  };
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => setFiles(input.files));
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('khe-dropzone--over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('khe-dropzone--over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('khe-dropzone--over');
    setFiles(e.dataTransfer?.files ?? null);
  });
  ctx.fields.set(item.name, {
    name: item.name,
    el: zone,
    getValue: () => files,
    setValue: (v) => {
      files = isArray(v) ? (v as File[]) : [];
    },
    setEnabled: (s) => {
      input.disabled = !s;
      zone.style.pointerEvents = s ? '' : 'none';
    },
    focus: () => zone.focus(),
  });
  return labelFor(ctx, item, zone);
};

const renderIframe = (ctx: DialogContext, item: any): HTMLElement => {
  const iframe = h('iframe', { class: 'khe-iframe', title: translate(ctx.editor, item.label || 'Preview') }) as HTMLIFrameElement;
  if (item.sandboxed !== false) {
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  }
  let current = '';
  const write = (html: string) => {
    current = html;
    iframe.srcdoc = html;
  };
  ctx.fields.set(item.name, {
    name: item.name,
    el: iframe,
    getValue: () => current,
    setValue: (v) => write(String(v ?? '')),
    setEnabled: () => {},
    focus: () => iframe.focus(),
  });
  return item.label ? labelFor(ctx, item, iframe) : iframe;
};

const renderHtmlPanel = (ctx: DialogContext, item: any): HTMLElement => {
  const panel = h('div', { class: 'khe-htmlpanel' + (item.presets === 'presentation' ? ' khe-htmlpanel--presentation' : '') });
  // Dialog HTML comes from the integrator/plugins, but still gets a safety pass.
  const frag = ctx.editor.parser.parse(item.html || '', { context: 'div', insert: true });
  panel.appendChild(document.adoptNode(frag));
  return panel;
};

const renderButton = (ctx: DialogContext, item: any): HTMLElement => {
  const btn = h('button', { type: 'button', class: 'khe-button' + (item.primary || item.buttonType === 'primary' ? ' khe-button--primary' : '') + (item.borderless ? ' khe-button--borderless' : '') + (item.icon && !item.text ? ' khe-button--icon' : ''), name: item.name }) as HTMLButtonElement;
  if (item.icon) {
    btn.appendChild(svgEl(getIcon(item.icon, ctx.editor.ui.registry.getAll().icons)));
    btn.setAttribute('aria-label', translate(ctx.editor, item.text || item.tooltip || item.name));
  }
  if (item.text) {
    btn.appendChild(document.createTextNode(translate(ctx.editor, item.text)));
  }
  if (item.enabled === false) {
    btn.disabled = true;
  }
  if (item.active) {
    btn.classList.add('khe-button--active');
  }
  btn.addEventListener('click', () => ctx.onAction(item.name));
  ctx.fields.set(item.name, {
    name: item.name,
    el: btn,
    getValue: () => undefined,
    setValue: () => {},
    setEnabled: (s) => (btn.disabled = !s),
    focus: () => btn.focus(),
  });
  return btn;
};

const renderCollection = (ctx: DialogContext, item: any): HTMLElement => {
  const list = h('div', { class: 'khe-collection' + (item.columns === 1 || item.columns === undefined ? ' khe-collection--list' : ''), role: 'listbox', 'aria-label': translate(ctx.editor, item.label || item.name) });
  if (item.columns && item.columns !== 'auto' && item.columns > 1) {
    list.style.gridTemplateColumns = `repeat(${item.columns}, 1fr)`;
  }
  let items: Array<{ text?: string; value: string; icon?: string }> = [];
  const render = () => {
    empty(list);
    for (const entry of items) {
      const btn = h('button', { type: 'button', class: 'khe-collection__item', role: 'option', 'data-value': entry.value, title: translate(ctx.editor, entry.text ?? entry.value), 'aria-label': translate(ctx.editor, entry.text ?? entry.value), tabindex: '-1' });
      if (entry.icon) {
        // Collections carry either a raw character/HTML snippet or an icon name.
        if (/^<|^&|^[^a-z-]/i.test(entry.icon) || !/^[a-z0-9-]+$/.test(entry.icon)) {
          btn.innerHTML = entry.icon;
        } else {
          btn.appendChild(svgEl(getIcon(entry.icon, ctx.editor.ui.registry.getAll().icons)));
        }
      }
      if (entry.text && (item.columns === 1 || item.columns === undefined)) {
        btn.appendChild(h('span', {}, translate(ctx.editor, entry.text)));
      }
      btn.addEventListener('click', () => ctx.onAction(item.name, entry.value));
      list.appendChild(btn);
    }
    const first = list.querySelector<HTMLElement>('.khe-collection__item');
    if (first) {
      first.tabIndex = 0;
    }
  };
  list.addEventListener('keydown', (e) => {
    const buttons = Array.from(list.querySelectorAll<HTMLElement>('.khe-collection__item'));
    const idx = buttons.indexOf(document.activeElement as HTMLElement);
    const cols = item.columns && item.columns !== 'auto' ? item.columns : Math.max(1, Math.round(list.clientWidth / 40));
    let next = idx;
    if (e.key === 'ArrowRight') {
      next = idx + 1;
    } else if (e.key === 'ArrowLeft') {
      next = idx - 1;
    } else if (e.key === 'ArrowDown') {
      next = idx + cols;
    } else if (e.key === 'ArrowUp') {
      next = idx - cols;
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      (document.activeElement as HTMLElement)?.click();
      return;
    } else {
      return;
    }
    e.preventDefault();
    if (buttons[next]) {
      buttons.forEach((b) => (b.tabIndex = -1));
      buttons[next].tabIndex = 0;
      buttons[next].focus();
    }
  });
  ctx.fields.set(item.name, {
    name: item.name,
    el: list,
    getValue: () => items,
    setValue: (v) => {
      items = isArray(v) ? (v as Array<{ text?: string; value: string; icon?: string }>) : [];
      render();
    },
    setEnabled: (s) => setControlEnabled(list, s),
    focus: () => (list.querySelector<HTMLElement>('.khe-collection__item') || list).focus(),
  });
  return item.label ? labelFor(ctx, item, list) : list;
};

const renderTable = (ctx: DialogContext, item: any): HTMLElement => {
  const table = h('table', { class: 'khe-table' });
  if (item.header) {
    const tr = h('tr');
    (item.header as string[]).forEach((cell) => tr.appendChild(h('th', { scope: 'col' }, translate(ctx.editor, cell))));
    table.appendChild(h('thead', {}, tr));
  }
  const tbody = h('tbody');
  (item.cells as string[][]).forEach((row) => {
    const tr = h('tr');
    row.forEach((cell) => tr.appendChild(h('td', {}, translate(ctx.editor, cell))));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
};

const renderSlider = (ctx: DialogContext, item: any): HTMLElement => {
  const input = h('input', { type: 'range', class: 'khe-slider', min: String(item.min ?? 0), max: String(item.max ?? 100), name: item.name }) as HTMLInputElement;
  input.addEventListener('input', () => ctx.onChange(item.name));
  ctx.fields.set(item.name, {
    name: item.name,
    el: input,
    getValue: () => Number(input.value),
    setValue: (v) => (input.value = String(v ?? 0)),
    setEnabled: (s) => (input.disabled = !s),
    focus: () => input.focus(),
  });
  return labelFor(ctx, item, input);
};

const renderImagePreview = (ctx: DialogContext, item: any): HTMLElement => {
  const img = h('img', { alt: '' }) as HTMLImageElement;
  const wrap = h('div', { class: 'khe-imagepreview' }, img);
  if (item.height) {
    wrap.style.height = item.height;
  }
  let value: any = {};
  ctx.fields.set(item.name, {
    name: item.name,
    el: wrap,
    getValue: () => value,
    setValue: (v) => {
      value = v || {};
      img.src = value.url || '';
      img.style.transform = value.zoom ? `scale(${value.zoom})` : '';
    },
    setEnabled: () => {},
    focus: () => {},
  });
  return wrap;
};

const renderAlertBanner = (ctx: DialogContext, item: any): HTMLElement => {
  const level = item.level === 'warn' ? 'warn' : item.level === 'error' ? 'error' : item.level === 'success' ? 'success' : 'info';
  const banner = h('div', { class: 'khe-alertbanner khe-alertbanner--' + level, role: level === 'error' ? 'alert' : 'status' });
  if (item.icon) {
    banner.appendChild(svgEl(getIcon(item.icon)));
  }
  const text = h('span', {}, translate(ctx.editor, item.text));
  banner.appendChild(text);
  if (item.url) {
    const link = h('a', { href: item.url, target: '_blank', rel: 'noopener' }, translate(ctx.editor, 'Learn more'));
    banner.appendChild(link);
  }
  return banner;
};

const renderItem = (ctx: DialogContext, item: any): HTMLElement | null => {
  switch (item.type) {
    case 'input':
      return renderInput(ctx, item);
    case 'textarea':
      return renderTextarea(ctx, item);
    case 'customeditor':
      return renderTextarea(ctx, { ...item, maximized: true }, true);
    case 'selectbox':
    case 'listbox':
      return renderSelect(ctx, item);
    case 'checkbox':
      return renderCheckbox(ctx, item);
    case 'urlinput':
      return renderUrlInput(ctx, item);
    case 'sizeinput':
      return renderSizeInput(ctx, item);
    case 'colorinput':
      return renderColorInput(ctx, item);
    case 'colorpicker':
      return renderColorPicker(ctx, item);
    case 'dropzone':
      return renderDropzone(ctx, item);
    case 'iframe':
      return renderIframe(ctx, item);
    case 'htmlpanel':
      return renderHtmlPanel(ctx, item);
    case 'button':
      return renderButton(ctx, item);
    case 'collection':
      return renderCollection(ctx, item);
    case 'table':
      return renderTable(ctx, item);
    case 'slider':
      return renderSlider(ctx, item);
    case 'imagepreview':
      return renderImagePreview(ctx, item);
    case 'alertbanner':
      return renderAlertBanner(ctx, item);
    case 'grid': {
      const grid = h('div', { class: 'khe-grid' });
      grid.style.gridTemplateColumns = `repeat(${item.columns || 2}, minmax(0, 1fr))`;
      (item.items || []).forEach((child: any) => {
        const el = renderItem(ctx, child);
        if (el) {
          grid.appendChild(el);
        }
      });
      return grid;
    }
    case 'bar': {
      const bar = h('div', { class: 'khe-bar' });
      (item.items || []).forEach((child: any) => {
        const el = renderItem(ctx, child);
        if (el) {
          bar.appendChild(el);
        }
      });
      return bar;
    }
    case 'label': {
      const group = h('div', { class: 'khe-field', role: 'group' });
      group.appendChild(h('div', { class: 'khe-label' }, translate(ctx.editor, item.label)));
      const inner = h('div', { class: 'khe-form' });
      if (item.align === 'center') {
        inner.style.alignItems = 'center';
      } else if (item.align === 'end') {
        inner.style.alignItems = 'flex-end';
      }
      (item.items || []).forEach((child: any) => {
        const el = renderItem(ctx, child);
        if (el) {
          inner.appendChild(el);
        }
      });
      group.appendChild(inner);
      return group;
    }
    case 'panel': {
      const panel = h('div', { class: 'khe-form' + (item.classes ? ' ' + (item.classes as string[]).join(' ') : '') });
      (item.items || []).forEach((child: any) => {
        const el = renderItem(ctx, child);
        if (el) {
          panel.appendChild(el);
        }
      });
      return panel;
    }
    case 'tree':
    default:
      console.warn(`kHtmlEditor: dialog component "${item.type}" is not supported.`);
      return null;
  }
};

interface BodyRender {
  el: HTMLElement;
  showTab: (name: string) => void;
  currentTab: () => string | undefined;
}

const renderBody = (ctx: DialogContext, body: DialogSpec['body'], onTabChange: (newTab: string, oldTab: string) => void): BodyRender => {
  if (body.type === 'tabpanel') {
    const wrap = h('div', { class: 'khe-tabs' });
    const list = h('div', { class: 'khe-tabs__list', role: 'tablist' });
    const panels: Record<string, HTMLElement> = {};
    const tabs: Record<string, HTMLElement> = {};
    let current = '';
    const names = body.tabs.map((t, i) => t.name ?? 'tab' + i);
    const showTab = (name: string) => {
      if (!panels[name]) {
        return;
      }
      const old = current;
      current = name;
      Object.keys(panels).forEach((n) => {
        panels[n].hidden = n !== name;
        tabs[n].setAttribute('aria-selected', String(n === name));
        tabs[n].tabIndex = n === name ? 0 : -1;
      });
      if (old && old !== name) {
        onTabChange(name, old);
      }
    };
    body.tabs.forEach((tab, i) => {
      const name = names[i];
      const panelId = uniqueId('khe-tabpanel');
      const tabBtn = h('button', { type: 'button', class: 'khe-tabs__tab', role: 'tab', 'aria-controls': panelId, 'aria-selected': 'false', tabindex: '-1' }, translate(ctx.editor, tab.title));
      tabBtn.addEventListener('click', () => showTab(name));
      tabBtn.addEventListener('keydown', (e) => {
        const idx = names.indexOf(current);
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          const n = names[(idx + 1) % names.length];
          showTab(n);
          tabs[n].focus();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const n = names[(idx - 1 + names.length) % names.length];
          showTab(n);
          tabs[n].focus();
        }
      });
      tabs[name] = tabBtn;
      list.appendChild(tabBtn);
      const panel = h('div', { class: 'khe-tabs__panel khe-form', role: 'tabpanel', id: panelId, hidden: true });
      tab.items.forEach((item) => {
        const el = renderItem(ctx, item);
        if (el) {
          panel.appendChild(el);
        }
      });
      panels[name] = panel;
    });
    wrap.appendChild(list);
    const panelWrap = h('div', { class: 'khe-tabs__panel-wrap', style: 'flex:1 1 auto;min-width:0' });
    Object.keys(panels).forEach((n) => panelWrap.appendChild(panels[n]));
    wrap.appendChild(panelWrap);
    if (names[0]) {
      current = names[0];
      panels[names[0]].hidden = false;
      tabs[names[0]].setAttribute('aria-selected', 'true');
      tabs[names[0]].tabIndex = 0;
    }
    return { el: wrap, showTab, currentTab: () => current };
  }
  const panel = renderItem(ctx, body) as HTMLElement;
  return { el: panel, showTab: () => {}, currentTab: () => undefined };
};

const copySkin = (from: HTMLElement | null, to: HTMLElement) => {
  if (!from) {
    return;
  }
  from.classList.forEach((c) => {
    if (c.startsWith('khe-skin-')) {
      to.classList.add(c);
    }
  });
  const style = getComputedStyle(from);
  for (const v of ['--khe-bg', '--khe-bg-subtle', '--khe-fg', '--khe-fg-muted', '--khe-border', '--khe-border-strong', '--khe-accent', '--khe-accent-fg', '--khe-accent-soft', '--khe-hover', '--khe-active', '--khe-focus', '--khe-shadow', '--khe-radius', '--khe-font', '--khe-font-size', '--khe-danger', '--khe-success', '--khe-warning', '--khe-info']) {
    const val = style.getPropertyValue(v);
    if (val) {
      to.style.setProperty(v, val);
    }
  }
};

export const createWindowManagerImpl = (editor: Editor, getThemeRoot: () => HTMLElement | null): WindowManagerImpl => {
  const openDialog = <T>(spec: DialogSpec<T>, params: WindowParams | undefined, closeWindow: (api: DialogInstanceApi<T>) => void): DialogInstanceApi<T> => {
    const fields = new Map<string, FieldHandle>();
    let currentSpec: DialogSpec<any> = spec;
    const inline = !!params?.inline;
    const wrap = h('div', { class: 'khe-aux ' + (inline ? 'khe-dialog-inline-wrap' : 'khe-dialog-wrap') });
    copySkin(getThemeRoot(), wrap);
    const dialog = h('div', { class: 'khe-dialog' + (inline ? ' khe-dialog--inline' : ''), role: 'dialog', 'aria-modal': inline ? 'false' : 'true', tabindex: '-1' });
    wrap.appendChild(dialog);
    const titleId = uniqueId('khe-dialog-title');
    dialog.setAttribute('aria-labelledby', titleId);
    if (params?.ariaAttrs) {
      for (const k of Object.keys(params.ariaAttrs)) {
        dialog.setAttribute(k, params.ariaAttrs[k]);
      }
    }
    let blocker: HTMLElement | null = null;
    let closed = false;
    let bodyRender: BodyRender | null = null;
    let popup: PopupHandle | null = null;
    let previousFocus: Element | null = document.activeElement;

    const getData = (): Record<string, any> => {
      const data: Record<string, any> = {};
      fields.forEach((f, name) => {
        const v = f.getValue();
        if (v !== undefined) {
          data[name] = v;
        }
      });
      return data;
    };

    const api: DialogInstanceApi<T> = {
      getData: () => getData() as T,
      setData: (data) => {
        if (!data) {
          return;
        }
        for (const k of Object.keys(data)) {
          const f = fields.get(k);
          if (f) {
            f.setValue((data as any)[k]);
          }
        }
      },
      setEnabled: (name, state) => {
        const f = fields.get(name) ?? footerButtons.get(name);
        if (f) {
          f.setEnabled(state);
        }
      },
      focus: (name) => {
        const f = fields.get(name) ?? footerButtons.get(name);
        f?.focus();
      },
      showTab: (name) => bodyRender?.showTab(name),
      redial: (newSpec) => {
        render(newSpec);
      },
      block: (message) => {
        if (!blocker) {
          blocker = h('div', { class: 'khe-dialog__blocker', 'aria-busy': 'true' }, h('div', { class: 'khe-spinner', 'aria-hidden': 'true' }), h('span', { style: 'margin-left:10px' }, translate(editor, message)));
          dialog.appendChild(blocker);
        } else {
          blocker.lastElementChild!.textContent = translate(editor, message);
        }
      },
      unblock: () => {
        blocker?.remove();
        blocker = null;
      },
      close: () => {
        if (closed) {
          return;
        }
        closed = true;
        currentSpec.onClose?.();
        if (popup) {
          popup.close();
        } else {
          wrap.remove();
        }
        document.removeEventListener('keydown', keyHandler, true);
        closeWindow(api);
        if (previousFocus && (previousFocus as HTMLElement).focus && document.body.contains(previousFocus) && !getThemeRoot()?.contains(previousFocus)) {
          (previousFocus as HTMLElement).focus();
        }
      },
      toggleFullscreen: () => {
        dialog.classList.toggle('khe-dialog--fullscreen');
      },
    };

    const footerButtons = new Map<string, FieldHandle>();

    const ctx: DialogContext = {
      editor,
      themeRoot: getThemeRoot,
      api,
      fields,
      getData,
      isInline: inline,
      onChange: (name) => {
        if (!closed) {
          currentSpec.onChange?.(api, { name });
        }
      },
      onAction: (name, value) => {
        if (!closed) {
          currentSpec.onAction?.(api, { name, value });
        }
      },
      submit: () => {
        if (!closed && hasSubmit) {
          currentSpec.onSubmit?.(api);
        }
      },
    };
    let hasSubmit = false;

    const keyHandler = (e: KeyboardEvent) => {
      if (closed || !dialog.contains(e.target as Node)) {
        if (!inline && e.key === 'Tab' && !dialog.contains(e.target as Node)) {
          // Focus escaped (e.g. iframe); pull it back.
          const items = focusable(dialog);
          if (items.length) {
            e.preventDefault();
            items[0].focus();
          }
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        currentSpec.onCancel?.(api);
        api.close();
      } else if (e.key === 'Tab' && !inline) {
        const items = focusable(dialog);
        if (items.length === 0) {
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    const render = (s: DialogSpec<any>) => {
      currentSpec = s;
      fields.clear();
      footerButtons.clear();
      empty(dialog);
      hasSubmit = false;
      dialog.className = 'khe-dialog' + (inline ? ' khe-dialog--inline' : '') + (s.size === 'medium' ? ' khe-dialog--medium' : s.size === 'large' ? ' khe-dialog--large' : '') + (!inline && isMobile() ? ' khe-dialog--mobile' : '');

      const header = h('div', { class: 'khe-dialog__header' });
      header.appendChild(h('h2', { class: 'khe-dialog__title', id: titleId }, translate(editor, s.title)));
      const closeBtn = h('button', { type: 'button', class: 'khe-dialog__close', 'aria-label': translate(editor, 'Close') });
      closeBtn.appendChild(svgEl(getIcon('close')));
      closeBtn.addEventListener('click', () => {
        s.onCancel?.(api);
        api.close();
      });
      header.appendChild(closeBtn);
      dialog.appendChild(header);

      const body = h('div', { class: 'khe-dialog__body' + (inline ? ' khe-dialog__body--inline' : '') });
      bodyRender = renderBody(ctx, s.body, (newTab, oldTab) => s.onTabChange?.(api, { newTabName: newTab, oldTabName: oldTab }));
      body.appendChild(bodyRender.el);
      dialog.appendChild(body);

      if (s.buttons && s.buttons.length) {
        const footer = h('div', { class: 'khe-dialog__footer' });
        const start = h('div', { class: 'khe-footer-start' });
        let hasStart = false;
        for (const b of s.buttons) {
          const el = renderFooterButton(b);
          if (b.align === 'start') {
            start.appendChild(el);
            hasStart = true;
          } else {
            footer.appendChild(el);
          }
        }
        if (hasStart) {
          footer.insertBefore(start, footer.firstChild);
        }
        dialog.appendChild(footer);
      }
      if (s.initialData) {
        api.setData(s.initialData);
      }
      // Focus first field.
      setTimeout(() => {
        if (closed) {
          return;
        }
        const first = focusable(body)[0];
        if (first) {
          first.focus();
        } else {
          dialog.focus();
        }
      }, 0);
    };

    const renderFooterButton = (b: any): HTMLElement => {
      const type = b.type as string;
      const isPrimary = b.primary || b.buttonType === 'primary' || type === 'submit';
      const btn = h('button', { type: 'button', class: 'khe-button' + (isPrimary ? ' khe-button--primary' : ''), name: b.name ?? type }) as HTMLButtonElement;
      if (b.icon) {
        btn.appendChild(svgEl(getIcon(b.icon, editor.ui.registry.getAll().icons)));
      }
      btn.appendChild(document.createTextNode(translate(editor, b.text ?? (type === 'cancel' ? 'Cancel' : type === 'submit' ? 'Save' : ''))));
      if (b.enabled === false) {
        btn.disabled = true;
      }
      if (type === 'submit') {
        hasSubmit = true;
        btn.addEventListener('click', () => ctx.submit());
      } else if (type === 'cancel') {
        btn.addEventListener('click', () => {
          currentSpec.onCancel?.(api);
          api.close();
        });
      } else if (type === 'menu') {
        btn.setAttribute('aria-haspopup', 'true');
        btn.addEventListener('click', () => {
          openMenu(
            { editor, themeRoot: getThemeRoot() ?? document.body },
            {
              anchor: btn,
              items: (b.items ?? []) as MenuItemLike[],
              onChoice: (value) => ctx.onAction(b.name, value),
              select: (value) => b.items?.some((i: any) => i.value === value && i.active) ?? false,
            },
          );
        });
      } else if (type === 'togglebutton') {
        let active = !!b.active;
        btn.classList.toggle('khe-button--active', active);
        btn.setAttribute('aria-pressed', String(active));
        btn.addEventListener('click', () => {
          active = !active;
          btn.classList.toggle('khe-button--active', active);
          btn.setAttribute('aria-pressed', String(active));
          ctx.onAction(b.name, active);
        });
      } else {
        btn.addEventListener('click', () => ctx.onAction(b.name));
      }
      if (b.name) {
        footerButtons.set(b.name, { name: b.name, el: btn, getValue: () => undefined, setValue: () => {}, setEnabled: (s2) => (btn.disabled = !s2), focus: () => btn.focus() });
      }
      return btn;
    };

    render(spec);
    document.addEventListener('keydown', keyHandler, true);

    if (inline) {
      // Anchor near the selection or below the toolbar.
      const anchor = (): DOMRect | null => {
        if (params?.inline === 'cursor') {
          try {
            const rect = editor.selection.getBoundingClientRect();
            const frame = editor.iframeElement?.getBoundingClientRect();
            if (frame && rect) {
              return new DOMRect(rect.left + frame.left, rect.top + frame.top, rect.width, rect.height);
            }
          } catch {
            /* fall through */
          }
        }
        const toolbar = getThemeRoot()?.querySelector('.khe-header') as HTMLElement | null;
        const r = (toolbar ?? getThemeRoot())?.getBoundingClientRect() ?? null;
        return r ? new DOMRect(r.left + 8, r.bottom - 4, 1, 1) : null;
      };
      popup = openPopup({
        anchor,
        content: dialog,
        themeRoot: getThemeRoot(),
        className: 'khe-dialog-popup',
        placement: 'below',
        onClose: () => {
          if (!closed) {
            closed = true;
            currentSpec.onClose?.();
            document.removeEventListener('keydown', keyHandler, true);
            closeWindow(api);
          }
        },
      });
      popup.el.style.padding = '0';
      popup.el.style.border = '0';
      popup.el.style.boxShadow = 'none';
      popup.el.style.background = 'transparent';
      if (params?.persistent) {
        // Persistent inline dialogs ignore outside clicks: re-add on close caused by outside click.
        const origClose = popup.close;
        popup.close = (reason) => {
          if (reason === 'outside') {
            return;
          }
          origClose(reason);
        };
      }
    } else {
      document.body.appendChild(wrap);
      wrap.addEventListener('mousedown', (e) => {
        if (e.target === wrap) {
          // Clicking the backdrop does not close (TinyMCE behaviour), just refocus.
          dialog.focus();
        }
      });
    }
    return api;
  };

  const openUrl = (spec: UrlDialogSpec, closeWindow: (api: UrlDialogInstanceApi) => void): UrlDialogInstanceApi => {
    const wrap = h('div', { class: 'khe-aux khe-dialog-wrap' });
    copySkin(getThemeRoot(), wrap);
    const dialog = h('div', { class: 'khe-dialog khe-dialog--large', role: 'dialog', 'aria-modal': 'true', tabindex: '-1' });
    if (spec.width) {
      dialog.style.maxWidth = spec.width + 'px';
    }
    const titleId = uniqueId('khe-dialog-title');
    dialog.setAttribute('aria-labelledby', titleId);
    const header = h('div', { class: 'khe-dialog__header' }, h('h2', { class: 'khe-dialog__title', id: titleId }, translate(editor, spec.title)));
    const closeBtn = h('button', { type: 'button', class: 'khe-dialog__close', 'aria-label': translate(editor, 'Close') });
    closeBtn.appendChild(svgEl(getIcon('close')));
    header.appendChild(closeBtn);
    const iframe = h('iframe', { class: 'khe-iframe', src: spec.url, title: translate(editor, spec.title) }) as HTMLIFrameElement;
    if (spec.height) {
      iframe.style.height = spec.height + 'px';
    } else {
      iframe.style.height = '60vh';
    }
    const body = h('div', { class: 'khe-dialog__body' }, iframe);
    dialog.appendChild(header);
    dialog.appendChild(body);
    let blocker: HTMLElement | null = null;
    let closed = false;
    const api: UrlDialogInstanceApi = {
      block: (message) => {
        if (!blocker) {
          blocker = h('div', { class: 'khe-dialog__blocker' }, h('div', { class: 'khe-spinner' }), h('span', { style: 'margin-left:10px' }, translate(editor, message)));
          dialog.appendChild(blocker);
        }
      },
      unblock: () => {
        blocker?.remove();
        blocker = null;
      },
      close: () => {
        if (!closed) {
          closed = true;
          spec.onClose?.();
          wrap.remove();
          window.removeEventListener('message', onMessage);
          closeWindow(api);
        }
      },
      sendMessage: (msg) => {
        iframe.contentWindow?.postMessage(msg, '*');
      },
    };
    closeBtn.addEventListener('click', () => {
      spec.onCancel?.(api);
      api.close();
    });
    if (spec.buttons && spec.buttons.length) {
      const footer = h('div', { class: 'khe-dialog__footer' });
      for (const b of spec.buttons) {
        const btn = h('button', { type: 'button', class: 'khe-button' + (b.primary ? ' khe-button--primary' : ''), name: b.name }, translate(editor, b.text));
        btn.addEventListener('click', () => {
          if (b.type === 'cancel') {
            spec.onCancel?.(api);
            api.close();
          } else {
            spec.onAction?.(api, { name: b.name });
          }
        });
        footer.appendChild(btn);
      }
      dialog.appendChild(footer);
    }
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow || !isObject(e.data)) {
        return;
      }
      const data = e.data as Record<string, any>;
      switch (data.mceAction) {
        case 'insertContent':
          editor.insertContent(String(data.content ?? ''));
          break;
        case 'setContent':
          editor.setContent(String(data.content ?? ''));
          break;
        case 'execCommand':
          editor.execCommand(String(data.cmd), !!data.ui, data.value);
          break;
        case 'close':
          api.close();
          break;
        case 'block':
          api.block(String(data.message ?? ''));
          break;
        case 'unblock':
          api.unblock();
          break;
        default:
          spec.onMessage?.(api, data);
      }
    };
    window.addEventListener('message', onMessage);
    wrap.appendChild(dialog);
    document.body.appendChild(wrap);
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        spec.onCancel?.(api);
        api.close();
      }
    });
    setTimeout(() => dialog.focus(), 0);
    return api;
  };

  const simpleDialog = (message: string, buttons: Array<{ text: string; primary?: boolean; onClick: () => void }>) => {
    let api: DialogInstanceApi<any> | null = null;
    api = openDialog(
      {
        title: ' ',
        body: { type: 'panel', items: [{ type: 'htmlpanel', html: '<p>' + editor.dom.encode(message) + '</p>', presets: 'presentation' }] },
        buttons: buttons.map((b, i) => ({ type: 'custom', name: 'btn' + i, text: b.text, primary: b.primary })),
        onAction: (_api, details) => {
          const idx = Number(details.name.slice(3));
          api?.close();
          buttons[idx]?.onClick();
        },
        onCancel: () => buttons[buttons.length - 1]?.onClick(),
      },
      undefined,
      () => {},
    );
    (api as any).__simple = true;
    const title = document.querySelector('.khe-dialog__title:last-of-type');
    if (title && title.textContent === ' ') {
      (title.parentElement as HTMLElement).style.borderBottom = '0';
    }
  };

  return {
    open: openDialog,
    openUrl,
    alert: (message, callback) => {
      simpleDialog(message, [{ text: 'OK', primary: true, onClick: callback }]);
    },
    confirm: (message, callback) => {
      let answered = false;
      simpleDialog(message, [
        {
          text: 'Yes',
          primary: true,
          onClick: () => {
            if (!answered) {
              answered = true;
              callback(true);
            }
          },
        },
        {
          text: 'No',
          onClick: () => {
            if (!answered) {
              answered = true;
              callback(false);
            }
          },
        },
      ]);
    },
    close: (dialog) => dialog.close(),
  };
};

export const isStringSpec = isString;
