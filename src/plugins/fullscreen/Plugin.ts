import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';

/** Fullscreen plugin: the editor container fills the viewport (or uses the Fullscreen API). */
const register = (editor: Editor): Record<string, any> => {
  editor.options.register('fullscreen_native', { processor: 'boolean', default: false });
  let active = false;
  let savedIframeHeight: string | null = null;
  let savedScroll = { x: 0, y: 0 };

  const setState = (state: boolean) => {
    const container = editor.getContainer();
    if (!container || state === active) {
      return;
    }
    active = state;
    const iframe = editor.iframeElement;
    const html = document.documentElement;
    if (state) {
      savedScroll = { x: window.scrollX, y: window.scrollY };
      savedIframeHeight = iframe ? iframe.style.height : null;
      if (iframe) {
        iframe.style.height = '';
      }
      container.classList.add('khe-fullscreen');
      html.classList.add('khe-fullscreen-root');
      document.body.classList.add('khe-fullscreen-root');
      if (editor.options.get('fullscreen_native') && container.requestFullscreen) {
        container.requestFullscreen().catch(() => undefined);
      }
    } else {
      container.classList.remove('khe-fullscreen');
      html.classList.remove('khe-fullscreen-root');
      document.body.classList.remove('khe-fullscreen-root');
      if (iframe && savedIframeHeight !== null) {
        iframe.style.height = savedIframeHeight;
      }
      if (document.fullscreenElement === container && document.exitFullscreen) {
        document.exitFullscreen().catch(() => undefined);
      }
      window.scrollTo(savedScroll.x, savedScroll.y);
    }
    editor.dispatch('FullscreenStateChanged', { state });
    editor.dispatch('ResizeEditor');
    editor.focus();
  };

  document.addEventListener('fullscreenchange', () => {
    if (active && editor.options.get('fullscreen_native') && !document.fullscreenElement) {
      setState(false);
    }
  });

  editor.editorCommands.addCommands({ mceFullScreen: () => setState(!active) });
  editor.editorCommands.addCommands({ mceFullScreen: () => active }, 'state');
  editor.addShortcut('Meta+Shift+F', 'Fullscreen', () => editor.execCommand('mceFullScreen'));

  const setup = (api: { setActive: (s: boolean) => void }) => {
    const update = (e?: any) => api.setActive(e && typeof e.state === 'boolean' ? e.state : active);
    editor.on('FullscreenStateChanged', update);
    update();
    return () => editor.off('FullscreenStateChanged', update);
  };
  editor.ui.registry.addToggleButton('fullscreen', { icon: 'fullscreen', tooltip: 'Fullscreen', shortcut: 'Meta+Shift+F', onAction: () => editor.execCommand('mceFullScreen'), onSetup: setup });
  editor.ui.registry.addToggleMenuItem('fullscreen', { icon: 'fullscreen', text: 'Fullscreen', shortcut: 'Meta+Shift+F', onAction: () => editor.execCommand('mceFullScreen'), onSetup: setup });
  editor.on('remove', () => {
    if (active) {
      setState(false);
    }
  });

  return { isFullscreen: () => active };
};

PluginManager.add('fullscreen', register);
export default register;
