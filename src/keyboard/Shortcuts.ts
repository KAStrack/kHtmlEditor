import type { Editor } from '../core/Editor';
import { Env } from '../util/Env';
import { isString, isFunction } from '../util/Type';
import { explode } from '../util/Str';

/**
 * Keyboard shortcut registry (`editor.addShortcut`). Patterns follow TinyMCE:
 * `meta+b`, `ctrl+shift+z`, `access+1`, `alt+f9`, several separated by `,`.
 * `meta` maps to ⌘ on macOS and Ctrl elsewhere; `access` is Ctrl+Alt on macOS and Shift+Alt elsewhere.
 */
interface Shortcut {
  id: string;
  access: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  keyCode: number;
  charCode: number;
  desc: string;
  subpatterns: Shortcut[];
  func: () => void;
  scope: any;
}

const keyCodeLookup: Record<string, number> = { f1: 112, f2: 113, f3: 114, f4: 115, f5: 116, f6: 117, f7: 118, f8: 119, f9: 120, f10: 121, f11: 122, f12: 123 };
const modifierNames = ['alt', 'ctrl', 'shift', 'meta', 'access'];

export class Shortcuts {
  private shortcuts: Record<string, Shortcut> = {};
  private pendingPatterns: Shortcut[] = [];
  private readonly editor: Editor;

  constructor(editor: Editor) {
    this.editor = editor;
    editor.on('keyup keypress keydown', (e) => {
      if ((this.hasModifier(e) || this.isFunctionKey(e)) && !e.isDefaultPrevented()) {
        for (const id of Object.keys(this.shortcuts)) {
          const shortcut = this.shortcuts[id];
          if (this.matchShortcut(e, shortcut)) {
            this.pendingPatterns = shortcut.subpatterns.slice(0);
            if (e.type === 'keydown') {
              this.executeShortcutAction(shortcut);
            }
          }
        }
        if (this.matchShortcut(e, this.pendingPatterns[0])) {
          if (this.pendingPatterns.length === 1 && e.type === 'keydown') {
            this.executeShortcutAction(this.pendingPatterns[0]);
          }
          this.pendingPatterns.shift();
        }
      }
    });
  }

  private hasModifier(e: KeyboardEvent): boolean {
    return e.altKey || e.ctrlKey || e.metaKey;
  }

  private isFunctionKey(e: KeyboardEvent): boolean {
    return e.type === 'keydown' && e.keyCode >= 112 && e.keyCode <= 123;
  }

  private matchShortcut(e: KeyboardEvent, shortcut: Shortcut | undefined): boolean {
    if (!shortcut) {
      return false;
    }
    if (shortcut.ctrl !== e.ctrlKey || shortcut.meta !== e.metaKey) {
      return false;
    }
    if (shortcut.alt !== e.altKey || shortcut.shift !== e.shiftKey) {
      return false;
    }
    if (e.keyCode === shortcut.keyCode || (e.charCode && e.charCode === shortcut.charCode)) {
      e.preventDefault();
      return true;
    }
    return false;
  }

  private executeShortcutAction(shortcut: Shortcut): void {
    shortcut.func.call(shortcut.scope);
  }

  private parseShortcut(pattern: string): Shortcut {
    let key: string | undefined;
    const shortcut: Partial<Shortcut> = {};
    for (const value of explode(pattern.toLowerCase(), '+')) {
      if (modifierNames.includes(value)) {
        (shortcut as any)[value] = true;
      } else {
        if (/^[0-9]{2,}$/.test(value)) {
          shortcut.keyCode = parseInt(value, 10);
        } else {
          shortcut.charCode = value.charCodeAt(0);
          shortcut.keyCode = keyCodeLookup[value] || value.toUpperCase().charCodeAt(0);
        }
        key = value;
      }
    }
    const id: string[] = [String(shortcut.keyCode)];
    for (const name of modifierNames) {
      if ((shortcut as any)[name]) {
        id.push(name);
      } else {
        (shortcut as any)[name] = false;
      }
    }
    shortcut.id = id.join(',');
    if (shortcut.access) {
      shortcut.alt = true;
      if (Env.mac) {
        shortcut.ctrl = true;
      } else {
        shortcut.shift = true;
      }
    }
    if (shortcut.meta) {
      if (Env.mac) {
        shortcut.meta = true;
      } else {
        shortcut.ctrl = true;
        shortcut.meta = false;
      }
    }
    void key;
    return shortcut as Shortcut;
  }

  private createShortcut(pattern: string, desc: string, cmdFunc: string | (() => void) | undefined, scope: any): Shortcut {
    const shortcuts = explode(pattern, '>').map((p) => this.parseShortcut(p));
    const main = shortcuts[shortcuts.length - 1];
    main.func = this.normalizeCommandFunc(cmdFunc);
    main.scope = scope || this.editor;
    main.desc = this.editor.translate(desc);
    main.subpatterns = shortcuts.slice(0, shortcuts.length - 1);
    return { ...shortcuts[0], func: main.func, scope: main.scope, desc: main.desc, subpatterns: main.subpatterns };
  }

  private normalizeCommandFunc(cmdFunc: string | (() => void) | undefined): () => void {
    const editor = this.editor;
    if (isString(cmdFunc)) {
      return () => {
        editor.execCommand(cmdFunc, false, null);
      };
    }
    if (Array.isArray(cmdFunc)) {
      const arr = cmdFunc as any[];
      return () => {
        editor.execCommand(arr[0], arr[1], arr[2]);
      };
    }
    return isFunction(cmdFunc) ? cmdFunc : () => {};
  }

  add(pattern: string, desc: string, cmdFunc: string | (() => void), scope?: any): boolean {
    for (const p of explode(pattern.toLowerCase())) {
      const shortcut = this.createShortcut(p, desc, cmdFunc, scope);
      this.shortcuts[shortcut.id] = shortcut;
    }
    return true;
  }

  remove(pattern: string): boolean {
    const shortcut = this.createShortcut(pattern, '', undefined, undefined);
    if (this.shortcuts[shortcut.id]) {
      delete this.shortcuts[shortcut.id];
      return true;
    }
    return false;
  }

  getAll(): Array<{ pattern: string; desc: string }> {
    return Object.keys(this.shortcuts).map((id) => ({ pattern: id, desc: this.shortcuts[id].desc }));
  }
}
