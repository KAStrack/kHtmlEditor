import type { Editor } from './Editor';
import { isString, isBoolean, isArray, isFunction, isObject, isNumber } from '../util/Type';
import { explode } from '../util/Str';
import { DEFAULT_IFRAME_EXCLUSIONS } from '../html/Sanitizer';

/**
 * Registers the core editor options (defaults and processors) and exposes typed getters.
 * Names, defaults and semantics follow TinyMCE 6/7 so existing configs behave the same.
 */

const stringOrFalse = (value: unknown) => (value === false || isString(value) ? { valid: true as const, value } : { valid: false as const, message: 'Must be a string or false.' });

const stringList = (value: unknown): { valid: true; value: string[] } | { valid: false; message: string } => {
  if (isString(value)) {
    return { valid: true, value: explode(value, /[ ,]/) };
  }
  if (isArray(value)) {
    const out: string[] = [];
    for (const v of value) {
      if (isString(v)) {
        out.push(...explode(v, /[ ,]/));
      } else {
        return { valid: false, message: 'Must be an array of strings.' };
      }
    }
    return { valid: true, value: out };
  }
  return { valid: false, message: 'Must be a string or array of strings.' };
};

const numberOrString = (value: unknown) => (isNumber(value) || isString(value) ? { valid: true as const, value } : { valid: false as const, message: 'Must be a number or string.' });

