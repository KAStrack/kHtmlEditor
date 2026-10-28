import type { Editor } from '../../core/Editor';
import { PluginManager } from '../../core/AddOnManager';
import { openDialog } from './MediaDialog';
import { setupNodes, getMediaNode } from './Nodes';
import { dataToHtml } from './DataToHtml';
import { htmlToData } from './HtmlToData';

/**
 * Media plugin: video/audio/iframe embeds with provider URL resolution, embed code editing,
 * poster and alternative sources, live previews in the editor and (kHtmlEditor extension) video
 * and audio file upload through `media_upload_url`/`media_upload_handler`.
 */
const registerOptions = (editor: Editor) => {
  const r = editor.options.register;
  r('media_alt_source', { processor: 'boolean', default: true });
  r('media_poster', { processor: 'boolean', default: true });
  r('media_dimensions', { processor: 'boolean', default: true });
  r('media_live_embeds', { processor: 'boolean', default: true });
  r('media_filter_html', { processor: 'boolean', default: true });
  r('media_url_resolver', { processor: 'function' });
  r('media_uploadtab', { processor: 'boolean', default: true });
  r('audio_template_callback', { processor: 'function' });
  r('video_template_callback', { processor: 'function' });
  r('iframe_template_callback', { processor: 'function' });
};

const register = (editor: Editor): Record<string, any> => {
  registerOptions(editor);
  setupNodes(editor);

  editor.editorCommands.addCommands({
    mceMedia: () => openDialog(editor),
  });

  const setup = (api: { setEnabled: (s: boolean) => void; setActive?: (s: boolean) => void }) => {
    const update = () => {
      api.setEnabled(!editor.readonly && editor.selection.isEditable());
      if (api.setActive) {
        api.setActive(!!getMediaNode(editor, editor.selection.getNode()));
      }
    };
    editor.on('NodeChange SwitchMode', update);
    update();
    return () => editor.off('NodeChange SwitchMode', update);
  };
  editor.ui.registry.addToggleButton('media', { icon: 'embed', tooltip: 'Insert/edit media', onAction: () => editor.execCommand('mceMedia'), onSetup: setup });
  editor.ui.registry.addMenuItem('media', { icon: 'embed', text: 'Media...', onAction: () => editor.execCommand('mceMedia'), onSetup: setup as any });
  editor.ui.registry.addContextMenu('media', { update: (node) => (getMediaNode(editor, node) ? 'media' : '') });

  editor.on('dblclick', (e) => {
    const media = getMediaNode(editor, e.target as Node);
    if (media && !editor.readonly) {
      e.preventDefault();
      editor.selection.select(media);
      openDialog(editor);
    }
  });

  return {
    showDialog: () => openDialog(editor),
    dataToHtml: (data: any) => dataToHtml(editor, data),
    htmlToData,
  };
};

PluginManager.add('media', register);
export default register;
