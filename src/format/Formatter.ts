import type { Editor } from '../core/Editor';
import { getDefaultFormats } from './DefaultFormats';
import { applyFormatInternal } from './ApplyFormat';
import { removeFormatInternal } from './RemoveFormat';
import * as MatchFormat from './MatchFormat';
import { createFormatChanged } from './FormatChanged';
import { getCssText } from './Preview';
import { setupCaretFormat } from './CaretFormat';
import { isString, isArray } from '../util/Type';

/**
 * `editor.formatter`: registry plus apply/remove/toggle/match of inline, block, selector and
 * wrapper formats, API-compatible with TinyMCE's Formatter.
 */
export interface FormatVars {
  [key: string]: string | null;
}

export interface BaseFormat {
  inline?: string;
  block?: string;
  selector?: string;
  styles?: Record<string, string>;
  attributes?: Record<string, string>;
  classes?: string | string[];
  exact?: boolean;
  remove?: 'none' | 'empty' | 'all';
  split?: boolean;
  wrapper?: boolean;
  expand?: boolean;
  deep?: boolean;
  links?: boolean;
  list_block?: string;
  list_item?: string;
  preview?: boolean | string;
  clear_child_styles?: boolean;
  include?: string[];
  collapsed?: boolean;
  ceFalseOverride?: boolean;
  defaultBlock?: string;
  mixed?: boolean;
  merge_siblings?: boolean;
  merge_with_parents?: boolean;
  preserve_attributes?: string[];
  remove_similar?: boolean;
  toggle?: boolean;
  inherit?: boolean;
  block_expand?: boolean;
  onmatch?: (node: Node, fmt: Format, itemName: string) => boolean;
  onformat?: (elm: Element, fmt: Format, vars?: FormatVars, node?: Node) => void;
  [key: string]: any;
}
export type Format = BaseFormat;
export type Formats = Record<string, Format | Format[]>;
export interface RangeLikeObject {
  startContainer: Node;
  startOffset: number;
  endContainer: Node;
  endOffset: number;
}

export interface FormatChangedCallback {
  (state: boolean, data: { node: Node; format: string; parents: Node[] }): void;
}

export interface Formatter {
  get: (name?: string) => Format[] | Formats | undefined;
  has: (name: string) => boolean;
  register: (name: string | Formats, format?: Format | Format[]) => void;
  unregister: (name: string) => Formats;
  apply: (name: string, vars?: FormatVars, node?: Node | RangeLikeObject) => void;
  remove: (name: string, vars?: FormatVars, node?: Node | Range | RangeLikeObject, similar?: boolean) => void;
  toggle: (name: string, vars?: FormatVars, node?: Node | RangeLikeObject) => void;
  match: (name: string, vars?: FormatVars, node?: Node, similar?: boolean) => boolean;
  closest: (names: string[]) => string | null;
  matchAll: (names: string[], vars?: FormatVars) => string[];
  matchNode: (node: Node | null, name: string, vars?: FormatVars, similar?: boolean) => Format | undefined;
  canApply: (name: string) => boolean;
  formatChanged: (names: string, callback: FormatChangedCallback, similar?: boolean, vars?: FormatVars) => { unbind: () => void };
  getCssText: (format: string | Format) => string;
}

export const createFormatter = (editor: Editor): Formatter => {
  const formats: Formats = {};

  const get = (name?: string): Format[] | Formats | undefined => (name ? (formats[name] as Format[] | undefined) : formats);
  const has = (name: string) => Object.prototype.hasOwnProperty.call(formats, name);

  const register = (name: string | Formats, format?: Format | Format[]) => {
    if (isString(name)) {
      if (format) {
        const list = isArray(format) ? format : [format];
        list.forEach((f) => {
          if (f.deep === undefined) {
            f.deep = !f.selector;
          }
          if (f.split === undefined) {
            f.split = !f.selector || !!f.inline;
          }
          if (f.remove === undefined && f.selector && !f.inline) {
            f.remove = 'none';
          }
          if (f.selector && f.inline) {
            f.mixed = true;
            f.block_expand = true;
          }
          if (isString(f.classes)) {
            f.classes = f.classes.split(/\s+/);
          }
        });
        formats[name] = list;
      }
    } else {
      for (const k of Object.keys(name)) {
        register(k, name[k]);
      }
    }
  };

  const unregister = (name: string) => {
    if (name && formats[name]) {
      delete formats[name];
    }
    return formats;
  };

  register(getDefaultFormats(editor));
  const customFormats = editor.options.get('formats') as Formats | undefined;
  if (customFormats) {
    register(customFormats);
  }

  const { formatChanged } = createFormatChanged(editor);
  setupCaretFormat(editor);

  const formatter: Formatter = {
    get,
    has,
    register,
    unregister,
    apply: (name, vars, node) => applyFormatInternal(editor, name, vars, node),
    remove: (name, vars, node, similar) => removeFormatInternal(editor, name, vars, node as any, similar),
    toggle: (name, vars, node) => {
      const fmt = (get(name) as Format[] | undefined)?.[0];
      if (fmt && MatchFormat.match(editor, name, vars, node as Node | undefined) && (!('toggle' in fmt) || fmt.toggle)) {
        removeFormatInternal(editor, name, vars, node as any);
      } else {
        applyFormatInternal(editor, name, vars, node);
      }
    },
    match: (name, vars, node, similar) => MatchFormat.match(editor, name, vars, node, similar),
    closest: (names) => MatchFormat.closest(editor, names),
    matchAll: (names, vars) => MatchFormat.matchAll(editor, names, vars),
    matchNode: (node, name, vars, similar) => MatchFormat.matchNode(editor, node, name, vars, similar),
    canApply: (name) => MatchFormat.canApply(editor, name),
    formatChanged,
    getCssText: (format) => getCssText(editor, format),
  };
  return formatter;
};
