import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';

/** Visual blocks plugin: dashed outlines around block elements (`mce-visualblocks` body class). */
const register = (editor: Editor): void => {
  editor.options.register('visualblocks_default_state', { processor: 'boolean', default: false });
  let enabled = false;

  const apply = (state: boolean) => {
    enabled = state;
    editor.getBody().classList.toggle('mce-visualblocks', state);
    editor.dispatch('VisualBlocks', { state });
  };

  editor.editorCommands.addCommands({ mceVisualBlocks: () => apply(!enabled) });
  editor.editorCommands.addCommands({ mceVisualBlocks: () => enabled }, 'state');

  editor.on('init', () => {
    if (editor.options.get('visualblocks_default_state')) {
      apply(true);
    }
  });

  const setup = (api: { setActive: (s: boolean) => void }) => {
    const update = (e?: any) => api.setActive(e && typeof e.state === 'boolean' ? e.state : enabled);
    editor.on('VisualBlocks', update);
    update();
    return () => editor.off('VisualBlocks', update);
  };
  editor.ui.registry.addToggleButton('visualblocks', { icon: 'visualblocks', tooltip: 'Show blocks', onAction: () => editor.execCommand('mceVisualBlocks'), onSetup: setup });
  editor.ui.registry.addToggleMenuItem('visualblocks', { icon: 'visualblocks', text: 'Show blocks', onAction: () => editor.execCommand('mceVisualBlocks'), onSetup: setup });
};

PluginManager.add('visualblocks', register);
export default register;
