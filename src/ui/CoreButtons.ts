import type { Editor } from '../core/Editor';
import type { ChoiceMenuItemSpec, MenuItemAnySpec, ToggleButtonApi, SplitButtonApi, MenuButtonApi } from '../core/UiTypes';
import { colorMenuItems, getColorCols, addCustomColor, openCustomColorDialog } from './components/ColorSwatches';
import { registerFancyMenuItem } from './components/Menu';
import { createGridPicker } from './components/GridPicker';
import { renderSwatches } from './components/ColorSwatches';
import type { Format } from '../format/Formatter';
import { isString } from '../util/Type';

/**
 * Registers TinyMCE's core toolbar buttons and menu items (formatting, alignment, undo/redo,
 * blocks/styles/font dropdowns, colours, indentation, clipboard, document).
 */

const parseKeyValueList = (value: string, sep: string): Array<{ title: string; value: string }> =>
  value
    .split(sep)
    .map((s) => s.trim())
    .filter((s) => s.length)
    .map((entry) => {
      const idx = entry.indexOf('=');
      return idx === -1 ? { title: entry, value: entry } : { title: entry.slice(0, idx).trim(), value: entry.slice(idx + 1).trim() };
    });

const onSetupFormatToggle = (editor: Editor, format: string) => (api: ToggleButtonApi) => {
  const { unbind } = editor.formatter.formatChanged(format, (state) => api.setActive(state));
  return () => unbind();
};

const onSetupEditable = (editor: Editor) => (api: { setEnabled: (s: boolean) => void }) => {
  const update = () => api.setEnabled(!editor.readonly && editor.selection.isEditable());
  editor.on('NodeChange', update);
  return () => editor.off('NodeChange', update);
};

const toggleFormatButton = (editor: Editor, name: string, format: string, icon: string, tooltip: string, cmd: string, shortcut?: string) => {
  editor.ui.registry.addToggleButton(name, {
    icon,
    tooltip,
    shortcut,
    onAction: () => editor.execCommand(cmd),
    onSetup: onSetupFormatToggle(editor, format),
  });
  editor.ui.registry.addToggleMenuItem(name, {
    text: tooltip,
    icon,
    shortcut,
    onAction: () => editor.execCommand(cmd),
    onSetup: onSetupFormatToggle(editor, format) as any,
  });
};

const registerFormatButtons = (editor: Editor): void => {
  toggleFormatButton(editor, 'bold', 'bold', 'bold', 'Bold', 'Bold', 'Meta+B');
  toggleFormatButton(editor, 'italic', 'italic', 'italic', 'Italic', 'Italic', 'Meta+I');
  toggleFormatButton(editor, 'underline', 'underline', 'underline', 'Underline', 'Underline', 'Meta+U');
  toggleFormatButton(editor, 'strikethrough', 'strikethrough', 'strike-through', 'Strikethrough', 'Strikethrough');
  toggleFormatButton(editor, 'subscript', 'subscript', 'subscript', 'Subscript', 'Subscript');
  toggleFormatButton(editor, 'superscript', 'superscript', 'superscript', 'Superscript', 'Superscript');
  // `codeformat` is the inline code menu item; `code` is taken by the source code plugin.
  editor.ui.registry.addToggleMenuItem('codeformat', {
    text: 'Code',
    icon: 'sourcecode',
    onAction: () => editor.execCommand('mceToggleFormat', false, 'code'),
    onSetup: onSetupFormatToggle(editor, 'code') as any,
  });
  editor.ui.registry.addToggleButton('blockquote', {
    icon: 'quote',
    tooltip: 'Blockquote',
    onAction: () => editor.execCommand('mceBlockQuote'),
    onSetup: onSetupFormatToggle(editor, 'blockquote'),
  });
  editor.ui.registry.addToggleMenuItem('blockquote', {
    text: 'Blockquote',
    icon: 'quote',
    onAction: () => editor.execCommand('mceBlockQuote'),
    onSetup: onSetupFormatToggle(editor, 'blockquote') as any,
  });
  for (let i = 1; i <= 6; i++) {
    editor.ui.registry.addToggleButton('h' + i, {
      text: 'H' + i,
      tooltip: 'Heading ' + i,
      onAction: () => editor.execCommand('FormatBlock', false, 'h' + i),
      onSetup: onSetupFormatToggle(editor, 'h' + i),
    });
  }
  editor.ui.registry.addButton('removeformat', {
    icon: 'remove-formatting',
    tooltip: 'Clear formatting',
    onAction: () => editor.execCommand('RemoveFormat'),
    onSetup: onSetupEditable(editor),
  });
  editor.ui.registry.addMenuItem('removeformat', {
    text: 'Clear formatting',
    icon: 'remove-formatting',
    onAction: () => editor.execCommand('RemoveFormat'),
  });
};

