import type { Editor } from './Editor';
import { createDomParser, DomParser, DomParserSettings } from '../html/HtmlParser';
import { isEmptyNode } from '../html/Empty';

/** Builds the editor's content parser (parse-in direction) with the editor-level filters. */
export const getParserSettings = (editor: Editor): DomParserSettings => {
  const get = <T = any>(name: string) => editor.options.get<T>(name);
  return {
    allow_html_data_urls: get('allow_html_data_urls'),
    allow_svg_data_urls: get('allow_svg_data_urls'),
    allow_script_urls: get('allow_script_urls'),
    allow_unsafe_link_target: get('allow_unsafe_link_target'),
    allow_conditional_comments: get('allow_conditional_comments'),
    allow_html_in_comments: get('allow_html_in_comments'),
    convert_unsafe_embeds: get('convert_unsafe_embeds'),
    sandbox_iframes: get('sandbox_iframes'),
    sandbox_iframes_exclusions: get('sandbox_iframes_exclusions'),
    convert_fonts_to_spans: get('convert_fonts_to_spans'),
    fix_list_elements: get('fix_list_elements'),
    font_size_legacy_values: get('font_size_legacy_values'),
    forced_root_block: get('forced_root_block'),
    forced_root_block_attrs: get('forced_root_block_attrs'),
    inline_styles: get('inline_styles'),
    pad_empty_with_br: get('pad_empty_with_br'),
    preserve_cdata: get('preserve_cdata'),
    remove_trailing_brs: get('remove_trailing_brs'),
    xss_sanitization: get('xss_sanitization'),
    validate: get('verify_html') !== false,
    url_converter: editor.convertURL,
    url_converter_scope: editor,
  };
};

export const createEditorParser = (editor: Editor): DomParser => {
  const parser = createDomParser(getParserSettings(editor), editor.schema);

  // Store converted URLs/styles in data-mce-* attributes as the browser may rewrite the originals.
  parser.addAttributeFilter('src,href,style,tabindex', (nodes, name) => {
    const internalName = 'data-mce-' + name;
    for (const node of nodes) {
      const value = node.getAttribute(name);
      if (value && !node.hasAttribute(internalName)) {
        if (value.indexOf('data:') === 0 || value.indexOf('blob:') === 0) {
          continue;
        }
        if (name === 'style') {
          const css = editor.dom.serializeStyle(editor.dom.parseStyle(value), node.nodeName.toLowerCase());
          if (css.length) {
            node.setAttribute(internalName, css);
            node.setAttribute(name, css);
          } else {
            node.removeAttribute(name);
          }
        } else if (name === 'tabindex') {
          node.setAttribute(internalName, value);
          node.removeAttribute(name);
        } else {
          node.setAttribute(internalName, editor.convertURL(value, name, node.nodeName.toLowerCase()));
        }
      }
    }
  });

  // Keep scripts from executing when they are allowed through extended_valid_elements.
  parser.addNodeFilter('script', (nodes) => {
    for (const node of nodes) {
      const type = node.getAttribute('type') || 'no/type';
      if (type.indexOf('mce-') !== 0) {
        node.setAttribute('type', 'mce-' + type);
      }
    }
  });

  // Empty blocks in the editor get a bogus br so the caret can be placed in them. A block holding
  // only the padding nbsp produced by the parser is treated the same, so typing into it does not
  // leave a stray trailing &nbsp;.
  parser.addNodeFilter('p,h1,h2,h3,h4,h5,h6,div,li,td,th,pre,blockquote,address', (nodes, _name, args) => {
    if (args.get) {
      return;
    }
    const nonEmptyElements = editor.schema.getNonEmptyElements();
    for (const node of nodes) {
      const only = node.childNodes.length === 1 ? node.firstChild : null;
      const isPaddingNbsp = !!only && only.nodeType === 3 && (only as Text).data === '\u00a0';
      if (isPaddingNbsp || (isEmptyNode(editor.schema, node, nonEmptyElements) && node.getElementsByTagName('br').length === 0)) {
        while (node.firstChild) {
          node.removeChild(node.firstChild);
        }
        const br = node.ownerDocument.createElement('br');
        br.setAttribute('data-mce-bogus', '1');
        node.appendChild(br);
      }
    }
  });

  // Protected content placeholders.
  parser.addNodeFilter('#comment', ((nodes: Comment[]) => {
    for (const node of nodes) {
      const data = node.data;
      if (data.indexOf('mce:protected ') === 0) {
        const span = node.ownerDocument.createElement('span');
        span.setAttribute('data-mce-type', 'protected');
        span.setAttribute('data-mce-content', data.substring('mce:protected '.length));
        span.setAttribute('contenteditable', 'false');
        node.parentNode?.replaceChild(span, node);
      }
    }
  }) as any);

  return parser;
};
