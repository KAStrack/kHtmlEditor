import type { Editor } from '../core/Editor';
import type { Bookmark } from '../selection/Bookmark';

/**
 * Snapshot based undo manager (`editor.undoManager`). Levels store the serialised raw body HTML
 * plus a path bookmark; typing is coalesced into a single level until a structural key, command
 * or blur closes it (TinyMCE behaviour).
 */
export interface UndoLevel {
  type: 'complete' | 'fragmented';
  content: string;
  fragments?: string[];
  bookmark: Bookmark | null;
  beforeBookmark: Bookmark | null;
}

export interface UndoManager {
  data: UndoLevel[];
  typing: boolean;
  add: (level?: Partial<UndoLevel>, event?: any) => UndoLevel | null;
  dispatchChange: () => void;
  beforeChange: () => void;
  undo: () => UndoLevel | undefined;
  redo: () => UndoLevel | undefined;
  clear: () => void;
  reset: () => void;
  hasUndo: () => boolean;
  hasRedo: () => boolean;
  transact: (callback: () => void) => UndoLevel | null;
  ignore: (callback: () => void) => void;
  extra: (callback1: () => void, callback2: () => void) => void;
}

const isUnlocked = (locks: { value: number }) => locks.value === 0;

export const createUndoManager = (editor: Editor): UndoManager => {
  const locks = { value: 0 };
  let beforeBookmark: Bookmark | null = null;
  let index = -1;
  const data: UndoLevel[] = [];
  let isAdding = false;

  const getContent = (): string => editor.getContent({ format: 'raw', no_events: true }).replace(/\s*data-mce-selected="[^"]+"/g, '');

  const createLevel = (): UndoLevel => ({
    type: 'complete',
    content: getContent(),
    bookmark: null,
    beforeBookmark: null,
  });

  const isEq = (a: UndoLevel | undefined, b: UndoLevel | undefined) => !!a && !!b && a.content === b.content;

  const setDirty = (state: boolean) => {
    editor.setDirty(state);
  };

  const getBookmark = (): Bookmark | null => {
    try {
      return editor.selection.getBookmark(2, true);
    } catch {
      return null;
    }
  };

  const undoManager: UndoManager = {
    data,
    typing: false,

    beforeChange: () => {
      if (isUnlocked(locks)) {
        beforeBookmark = getBookmark();
      }
    },

    add: (level, event) => {
      if (!isUnlocked(locks) || isAdding) {
        return null;
      }
      isAdding = true;
      try {
        const newLevel: UndoLevel = { ...createLevel(), ...(level || {}) };
        newLevel.bookmark = getBookmark();
        newLevel.beforeBookmark = beforeBookmark;
        const lastLevel = data[index];
        const args = editor.dispatch('BeforeAddUndo', { level: newLevel, lastLevel, originalEvent: event });
        if (args.isDefaultPrevented()) {
          return null;
        }
        if (lastLevel && isEq(lastLevel, newLevel)) {
          // Content unchanged – only refresh the bookmark so undo restores the latest caret.
          lastLevel.bookmark = newLevel.bookmark;
          return null;
        }
        // Drop redo levels.
        if (data[index]) {
          data.splice(index + 1, data.length - (index + 1));
        }
        const levels = editor.options.get('custom_undo_redo_levels') as number;
        if (levels && data.length > levels) {
          data.shift();
          index--;
        }
        data.push(newLevel);
        index = data.length - 1;
        const addArgs = { level: newLevel, lastLevel, originalEvent: event };
        if (index > 0) {
          editor.dispatch('AddUndo', addArgs);
          editor.dispatch('change', addArgs);
          setDirty(true);
        } else {
          // First level is the initial content; still fire AddUndo for parity.
          editor.dispatch('AddUndo', addArgs);
        }
        return newLevel;
      } finally {
        isAdding = false;
      }
    },

    dispatchChange: () => {
      editor.setDirty(true);
      const level = createLevel();
      level.bookmark = getBookmark();
      editor.dispatch('change', { level, lastLevel: data[index] });
    },

    undo: () => {
      if (undoManager.typing) {
        undoManager.add();
        undoManager.typing = false;
      }
      if (index > 0) {
        const level = data[--index];
        applyLevel(level);
        setDirty(true);
        editor.dispatch('Undo', { level });
        return level;
      }
      return undefined;
    },

    redo: () => {
      if (index < data.length - 1) {
        const level = data[++index];
        applyLevel(level);
        setDirty(true);
        editor.dispatch('Redo', { level });
        return level;
      }
      return undefined;
    },

    clear: () => {
      data.length = 0;
      index = -1;
      undoManager.typing = false;
      beforeBookmark = null;
      editor.dispatch('ClearUndos');
    },

    reset: () => {
      undoManager.clear();
      undoManager.add();
    },

    hasUndo: () => index > 0 || (undoManager.typing && !!data[0] && !isEq(createLevel(), data[0])),
    hasRedo: () => index < data.length - 1 && !undoManager.typing,

    transact: (callback) => {
      endTyping();
      undoManager.beforeChange();
      undoManager.ignore(callback);
      return undoManager.add();
    },

    ignore: (callback) => {
      try {
        locks.value++;
        callback();
      } finally {
        locks.value--;
      }
    },

    extra: (callback1, callback2) => {
      if (undoManager.transact(callback1)) {
        const bookmark = data[index].bookmark;
        const lastLevel = data[index - 1];
        if (lastLevel) {
          applyLevel(lastLevel);
        }
        if (undoManager.transact(callback2)) {
          data[index - 1].beforeBookmark = bookmark;
        }
      }
    },
  };

  const endTyping = () => {
    if (undoManager.typing) {
      undoManager.typing = false;
      undoManager.add();
    }
  };

  const applyLevel = (level: UndoLevel) => {
    editor.setContent(level.content, { format: 'raw', no_events: true, no_selection: true });
    editor.selection.moveToBookmark(level.bookmark);
    editor.nodeChanged();
  };

  // Typing coalescing: structural keys close the current typing level.
  const isModifierKey = (e: KeyboardEvent) => e.ctrlKey || e.metaKey || e.altKey;
  editor.on('init', () => {
    undoManager.add();
  });
  editor.on('BeforeExecCommand', (e) => {
    const cmd = (e.command || '').toLowerCase();
    if (cmd !== 'undo' && cmd !== 'redo' && cmd !== 'mcerepaint' && cmd !== 'mcefocus') {
      endTyping();
      undoManager.beforeChange();
    }
  });
  editor.on('ExecCommand', (e) => {
    const cmd = (e.command || '').toLowerCase();
    if (cmd !== 'undo' && cmd !== 'redo' && cmd !== 'mcerepaint' && cmd !== 'mcefocus') {
      undoManager.add(undefined, e);
    }
  });
  editor.on('ObjectResizeStart cut', () => {
    undoManager.beforeChange();
  });
  editor.on('SaveContent ObjectResized blur', () => {
    endTyping();
  });
  editor.on('dragend', () => {
    undoManager.add();
  });
  editor.on('keyup', (e) => {
    const keyCode = e.keyCode;
    if (e.isDefaultPrevented()) {
      return;
    }
    if ((keyCode >= 33 && keyCode <= 36) || (keyCode >= 37 && keyCode <= 40) || keyCode === 45 || e.ctrlKey) {
      undoManager.add();
      editor.nodeChanged();
    }
    if (keyCode === 46 || keyCode === 8) {
      editor.nodeChanged();
    }
  });
  let firstTypedCharacter = false;
  editor.on('keydown', (e) => {
    const keyCode = e.keyCode;
    if (e.isDefaultPrevented()) {
      return;
    }
    if (editor.composing) {
      return;
    }
    // Navigation/structural keys close typing level.
    if ((keyCode >= 33 && keyCode <= 36) || (keyCode >= 37 && keyCode <= 40) || keyCode === 45) {
      endTyping();
      return;
    }
    if (keyCode === 13 || keyCode === 8 || keyCode === 46 || keyCode === 9) {
      // Enter, Backspace, Delete, Tab: own level.
      endTyping();
      undoManager.beforeChange();
      return;
    }
    const isPrintable = (keyCode >= 48 && keyCode <= 90) || (keyCode >= 96 && keyCode <= 111) || (keyCode >= 186 && keyCode <= 222) || keyCode === 32 || keyCode === 229 || keyCode === 0;
    if (isPrintable && !isModifierKey(e)) {
      if (!undoManager.typing) {
        undoManager.beforeChange();
        undoManager.typing = true;
        firstTypedCharacter = true;
        undoManager.add({ type: 'complete' } as Partial<UndoLevel>, e);
        editor.dispatch('TypingUndo');
      }
    } else if (isModifierKey(e) && !(e.key && e.key.length === 1 && e.altKey && !e.ctrlKey && !e.metaKey)) {
      endTyping();
    }
  });
  editor.on('compositionend', () => {
    if (!undoManager.typing) {
      undoManager.beforeChange();
      undoManager.typing = true;
      firstTypedCharacter = true;
      editor.dispatch('TypingUndo');
    }
  });
  editor.on('mousedown', () => {
    endTyping();
  });
  editor.on('input', (e) => {
    const inputType = e.inputType as string | undefined;
    if (inputType && /^(insertFromPaste|insertFromDrop|deleteByCut|deleteByDrag|historyUndo|historyRedo)$/.test(inputType)) {
      return;
    }
    if (!undoManager.typing && !editor.composing && inputType && /^(insertText|insertReplacementText|insertCompositionText)$/.test(inputType)) {
      undoManager.typing = true;
      firstTypedCharacter = true;
      editor.dispatch('TypingUndo');
    }
    // The first typed character makes the editor dirty straight away (TinyMCE keyup behaviour).
    if (undoManager.typing && firstTypedCharacter && !editor.composing) {
      firstTypedCharacter = false;
      if (!editor.isDirty()) {
        editor.setDirty(true);
      }
      editor.nodeChanged();
    }
  });
  editor.on('AddUndo Undo Redo ClearUndos', (e) => {
    if (!e.isDefaultPrevented()) {
      editor.nodeChanged();
    }
  });

  return undoManager;
};
