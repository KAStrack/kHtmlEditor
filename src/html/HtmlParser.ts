import { Schema, SchemaMap, ElementRule } from './Schema';
import { createStyles, Styles, StyleSettings } from './StyleParser';
import { isEmptyNode, isWhitespaceText, isElement, isText, isComment, nodeName, hasOnlyChild } from './Empty';
import * as Sanitizer from './Sanitizer';
import { Tools } from '../util/Tools';

/**
 * Parses HTML strings into sanitised, schema-valid DOM fragments and can re-filter an existing
 * DOM subtree (used on serialisation). Behaviour follows TinyMCE's DomParser so that content
 * round-trips identically: whitespace handling, invalid child repair, root block wrapping,
 * empty element padding/removal, trailing `br` handling, node and attribute filters.
 */

export interface ParserArgs {
  format?: string;
  context?: string;
  forced_root_block?: string | false;
  forced_root_block_attrs?: Record<string, string>;
  isRootContent?: boolean;
  insert?: boolean;
  set?: boolean;
  get?: boolean;
  getInner?: boolean;
  no_events?: boolean;
  invalid?: boolean;
  cleanup?: boolean;
  selection?: boolean;
  source_view?: boolean;
  validate?: boolean;
  content?: string;
  load?: boolean;
  initial?: boolean;
  [key: string]: any;
}

export type ParserFilterCallback = (nodes: Element[], name: string, args: ParserArgs) => void;
export type CommentFilterCallback = (nodes: Comment[], name: string, args: ParserArgs) => void;

export interface ParserFilter {
  name: string;
  callbacks: ParserFilterCallback[];
}

export interface DomParserSettings extends StyleSettings, Sanitizer.SanitizerSettings {
  document?: Document;
  convert_fonts_to_spans?: boolean;
  fix_list_elements?: boolean;
  font_size_legacy_values?: string;
  forced_root_block?: boolean | string;
  forced_root_block_attrs?: Record<string, string>;
  inline_styles?: boolean;
  pad_empty_with_br?: boolean;
  preserve_cdata?: boolean;
  remove_trailing_brs?: boolean;
  root_name?: string;
  sanitize?: boolean;
  validate?: boolean;
  xss_sanitization?: boolean;
}

export interface DomParser {
  schema: Schema;
  styles: Styles;
  addAttributeFilter: (name: string, callback: ParserFilterCallback) => void;
  getAttributeFilters: () => ParserFilter[];
  removeAttributeFilter: (name: string, callback?: ParserFilterCallback) => void;
  addNodeFilter: (name: string, callback: ParserFilterCallback) => void;
  getNodeFilters: () => ParserFilter[];
  removeNodeFilter: (name: string, callback?: ParserFilterCallback) => void;
  /** Parses `html` and returns a fragment owned by the parser's inert document. */
  parse: (html: string, args?: ParserArgs) => DocumentFragment;
  /** Applies validation, sanitisation and filters to an existing subtree in place. */
  filter: (root: Element | DocumentFragment, args?: ParserArgs) => void;
  /** The inert document used for parsing. */
  getDocument: () => Document;
}

const whiteSpaceRegExp = /[ \t\r\n]+/g;
const startWhiteSpaceRegExp = /^[ \t\r\n]+/;
const endWhiteSpaceRegExp = /[ \t\r\n]+$/;
const nbsp = ' ';

const nonSplittableElements = Tools.makeMap('tr,td,th,tbody,thead,tfoot,table');

let sharedInertDoc: Document | null = null;
const getInertDocument = (): Document => {
  if (!sharedInertDoc) {
    sharedInertDoc = document.implementation.createHTMLDocument('');
  }
  return sharedInertDoc;
};