const registerAlignButtons = (editor: Editor): void => {
  const aligns: Array<[string, string, string, string]> = [
    ['alignleft', 'alignleft', 'align-left', 'Align left'],
    ['aligncenter', 'aligncenter', 'align-center', 'Align center'],
    ['alignright', 'alignright', 'align-right', 'Align right'],
    ['alignjustify', 'alignjustify', 'align-justify', 'Justify'],
  ];
  const commands: Record<string, string> = { alignleft: 'JustifyLeft', aligncenter: 'JustifyCenter', alignright: 'JustifyRight', alignjustify: 'JustifyFull' };
  for (const [name, format, icon, tooltip] of aligns) {
    editor.ui.registry.addToggleButton(name, {
      icon,
      tooltip,
      onAction: () => editor.execCommand(commands[name]),
      onSetup: onSetupFormatToggle(editor, format),
    });
    editor.ui.registry.addToggleMenuItem(name, {
      text: tooltip,
      icon,
      onAction: () => editor.execCommand(commands[name]),
      onSetup: onSetupFormatToggle(editor, format) as any,
    });
  }
  editor.ui.registry.addButton('alignnone', {
    icon: 'align-none',
    tooltip: 'No alignment',
    onAction: () => editor.execCommand('JustifyNone'),
  });
  editor.ui.registry.addNestedMenuItem('align', {
    text: 'Align',
    getSubmenuItems: () => 'alignleft aligncenter alignright alignjustify',
  });
};

const registerUndoRedo = (editor: Editor): void => {
  const setup = (check: () => boolean) => (api: { setEnabled: (s: boolean) => void }) => {
    const update = () => api.setEnabled(!editor.readonly && check());
    editor.on('Undo Redo AddUndo TypingUndo ClearUndos SwitchMode init', update);
    update();
    return () => editor.off('Undo Redo AddUndo TypingUndo ClearUndos SwitchMode init', update);
  };
  editor.ui.registry.addButton('undo', { icon: 'undo', tooltip: 'Undo', shortcut: 'Meta+Z', onAction: () => editor.execCommand('Undo'), onSetup: setup(() => editor.undoManager.hasUndo()), context: 'any' });
  editor.ui.registry.addButton('redo', { icon: 'redo', tooltip: 'Redo', shortcut: 'Meta+Y', onAction: () => editor.execCommand('Redo'), onSetup: setup(() => editor.undoManager.hasRedo()), context: 'any' });
  editor.ui.registry.addMenuItem('undo', { text: 'Undo', icon: 'undo', shortcut: 'Meta+Z', onAction: () => editor.execCommand('Undo'), onSetup: setup(() => editor.undoManager.hasUndo()) as any });
  editor.ui.registry.addMenuItem('redo', { text: 'Redo', icon: 'redo', shortcut: 'Meta+Y', onAction: () => editor.execCommand('Redo'), onSetup: setup(() => editor.undoManager.hasRedo()) as any });
};