export const registerOptions = (editor: Editor): void => {
  const registerOption = editor.options.register;
  const documentBaseURL = editor.editorManager.documentBaseURL;

  registerOption('id', { processor: 'string', default: editor.id });
  registerOption('selector', { processor: 'string' });
  registerOption('target', { processor: 'object' });
  registerOption('suffix', { processor: 'string' });
  registerOption('cache_suffix', { processor: 'string' });
  registerOption('base_url', { processor: 'string' });
  registerOption('referrer_policy', { processor: 'string', default: '' });
  registerOption('language_load', { processor: 'boolean', default: true });
  registerOption('inline', { processor: 'boolean', default: false });
  registerOption('iframe_attrs', { processor: 'object', default: {} });
  registerOption('doctype', { processor: 'string', default: '<!DOCTYPE html>' });
  registerOption('document_base_url', { processor: 'string', default: documentBaseURL });
  registerOption('body_id', { processor: 'string', default: 'tinymce' });
  registerOption('body_class', { processor: 'string', default: '' });
  registerOption('content_security_policy', { processor: 'string', default: '' });
  registerOption('br_in_pre', { processor: 'boolean', default: true });
  registerOption('forced_root_block', {
    processor: (value: unknown) => {
      if (isString(value) && value.length > 0) {
        return { valid: true, value };
      }
      if (value === false || value === '') {
        console.warn('kHtmlEditor: forced_root_block cannot be disabled; using "p".');
        return { valid: true, value: 'p' };
      }
      return { valid: false, message: 'Must be a non-empty string.' };
    },
    default: 'p',
  });
  registerOption('forced_root_block_attrs', { processor: 'object', default: {} });
  registerOption('newline_behavior', {
    processor: (value: unknown) => (isString(value) && ['block', 'linebreak', 'invert', 'default'].includes(value) ? { valid: true, value } : { valid: false, message: 'Must be one of: default, block, linebreak or invert.' }),
    default: 'default',
  });
  registerOption('br_newline_selector', { processor: 'string', default: '.mce-toc h2,figcaption,caption' });
  registerOption('no_newline_selector', { processor: 'string', default: '' });
  registerOption('keep_styles', { processor: 'boolean', default: true });
  registerOption('end_container_on_empty_block', { processor: (value: unknown) => (isBoolean(value) || isString(value) ? { valid: true, value } : { valid: false, message: 'Must be boolean or a string' }), default: 'blockquote' });
  registerOption('font_size_style_values', { processor: 'string', default: 'xx-small,x-small,small,medium,large,x-large,xx-large' });
  registerOption('font_size_legacy_values', { processor: 'string', default: 'xx-small,small,medium,large,x-large,xx-large,300%' });
  registerOption('font_size_classes', { processor: 'string', default: '' });
  registerOption('automatic_uploads', { processor: 'boolean', default: true });
  registerOption('images_reuse_filename', { processor: 'boolean', default: false });
  registerOption('images_replace_blob_uris', { processor: 'boolean', default: true });
  registerOption('icons', { processor: 'string', default: '' });
  registerOption('icons_url', { processor: 'string', default: '' });
  registerOption('images_upload_url', { processor: 'string', default: '' });
  registerOption('images_upload_base_path', { processor: 'string', default: '' });
  registerOption('images_upload_handler', { processor: 'function' });
  registerOption('images_upload_credentials', { processor: 'boolean', default: false });
  registerOption('images_file_types', { processor: 'string', default: 'jpeg,jpg,jpe,jfi,jif,jfif,png,gif,bmp,webp,avif' });
  registerOption('media_upload_url', { processor: 'string', default: '' });
  registerOption('media_upload_handler', { processor: 'function' });
  registerOption('media_file_types', { processor: 'string', default: 'mp4,webm,ogv,mov,m4v,mp3,ogg,wav,weba,m4a' });
  registerOption('upload_max_file_size', { processor: 'number', default: 0 });
  registerOption('language', { processor: 'string', default: 'en' });
  registerOption('language_url', { processor: 'string', default: '' });
  registerOption('entity_encoding', { processor: 'string', default: 'named' });
  registerOption('indent', { processor: 'boolean', default: true });
  registerOption('indent_before', {
    processor: 'string',
    default: 'p,h1,h2,h3,h4,h5,h6,blockquote,div,title,style,pre,script,td,th,li,area,table,thead,tfoot,tbody,tr,section,summary,article,hgroup,aside,header,footer,nav,figure,option,optgroup,datalist',
  });
  registerOption('indent_after', {
    processor: 'string',
    default: 'p,h1,h2,h3,h4,h5,h6,blockquote,div,title,style,pre,script,td,th,li,area,table,thead,tfoot,tbody,tr,section,summary,article,hgroup,aside,header,footer,nav,figure,option,optgroup,datalist',
  });
  registerOption('indent_use_margin', { processor: 'boolean', default: false });
  registerOption('indentation', { processor: 'string', default: '40px' });
  registerOption('content_css', {
    processor: (value: unknown) => {
      if (value === false) {
        return { valid: true, value: [] };
      }
      if (isString(value)) {
        return { valid: true, value: value.split(',').map((s) => s.trim()).filter((s) => s.length > 0) };
      }
      if (isArray(value) && value.every(isString)) {
        return { valid: true, value };
      }
      return { valid: false, message: 'Must be a string, string array or false.' };
    },
    default: editor.inline ? [] : ['default'],
  });
  registerOption('content_style', { processor: 'string' });
  registerOption('content_css_cors', { processor: 'boolean', default: false });
  registerOption('font_css', { processor: (value: unknown) => (isString(value) ? { valid: true, value: value.split(',').map((s) => s.trim()) } : isArray(value) ? { valid: true, value } : { valid: false, message: 'Must be a string or array.' }), default: [] });
  registerOption('inline_boundaries', { processor: 'boolean', default: true });
  registerOption('inline_boundaries_selector', { processor: 'string', default: 'a[href],code,span.mce-annotation' });
  registerOption('object_resizing', {
    processor: (value: unknown) => {
      if (isBoolean(value)) {
        return { valid: true, value: value ? 'table,img,figure.image,div,video,iframe' : '' };
      }
      if (isString(value)) {
        return { valid: true, value };
      }
      return { valid: false, message: 'Must be boolean or a string' };
    },
    default: 'table,img,figure.image,div,video,iframe',
  });
  registerOption('resize_img_proportional', { processor: 'boolean', default: true });
  registerOption('event_root', { processor: 'object' });
  registerOption('service_message', { processor: 'string' });
  registerOption('theme', { processor: (value: unknown) => (value === false || isString(value) || isFunction(value) ? { valid: true, value } : { valid: false, message: 'Must be a string, function or false.' }), default: 'silver' });
  registerOption('theme_url', { processor: 'string' });
  registerOption('formats', { processor: 'object' });
  registerOption('format_empty_lines', { processor: 'boolean', default: false });
  registerOption('format_noneditable_selector', { processor: 'string', default: 'svg,math,div[data-ephox-embed-iri]' });
  registerOption('preview_styles', {
    processor: (value: unknown) => (value === false ? { valid: true, value: '' } : isString(value) ? { valid: true, value } : { valid: false, message: 'Must be false or a string' }),
    default: 'font-family font-size font-weight font-style text-decoration text-transform color background-color border border-radius outline text-shadow',
  });
  registerOption('custom_ui_selector', { processor: 'string', default: '' });
  registerOption('hidden_input', { processor: 'boolean', default: true });
  registerOption('submit_patch', { processor: 'boolean', default: true });
  registerOption('encoding', { processor: 'string' });
  registerOption('add_form_submit_trigger', { processor: 'boolean', default: true });
  registerOption('add_unload_trigger', { processor: 'boolean', default: true });
  registerOption('custom_undo_redo_levels', { processor: 'number', default: 0 });
  registerOption('disable_nodechange', { processor: 'boolean', default: false });
  registerOption('readonly', { processor: 'boolean', default: false });
  registerOption('disabled', { processor: 'boolean', default: false });
  registerOption('editable_root', { processor: 'boolean', default: true });
  registerOption('plugins', { processor: stringList, default: [] });
  registerOption('external_plugins', { processor: 'object', default: {} });
  registerOption('forced_plugins', { processor: stringList, default: [] });
  registerOption('model', { processor: 'string', default: 'dom' });
  registerOption('model_url', { processor: 'string' });
  registerOption('block_unsupported_drop', { processor: 'boolean', default: true });
  registerOption('visual', { processor: 'boolean', default: true });
  registerOption('visual_table_class', { processor: 'string', default: 'mce-item-table' });
  registerOption('visual_anchor_class', { processor: 'string', default: 'mce-item-anchor' });
  registerOption('iframe_aria_text', { processor: 'string', default: 'Rich Text Area. Press ALT-0 for help.' });
  registerOption('setup', { processor: 'function' });
  registerOption('init_instance_callback', { processor: 'function' });
  registerOption('url_converter', { processor: 'function', default: editor.convertURL });
  registerOption('url_converter_scope', { processor: 'object', default: editor });
  registerOption('urlconverter_callback', { processor: 'function' });
  registerOption('allow_conditional_comments', { processor: 'boolean', default: false });
  registerOption('allow_html_data_urls', { processor: 'boolean', default: false });
  registerOption('allow_svg_data_urls', { processor: 'boolean' });
  registerOption('allow_html_in_named_anchor', { processor: 'boolean', default: false });
  registerOption('allow_html_in_comments', { processor: 'boolean', default: false });
  registerOption('allow_script_urls', { processor: 'boolean', default: false });
  registerOption('allow_unsafe_link_target', { processor: 'boolean', default: false });
  registerOption('convert_fonts_to_spans', { processor: 'boolean', default: true, deprecated: true });
  registerOption('fix_list_elements', { processor: 'boolean', default: false });
  registerOption('preserve_cdata', { processor: 'boolean', default: false });
  registerOption('remove_trailing_brs', { processor: 'boolean', default: true });
  registerOption('pad_empty_with_br', { processor: 'boolean', default: false });
  registerOption('inline_styles', { processor: 'boolean', default: true, deprecated: true });
  registerOption('element_format', { processor: 'string', default: 'html' });
  registerOption('entities', { processor: 'string' });
  registerOption('schema', { processor: 'string', default: 'html5' });
  registerOption('convert_urls', { processor: 'boolean', default: true });
  registerOption('relative_urls', { processor: 'boolean', default: true });
  registerOption('remove_script_host', { processor: 'boolean', default: true });
  registerOption('custom_elements', { processor: 'string' });
  registerOption('extended_valid_elements', { processor: 'string' });
  registerOption('invalid_elements', { processor: 'string' });
  registerOption('invalid_styles', { processor: (value: unknown) => (isString(value) || isObject(value) ? { valid: true, value } : { valid: false, message: 'Must be a string or object.' }) });
  registerOption('valid_children', { processor: 'string' });
  registerOption('valid_classes', { processor: (value: unknown) => (isString(value) || isObject(value) ? { valid: true, value } : { valid: false, message: 'Must be a string or object.' }) });
  registerOption('valid_elements', { processor: 'string' });
  registerOption('valid_styles', { processor: (value: unknown) => (isString(value) || isObject(value) ? { valid: true, value } : { valid: false, message: 'Must be a string or object.' }) });
  registerOption('verify_html', { processor: 'boolean', default: true });
  registerOption('auto_focus', { processor: (value: unknown) => (isString(value) || isBoolean(value) ? { valid: true, value } : { valid: false, message: 'Must be a string or boolean.' }) });
  registerOption('browser_spellcheck', { processor: 'boolean', default: false });
  registerOption('protect', { processor: 'array' });
  registerOption('images_dataimg_filter', { processor: 'function', default: () => true });
  registerOption('placeholder', { processor: 'string', default: (editor.getElement() as HTMLTextAreaElement | null)?.getAttribute?.('placeholder') ?? undefined });
  registerOption('text_patterns', {
    processor: (value: unknown) => (isArray(value) || value === false ? { valid: true, value: value === false ? [] : value } : { valid: false, message: 'Must be an array of objects or false.' }),
    default: [
      { start: '*', end: '*', format: 'italic' },
      { start: '**', end: '**', format: 'bold' },
      { start: '#', format: 'h1' },
      { start: '##', format: 'h2' },
      { start: '###', format: 'h3' },
      { start: '####', format: 'h4' },
      { start: '#####', format: 'h5' },
      { start: '######', format: 'h6' },
      { start: '1. ', cmd: 'InsertOrderedList' },
      { start: '* ', cmd: 'InsertUnorderedList' },
      { start: '- ', cmd: 'InsertUnorderedList' },
      { start: '---', replacement: '<hr/>' },
      { start: '--', replacement: '—' },
      { start: '(c)', replacement: '©' },
    ],
  });
  registerOption('text_patterns_lookup', { processor: 'function', default: () => [] });
  registerOption('noneditable_class', { processor: 'string', default: 'mceNonEditable' });
  registerOption('editable_class', { processor: 'string', default: 'mceEditable' });
  registerOption('noneditable_regexp', { processor: (value: unknown) => (isArray(value) ? { valid: true, value } : value instanceof RegExp ? { valid: true, value: [value] } : { valid: false, message: 'Must be a RegExp or an array of RegExp.' }), default: [] });
  registerOption('table_tab_navigation', { processor: 'boolean', default: true });
  registerOption('highlight_on_focus', { processor: 'boolean', default: true });
  registerOption('xss_sanitization', { processor: 'boolean', default: true });
  registerOption('details_initial_state', { processor: 'string', default: 'inherited' });
  registerOption('details_serialized_state', { processor: 'string', default: 'inherited' });
  registerOption('init_content_sync', { processor: 'boolean', default: false });
  registerOption('newdocument_content', { processor: 'string', default: '' });
  registerOption('sandbox_iframes', { processor: 'boolean', default: true });
  registerOption('sandbox_iframes_exclusions', { processor: 'string[]', default: DEFAULT_IFRAME_EXCLUSIONS });
  registerOption('convert_unsafe_embeds', { processor: 'boolean', default: true });
  registerOption('license_key', { processor: 'string' });
  registerOption('height', { processor: numberOrString, default: Math.max((editor.getElement() as HTMLElement | null)?.offsetHeight ?? 0, 200) });
  registerOption('width', { processor: numberOrString });
  registerOption('min_height', { processor: 'number', default: 100 });
  registerOption('max_height', { processor: 'number', default: 0 });
  registerOption('min_width', { processor: 'number' });
  registerOption('max_width', { processor: 'number' });
  registerOption('directionality', { processor: 'string' });
  registerOption('placeholder_mode', { processor: 'string', default: 'auto' });
  registerOption('code_view', { processor: 'string', default: 'dialog' });
  registerOption('paste_as_text', { processor: 'boolean', default: false });
  registerOption('paste_block_drop', { processor: 'boolean', default: false });
  registerOption('paste_data_images', { processor: 'boolean', default: true });
  registerOption('paste_preprocess', { processor: 'function' });
  registerOption('paste_postprocess', { processor: 'function' });
  registerOption('paste_webkit_styles', { processor: 'string', default: 'none' });
  registerOption('paste_remove_styles_if_webkit', { processor: 'boolean', default: true });
  registerOption('paste_merge_formats', { processor: 'boolean', default: true });
  registerOption('paste_tab_spaces', { processor: 'number', default: 4 });
  registerOption('smart_paste', { processor: 'boolean', default: true });
  registerOption('file_picker_callback', { processor: 'function' });
  registerOption('file_picker_types', { processor: 'string' });
  registerOption('file_picker_validator_handler', { processor: 'function' });
  registerOption('typeahead_urls', { processor: 'boolean', default: true });
  registerOption('promotion', { processor: 'boolean', default: false });
  registerOption('branding', { processor: 'boolean', default: false });
  registerOption('content_langs', { processor: 'object[]' });
  // Accept-and-ignore for TinyMCE cloud options.
  registerOption('cloud_channel', { processor: 'string' });
  registerOption('deprecation_warnings', { processor: 'boolean', default: true });

  (stringOrFalse as unknown as () => void)();
};

