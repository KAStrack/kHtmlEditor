import type { Editor } from '../core/Editor';

/**
 * Command registry behind `editor.execCommand` / `queryCommandState` / `queryCommandValue`.
 */
export type ExecCommandCallback<S = any> = (this: S, ui: boolean, value: any, args?: ExecCommandArgs) => void;
export type InternalExecCallback = (command: string, ui: boolean, value: any, args?: ExecCommandArgs) => void;
export type QueryStateCallback<S = any> = (this: S, command: string) => boolean;
export type QueryValueCallback<S = any> = (this: S, command: string) => string;

export interface ExecCommandArgs {
  skip_focus?: boolean;
  [key: string]: any;
}

interface Commands {
  state: Record<string, QueryStateCallback>;
  exec: Record<string, InternalExecCallback>;
  value: Record<string, QueryValueCallback>;
}

export class EditorCommands {
  private readonly editor: Editor;
  private readonly commands: Commands = { state: {}, exec: {}, value: {} };

  constructor(editor: Editor) {
    this.editor = editor;
  }

  execCommand(command: string, ui: boolean = false, value?: any, args?: ExecCommandArgs): boolean {
    const editor = this.editor;
    const lowerCased = command.toLowerCase();
    const skipFocus = args?.skip_focus;
    if (editor.removed) {
      return false;
    }
    if (lowerCased !== 'mcefocus') {
      if (!/^(mceAddUndoLevel|mceEndUndoLevel|mceBeginUndoLevel|mceRepaint)$/i.test(command) && !skipFocus) {
        editor.focus();
      }
    }
    const eventArgs = editor.dispatch('BeforeExecCommand', { command, ui, value });
    if (eventArgs.isDefaultPrevented()) {
      return false;
    }
    const func = this.commands.exec[lowerCased];
    if (func) {
      func.call(editor, command, ui, value, args);
      editor.dispatch('ExecCommand', { command, ui, value });
      return true;
    }
    return false;
  }

  queryCommandState(command: string): boolean {
    const editor = this.editor;
    if (editor.quirks?.isHidden?.() || editor.removed) {
      return false;
    }
    const lowerCased = command.toLowerCase();
    const func = this.commands.state[lowerCased];
    if (func) {
      return func.call(editor, lowerCased);
    }
    return false;
  }

  queryCommandValue(command: string): string {
    const editor = this.editor;
    if (editor.quirks?.isHidden?.() || editor.removed) {
      return '';
    }
    const lowerCased = command.toLowerCase();
    const func = this.commands.value[lowerCased];
    if (func) {
      return func.call(editor, lowerCased);
    }
    return '';
  }

  addCommands<K extends keyof Commands>(commandList: Record<string, Commands[K][string]>, type: K = 'exec' as K): void {
    const commands = this.commands;
    for (const name of Object.keys(commandList)) {
      const callback = commandList[name];
      for (const cmd of name.toLowerCase().split(',')) {
        (commands[type] as Record<string, any>)[cmd] = callback;
      }
    }
  }

  addCommand<S>(command: string, callback: ExecCommandCallback<S>, scope?: S): void {
    const lowerCased = command.toLowerCase();
    this.commands.exec[lowerCased] = (_command, ui, value, args) => callback.call(scope ?? (this.editor as any), ui, value, args);
  }

  queryCommandSupported(command: string): boolean {
    const lowerCased = command.toLowerCase();
    return !!this.commands.exec[lowerCased];
  }

  addQueryStateHandler<S>(command: string, callback: QueryStateCallback<S>, scope?: S): void {
    this.commands.state[command.toLowerCase()] = () => callback.call(scope ?? (this.editor as any), command);
  }

  addQueryValueHandler<S>(command: string, callback: QueryValueCallback<S>, scope?: S): void {
    this.commands.value[command.toLowerCase()] = () => callback.call(scope ?? (this.editor as any), command);
  }
}