const registerIndent = (editor: Editor): void => {
  editor.ui.registry.addButton('outdent', {
    icon: 'outdent',
    tooltip: 'Decrease indent',
    onAction: () => editor.execCommand('Outdent'),
    onSetup: (api) => {
      const update = () => api.setEnabled(!editor.readonly && editor.queryCommandState('Outdent'));
      editor.on('NodeChange SwitchMode', update);
      return () => editor.off('NodeChange SwitchMode', update);
    },
  });
  editor.ui.registry.addButton('indent', { icon: 'indent', tooltip: 'Increase indent', onAction: () => editor.execCommand('Indent') });
  editor.ui.registry.addMenuItem('outdent', { text: 'Decrease indent', icon: 'outdent', onAction: () => editor.execCommand('Outdent') });
  editor.ui.registry.addMenuItem('indent', { text: 'Increase indent', icon: 'indent', onAction: () => editor.execCommand('Indent') });
};

const registerClipboard = (editor: Editor): void => {
  const clipboardCommand = (cmd: string) => () => {
    const ok = editor.execCommand(cmd);
    if (!ok || !(editor.getDoc() as any).queryCommandSupported?.(cmd)) {
      editor.notificationManager.open({
        text: editor.translate("Your browser doesn't support direct access to the clipboard. Please use the Ctrl+X/C/V keyboard shortcuts instead."),
        type: 'error',
        timeout: 5000,
      });
    }
  };
  const items: Array<[string, string, string, string, string]> = [
    ['cut', 'cut', 'Cut', 'Cut', 'Meta+X'],
    ['copy', 'copy', 'Copy', 'Copy', 'Meta+C'],
    ['paste', 'paste', 'Paste', 'Paste', 'Meta+V'],
  ];
  for (const [name, icon, tooltip, cmd, shortcut] of items) {
    editor.ui.registry.addButton(name, { icon, tooltip, shortcut, onAction: clipboardCommand(cmd), context: name === 'copy' ? 'any' : undefined });
    editor.ui.registry.addMenuItem(name, { text: tooltip, icon, shortcut, onAction: clipboardCommand(cmd) });
  }
  editor.ui.registry.addToggleButton('pastetext', {
    icon: 'paste-text',
    tooltip: 'Paste as text',
    onAction: () => editor.execCommand('mceTogglePlainTextPaste'),
    onSetup: (api) => {
      const update = (e: any) => api.setActive(!!e.state);
      editor.on('PastePlainTextToggle', update);
      api.setActive(!!editor.options.get('paste_as_text'));
      return () => editor.off('PastePlainTextToggle', update);
    },
  });
  editor.ui.registry.addToggleMenuItem('pastetext', {
    text: 'Paste as text',
    icon: 'paste-text',
    onAction: () => editor.execCommand('mceTogglePlainTextPaste'),
    onSetup: (api) => {
      const update = (e: any) => api.setActive(!!e.state);
      editor.on('PastePlainTextToggle', update);
      api.setActive(!!editor.options.get('paste_as_text'));
      return () => editor.off('PastePlainTextToggle', update);
    },
  });
  editor.ui.registry.addButton('selectall', { icon: 'select-all', tooltip: 'Select all', shortcut: 'Meta+A', onAction: () => editor.execCommand('SelectAll'), context: 'any' });
  editor.ui.registry.addMenuItem('selectall', { text: 'Select all', icon: 'select-all', shortcut: 'Meta+A', onAction: () => editor.execCommand('SelectAll') });
  editor.ui.registry.addButton('newdocument', { icon: 'new-document', tooltip: 'New document', onAction: () => editor.execCommand('mceNewDocument') });
  editor.ui.registry.addMenuItem('newdocument', { text: 'New document', icon: 'new-document', onAction: () => editor.execCommand('mceNewDocument') });
  editor.ui.registry.addButton('print', { icon: 'print', tooltip: 'Print', shortcut: 'Meta+P', onAction: () => editor.execCommand('mcePrint'), context: 'any' });
  editor.ui.registry.addMenuItem('print', { text: 'Print...', icon: 'print', shortcut: 'Meta+P', onAction: () => editor.execCommand('mcePrint') });
  editor.ui.registry.addButton('remove', { icon: 'remove', tooltip: 'Remove', onAction: () => editor.execCommand('Delete') });
  editor.ui.registry.addButton('hr', { icon: 'horizontal-rule', tooltip: 'Horizontal line', onAction: () => editor.execCommand('InsertHorizontalRule') });
  editor.ui.registry.addMenuItem('hr', { text: 'Horizontal line', icon: 'horizontal-rule', onAction: () => editor.execCommand('InsertHorizontalRule') });
  editor.ui.registry.addToggleButton('visualaid', {
    tooltip: 'Visual aids',
    text: 'Visual aids',
    onAction: () => editor.execCommand('mceToggleVisualAid'),
    onSetup: (api) => {
      const update = () => api.setActive(editor.hasVisual);
      editor.on('VisualAid', update);
      update();
      return () => editor.off('VisualAid', update);
    },
  });
  editor.ui.registry.addToggleMenuItem('visualaid', {
    text: 'Visual aids',
    onAction: () => editor.execCommand('mceToggleVisualAid'),
    onSetup: (api) => {
      const update = () => api.setActive(editor.hasVisual);
      editor.on('VisualAid', update);
      update();
      return () => editor.off('VisualAid', update);
    },
  });
};

