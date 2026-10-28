import type { Editor } from './Editor';

/** Editor modes (`editor.mode`): design, readonly and custom registered modes. */
export interface ModeApi {
  activate: () => void;
  deactivate: () => void;
  editorReadOnly: boolean;
}

export interface EditorMode {
  isReadOnly: () => boolean;
  set: (mode: string) => void;
  get: () => string;
  register: (mode: string, api: ModeApi) => void;
}

const setContentEditable = (editor: Editor, state: boolean) => {
  const body = editor.getBody();
  if (body) {
    body.contentEditable = String(state);
  }
};

export const createMode = (editor: Editor): EditorMode => {
  let activeMode = 'design';
  const availableModes: Record<string, ModeApi> = {
    design: {
      activate: () => {
        setContentEditable(editor, editor.hasEditableRoot());
        editor.getBody()?.classList.remove('mce-content-readonly');
      },
      deactivate: () => {},
      editorReadOnly: false,
    },
    readonly: {
      activate: () => {
        setContentEditable(editor, false);
        editor.getBody()?.classList.add('mce-content-readonly');
        editor.selection?.getSel()?.removeAllRanges();
      },
      deactivate: () => {
        editor.getBody()?.classList.remove('mce-content-readonly');
      },
      editorReadOnly: true,
    },
  };

  const switchToMode = (mode: string) => {
    const oldMode = availableModes[activeMode];
    const newMode = availableModes[mode];
    try {
      newMode.activate();
    } catch (e) {
      console.error(`kHtmlEditor: problem while activating editor mode ${mode}:`, e);
      return;
    }
    oldMode.deactivate();
    if (oldMode.editorReadOnly !== newMode.editorReadOnly) {
      editor.readonly = newMode.editorReadOnly;
      editor.nodeChanged();
    }
    activeMode = mode;
    editor.dispatch('SwitchMode', { mode });
  };

  const set = (mode: string) => {
    if (mode === activeMode) {
      return;
    }
    if (!availableModes[mode]) {
      throw new Error(`Editor mode '${mode}' is invalid`);
    }
    if (editor.initialized) {
      switchToMode(mode);
    } else {
      editor.on('init', () => switchToMode(mode));
    }
  };

  const register = (mode: string, api: ModeApi) => {
    if (mode === 'design' || mode === 'readonly') {
      throw new Error(`Cannot override default mode ${mode}`);
    }
    availableModes[mode] = { ...api, deactivate: () => {
      try {
        api.deactivate();
      } catch (e) {
        console.error(`kHtmlEditor: problem while deactivating editor mode ${mode}:`, e);
      }
    } };
  };

  return {
    isReadOnly: () => editor.readonly,
    set,
    get: () => activeMode,
    register,
  };
};
