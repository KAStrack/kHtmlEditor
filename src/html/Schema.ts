import { each as arrEach, contains, indexOf } from '../util/Arr';
import { each as objEach, has, keys } from '../util/Obj';
import { explode, trim, wildcardToRegExp, words } from '../util/Str';
import { isString } from '../util/Type';
import { Tools } from '../util/Tools';

/**
 * HTML schema: which elements/attributes exist, which children they accept, which are blocks,
 * voids, whitespace preserving, etc. Implements TinyMCE's `valid_elements` rule grammar so that
 * existing configurations behave identically.
 */

export type SchemaType = 'html4' | 'html5' | 'html5-strict';
export type SchemaMap = Record<string, {}>;

export interface Attribute {
  required?: boolean;
  defaultValue?: string;
  forcedValue?: string;
  validValues?: Record<string, {}>;
}

export interface AttributePattern extends Attribute {
  pattern: RegExp;
}

export interface ElementRule {
  attributes: Record<string, Attribute>;
  attributesOrder: string[];
  attributePatterns?: AttributePattern[];
  attributesRequired?: string[];
  attributesDefault?: Array<{ name: string; value: string }>;
  attributesForced?: Array<{ name: string; value: string }>;
  outputName?: string;
  parentsRequired?: string[];
  paddEmpty?: boolean;
  paddInEmptyBlock?: boolean;
  removeEmpty?: boolean;
  removeEmptyAttrs?: boolean;
}

interface PatternElementRule extends ElementRule {
  pattern: RegExp;
}

export interface SchemaSettings {
  schema?: SchemaType;
  valid_elements?: string;
  extended_valid_elements?: string;
  invalid_elements?: string;
  valid_children?: string;
  custom_elements?: string;
  valid_styles?: string | Record<string, string>;
  invalid_styles?: string | Record<string, string>;
  valid_classes?: string | Record<string, string>;
  verify_html?: boolean;
  padd_empty_block_inline_children?: boolean;
  whitespace_elements?: string;
  self_closing_elements?: string;
  void_elements?: string;
  boolean_attributes?: string;
  non_empty_elements?: string;
  move_caret_before_on_enter_elements?: string;
  text_block_elements?: string;
  block_elements?: string;
  text_inline_elements?: string;
  transparent_elements?: string;
  wrap_block_elements?: string;
}

export interface Schema {
  type: SchemaType;
  children: Record<string, SchemaMap>;
  elements: Record<string, ElementRule>;
  getValidStyles: () => Record<string, string[]> | undefined;
  getValidClasses: () => Record<string, SchemaMap> | undefined;
  getInvalidStyles: () => Record<string, SchemaMap> | undefined;
  getBlockElements: () => SchemaMap;
  getTextBlockElements: () => SchemaMap;
  getTextInlineElements: () => SchemaMap;
  getVoidElements: () => SchemaMap;
  /** @deprecated alias of getVoidElements */
  getShortEndedElements: () => SchemaMap;
  getSelfClosingElements: () => SchemaMap;
  getBoolAttrs: () => SchemaMap;
  getWhitespaceElements: () => SchemaMap;
  getSpecialElements: () => Record<string, RegExp>;
  getNonEmptyElements: () => SchemaMap;
  getMoveCaretBeforeOnEnterElements: () => SchemaMap;
  getCustomElements: () => Record<string, string>;
  getTransparentElements: () => SchemaMap;
  getWrapBlockElements: () => SchemaMap;
  isValidChild: (name: string, child: string) => boolean;
  isValid: (name: string, attr?: string) => boolean;
  isBlock: (name: string) => boolean;
  isInline: (name: string) => boolean;
  isWrapper: (name: string) => boolean;
  getElementRule: (name: string) => ElementRule | undefined;
  getElement: (name: string) => ElementRule | undefined;
  addValidElements: (validElements: string) => void;
  setValidElements: (validElements: string) => void;
  addCustomElements: (customElements: string) => void;
  addValidChildren: (validChildren: string) => void;
}

interface SchemaElement {
  attributes: Record<string, Attribute>;
  attributesOrder: string[];
  children: SchemaMap;
}

type SchemaLookupTable = Record<string, SchemaElement>;

const mapCache: Record<string, any> = {};
const makeMap = Tools.makeMap;

const split = (items: string | undefined, delim?: string | RegExp): string[] => {
  const s = items ? trim(items) : '';
  return s.length ? s.split(delim || ' ').map(trim).filter((x) => x.length > 0) : [];
};

