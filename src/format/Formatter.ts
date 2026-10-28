import type { Editor } from '../core/Editor';

/**
 * Formatter API surface (`editor.formatter`). The full implementation (apply/remove/match of
 * inline, block, selector and wrapper formats) is provided by format/FormatterImpl.
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
  onmatch?: (node: Node, fmt: Format, itemName: string) => boolean;
  onformat?: (elm: Element, fmt: Format, vars?: FormatVars, node?: Node | RangeLikeObject) => void;
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

export type FormatterFactory = (editor: Editor) => Formatter;

let factory: FormatterFactory | null = null;

/** Allows the format layer to register its implementation without core importing it. */
export const setFormatterFactory = (f: FormatterFactory): void => {
  factory = f;
};

export const createFormatter = (editor: Editor): Formatter => {
  if (factory) {
    return factory(editor);
  }
  const formats: Formats = {};
  const noop = () => {};
  return {
    get: (name) => (name ? (formats[name] as Format[] | undefined) : formats),
    has: (name) => Object.prototype.hasOwnProperty.call(formats, name),
    register: (name, format) => {
      if (typeof name === 'string') {
        if (format) {
          formats[name] = Array.isArray(format) ? format : [format];
        }
      } else {
        for (const k of Object.keys(name)) {
          const f = name[k];
          formats[k] = Array.isArray(f) ? f : [f];
        }
      }
    },
    unregister: (name) => {
      delete formats[name];
      return formats;
    },
    apply: noop,
    remove: noop,
    toggle: noop,
    match: () => false,
    closest: () => null,
    matchAll: () => [],
    matchNode: () => undefined,
    canApply: () => true,
    formatChanged: () => ({ unbind: noop }),
    getCssText: () => '',
  };
};
