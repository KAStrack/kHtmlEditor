import { EditorManager } from './core/EditorManager';
import './ui/index';
import './plugins/index';

export { Editor } from './core/Editor';
export { EditorManager } from './core/EditorManager';
export type { Options, OptionSpec } from './core/Options';
export type * from './core/UiTypes';
export type { DialogSpec, DialogInstanceApi, WindowManager } from './core/WindowManager';
export type { NotificationSpec, NotificationApi, NotificationManager } from './core/NotificationManager';
export type { Schema } from './html/Schema';
export type { DomParser, ParserArgs } from './html/HtmlParser';
export type { Formatter, Format, Formats } from './format/Formatter';
export type { UndoManager } from './undo/UndoManager';
export type { BlobCache, BlobInfo } from './content/BlobCache';

/** The global editor manager – equivalent of the `tinymce` global. */
export const kHtmlEditor: EditorManager = new EditorManager();
export default kHtmlEditor;
