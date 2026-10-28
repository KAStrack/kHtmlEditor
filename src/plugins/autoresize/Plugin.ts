import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';

/** Autoresize plugin: the editor grows and shrinks with its content between min_height and max_height. */
const register = (editor: Editor): void => {
  editor.options.register('autoresize_overflow_padding', { processor: 'number', default: 1 });
  editor.options.register('autoresize_bottom_margin', { processor: 'number', default: 50 });
  // The manual resize handle makes no sense with automatic sizing.
  editor.options.set('resize', false);

  let oldSize = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const isFullscreen = () => !!editor.plugins.fullscreen && (editor.plugins.fullscreen as any).isFullscreen();

  const resize = () => {
    const doc = editor.getDoc();
    const body = editor.getBody();
    const iframe = editor.iframeElement;
    if (!doc || !body || !iframe || editor.removed || isFullscreen()) {
      return;
    }
    const dom = editor.dom;
    const minHeight = (editor.options.get('min_height') as number) || 0;
    const maxHeight = (editor.options.get('max_height') as number) || 0;
    const bottomMargin = editor.options.get('autoresize_bottom_margin') as number;
    const overflowPadding = editor.options.get('autoresize_overflow_padding') as number;
    const marginTop = parseInt(dom.getStyle(body, 'margin-top', true) || '0', 10) || 0;
    const marginBottom = parseInt(dom.getStyle(body, 'margin-bottom', true) || '0', 10) || 0;
    const borders = (parseInt(dom.getStyle(body, 'border-top-width', true) || '0', 10) || 0) + (parseInt(dom.getStyle(body, 'border-bottom-width', true) || '0', 10) || 0);
    let contentHeight = body.offsetHeight + marginTop + marginBottom + borders + bottomMargin;
    if (isNaN(contentHeight) || contentHeight <= 0) {
      contentHeight = doc.documentElement.offsetHeight || body.scrollHeight;
    }
    let newHeight = Math.max(minHeight, contentHeight);
    if (maxHeight && newHeight > maxHeight) {
      newHeight = maxHeight;
      dom.setStyle(body, 'overflow-y', '');
      dom.setStyle(doc.documentElement, 'overflow-y', '');
    } else {
      dom.setStyle(body, 'overflow-y', 'hidden');
      dom.setStyle(doc.documentElement, 'overflow-y', 'hidden');
    }
    const container = editor.getContainer();
    if (newHeight !== oldSize) {
      const delta = newHeight - oldSize;
      oldSize = newHeight;
      iframe.style.height = newHeight + 'px';
      if (container) {
        container.style.height = '';
      }
      editor.dispatch('ResizeEditor', { height: newHeight, delta });
    }
    // Keep paddings consistent so the last line is never hidden under the fold.
    dom.setStyle(body, 'padding-bottom', overflowPadding + 'px');
  };

  const schedule = () => {
    if (timer) {
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      resize();
    }, 0);
  };

  editor.editorCommands.addCommands({ mceAutoResize: () => resize() });
  editor.on('init', () => {
    resize();
    // Fonts and images may load after init; settle over the first seconds.
    let runs = 0;
    const tick = setInterval(() => {
      resize();
      if (++runs >= 10 || editor.removed) {
        clearInterval(tick);
      }
    }, 100);
    editor.getDoc().addEventListener('load', schedule, true);
  });
  editor.on('NodeChange SetContent keyup input change undo redo FullscreenStateChanged ResizeContent ExecCommand', schedule);
  editor.on('remove', () => {
    if (timer) {
      clearTimeout(timer);
    }
  });
};

PluginManager.add('autoresize', register);
export default register;