const mapToObject = <T>(list: string[], f: () => T): Record<string, T> => {
  const r: Record<string, T> = {};
  arrEach(list, (k) => {
    r[k] = f();
  });
  return r;
};

const createMap = (defaultValue?: string, extendWith: SchemaMap = {}): SchemaMap => {
  const value = makeMap(defaultValue, ' ', makeMap((defaultValue ?? '').toUpperCase(), ' '));
  return { ...value, ...extendWith };
};

/** Compiles the element table for a schema type (cached). */
const compileSchema = (type: SchemaType): SchemaLookupTable => {
  if (mapCache[type]) {
    return mapCache[type];
  }
  const schema: SchemaLookupTable = {};
  let globalAttributes: string;
  let blockContent: string;
  let phrasingContent: string;
  let flowContent: string | undefined;

  const add = (name: string, attributes: string = '', children: string = '') => {
    const childNames = split(children);
    const names = split(name);
    let ni = names.length;
    while (ni--) {
      const attributesOrder = split([globalAttributes, attributes].join(' '));
      schema[names[ni]] = {
        attributes: mapToObject(attributesOrder, () => ({})),
        attributesOrder,
        children: mapToObject(childNames, () => ({})),
      };
    }
  };

  const addAttrs = (name: string, attributes?: string) => {
    const names = split(name);
    const attrs = split(attributes);
    let ni = names.length;
    while (ni--) {
      const schemaItem = schema[names[ni]];
      if (!schemaItem) {
        continue;
      }
      for (let i = 0, l = attrs.length; i < l; i++) {
        if (!schemaItem.attributes[attrs[i]]) {
          schemaItem.attributes[attrs[i]] = {};
          schemaItem.attributesOrder.push(attrs[i]);
        }
      }
    }
  };

  globalAttributes = 'id accesskey class dir lang style tabindex title role';
  blockContent = 'address blockquote div dl fieldset form h1 h2 h3 h4 h5 h6 hr menu ol p pre table ul';
  phrasingContent =
    'a abbr b bdo br button cite code del dfn em embed i iframe img input ins kbd label map noscript object q s samp script select small span strong sub sup textarea u var #text #comment';

  if (type !== 'html4') {
    const transparentContent = 'a ins del canvas map';
    globalAttributes += ' contenteditable contextmenu draggable dropzone hidden spellcheck translate';
    blockContent += ' article aside details dialog figure main header footer hgroup section nav ' + transparentContent;
    phrasingContent += ' audio canvas command datalist mark meter output picture progress time wbr video ruby bdi keygen svg';
  }

  if (type !== 'html5-strict') {
    globalAttributes += ' xml:lang';
    const html4PhrasingContent = 'acronym applet basefont big font strike tt';
    phrasingContent = [phrasingContent, html4PhrasingContent].join(' ');
    arrEach(split(html4PhrasingContent), (name) => {
      add(name, '', phrasingContent);
    });
    const html4BlockContent = 'center dir isindex noframes';
    blockContent = [blockContent, html4BlockContent].join(' ');
    flowContent = [blockContent, phrasingContent].join(' ');
    arrEach(split(html4BlockContent), (name) => {
      add(name, '', flowContent);
    });
  }

  flowContent = flowContent || [blockContent, phrasingContent].join(' ');

  add('html', 'manifest', 'head body');
  add('head', '', 'base command link meta noscript script style title');
  add('title hr noscript br');
  add('base', 'href target');
  add('link', 'href rel media hreflang type sizes hreflang');
  add('meta', 'name http-equiv content charset');
  add('style', 'media type scoped');
  add('script', 'src async defer type charset');
  add('body', '', flowContent);
  add('address dt dd div caption', '', flowContent);
  add('h1 h2 h3 h4 h5 h6 pre p abbr code var samp kbd sub sup i b u bdo span legend em strong small s cite dfn', '', phrasingContent);
  add('blockquote', 'cite', flowContent);
  add('ol', 'reversed start type', 'li');
  add('ul', '', 'li');
  add('li', 'value', flowContent);
  add('dl', '', 'dt dd');
  add('a', 'href target rel media hreflang type', type === 'html4' ? phrasingContent : flowContent);
  add('q', 'cite', phrasingContent);
  add('ins del', 'cite datetime', flowContent);
  add('img', 'src sizes srcset alt usemap ismap width height');
  add('iframe', 'src name width height', flowContent);
  add('embed', 'src type width height');
  add('object', 'data type typemustmatch name usemap form width height', [flowContent, 'param'].join(' '));
  add('param', 'name value');
  add('map', 'name', [flowContent, 'area'].join(' '));
  add('area', 'alt coords shape href target rel media hreflang type');
  add('table', 'border', 'caption colgroup thead tfoot tbody tr' + (type === 'html4' ? ' col' : ''));
  add('colgroup', 'span', 'col');
  add('col', 'span');
  add('tbody thead tfoot', '', 'tr');
  add('tr', '', 'td th');
  add('td', 'colspan rowspan headers', flowContent);
  add('th', 'colspan rowspan headers scope abbr', flowContent);
  add('form', 'accept-charset action autocomplete enctype method name novalidate target', flowContent);
  add('fieldset', 'disabled form name', [flowContent, 'legend'].join(' '));
  add('label', 'form for', phrasingContent);
  add(
    'input',
    'accept alt autocomplete checked dirname disabled form formaction formenctype formmethod formnovalidate formtarget height list max maxlength min multiple name pattern readonly required size src step type value width',
  );
  add('button', 'disabled form formaction formenctype formmethod formnovalidate formtarget name type value', type === 'html4' ? flowContent : phrasingContent);
  add('select', 'disabled form multiple name required size', 'option optgroup');
  add('optgroup', 'disabled label', 'option');
  add('option', 'disabled label selected value');
  add('textarea', 'cols dirname disabled form maxlength name readonly required rows wrap');
  add('menu', 'type label', [flowContent, 'li'].join(' '));
  add('noscript', '', flowContent);

  if (type !== 'html4') {
    add('wbr');
    add('ruby', '', [phrasingContent, 'rt rp'].join(' '));
    add('figcaption', '', flowContent);
    add('mark rt rp bdi', '', phrasingContent);
    add('summary', '', [phrasingContent, 'h1 h2 h3 h4 h5 h6'].join(' '));
    add('canvas', 'width height', flowContent);
    add('video', 'src crossorigin poster preload autoplay mediagroup loop muted controls width height buffered', [flowContent, 'track source'].join(' '));
    add('audio', 'src crossorigin preload autoplay mediagroup loop muted controls buffered volume', [flowContent, 'track source'].join(' '));
    add('picture', '', 'img source');
    add('source', 'src srcset type media sizes');
    add('track', 'kind src srclang label default');
    add('datalist', '', [phrasingContent, 'option'].join(' '));
    add('article section nav aside main header footer', '', flowContent);
    add('hgroup', '', 'h1 h2 h3 h4 h5 h6');
    add('figure', '', [flowContent, 'figcaption'].join(' '));
    add('time', 'datetime', phrasingContent);
    add('dialog', 'open', flowContent);
    add('command', 'type label icon disabled checked radiogroup command');
    add('output', 'for form name', phrasingContent);
    add('progress', 'value max', phrasingContent);
    add('meter', 'value min max low high optimum', phrasingContent);
    add('details', 'open', [flowContent, 'summary'].join(' '));
    add('keygen', 'autofocus challenge disabled form keytype name');
    add('svg', 'xmlns xmlns:xlink viewbox width height preserveaspectratio fill stroke stroke-width', '#text');
  }

  if (type !== 'html5-strict') {
    addAttrs('script', 'language xml:space');
    addAttrs('style', 'xml:space');
    addAttrs('object', 'declare classid code codebase codetype archive standby align border hspace vspace');
    addAttrs('embed', 'align name hspace vspace');
    addAttrs('param', 'valuetype type');
    addAttrs('a', 'charset name rev shape coords');
    addAttrs('br', 'clear');
    addAttrs('applet', 'codebase archive code object alt name width height align hspace vspace');
    addAttrs('img', 'name longdesc align border hspace vspace');
    addAttrs('iframe', 'longdesc frameborder marginwidth marginheight scrolling align');
    addAttrs('font basefont', 'size color face');
    addAttrs('input', 'usemap align');
    addAttrs('select');
    addAttrs('textarea');
    addAttrs('h1 h2 h3 h4 h5 h6 div p legend caption', 'align');
    addAttrs('ul', 'type compact');
    addAttrs('li', 'type');
    addAttrs('ol dl menu dir', 'compact');
    addAttrs('pre', 'width xml:space');
    addAttrs('hr', 'align noshade size width');
    addAttrs('isindex', 'prompt');
    addAttrs('table', 'summary width frame rules cellspacing cellpadding align bgcolor');
    addAttrs('col', 'width align char charoff valign');
    addAttrs('colgroup', 'width align char charoff valign');
    addAttrs('thead', 'align char charoff valign');
    addAttrs('tr', 'align char charoff valign bgcolor');
    addAttrs('th', 'axis align char charoff valign nowrap bgcolor width height');
    addAttrs('form', 'accept');
    addAttrs('td', 'abbr axis scope align char charoff valign nowrap bgcolor width height');
    addAttrs('tfoot', 'align char charoff valign');
    addAttrs('tbody', 'align char charoff valign');
    addAttrs('area', 'nohref');
    addAttrs('body', 'background bgcolor text link vlink alink');
  }

  if (type !== 'html4') {
    addAttrs('input button select textarea', 'autofocus');
    addAttrs('input textarea', 'placeholder');
    addAttrs('a', 'download');
    addAttrs('a link', 'referrerpolicy');
    addAttrs('link script img', 'crossorigin');
    addAttrs('img', 'loading decoding');
    addAttrs('iframe', 'sandbox seamless allow allowfullscreen loading referrerpolicy');
    addAttrs('video audio', 'playsinline');
  }

  // Elements that can't contain themselves.
  arrEach(split('a form meter progress dfn'), (name) => {
    if (schema[name]) {
      delete schema[name].children[name];
    }
  });

  // Caption can't have tables.
  delete schema.caption.children.table;

  // Scripts are never part of the default schema (XSS).
  delete schema.script;

  mapCache[type] = schema;
  return schema;
};