const registerBlocks = (editor: Editor): void => {
  const getBlocks = () => parseKeyValueList(editor.options.get('block_formats') as string, ';');
  const currentTitle = (): string => {
    const value = editor.queryCommandValue('FormatBlock');
    const match = getBlocks().find((b) => b.value === value);
    return match ? editor.translate(match.title) : editor.translate('Paragraph');
  };
  const items = (): ChoiceMenuItemSpec[] =>
    getBlocks().map((b) => {
      const fmt = (editor.formatter.get(b.value) as Format[] | undefined)?.[0];
      return { type: 'choiceitem', text: b.title, value: b.value, meta: { style: fmt ? editor.formatter.getCssText(fmt) : '' } };
    });
  editor.ui.registry.addMenuButton('blocks', {
    text: 'Paragraph',
    tooltip: 'Blocks',
    fetch: (callback) => callback(items().map((i) => ({ type: 'togglemenuitem', text: i.text, meta: i.meta, active: editor.formatter.match(i.value as string), onAction: () => editor.execCommand('FormatBlock', false, i.value) }) as MenuItemAnySpec)),
    onSetup: (api) => {
      const update = () => api.setText(currentTitle());
      editor.on('NodeChange', update);
      update();
      return () => editor.off('NodeChange', update);
    },
  });
  editor.ui.registry.addNestedMenuItem('blocks', {
    text: 'Blocks',
    getSubmenuItems: () => items().map((i) => ({ type: 'togglemenuitem', text: i.text, meta: i.meta, active: editor.formatter.match(i.value as string), onAction: () => editor.execCommand('FormatBlock', false, i.value) }) as MenuItemAnySpec),
  });
  // Legacy aliases.
  editor.ui.registry.addMenuButton('formatselect', editor.ui.registry.getAll().buttons.blocks as any);
};

interface StyleFormatItem {
  title: string;
  format?: string;
  items?: StyleFormatItem[];
  name?: string;
  [key: string]: any;
}

