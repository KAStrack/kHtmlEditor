import type { Editor } from '../core/Editor';

/**
 * Central input handling: routes beforeinput/keydown to the structural key handlers. The handlers
 * for Enter/Delete/Tab/arrows are registered by the keyboard modules when present.
 */
export type InputHandler = (editor: Editor, e: InputEvent) => boolean | void;
export type KeyHandler = (editor: Editor, e: KeyboardEvent) => boolean | void;

const inputHandlers: Record<string, InputHandler[]> = {};
const keydownHandlers: KeyHandler[] = [];
const setupHooks: Array<(editor: Editor) => void> = [];

export const registerInputHandler = (inputType: string, handler: InputHandler): void => {
  (inputHandlers[inputType] = inputHandlers[inputType] || []).push(handler);
};

export const registerKeydownHandler = (handler: KeyHandler): void => {
  keydownHandlers.push(handler);
};

export const registerSetupHook = (hook: (editor: Editor) => void): void => {
  setupHooks.push(hook);
};

export const setupKeyboard = (editor: Editor): void => {
  editor.on('beforeinput', (e) => {
    if (e.isDefaultPrevented() || editor.readonly) {
      return;
    }
    const handlers = inputHandlers[e.inputType as string];
    if (handlers) {
      for (const h of handlers) {
        if (h(editor, e as unknown as InputEvent) === true) {
          e.preventDefault();
          return;
        }
      }
    }
  });
  editor.on('keydown', (e) => {
    if (e.isDefaultPrevented() || editor.readonly) {
      return;
    }
    for (const h of keydownHandlers) {
      if (h(editor, e as unknown as KeyboardEvent) === true) {
        e.preventDefault();
        return;
      }
    }
  });
  for (const hook of setupHooks) {
    hook(editor);
  }
};