const makeFilterRegistry = () => {
  const filters: ParserFilter[] = [];
  const add = (name: string, callback: ParserFilterCallback) => {
    for (const n of Tools.explode(name)) {
      let filter = filters.find((f) => f.name === n);
      if (!filter) {
        filter = { name: n, callbacks: [] };
        filters.push(filter);
      }
      filter.callbacks.push(callback);
    }
  };
  const remove = (name: string, callback?: ParserFilterCallback) => {
    for (const n of Tools.explode(name)) {
      const idx = filters.findIndex((f) => f.name === n);
      if (idx === -1) {
        continue;
      }
      if (callback) {
        const f = filters[idx];
        f.callbacks = f.callbacks.filter((cb) => cb !== callback);
        if (f.callbacks.length === 0) {
          filters.splice(idx, 1);
        }
      } else {
        filters.splice(idx, 1);
      }
    }
  };
  return { filters, add, remove, get: () => filters };
};

export const createDomParser = (settings: DomParserSettings = {}, schema: Schema): DomParser => {
  const nodeFilters = makeFilterRegistry();
  const attributeFilters = makeFilterRegistry();
  const styles = createStyles(settings, schema);
  const inertDoc = settings.document ?? getInertDocument();

  const validate = settings.validate !== false;
  const sanitize = settings.sanitize !== false && settings.xss_sanitization !== false;
  const blockElements = schema.getBlockElements();
  const textBlockElements = schema.getTextBlockElements();
  const nonEmptyElements = schema.getNonEmptyElements();
  const whitespaceElements = schema.getWhitespaceElements();
  const specialElements = schema.getSpecialElements();
  const boolAttrs = schema.getBoolAttrs();
  const transparentElements = schema.getTransparentElements();
  const validClasses = schema.getValidClasses();
  const fontSizes = Tools.explode(settings.font_size_legacy_values || 'xx-small,small,medium,large,x-large,xx-large,300%');

  const isBlock = (node: Node): boolean => isElement(node) && !!blockElements[node.localName.toLowerCase()];
  const isTextBlock = (name: string): boolean => !!textBlockElements[name];
  const isBr = (node: Node | null): boolean => !!node && isElement(node) && node.localName === 'br';
  const isLineBreakNode = (node: Node | null): boolean => node === null || isBlock(node) || isBr(node);
  const isTransparent = (node: Node | null): boolean => !!node && isElement(node) && !!transparentElements[node.localName.toLowerCase()];

  /** Element name used for validity checks, skipping transparent wrappers (a, ins, del…). */
  const effectiveParentName = (parent: Node, rootName: string, root: Node): string => {
    let cur: Node | null = parent;
    while (cur && cur !== root && isTransparent(cur)) {
      cur = cur.parentNode;
    }
    if (!cur || cur === root) {
      return rootName;
    }
    return nodeName(cur);
  };

  const isWhitespacePreserving = (node: Node, root: Node): boolean => {
    let cur: Node | null = node;
    while (cur && cur !== root) {
      if (isElement(cur)) {
        const name = cur.localName.toLowerCase();
        if (whitespaceElements[name]) {
          return true;
        }
        const style = cur.getAttribute('style');
        if (style && /white-space\s*:\s*(pre|pre-wrap|pre-line|break-spaces)/i.test(style)) {
          return true;
        }
      }
      cur = cur.parentNode;
    }
    return false;
  };

  const renameElement = (el: Element, newName: string): Element => {
    const doc = el.ownerDocument!;
    const replacement = doc.createElement(newName);
    const attrs = el.attributes;
    for (let i = 0; i < attrs.length; i++) {
      replacement.setAttribute(attrs[i].name, attrs[i].value);
    }
    while (el.firstChild) {
      replacement.appendChild(el.firstChild);
    }
    el.parentNode?.replaceChild(replacement, el);
    return replacement;
  };

  const unwrap = (el: Element): Node | null => {
    const parent = el.parentNode;
    if (!parent) {
      return null;
    }
    const first = el.firstChild;
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el);
    }
    parent.removeChild(el);
    return first;
  };

  const removeNode = (node: Node): void => {
    node.parentNode?.removeChild(node);
  };

  const paddEmptyNode = (node: Element, args: ParserArgs): void => {
    const brPreferred = settings.pad_empty_with_br || args.insert;
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
    if (brPreferred && isBlock(node)) {
      node.appendChild(node.ownerDocument!.createElement('br'));
    } else {
      node.appendChild(node.ownerDocument!.createTextNode(nbsp));
    }
  };

  const mergeStyles = (el: Element, extra: Record<string, string | undefined>): void => {
    const parsed = styles.parse(el.getAttribute('style'));
    for (const k of Object.keys(extra)) {
      const v = extra[k];
      if (v) {
        parsed[k] = v;
      }
    }
    const css = styles.serialize(parsed, el.localName.toLowerCase());
    if (css) {
      el.setAttribute('style', css);
    } else {
      el.removeAttribute('style');
    }
  };

  /** Converts legacy presentational markup (font, strike, align) to styled equivalents. */
  const convertLegacyElement = (el: Element): Element => {
    const name = el.localName.toLowerCase();
    if (settings.convert_fonts_to_spans !== false && name === 'font') {
      const face = el.getAttribute('face');
      const size = el.getAttribute('size');
      const color = el.getAttribute('color');
      el.removeAttribute('face');
      el.removeAttribute('size');
      el.removeAttribute('color');
      const span = renameElement(el, 'span');
      let fontSize: string | undefined;
      if (size) {
        const n = parseInt(size, 10);
        if (!Number.isNaN(n)) {
          fontSize = fontSizes[Math.min(Math.max(n, 1), fontSizes.length) - 1];
        }
      }
      mergeStyles(span, { 'font-family': face ?? undefined, 'font-size': fontSize, color: color ?? undefined });
      return span;
    }
    if (name === 'strike' && schema.type !== 'html4') {
      return renameElement(el, 's');
    }
    if (settings.inline_styles !== false && el.hasAttribute('align')) {
      const align = (el.getAttribute('align') || '').toLowerCase();
      el.removeAttribute('align');
      if (align) {
        if (name === 'img') {
          if (align === 'left' || align === 'right') {
            mergeStyles(el, { float: align });
          } else {
            mergeStyles(el, { 'vertical-align': align });
          }
        } else if (name !== 'td' && name !== 'th' && name !== 'tr' && name !== 'table' && name !== 'col' && name !== 'colgroup' && name !== 'tbody' && name !== 'thead' && name !== 'tfoot') {
          mergeStyles(el, { 'text-align': align });
        } else {
          el.setAttribute('align', align);
        }
      }
    }
    return el;
  };

  const filterClasses = (el: Element, name: string): void => {
    if (!validClasses) {
      return;
    }
    const value = el.getAttribute('class');
    if (value === null) {
      return;
    }
    const globalList = validClasses['*'];
    const elementList = validClasses[name];
    const kept = value
      .split(/\s+/)
      .filter((c) => c.length > 0 && ((globalList && globalList[c]) || (elementList && elementList[c])));
    if (kept.length) {
      el.setAttribute('class', kept.join(' '));
    } else {
      el.removeAttribute('class');
    }
  };

  /** Returns false when the element must be removed/unwrapped after attribute processing. */
  const processAttributes = (el: Element, name: string, rule: ElementRule | undefined, isInternal: boolean): boolean => {
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      const attrName = attr.name;
      let value = attr.value;
      if (sanitize) {
        const decision = Sanitizer.sanitizeAttribute(el, attrName, value, settings);
        if (decision.action === 'remove') {
          el.removeAttribute(attrName);
          continue;
        }
      }
      const lower = attrName.toLowerCase();
      if (lower !== attrName) {
        // Attribute names are case-insensitive in HTML; normalise.
        el.removeAttribute(attrName);
        el.setAttribute(lower, value);
      }
      if (validate && rule && !isInternal) {
        if (!schema.isValid(name, lower)) {
          el.removeAttribute(lower);
          continue;
        }
        const attrRule = rule.attributes[lower];
        if (attrRule && attrRule.validValues && !(value in attrRule.validValues)) {
          el.removeAttribute(lower);
          continue;
        }
      }
      if (lower === 'style') {
        const css = styles.serialize(styles.parse(value), name);
        if (css) {
          if (css !== value) {
            el.setAttribute('style', css);
          }
        } else {
          el.removeAttribute('style');
        }
        continue;
      }
      if (lower === 'class') {
        filterClasses(el, name);
        continue;
      }
      if (boolAttrs[lower]) {
        el.setAttribute(lower, lower);
        continue;
      }
      if (lower === 'xlink:href' || lower === 'href' || lower === 'src') {
        // Trim stray whitespace which browsers tolerate but which hides schemes.
        value = value.trim();
        if (value !== attr.value) {
          el.setAttribute(lower, value);
        }
      }
    }

    if (validate && rule && !isInternal) {
      if (rule.attributesRequired) {
        const hasRequired = rule.attributesRequired.some((a) => el.hasAttribute(a));
        if (!hasRequired) {
          return false;
        }
      }
      if (rule.attributesDefault) {
        for (const d of rule.attributesDefault) {
          if (!el.hasAttribute(d.name)) {
            el.setAttribute(d.name, d.value);
          }
        }
      }
      if (rule.attributesForced) {
        for (const f of rule.attributesForced) {
          el.setAttribute(f.name, f.value === '{$uid}' ? 'mce_' + Math.floor(Math.random() * 1e9).toString(36) : f.value);
        }
      }
    }

    if (sanitize) {
      Sanitizer.applyLinkAndIframePolicies(el, settings);
    }
    return true;
  };

  interface WalkContext {
    args: ParserArgs;
    root: Node;
    rootName: string;
    invalidChildren: Node[];
    matchedNodes: Record<string, Element[]>;
    matchedComments: Comment[];
    matchedAttributes: Record<string, Element[]>;
  }

  const processChildren = (parent: Node, ctx: WalkContext): void => {
    let node: Node | null = parent.firstChild;
    while (node) {
      node = processNode(node, parent, ctx);
    }
  };

  /** Processes a node and returns the next node to process (sibling, or first unwrapped child). */
  const processNode = (node: Node, parent: Node, ctx: WalkContext): Node | null => {
    const next = node.nextSibling;
    const parentName = effectiveParentName(parent, ctx.rootName, ctx.root);

    if (isText(node)) {
      processText(node, parent, parentName, ctx);
      return next;
    }

    if (isComment(node)) {
      if (sanitize && !Sanitizer.isSafeComment(node.data, settings)) {
        removeNode(node);
        return next;
      }
      if (validate && !schema.isValidChild(parentName, '#comment') && parent !== ctx.root) {
        removeNode(node);
        return next;
      }
      ctx.matchedComments.push(node);
      return next;
    }

    if (!isElement(node)) {
      // Processing instructions, CDATA, doctype… are never part of body content.
      removeNode(node);
      return next;
    }

    let el: Element = node;

    // Foreign namespaces (svg/math).
    if (Sanitizer.isForeign(el)) {
      const name = el.localName.toLowerCase();
      if (schema.getElementRule(name) && (!sanitize || Sanitizer.sanitizeForeignSubtree(el, settings))) {
        if (!schema.isValidChild(parentName, name) && validate) {
          ctx.invalidChildren.push(el);
        }
        collectMatches(el, name, ctx);
        return next;
      }
      removeNode(el);
      return next;
    }

    let name = el.localName.toLowerCase();
    const isInternal = el.hasAttribute('data-mce-type') || el.hasAttribute('data-mce-bogus');

    if (sanitize) {
      if (Sanitizer.forbiddenElements.has(name)) {
        removeNode(el);
        return next;
      }
      if (/[^a-z0-9-]/.test(name)) {
        const first = unwrap(el);
        return first ?? next;
      }
      if ((name === 'object' || name === 'embed') && settings.convert_unsafe_embeds !== false) {
        const replacement = Sanitizer.convertUnsafeEmbed(el);
        if (!replacement) {
          return next;
        }
        el = replacement;
        name = el.localName.toLowerCase();
      }
    }

    // Legacy conversions before validation so the new element is validated.
    if (!isInternal) {
      el = convertLegacyElement(el);
      name = el.localName.toLowerCase();
    }

    let rule = schema.getElementRule(name);

    if (validate && !isInternal) {
      if (!rule) {
        if (specialElements[name]) {
          removeNode(el);
          return next;
        }
        const first = unwrap(el);
        return first ?? next;
      }
      if (rule.outputName && rule.outputName !== name) {
        el = renameElement(el, rule.outputName);
        name = rule.outputName;
        rule = schema.getElementRule(name) ?? rule;
      }
    }

    if (!processAttributes(el, name, rule, isInternal)) {
      const first = unwrap(el);
      return first ?? next;
    }

    // Children.
    processChildren(el, ctx);

    // Validity in parent.
    if (validate && !isInternal) {
      if (!schema.isValidChild(parentName, name)) {
        ctx.invalidChildren.push(el);
      } else if (rule && rule.parentsRequired && parent !== ctx.root) {
        const pn = nodeName(parent);
        if (!rule.parentsRequired.includes(pn)) {
          ctx.invalidChildren.push(el);
        }
      }

      if (rule && (rule.removeEmpty || rule.paddEmpty) && isEmptyNode(schema, el, nonEmptyElements, whitespaceElements)) {
        if (rule.paddEmpty) {
          paddEmptyNode(el, ctx.args);
        } else if (!el.hasAttribute('name') && !el.hasAttribute('id')) {
          if (blockElements[name]) {
            removeNode(el);
          } else {
            unwrap(el);
          }
          return next;
        }
      }

      if (rule && rule.removeEmptyAttrs && el.attributes.length === 0) {
        unwrap(el);
        return next;
      }
    }

    collectMatches(el, name, ctx);
    return next;
  };

  const collectMatches = (el: Element, name: string, ctx: WalkContext): void => {
    if (nodeFilters.filters.length) {
      for (const f of nodeFilters.filters) {
        if (f.name === name) {
          (ctx.matchedNodes[name] = ctx.matchedNodes[name] || []).push(el);
        }
      }
    }
    if (attributeFilters.filters.length) {
      for (const f of attributeFilters.filters) {
        if (el.hasAttribute(f.name)) {
          (ctx.matchedAttributes[f.name] = ctx.matchedAttributes[f.name] || []).push(el);
        }
      }
    }
  };

  const isAtStartOfBlock = (node: Node, root: Node): boolean => {
    let cur: Node = node;
    while (true) {
      const prev = cur.previousSibling;
      if (prev) {
        return isLineBreakNode(prev);
      }
      const p = cur.parentNode;
      if (!p || p === root) {
        return true;
      }
      if (isBlock(p)) {
        return true;
      }
      cur = p;
    }
  };

  const isAtEndOfBlock = (node: Node, root: Node): boolean => {
    let cur: Node = node;
    while (true) {
      const nxt = cur.nextSibling;
      if (nxt) {
        return isLineBreakNode(nxt);
      }
      const p = cur.parentNode;
      if (!p || p === root) {
        return true;
      }
      if (isBlock(p)) {
        return true;
      }
      cur = p;
    }
  };

  const processText = (node: Text, parent: Node, parentName: string, ctx: WalkContext): void => {
    let text = node.data;
    if (!isWhitespacePreserving(parent, ctx.root)) {
      text = text.replace(whiteSpaceRegExp, ' ');
      if (isAtStartOfBlock(node, ctx.root)) {
        text = text.replace(startWhiteSpaceRegExp, '');
      }
      if (isAtEndOfBlock(node, ctx.root)) {
        text = text.replace(endWhiteSpaceRegExp, '');
      }
      if (text.length === 0) {
        removeNode(node);
        return;
      }
      if (text !== node.data) {
        node.data = text;
      }
    }
    if (validate && parent !== ctx.root && !schema.isValidChild(parentName, '#text')) {
      if (isWhitespaceText(text)) {
        removeNode(node);
      } else {
        ctx.invalidChildren.push(node);
      }
    }
  };

  /** Port of TinyMCE DomParser.fixInvalidChildren operating on DOM nodes. */
  const fixInvalidChildren = (nodes: Node[], ctx: WalkContext): void => {
    const doc = ctx.root.ownerDocument ?? inertDoc;
    for (const node of nodes) {
      const parent = node.parentNode;
      if (!parent || (node as any).__kheFixed) {
        continue;
      }

      if (isText(node)) {
        const pn = nodeName(parent);
        let wrapperName: string | null = null;
        if (pn === 'ul' || pn === 'ol') {
          wrapperName = 'li';
        } else if (pn === 'dl') {
          wrapperName = 'dd';
        } else if (schema.isValidChild(pn, 'p')) {
          wrapperName = 'p';
        } else if (schema.isValidChild(pn, 'div')) {
          wrapperName = 'div';
        }
        if (wrapperName) {
          const wrapper = doc.createElement(wrapperName);
          parent.insertBefore(wrapper, node);
          wrapper.appendChild(node);
        } else {
          // Move the text before the offending parent.
          const gp = parent.parentNode;
          if (gp && gp !== ctx.root || gp === ctx.root) {
            gp!.insertBefore(node, parent);
          } else {
            removeNode(node);
          }
        }
        continue;
      }

      if (!isElement(node)) {
        continue;
      }
      const name = node.localName.toLowerCase();

      // Text block inside li: unwrap, convert following text blocks to li (Word/OpenOffice style).
      if (isTextBlock(name) && nodeName(parent) === 'li') {
        let sibling = node.nextSibling;
        while (sibling) {
          const nextSibling = sibling.nextSibling;
          if (isElement(sibling) && isTextBlock(sibling.localName.toLowerCase())) {
            const li = renameElement(sibling, 'li');
            (li as any).__kheFixed = true;
            parent.parentNode?.insertBefore(li, parent.nextSibling);
          } else {
            break;
          }
          sibling = nextSibling;
        }
        unwrap(node);
        continue;
      }

      // Find a parent that can accept the node.
      const parents: Node[] = [node];
      let p: Node | null = parent;
      while (p && p !== ctx.root && !schema.isValidChild(nodeName(p), name) && !nonSplittableElements[nodeName(p)]) {
        parents.push(p);
        p = p.parentNode;
      }
      const targetName = p ? (p === ctx.root ? ctx.rootName : nodeName(p)) : null;

      if (p && parents.length > 1 && targetName) {
        if (schema.isValidChild(targetName, name)) {
          parents.reverse();
          const newParent = (parents[0] as Element).cloneNode(false) as Element;
          let currentNode: Element = newParent;
          for (let i = 0; i < parents.length - 1; i++) {
            let tempNode: Element;
            if (schema.isValidChild(currentNode.localName, nodeName(parents[i]))) {
              tempNode = (parents[i] as Element).cloneNode(false) as Element;
              currentNode.appendChild(tempNode);
            } else {
              tempNode = currentNode;
            }
            let childNode = parents[i].firstChild;
            while (childNode && childNode !== parents[i + 1]) {
              const nextNode = childNode.nextSibling;
              tempNode.appendChild(childNode);
              childNode = nextNode;
            }
            currentNode = tempNode;
          }
          const first = parents[0];
          if (!isEmptyNode(schema, newParent, nonEmptyElements, whitespaceElements)) {
            p.insertBefore(newParent, first);
            p.insertBefore(node, first);
          } else {
            p.insertBefore(node, first);
          }
          if (isElement(first) && (isEmptyNode(schema, first, nonEmptyElements, whitespaceElements) || hasOnlyChild(first, 'br'))) {
            removeNode(first);
          }
        } else {
          unwrap(node);
        }
      } else if (node.parentNode) {
        if (name === 'li') {
          let sibling = node.previousSibling;
          if (sibling && isElement(sibling) && (sibling.localName === 'ul' || sibling.localName === 'ol')) {
            sibling.appendChild(node);
            continue;
          }
          sibling = node.nextSibling;
          if (sibling && isElement(sibling) && (sibling.localName === 'ul' || sibling.localName === 'ol') && sibling.firstChild) {
            sibling.insertBefore(node, sibling.firstChild);
            continue;
          }
          const wrapper = doc.createElement('ul');
          node.parentNode.insertBefore(wrapper, node);
          wrapper.appendChild(node);
          continue;
        }
        if ((name === 'td' || name === 'th') && nodeName(node.parentNode) !== 'tr') {
          // Cells outside rows become their contents.
          unwrap(node);
          continue;
        }
        const pn = node.parentNode === ctx.root ? ctx.rootName : nodeName(node.parentNode);
        if (schema.isValidChild(pn, 'div') && schema.isValidChild('div', name)) {
          const wrapper = doc.createElement('div');
          node.parentNode.insertBefore(wrapper, node);
          wrapper.appendChild(node);
        } else if (specialElements[name]) {
          removeNode(node);
        } else {
          unwrap(node);
        }
      }
    }
  };

  /** Removes trailing `br` elements in blocks (TinyMCE `remove_trailing_brs`). */
  const removeTrailingBrs = (root: Node, args: ParserArgs): void => {
    const brs: Element[] = [];
    const walker = (root.ownerDocument ?? inertDoc).createTreeWalker(root, 1);
    let cur = walker.nextNode() as Element | null;
    while (cur) {
      if (cur.localName === 'br') {
        brs.push(cur);
      }
      cur = walker.nextNode() as Element | null;
    }
    for (let br of brs as Array<Element | null>) {
      if (!br || !br.parentNode) {
        continue;
      }
      let parent: Node | null = br.parentNode;
      const parentIsBlock = parent === root || isBlock(parent);
      if (parentIsBlock && br === parent.lastChild) {
        let prev = br.previousSibling;
        while (prev) {
          if (!(isElement(prev) && prev.localName === 'span' && prev.getAttribute('data-mce-type') === 'bookmark')) {
            if (isElement(prev) && prev.localName === 'br') {
              br = null;
            }
            break;
          }
          prev = prev.previousSibling;
        }
        if (br) {
          removeNode(br);
          if (parent !== root && isElement(parent) && isEmptyNode(schema, parent, nonEmptyElements, whitespaceElements)) {
            const elementRule = schema.getElementRule(parent.localName.toLowerCase());
            if (elementRule) {
              if (elementRule.removeEmpty) {
                removeNode(parent);
              } else if (elementRule.paddEmpty) {
                paddEmptyNode(parent, args);
              }
            }
          }
        }
      } else {
        // <p><b><i><br></i></b></p> → <p><b><i>&nbsp;</i></b></p>
        let lastParent: Node = br;
        while (parent && parent.firstChild === lastParent && parent.lastChild === lastParent) {
          lastParent = parent;
          if (isBlock(parent) || parent === root) {
            break;
          }
          parent = parent.parentNode;
        }
        if (lastParent === parent && parent !== root) {
          const textNode = (root.ownerDocument ?? inertDoc).createTextNode(nbsp);
          br.parentNode.replaceChild(textNode, br);
        }
      }
    }
  };

  /** Wraps loose inline content at the root into forced root blocks. */
  const addRootBlocks = (root: Node, args: ParserArgs): void => {
    const forced = args.forced_root_block !== undefined ? args.forced_root_block : settings.forced_root_block;
    const blockName = forced === false ? null : forced === true || forced === undefined ? 'p' : forced;
    if (!blockName) {
      return;
    }
    const attrs = args.forced_root_block_attrs ?? settings.forced_root_block_attrs ?? {};
    const doc = root.ownerDocument ?? inertDoc;
    let rootBlockNode: Element | null = null;

    const trim = (block: Element | null) => {
      if (block) {
        const first = block.firstChild;
        if (first && isText(first)) {
          first.data = first.data.replace(startWhiteSpaceRegExp, '');
        }
        const last = block.lastChild;
        if (last && isText(last)) {
          last.data = last.data.replace(endWhiteSpaceRegExp, '');
        }
        if (!block.firstChild) {
          removeNode(block);
        }
      }
    };

    let node = root.firstChild;
    while (node) {
      const next = node.nextSibling;
      const wrap = isText(node) || (isElement(node) && node.localName !== blockName && !blockElements[node.localName.toLowerCase()] && !node.hasAttribute('data-mce-type'));
      if (wrap) {
        if (isText(node) && isWhitespaceText(node.data) && !rootBlockNode) {
          removeNode(node);
        } else {
          if (!rootBlockNode) {
            rootBlockNode = doc.createElement(blockName);
            for (const k of Object.keys(attrs)) {
              rootBlockNode.setAttribute(k, attrs[k]);
            }
            root.insertBefore(rootBlockNode, node);
          }
          rootBlockNode.appendChild(node);
        }
      } else {
        trim(rootBlockNode);
        rootBlockNode = null;
      }
      node = next;
    }
    trim(rootBlockNode);
  };

  const runFilters = (ctx: WalkContext): void => {
    for (const f of nodeFilters.filters) {
      if (f.name === '#comment') {
        if (ctx.matchedComments.length) {
          for (const cb of f.callbacks) {
            (cb as unknown as CommentFilterCallback)(ctx.matchedComments.filter((c) => c.parentNode), f.name, ctx.args);
          }
        }
        continue;
      }
      const nodes = ctx.matchedNodes[f.name];
      if (nodes && nodes.length) {
        const live = nodes.filter((n) => n.isConnected || contains(ctx.root, n));
        if (live.length) {
          for (const cb of f.callbacks) {
            cb(live, f.name, ctx.args);
          }
        }
      }
    }
    for (const f of attributeFilters.filters) {
      const nodes = ctx.matchedAttributes[f.name];
      if (nodes && nodes.length) {
        const live = nodes.filter((n) => (n.isConnected || contains(ctx.root, n)) && n.hasAttribute(f.name));
        if (live.length) {
          for (const cb of f.callbacks) {
            cb(live, f.name, ctx.args);
          }
        }
      }
    }
  };

  const contains = (root: Node, node: Node): boolean => {
    let cur: Node | null = node;
    while (cur) {
      if (cur === root) {
        return true;
      }
      cur = cur.parentNode;
    }
    return false;
  };

  const filter = (root: Element | DocumentFragment, args: ParserArgs = {}): void => {
    const rootName = args.context ?? (isElement(root) ? root.localName.toLowerCase() : settings.root_name ?? 'body');
    const ctx: WalkContext = { args, root, rootName, invalidChildren: [], matchedNodes: {}, matchedComments: [], matchedAttributes: {} };
    processChildren(root, ctx);
    if (validate && ctx.invalidChildren.length > 0) {
      if (!args.context) {
        fixInvalidChildren(ctx.invalidChildren, ctx);
      } else {
        args.invalid = true;
      }
    }
    if (settings.remove_trailing_brs !== false) {
      removeTrailingBrs(root, args);
    }
    if (!args.context && (rootName === 'body' || rootName === (settings.root_name ?? 'body'))) {
      addRootBlocks(root, args);
    }
    if (!args.invalid) {
      runFilters(ctx);
    }
  };

  const parse = (html: string, args: ParserArgs = {}): DocumentFragment => {
    const fragment = inertDoc.createDocumentFragment();
    if (args.context) {
      const container = inertDoc.createElement(args.context);
      container.innerHTML = html;
      while (container.firstChild) {
        fragment.appendChild(container.firstChild);
      }
    } else {
      const body = inertDoc.createElement('body');
      // Parsing in body context mirrors how browsers treat pasted/loaded content.
      const template = inertDoc.createElement('template');
      template.innerHTML = '<body>' + html + '</body>';
      const parsedBody = template.content.querySelector('body');
      const source: Node = parsedBody ?? template.content;
      while (source.firstChild) {
        body.appendChild(source.firstChild);
      }
      // Anything outside body in the template (e.g. stray head content) is dropped.
      while (body.firstChild) {
        fragment.appendChild(body.firstChild);
      }
    }
    filter(fragment, args);
    return fragment;
  };

  return {
    schema,
    styles,
    addAttributeFilter: attributeFilters.add,
    getAttributeFilters: attributeFilters.get,
    removeAttributeFilter: attributeFilters.remove,
    addNodeFilter: nodeFilters.add,
    getNodeFilters: nodeFilters.get,
    removeNodeFilter: nodeFilters.remove,
    parse,
    filter,
    getDocument: () => inertDoc,
  };
};

export type { SchemaMap };
