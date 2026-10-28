import type { Editor } from '../core/Editor';
import type { FormatChangedCallback, FormatVars } from './Formatter';
import * as MatchFormat from './MatchFormat';
import * as FormatUtils from './FormatUtils';

/** `formatter.formatChanged`: notifies callbacks when a format's match state changes at the caret. */
interface FormatCallback {
  state: boolean;
  similar: boolean;
  vars?: FormatVars;
  callbacks: FormatChangedCallback[];
}

export const createFormatChanged = (editor: Editor) => {
  const registered: Record<string, FormatCallback[]> = {};

  const check = (parents: Node[]) => {
    for (const formatName of Object.keys(registered)) {
      for (const entry of registered[formatName]) {
        let matchedNode: Node | null = null;
        if (FormatUtils.isVariableFormatName(editor, formatName) && !entry.vars) {
          // Formats with variables are matched with similar=true when no vars are given.
          matchedNode = parents.find((p) => MatchFormat.matchNode(editor, p, formatName, undefined, true)) ?? null;
        } else {
          matchedNode = parents.find((p) => MatchFormat.matchNode(editor, p, formatName, entry.vars, entry.similar)) ?? null;
        }
        const state = !!matchedNode;
        if (state !== entry.state) {
          entry.state = state;
          const node = matchedNode ?? parents[0];
          entry.callbacks.forEach((cb) => cb(state, { node, format: formatName, parents }));
        }
      }
    }
  };

  editor.on('NodeChange', (e) => {
    check(e.parents as Node[]);
  });

  const formatChanged = (formats: string, callback: FormatChangedCallback, similar: boolean = false, vars?: FormatVars) => {
    const names = formats.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    const entries: Array<{ name: string; entry: FormatCallback }> = [];
    for (const name of names) {
      const list = (registered[name] = registered[name] || []);
      let entry = list.find((e) => e.similar === similar && JSON.stringify(e.vars) === JSON.stringify(vars));
      if (!entry) {
        entry = { state: false, similar, vars, callbacks: [] };
        list.push(entry);
      }
      entry.callbacks.push(callback);
      entries.push({ name, entry });
    }
    // Fire the initial state when the editor is ready.
    if (editor.initialized) {
      const parents = editor.dom.getParents(editor.selection.getStart(), () => true, editor.getBody());
      for (const { name, entry } of entries) {
        const matched = parents.some((p) => MatchFormat.matchNode(editor, p, name, entry.vars, entry.similar));
        if (matched !== entry.state) {
          entry.state = matched;
        }
        if (matched) {
          callback(true, { node: parents[0], format: name, parents });
        }
      }
    }
    return {
      unbind: () => {
        for (const { name, entry } of entries) {
          entry.callbacks = entry.callbacks.filter((cb) => cb !== callback);
          if (entry.callbacks.length === 0 && registered[name]) {
            registered[name] = registered[name].filter((e) => e !== entry);
          }
        }
      },
    };
  };

  return { formatChanged };
};