/** Compiles valid_styles / invalid_styles / valid_classes into per-element maps. */
const compileElementMap = (value: string | Record<string, string> | undefined, mode?: 'map'): Record<string, any> | undefined => {
  if (!value) {
    return undefined;
  }
  const styles: Record<string, any> = {};
  if (isString(value)) {
    value = { '*': value };
  }
  objEach(value, (val, key) => {
    const list = split(val, /[, ]/);
    styles[key] = mode === 'map' ? makeMap(list, /[, ]/) : list;
  });
  return styles;
};

export const createSchema = (settings: SchemaSettings = {}): Schema => {
  const elements: Record<string, ElementRule> = {};
  const children: Record<string, SchemaMap> = {};
  const patternElements: PatternElementRule[] = [];
  const customElementsMap: Record<string, string> = {};
  const specialElements: Record<string, RegExp> = {};

  const createLookupTable = (option: keyof SchemaSettings, defaultValue: string, extendWith?: SchemaMap): SchemaMap => {
    const value = settings[option] as string | undefined;
    if (!value) {
      let newValue = mapCache['lookup:' + option];
      if (!newValue) {
        newValue = createMap(defaultValue, extendWith);
        mapCache['lookup:' + option] = newValue;
      }
      return { ...newValue };
    }
    return makeMap(value, /[, ]/, makeMap(value.toUpperCase(), /[, ]/));
  };

  const schemaType: SchemaType = settings.schema || 'html5';
  const schemaItems = compileSchema(schemaType);

  if (settings.verify_html === false) {
    settings.valid_elements = '*[*]';
  }

  const validStyles = compileElementMap(settings.valid_styles) as Record<string, string[]> | undefined;
  const invalidStyles = compileElementMap(settings.invalid_styles, 'map') as Record<string, SchemaMap> | undefined;
  const validClasses = compileElementMap(settings.valid_classes, 'map') as Record<string, SchemaMap> | undefined;

  const whitespaceElementsMap = createLookupTable('whitespace_elements', 'pre script noscript style textarea video audio iframe object code');
  const selfClosingElementsMap = createLookupTable('self_closing_elements', 'colgroup dd dt li option p td tfoot th thead tr');
  const voidElementsMap = createLookupTable('void_elements', 'area base basefont br col frame hr img input isindex link meta param embed source wbr track');
  const boolAttrMap = createLookupTable('boolean_attributes', 'checked compact declare defer disabled ismap multiple nohref noresize noshade nowrap readonly selected autoplay loop controls allowfullscreen');
  const nonEmptyOrMoveCaretBeforeOnEnter = 'td th iframe video audio object script code';
  const nonEmptyElementsMap = createLookupTable('non_empty_elements', nonEmptyOrMoveCaretBeforeOnEnter + ' pre svg textarea select button', voidElementsMap);
  const moveCaretBeforeOnEnterElementsMap = createLookupTable('move_caret_before_on_enter_elements', nonEmptyOrMoveCaretBeforeOnEnter + ' table', voidElementsMap);
  const textBlockElementsMap = createLookupTable(
    'text_block_elements',
    'h1 h2 h3 h4 h5 h6 p div address pre form blockquote center dir fieldset header footer article section hgroup aside main nav figure',
  );
  const blockElementsMap = createLookupTable(
    'block_elements',
    'hr table tbody thead tfoot th tr td li ol ul caption dl dt dd noscript menu isindex option datalist select optgroup figcaption details summary html body multicol listing',
    textBlockElementsMap,
  );
  const textInlineElementsMap = createLookupTable('text_inline_elements', 'span strong b em i font s strike u var cite dfn code mark q sup sub samp');
  const transparentElementsMap = createLookupTable('transparent_elements', 'a ins del canvas map');
  const wrapBlockElementsMap = createLookupTable('wrap_block_elements', 'pre ' + keys(textBlockElementsMap).filter((k) => k === k.toLowerCase()).join(' '));

  arrEach('script noscript iframe noframes noembed title style textarea xmp plaintext'.split(' '), (name) => {
    specialElements[name] = new RegExp('</' + name + '[^>]*>', 'gi');
  });

  const patternToRegExp = (str: string): RegExp => wildcardToRegExp(str);

  const addValidElements = (validElements?: string) => {
    const elementRuleRegExp = /^([#+\-])?([^\[!\/]+)(?:\/([^\[!]+))?(?:(!?)\[([^\]]+)])?$/;
    const attrRuleRegExp = /^([!\-])?(\w+[\\:]:\w+|[^=~<]+)?(?:([=~<])(.*))?$/;
    const hasPatternsRegExp = /[*?+]/;

    if (!validElements) {
      return;
    }
    const validElementsArr = split(validElements, ',');
    let globalAttributes: Record<string, Attribute> | undefined;
    let globalAttributesOrder: string[] | undefined;
    if (elements['@']) {
      globalAttributes = elements['@'].attributes;
      globalAttributesOrder = elements['@'].attributesOrder;
    }

    for (let ei = 0, el = validElementsArr.length; ei < el; ei++) {
      let matches = elementRuleRegExp.exec(validElementsArr[ei]);
      if (!matches) {
        continue;
      }
      const prefix = matches[1];
      const elementName = matches[2];
      const outputName = matches[3];
      const attrData = matches[5];
      const attributes: Record<string, Attribute> = {};
      const attributesOrder: string[] = [];
      const element: ElementRule = { attributes, attributesOrder };

      if (prefix === '#') {
        element.paddEmpty = true;
      }
      if (prefix === '-') {
        element.removeEmpty = true;
      }
      if (matches[4] === '!') {
        element.removeEmptyAttrs = true;
      }

      if (globalAttributes) {
        objEach(globalAttributes, (value, key) => {
          attributes[key] = value;
        });
        attributesOrder.push(...(globalAttributesOrder as string[]));
      }

      if (attrData) {
        const attrDatas = split(attrData, '|');
        for (let ai = 0, al = attrDatas.length; ai < al; ai++) {
          matches = attrRuleRegExp.exec(attrDatas[ai]);
          if (!matches) {
            continue;
          }
          const attr: Attribute = {};
          const attrType = matches[1];
          const attrName = (matches[2] || '').replace(/[\\:]:/g, ':');
          const attrPrefix = matches[3];
          const value = matches[4];

          if (attrType === '!') {
            element.attributesRequired = element.attributesRequired || [];
            element.attributesRequired.push(attrName);
            attr.required = true;
          }

          if (attrType === '-') {
            delete attributes[attrName];
            const idx = indexOf(attributesOrder, attrName);
            if (idx !== -1) {
              attributesOrder.splice(idx, 1);
            }
            continue;
          }

          if (attrPrefix) {
            if (attrPrefix === '=') {
              element.attributesDefault = element.attributesDefault || [];
              element.attributesDefault.push({ name: attrName, value });
              attr.defaultValue = value;
            } else if (attrPrefix === '~') {
              element.attributesForced = element.attributesForced || [];
              element.attributesForced.push({ name: attrName, value });
              attr.forcedValue = value;
            } else if (attrPrefix === '<') {
              attr.validValues = makeMap(value, '?');
            }
          }

          if (hasPatternsRegExp.test(attrName)) {
            const attrPattern = attr as AttributePattern;
            element.attributePatterns = element.attributePatterns || [];
            attrPattern.pattern = patternToRegExp(attrName);
            element.attributePatterns.push(attrPattern);
          } else {
            if (!attributes[attrName]) {
              attributesOrder.push(attrName);
            }
            attributes[attrName] = attr;
          }
        }
      }

      if (!globalAttributes && elementName === '@') {
        globalAttributes = attributes;
        globalAttributesOrder = attributesOrder;
      }

      if (outputName) {
        element.outputName = elementName;
        elements[outputName] = element;
      }

      if (hasPatternsRegExp.test(elementName)) {
        const patternElement = element as PatternElementRule;
        patternElement.pattern = patternToRegExp(elementName);
        patternElements.push(patternElement);
      } else {
        elements[elementName] = element;
      }
    }
  };

  const setValidElements = (validElements: string) => {
    for (const k of Object.keys(elements)) {
      delete elements[k];
    }
    patternElements.length = 0;
    addValidElements(validElements);
  };

  const addCustomElements = (customElements?: string) => {
    const customElementRegExp = /^(~)?(.+)$/;
    if (!customElements) {
      return;
    }
    mapCache['lookup:custom'] = null;
    arrEach(split(customElements, ','), (rule) => {
      const matches = customElementRegExp.exec(rule);
      if (!matches) {
        return;
      }
      const inline = matches[1] === '~';
      const cloneName = inline ? 'span' : 'div';
      const name = matches[2];

      children[name] = children[cloneName];
      customElementsMap[name] = cloneName;
      nonEmptyElementsMap[name.toUpperCase()] = {};
      nonEmptyElementsMap[name] = {};

      if (!inline) {
        blockElementsMap[name.toUpperCase()] = {};
        blockElementsMap[name] = {};
      }

      if (!elements[name]) {
        let customRule = elements[cloneName];
        customRule = { ...customRule, attributes: { ...customRule.attributes }, attributesOrder: customRule.attributesOrder.slice() };
        delete customRule.removeEmptyAttrs;
        delete customRule.removeEmpty;
        elements[name] = customRule;
      }

      objEach(children, (element, elmName) => {
        if (element[cloneName]) {
          const copy = { ...children[elmName] };
          copy[name] = copy[cloneName];
          children[elmName] = copy;
        }
      });
    });
  };

  const addValidChildren = (validChildren?: string) => {
    const childRuleRegExp = /^([+\-]?)([\w\-.:\u00b7-\uffff]+)\[([^\]]+)]$/;
    if (!validChildren) {
      return;
    }
    arrEach(split(validChildren, ','), (rule) => {
      const matches = childRuleRegExp.exec(rule);
      if (!matches) {
        return;
      }
      const prefix = matches[1];
      let parent: SchemaMap;
      if (prefix) {
        parent = children[matches[2]];
      } else {
        parent = children[matches[2]] = { '#comment': {} };
      }
      parent = children[matches[2]] = { ...(parent || {}) };
      arrEach(split(matches[3], '|'), (child) => {
        if (prefix === '-') {
          delete parent[child];
        } else {
          parent[child] = {};
        }
      });
    });
  };

  const getElementRule = (name: string): ElementRule | undefined => {
    const element = elements[name];
    if (element) {
      return element;
    }
    let i = patternElements.length;
    while (i--) {
      const patternElement = patternElements[i];
      if (patternElement.pattern.test(name)) {
        return patternElement;
      }
    }
    return undefined;
  };

  if (!settings.valid_elements) {
    objEach(schemaItems, (element, name) => {
      elements[name] = { attributes: element.attributes, attributesOrder: element.attributesOrder };
      children[name] = element.children;
    });

    // Prefer strong/em over b/i.
    arrEach(split('strong/b em/i'), (item) => {
      const items = split(item, '/');
      elements[items[1]].outputName = items[0];
    });

    // Remove these if they are empty by default.
    arrEach(split('ol ul sub sup blockquote span font a table tbody strong em b i'), (name) => {
      if (elements[name]) {
        elements[name].removeEmpty = true;
      }
    });

    // Pad these by default.
    arrEach(split('p h1 h2 h3 h4 h5 h6 th td pre div address caption li'), (name) => {
      if (elements[name]) {
        elements[name].paddEmpty = true;
      }
    });

    // Remove these if they have no attributes.
    arrEach(split('span'), (name) => {
      elements[name].removeEmptyAttrs = true;
    });
  } else {
    setValidElements(settings.valid_elements);
    objEach(schemaItems, (element, name) => {
      children[name] = element.children;
    });
  }

  // svg is only allowed when explicitly enabled through extended_valid_elements.
  delete elements.svg;

  addCustomElements(settings.custom_elements);
  addValidChildren(settings.valid_children);
  addValidElements(settings.extended_valid_elements);

  // Nested lists are always valid.
  addValidChildren('+ol[ul|ol],+ul[ul|ol]');

  // Some elements are not valid by themselves - require parents.
  objEach(
    {
      dd: 'dl',
      dt: 'dl',
      li: 'ul ol',
      td: 'tr',
      th: 'tr',
      tr: 'tbody thead tfoot',
      tbody: 'table',
      thead: 'table',
      tfoot: 'table',
      legend: 'fieldset',
      area: 'map',
      param: 'video audio object',
    },
    (parents, item) => {
      if (elements[item]) {
        elements[item].parentsRequired = split(parents);
      }
    },
  );

  if (settings.invalid_elements) {
    arrEach(explode(settings.invalid_elements), (item) => {
      if (elements[item]) {
        delete elements[item];
      }
    });
  }

  if (!getElementRule('span')) {
    addValidElements('span[!data-mce-type|*]');
  }

  if (settings.padd_empty_block_inline_children) {
    objEach(textInlineElementsMap, (_v, name) => {
      if (elements[name]) {
        elements[name].paddInEmptyBlock = true;
      }
    });
  }

  const isValidChild = (name: string, child: string): boolean => {
    const parent = children[name.toLowerCase()];
    return !!(parent && parent[child.toLowerCase()]);
  };

  const isValid = (name: string, attr?: string): boolean => {
    const rule = getElementRule(name);
    if (rule) {
      if (attr) {
        if (rule.attributes[attr]) {
          return true;
        }
        const attrPatterns = rule.attributePatterns;
        if (attrPatterns) {
          let i = attrPatterns.length;
          while (i--) {
            if (attrPatterns[i].pattern.test(attr)) {
              return true;
            }
          }
        }
        // data-* and aria-* attributes are always kept (TinyMCE behaviour).
        if (/^(data-|aria-)/.test(attr)) {
          return true;
        }
      } else {
        return true;
      }
    }
    return false;
  };

  const isBlock = (name: string): boolean => has(blockElementsMap, name);
  const isInline = (name: string): boolean => !name.startsWith('#') && isValid(name) && !isBlock(name);
  const isWrapper = (name: string): boolean => has(wrapBlockElementsMap, name) || isInline(name);

  return {
    type: schemaType,
    children,
    elements,
    getValidStyles: () => validStyles,
    getValidClasses: () => validClasses,
    getInvalidStyles: () => invalidStyles,
    getBoolAttrs: () => boolAttrMap,
    getBlockElements: () => blockElementsMap,
    getTextBlockElements: () => textBlockElementsMap,
    getTextInlineElements: () => textInlineElementsMap,
    getVoidElements: () => voidElementsMap,
    getShortEndedElements: () => voidElementsMap,
    getSelfClosingElements: () => selfClosingElementsMap,
    getWhitespaceElements: () => whitespaceElementsMap,
    getSpecialElements: () => specialElements,
    getNonEmptyElements: () => nonEmptyElementsMap,
    getMoveCaretBeforeOnEnterElements: () => moveCaretBeforeOnEnterElementsMap,
    getCustomElements: () => customElementsMap,
    getTransparentElements: () => transparentElementsMap,
    getWrapBlockElements: () => wrapBlockElementsMap,
    isValidChild,
    isValid,
    isBlock,
    isInline,
    isWrapper,
    getElementRule,
    getElement: getElementRule,
    addValidElements,
    setValidElements,
    addCustomElements,
    addValidChildren,
  };
};

export const isTextBlockName = (schema: Schema, name: string): boolean => has(schema.getTextBlockElements(), name);
export const isTextInlineName = (schema: Schema, name: string): boolean => has(schema.getTextInlineElements(), name);
export const splitWords = words;
export const containsName = contains;