const DEFAULT_STYLE_FORMATS: StyleFormatItem[] = [
  { title: 'Headings', items: [{ title: 'Heading 1', format: 'h1' }, { title: 'Heading 2', format: 'h2' }, { title: 'Heading 3', format: 'h3' }, { title: 'Heading 4', format: 'h4' }, { title: 'Heading 5', format: 'h5' }, { title: 'Heading 6', format: 'h6' }] },
  { title: 'Inline', items: [{ title: 'Bold', format: 'bold' }, { title: 'Italic', format: 'italic' }, { title: 'Underline', format: 'underline' }, { title: 'Strikethrough', format: 'strikethrough' }, { title: 'Superscript', format: 'superscript' }, { title: 'Subscript', format: 'subscript' }, { title: 'Code', format: 'code' }] },
  { title: 'Blocks', items: [{ title: 'Paragraph', format: 'p' }, { title: 'Blockquote', format: 'blockquote' }, { title: 'Div', format: 'div' }, { title: 'Pre', format: 'pre' }] },
  { title: 'Align', items: [{ title: 'Left', format: 'alignleft' }, { title: 'Center', format: 'aligncenter' }, { title: 'Right', format: 'alignright' }, { title: 'Justify', format: 'alignjustify' }] },
];

const registerStyles = (editor: Editor): void => {
  let counter = 0;
  const prepare = (items: StyleFormatItem[]): StyleFormatItem[] =>
    items.map((item) => {
      if (item.items) {
        return { ...item, items: prepare(item.items) };
      }
      if (item.format) {
        return item;
      }
      // Custom inline format definition: register it under a generated name.
      const name = item.name || 'custom-format-' + counter++;
      const { title, name: _n, ...format } = item;
      if (!editor.formatter.has(name)) {
        editor.formatter.register(name, format as Format);
      }
      return { title, format: name };
    });
  const getStyleFormats = (): StyleFormatItem[] => {
    const custom = editor.options.get('style_formats') as StyleFormatItem[] | undefined;
    const merge = editor.options.get('style_formats_merge') as boolean;
    if (custom) {
      return prepare(merge ? [...DEFAULT_STYLE_FORMATS, ...custom] : custom);
    }
    return prepare(DEFAULT_STYLE_FORMATS);
  };
  let formats = getStyleFormats();
  editor.on('init StyleFormatsChanged', () => {
    formats = getStyleFormats();
  });
  const flatten = (items: StyleFormatItem[]): StyleFormatItem[] => items.flatMap((i) => (i.items ? flatten(i.items) : [i]));
  const toMenu = (items: StyleFormatItem[]): MenuItemAnySpec[] =>
    items
      .map((item): MenuItemAnySpec | null => {
        if (item.items) {
          return { type: 'nestedmenuitem', text: item.title, getSubmenuItems: () => toMenu(item.items!) };
        }
        if (!item.format || !editor.formatter.has(item.format)) {
          return null;
        }
        const fmt = (editor.formatter.get(item.format) as Format[])[0];
        const autohide = editor.options.get('style_formats_autohide') as boolean;
        if (autohide && !editor.formatter.canApply(item.format)) {
          return null;
        }
        return {
          type: 'togglemenuitem',
          text: item.title,
          active: editor.formatter.match(item.format),
          meta: { style: fmt.preview === false ? '' : editor.formatter.getCssText(fmt) },
          onAction: () => {
            editor.formatter.toggle(item.format!);
            editor.nodeChanged();
          },
        } as MenuItemAnySpec;
      })
      .filter((i): i is MenuItemAnySpec => i !== null);
  const currentTitle = (): string => {
    const names = flatten(formats).filter((f) => f.format);
    const matched = editor.formatter.matchAll(names.map((f) => f.format as string));
    if (matched.length) {
      const first = names.find((f) => f.format === matched[0]);
      return editor.translate(first ? first.title : 'Formats');
    }
    return editor.translate('Formats');
  };
  editor.ui.registry.addMenuButton('styles', {
    text: 'Formats',
    tooltip: 'Formats',
    fetch: (callback) => callback(toMenu(formats)),
    onSetup: (api: MenuButtonApi) => {
      const update = () => api.setText(currentTitle());
      editor.on('NodeChange', update);
      return () => editor.off('NodeChange', update);
    },
  });
  editor.ui.registry.addNestedMenuItem('styles', {
    text: 'Formats',
    getSubmenuItems: () => toMenu(formats),
  });
  editor.ui.registry.addMenuButton('styleselect', editor.ui.registry.getAll().buttons.styles as any);
};

