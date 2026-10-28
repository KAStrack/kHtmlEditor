import { createSchema, SchemaSettings } from '../../../src/html/Schema';
import { createDomParser, DomParserSettings, ParserArgs } from '../../../src/html/HtmlParser';
import { createHtmlSerializer, HtmlSerializerSettings } from '../../../src/html/HtmlSerializer';

export interface PipelineSettings extends SchemaSettings, DomParserSettings, HtmlSerializerSettings {}

/** Mirrors the editor defaults relevant for parsing and serialising content. */
export const defaultSettings: PipelineSettings = {
  schema: 'html5',
  entity_encoding: 'named',
  indent: true,
  element_format: 'html',
  remove_trailing_brs: true,
  forced_root_block: 'p',
  convert_fonts_to_spans: true,
  inline_styles: true,
  sandbox_iframes: true,
  convert_unsafe_embeds: true,
};

export const createPipeline = (overrides: PipelineSettings = {}) => {
  const settings = { ...defaultSettings, ...overrides };
  const schema = createSchema(settings);
  const parser = createDomParser(settings, schema);
  const serializer = createHtmlSerializer(settings, schema);
  const roundTrip = (html: string, args: ParserArgs = {}): string => serializer.serialize(parser.parse(html, args), true);
  return { schema, parser, serializer, roundTrip, settings };
};