/** Typed accessors for frequently used options. */
export const getOption = <T = any>(editor: Editor, name: string): T => editor.options.get<T>(name);
export const getForcedRootBlock = (editor: Editor): string => editor.options.get('forced_root_block');
export const getForcedRootBlockAttrs = (editor: Editor): Record<string, string> => editor.options.get('forced_root_block_attrs');
export const getContentCss = (editor: Editor): string[] => editor.options.get('content_css');
export const getContentStyle = (editor: Editor): string | undefined => editor.options.get('content_style');
export const getBodyId = (editor: Editor): string => editor.options.get('body_id');
export const getBodyClass = (editor: Editor): string => editor.options.get('body_class');
export const getIframeAttrs = (editor: Editor): Record<string, string> => editor.options.get('iframe_attrs');
export const getIframeAriaText = (editor: Editor): string => editor.options.get('iframe_aria_text');
export const getDocType = (editor: Editor): string => editor.options.get('doctype');
export const getPlugins = (editor: Editor): string[] => editor.options.get('plugins');
export const getExternalPlugins = (editor: Editor): Record<string, string> => editor.options.get('external_plugins');
export const getForcedPlugins = (editor: Editor): string[] => editor.options.get('forced_plugins');
export const isReadOnly = (editor: Editor): boolean => editor.options.get('readonly');
export const hasHiddenInput = (editor: Editor): boolean => editor.options.get('hidden_input');
export const shouldPatchSubmit = (editor: Editor): boolean => editor.options.get('submit_patch');
export const shouldAddFormSubmitTrigger = (editor: Editor): boolean => editor.options.get('add_form_submit_trigger');
export const shouldAddUnloadTrigger = (editor: Editor): boolean => editor.options.get('add_unload_trigger');
export const getAutoFocus = (editor: Editor): string | boolean | undefined => editor.options.get('auto_focus');
export const shouldBrowserSpellcheck = (editor: Editor): boolean => editor.options.get('browser_spellcheck');
export const getProtect = (editor: Editor): RegExp[] | undefined => editor.options.get('protect');
export const getDirectionality = (editor: Editor): string | undefined => editor.options.get('directionality');
export const isVisualAidsEnabled = (editor: Editor): boolean => editor.options.get('visual');
export const getVisualAidsTableClass = (editor: Editor): string => editor.options.get('visual_table_class');
export const getVisualAidsAnchorClass = (editor: Editor): string => editor.options.get('visual_anchor_class');
export const getHeight = (editor: Editor): number | string => editor.options.get('height');
export const getWidth = (editor: Editor): number | string | undefined => editor.options.get('width');
export const getMinHeight = (editor: Editor): number => editor.options.get('min_height');
export const getMaxHeight = (editor: Editor): number => editor.options.get('max_height');
export const getPlaceholder = (editor: Editor): string | undefined => editor.options.get('placeholder');
export const getLanguageCode = (editor: Editor): string => editor.options.get('language');
export const getLanguageUrl = (editor: Editor): string => editor.options.get('language_url');
export const getContentSecurityPolicy = (editor: Editor): string => editor.options.get('content_security_policy');
export const shouldConvertUrls = (editor: Editor): boolean => editor.options.get('convert_urls');
export const shouldUseRelativeUrls = (editor: Editor): boolean => editor.options.get('relative_urls');
export const shouldRemoveScriptHost = (editor: Editor): boolean => editor.options.get('remove_script_host');
export const getUrlConverterCallback = (editor: Editor): ((url: string, node: any, on_save: boolean, name: string) => string) | undefined => editor.options.get('urlconverter_callback');
export const getSetupCallback = (editor: Editor): ((editor: Editor) => void) | undefined => editor.options.get('setup');
export const getInitInstanceCallback = (editor: Editor): ((editor: Editor) => void) | undefined => editor.options.get('init_instance_callback');
export const getCustomUndoRedoLevels = (editor: Editor): number => editor.options.get('custom_undo_redo_levels');
export const getNewDocumentContent = (editor: Editor): string => editor.options.get('newdocument_content');
export const getInlineBoundariesSelector = (editor: Editor): string => editor.options.get('inline_boundaries_selector');
export const isInlineBoundariesEnabled = (editor: Editor): boolean => editor.options.get('inline_boundaries');
export const getObjectResizing = (editor: Editor): string => editor.options.get('object_resizing');
export const isResizeImgProportional = (editor: Editor): boolean => editor.options.get('resize_img_proportional');
export const getTextPatterns = (editor: Editor): any[] => editor.options.get('text_patterns');
export const getNonEditableClass = (editor: Editor): string => editor.options.get('noneditable_class');
export const getEditableClass = (editor: Editor): string => editor.options.get('editable_class');
export const shouldHighlightOnFocus = (editor: Editor): boolean => editor.options.get('highlight_on_focus');
export const getIndentation = (editor: Editor): string => editor.options.get('indentation');
export const shouldIndentUseMargin = (editor: Editor): boolean => editor.options.get('indent_use_margin');
export const getFontSizeStyleValues = (editor: Editor): string => editor.options.get('font_size_style_values');
export const getFontSizeClasses = (editor: Editor): string => editor.options.get('font_size_classes');
export const shouldKeepStyles = (editor: Editor): boolean => editor.options.get('keep_styles');
export const getEndContainerOnEmptyBlock = (editor: Editor): boolean | string => editor.options.get('end_container_on_empty_block');
export const getBrNewLineSelector = (editor: Editor): string => editor.options.get('br_newline_selector');
export const getNoNewLineSelector = (editor: Editor): string => editor.options.get('no_newline_selector');
export const getNewlineBehavior = (editor: Editor): string => editor.options.get('newline_behavior');
export const shouldBrInPre = (editor: Editor): boolean => editor.options.get('br_in_pre');
export const getImagesUploadUrl = (editor: Editor): string => editor.options.get('images_upload_url');
export const getImagesUploadHandler = (editor: Editor): any => editor.options.get('images_upload_handler');
export const getImagesUploadBasePath = (editor: Editor): string => editor.options.get('images_upload_base_path');
export const getImagesUploadCredentials = (editor: Editor): boolean => editor.options.get('images_upload_credentials');
export const isAutomaticUploadsEnabled = (editor: Editor): boolean => editor.options.get('automatic_uploads');
export const shouldReuseFileName = (editor: Editor): boolean => editor.options.get('images_reuse_filename');
export const shouldReplaceBlobUris = (editor: Editor): boolean => editor.options.get('images_replace_blob_uris');
export const getImageFileTypes = (editor: Editor): string[] => explode(editor.options.get('images_file_types'));
export const getMediaFileTypes = (editor: Editor): string[] => explode(editor.options.get('media_file_types'));
export const getMediaUploadUrl = (editor: Editor): string => editor.options.get('media_upload_url');
export const getMediaUploadHandler = (editor: Editor): any => editor.options.get('media_upload_handler');
export const getUploadMaxFileSize = (editor: Editor): number => editor.options.get('upload_max_file_size');
export const getImagesDataImgFilter = (editor: Editor): (img: HTMLImageElement) => boolean => editor.options.get('images_dataimg_filter');
export const isPasteAsText = (editor: Editor): boolean => editor.options.get('paste_as_text');
export const shouldPasteDataImages = (editor: Editor): boolean => editor.options.get('paste_data_images');
export const getPastePreProcess = (editor: Editor): any => editor.options.get('paste_preprocess');
export const getPastePostProcess = (editor: Editor): any => editor.options.get('paste_postprocess');
export const getPasteWebkitStyles = (editor: Editor): string => editor.options.get('paste_webkit_styles');
export const shouldPasteRemoveWebKitStyles = (editor: Editor): boolean => editor.options.get('paste_remove_styles_if_webkit');
export const shouldPasteMergeFormats = (editor: Editor): boolean => editor.options.get('paste_merge_formats');
export const getPasteTabSpaces = (editor: Editor): number => editor.options.get('paste_tab_spaces');
export const isSmartPasteEnabled = (editor: Editor): boolean => editor.options.get('smart_paste');
export const shouldBlockUnsupportedDrop = (editor: Editor): boolean => editor.options.get('block_unsupported_drop');
export const shouldPasteBlockDrop = (editor: Editor): boolean => editor.options.get('paste_block_drop');
export const getFilePickerCallback = (editor: Editor): any => editor.options.get('file_picker_callback');
export const getFilePickerTypes = (editor: Editor): string | undefined => editor.options.get('file_picker_types');
export const getFilePickerValidatorHandler = (editor: Editor): any => editor.options.get('file_picker_validator_handler');
export const getCodeView = (editor: Editor): string => editor.options.get('code_view');