// TinyMCE labels the platform font stack (and any stack containing every font of
// `default_font_stack`) "System Font" instead of naming its first family.
const systemStackFonts = ['-apple-system', 'segoe ui', 'roboto', 'helvetica neue', 'sans-serif'];
const splitFonts = (s: string): string[] => s.split(/\s*,\s*/).map((f) => f.replace(/^['"]+|['"]+$/g, '').toLowerCase());
const matchesStack = (fonts: string[], stack: string[]): boolean => stack.length > 0 && stack.every((f) => fonts.includes(f.toLowerCase()));
const isSystemFontStack = (value: string, userStack: string[]): boolean => {
  if (value.toLowerCase().indexOf('-apple-system') !== 0 && userStack.length === 0) {
    return false;
  }
  const fonts = splitFonts(value);
  return matchesStack(fonts, systemStackFonts) || matchesStack(fonts, userStack);
};

const registerFonts = (editor: Editor): void => {
  const fonts = () => parseKeyValueList(editor.options.get('font_family_formats') as string, ';');
  const normalize = (s: string) => s.replace(/['"]/g, '').replace(/,\s+/g, ',').toLowerCase();
  // A format matches on its whole stack or, like TinyMCE, on its first family alone.
  const currentMatch = (value: string) => {
    const n = normalize(value);
    const first = splitFonts(value)[0];
    return fonts().find((f) => normalize(f.value) === n || normalize(f.title) === n || splitFonts(f.value)[0] === first);
  };
  const currentFont = (): string => {
    const value = editor.queryCommandValue('FontName');
    if (!value) {
      return editor.translate('Fonts');
    }
    const match = currentMatch(value);
    if (match) {
      return editor.translate(match.title);
    }
    if (isSystemFontStack(value, editor.options.get('default_font_stack') as string[])) {
      return editor.translate('System Font');
    }
    // Show the first family of a stack.
    return value.split(',')[0].replace(/['"]/g, '').trim() || editor.translate('Fonts');
  };
  const fontItems = (): MenuItemAnySpec[] => {
    const value = editor.queryCommandValue('FontName');
    const match = value ? currentMatch(value) : undefined;
    return fonts().map((f) => ({ type: 'togglemenuitem', text: f.title, active: !!match && f.title === match.title && f.value === match.value, meta: { style: `font-family: ${f.value}` }, onAction: () => editor.execCommand('FontName', false, f.value) }) as MenuItemAnySpec);
  };
  editor.ui.registry.addMenuButton('fontfamily', {
    text: 'Fonts',
    tooltip: 'Fonts',
    fetch: (callback) => callback(fontItems()),
    onSetup: (api) => {
      const update = () => api.setText(currentFont());
      editor.on('NodeChange', update);
      return () => editor.off('NodeChange', update);
    },
  });
  editor.ui.registry.addNestedMenuItem('fontfamily', { text: 'Fonts', getSubmenuItems: fontItems });
  editor.ui.registry.addMenuButton('fontselect', editor.ui.registry.getAll().buttons.fontfamily as any);

  const sizes = () => parseKeyValueList(editor.options.get('font_size_formats') as string, ' ');
  const ptToPx: Record<string, string> = { '8pt': '11px', '10pt': '13px', '12pt': '16px', '14pt': '19px', '18pt': '24px', '24pt': '32px', '36pt': '48px' };
  const pxToPt: Record<string, string> = {};
  Object.keys(ptToPx).forEach((pt) => (pxToPt[ptToPx[pt]] = pt));
  const legacy = ['xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large'];
  const legacyValues = (editor.options.get('font_size_legacy_values') as string).split(',');
  const currentSize = (): string => {
    let value = editor.queryCommandValue('FontSize');
    if (!value) {
      return editor.translate('Font sizes');
    }
    // Compare in several representations so 16px matches 12pt etc.
    const candidates = new Set<string>([value, pxToPt[value] ?? '', ptToPx[value] ?? '']);
    const legacyIdx = legacy.indexOf(value);
    if (legacyIdx !== -1) {
      candidates.add(legacyValues[legacyIdx] ?? '');
    }
    const match = sizes().find((s) => candidates.has(s.value) || candidates.has(s.title));
    if (match) {
      return match.title;
    }
    const px = /^([\d.]+)px$/.exec(value);
    if (px) {
      value = Math.round((parseFloat(px[1]) * 72) / 96) + 'pt';
      const m2 = sizes().find((s) => s.value === value);
      return m2 ? m2.title : value;
    }
    return value;
  };
  const sizeItems = (): MenuItemAnySpec[] => {
    const current = currentSize();
    return sizes().map((s) => ({ type: 'togglemenuitem', text: s.title, active: s.title === current, onAction: () => editor.execCommand('FontSize', false, s.value) }) as MenuItemAnySpec);
  };
  editor.ui.registry.addMenuButton('fontsize', {
    text: 'Font sizes',
    tooltip: 'Font sizes',
    fetch: (callback) => callback(sizeItems()),
    onSetup: (api) => {
      const update = () => api.setText(currentSize());
      editor.on('NodeChange', update);
      return () => editor.off('NodeChange', update);
    },
  });
  editor.ui.registry.addMenuButton('fontsizeinput', editor.ui.registry.getAll().buttons.fontsize as any);
  editor.ui.registry.addNestedMenuItem('fontsize', { text: 'Font sizes', getSubmenuItems: sizeItems });
  editor.ui.registry.addMenuButton('fontsizeselect', editor.ui.registry.getAll().buttons.fontsize as any);

  const lineHeights = () => parseKeyValueList(editor.options.get('line_height_formats') as string, ' ');
  const lineHeightItems = (): MenuItemAnySpec[] => {
    const current = editor.queryCommandValue('LineHeight');
    return lineHeights().map((l) => ({ type: 'togglemenuitem', text: l.title, active: l.value === current || (current === 'normal' && l.value === '1'), onAction: () => editor.execCommand('LineHeight', false, l.value) }) as MenuItemAnySpec);
  };
  editor.ui.registry.addMenuButton('lineheight', { icon: 'line-height', tooltip: 'Line height', fetch: (callback) => callback(lineHeightItems()) });
  editor.ui.registry.addNestedMenuItem('lineheight', { text: 'Line height', icon: 'line-height', getSubmenuItems: lineHeightItems });
  editor.ui.registry.addMenuButton('lineheightselect', editor.ui.registry.getAll().buttons.lineheight as any);
};

const registerColors = (editor: Editor): void => {
  const register = (name: string, format: 'forecolor' | 'hilitecolor', icon: string, tooltip: string, defaultOption: string) => {
    let lastColor = editor.options.get(defaultOption) as string;
    const applyColor = (value: string) => {
      editor.execCommand(format === 'forecolor' ? 'ForeColor' : 'HiliteColor', false, value);
    };
    const currentColor = (): string | null => {
      const node = editor.selection.getStart();
      const elm = editor.dom.getParent(node, (n) => n.nodeType === 1 && !!editor.dom.getStyle(n as Element, format === 'forecolor' ? 'color' : 'background-color'), editor.getBody()) as Element | null;
      if (!elm) {
        return null;
      }
      return editor.dom.getStyle(elm, format === 'forecolor' ? 'color' : 'background-color') || null;
    };
    const handleChoice = (api: SplitButtonApi | null, value: string, item?: ChoiceMenuItemSpec) => {
      const special = (item?.meta as any)?.special ?? (value === 'remove' ? 'remove' : value === 'custom' ? 'custom' : undefined);
      if (special === 'remove') {
        editor.execCommand('mceRemoveTextcolor', false, format);
        return;
      }
      if (special === 'custom') {
        openCustomColorDialog(editor, lastColor, (color) => {
          addCustomColor(editor, format, color);
          lastColor = color;
          api?.setIconFill?.(name, color);
          applyColor(color);
        });
        return;
      }
      lastColor = value;
      api?.setIconFill?.(name, value);
      applyColor(value);
    };
    editor.ui.registry.addSplitButton(name, {
      icon,
      tooltip,
      presets: 'color',
      columns: getColorCols(editor, format),
      select: (value) => {
        const current = currentColor();
        return !!current && current.toLowerCase() === value.toLowerCase();
      },
      fetch: (callback) => callback(colorMenuItems(editor, format)),
      onAction: (api) => handleChoice(api, lastColor),
      onItemAction: (api, value) => handleChoice(api, value, colorMenuItems(editor, format).find((i) => i.value === value)),
      onSetup: (api) => {
        api.setIconFill?.(name, lastColor);
        return () => {};
      },
    });
    editor.ui.registry.addNestedMenuItem(name, {
      text: tooltip,
      icon,
      getSubmenuItems: () => [{ type: 'fancymenuitem', fancytype: 'colorswatch', initData: { format, columns: getColorCols(editor, format) }, select: (value: string) => (currentColor() ?? '').toLowerCase() === value.toLowerCase(), onAction: (data: any) => handleChoice(null, data.value, data.item) }],
    });
  };
  register('forecolor', 'forecolor', 'text-color', 'Text color', 'color_default_foreground');
  register('backcolor', 'hilitecolor', 'highlight-bg-color', 'Background color', 'color_default_background');

  registerFancyMenuItem('colorswatch', (ctx, spec, close) => {
    const format = (spec.initData?.format as string) || 'forecolor';
    const items = colorMenuItems(ctx.editor, format);
    const current = items.find((i) => i.value && spec.select && spec.select(i.value))?.value ?? null;
    return renderSwatches(ctx.editor, items, (spec.initData?.columns as number) || getColorCols(ctx.editor, format), current, (value, item) => {
      close();
      spec.onAction?.({ value, item });
    });
  });
  registerFancyMenuItem('inserttable', (ctx, spec, close) =>
    createGridPicker(
      (s) => ctx.editor.translate(s),
      (rows, cols) => {
        close();
        spec.onAction?.({ numRows: rows, numColumns: cols });
      },
    ),
  );
};

const registerLanguage = (editor: Editor): void => {
  const langs = () => (editor.options.get('content_langs') as Array<{ title: string; code: string; customCode?: string }> | undefined) ?? [];
  const items = (): MenuItemAnySpec[] => {
    const current = editor.queryCommandValue('Lang');
    return langs().map((l) => ({ type: 'togglemenuitem', text: l.title, active: current === l.code, onAction: () => editor.execCommand('Lang', false, { code: l.code, customCode: l.customCode }) }) as MenuItemAnySpec);
  };
  editor.ui.registry.addMenuButton('language', {
    icon: 'language',
    tooltip: 'Language',
    fetch: (callback) => callback(items()),
    onSetup: (api) => {
      const update = () => api.setEnabled(langs().length > 0 && !editor.readonly);
      editor.on('init SwitchMode', update);
      update();
      return () => editor.off('init SwitchMode', update);
    },
  });
  editor.ui.registry.addNestedMenuItem('language', { text: 'Language', icon: 'language', getSubmenuItems: items });
};

export const registerCoreButtons = (editor: Editor): void => {
  registerFormatButtons(editor);
  registerAlignButtons(editor);
  registerUndoRedo(editor);
  registerIndent(editor);
  registerClipboard(editor);
  registerBlocks(editor);
  registerStyles(editor);
  registerFonts(editor);
  registerColors(editor);
  registerLanguage(editor);
  void isString;
};
