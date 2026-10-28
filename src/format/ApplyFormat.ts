import type { Editor } from '../core/Editor';
import type { Format, FormatVars, RangeLikeObject } from './Formatter';
import * as NodeType from '../dom/NodeType';
import * as FormatUtils from './FormatUtils';
import * as MatchFormat from './MatchFormat';
import * as MergeFormats from './MergeFormats';
import * as RangeWalk from './RangeWalk';
import { expandRng } from './ExpandRange';
import { applyCaretFormat } from './CaretFormat';
import { isArray, isFunction } from '../util/Type';

/** Format application (port of TinyMCE's ApplyFormat). */

const each = <T>(arr: ArrayLike<T> | undefined | null, f: (item: T, i: number) => void) => {
  if (arr) {
    for (let i = 0; i < arr.length; i++) {
      f(arr[i], i);
    }
  }
};

const getChildCount = (node: Node): number => {
  let count = 0;
  each(node.childNodes, (child) => {
    if (!FormatUtils.isWhiteSpaceNode(child) && !NodeType.isBookmarkNode(child)) {
      count++;
    }
  });
  return count;
};

export const applyFormatInternal = (ed: Editor, name: string, vars?: FormatVars, node?: Node | RangeLikeObject): void => {
  const formatList = ed.formatter.get(name) as Format[] | undefined;
  if (!formatList) {
    return;
  }
  const format = formatList[0];
  const isCollapsed = !node && ed.selection.isCollapsed();
  const dom = ed.dom;
  const selection = ed.selection;

  const setElementFormat = (elm: Element, fmt: Format = format): void => {
    if (isFunction(fmt.onformat)) {
      fmt.onformat(elm, fmt, vars, node as Node | undefined);
    }
    if (fmt.styles && !isArray(fmt.styles)) {
      for (const key of Object.keys(fmt.styles)) {
        dom.setStyle(elm, key, FormatUtils.replaceVars(fmt.styles[key], vars));
      }
      const styleVal = dom.getAttrib(elm, 'style');
      if (styleVal) {
        dom.setAttrib(elm, 'data-mce-style', styleVal);
      }
    }
    if (fmt.attributes && !isArray(fmt.attributes)) {
      for (const key of Object.keys(fmt.attributes)) {
        dom.setAttrib(elm, key, FormatUtils.replaceVars(fmt.attributes[key] as any, vars));
      }
    }
    if (fmt.classes) {
      const list = isArray(fmt.classes) ? fmt.classes : [fmt.classes];
      for (const cls of list) {
        const value = FormatUtils.replaceVars(cls, vars) as string;
        if (!dom.hasClass(elm, value)) {
          dom.addClass(elm, value);
        }
      }
    }
  };

  const applyNodeStyle = (fmtList: Format[], n: Node): boolean => {
    let found = false;
    for (const fmt of fmtList) {
      if (!FormatUtils.isSelectorFormat(fmt)) {
        break;
      }
      if (fmt.collapsed !== undefined && fmt.collapsed !== isCollapsed) {
        continue;
      }
      if (NodeType.isElement(n) && dom.is(n, fmt.selector) && !FormatUtils.isCaretNode(n)) {
        setElementFormat(n, fmt);
        found = true;
        break;
      }
    }
    return found;
  };

  /** A wrapper with a single same-named child collapses into one element carrying both formats. */
  const mergeStyles = (wrapper: Element): Element => {
    const child = Array.from(wrapper.childNodes).find((c) => FormatUtils.isElementNode(c) && dom.getContentEditable(c) !== 'false' && MatchFormat.matchName(dom, c, format)) as Element | undefined;
    if (!child) {
      return wrapper;
    }
    const clone = dom.clone(child, false);
    setElementFormat(clone);
    dom.replace(clone, wrapper, true);
    dom.remove(child, true);
    return clone;
  };

  const createWrapElement = (wrapName: string | undefined): Element | null => {
    if (wrapName) {
      const wrapElm = dom.create(wrapName);
      setElementFormat(wrapElm);
      return wrapElm;
    }
    return null;
  };

  const applyRngStyle = (rng: RangeLikeObject, nodeSpecific: boolean): void => {
    const newWrappers: Element[] = [];
    let contentEditable = true;
    const wrapName = FormatUtils.isInlineFormat(format) ? format.inline : FormatUtils.isBlockFormat(format) ? format.block : undefined;
    const wrapElm = createWrapElement(wrapName);

    const isMatchingWrappingBlock = (n: Node): boolean => !!format.wrapper && !!MatchFormat.matchNode(ed, n, name, vars);

    const canRenameBlock = (n: Node, parentName: string, isEditableDescendant: boolean): boolean => {
      const isValidBlockFormatForNode = FormatUtils.isBlockFormat(format) && !format.wrapper && FormatUtils.isTextBlock(ed.schema, n) && FormatUtils.isValid(ed, parentName, wrapName as string);
      return isEditableDescendant && isValidBlockFormatForNode;
    };

    const canWrapNode = (n: Node, parentName: string, isEditableDescendant: boolean, isWrappableNoneditableElm: boolean): boolean => {
      const nodeName = n.nodeName.toLowerCase();
      const isValidWrapNode = FormatUtils.isValid(ed, wrapName as string, nodeName) && FormatUtils.isValid(ed, parentName, wrapName as string);
      const isZwsp = !nodeSpecific && NodeType.isText(n) && NodeType.isZwspText(n);
      const isCaret = FormatUtils.isCaretNode(n);
      const isCorrectFormatForNode = !FormatUtils.isInlineFormat(format) || !dom.isBlock(n);
      return (isEditableDescendant || isWrappableNoneditableElm) && isValidWrapNode && !isZwsp && !isCaret && isCorrectFormatForNode;
    };

    RangeWalk.walk(dom, rng, (nodes) => {
      let currentWrapElm: Element | null = null;

      const process = (n: Node): void => {
        let hasContentEditableState = false;
        let lastContentEditable = contentEditable;
        let isWrappableNoneditableElm = false;
        const parentNode = n.parentNode as Node;
        const parentName = parentNode.nodeName.toLowerCase();

        const contentEditableValue = NodeType.isElement(n) ? dom.getContentEditable(n) : null;
        if (contentEditableValue !== null) {
          lastContentEditable = contentEditable;
          contentEditable = contentEditableValue === 'true';
          hasContentEditableState = true;
          isWrappableNoneditableElm = !!format.ceFalseOverride && contentEditable === false;
        }
        const isEditableDescendant = contentEditable && !hasContentEditableState;

        if (NodeType.isBr(n) && !FormatUtils.isValid(ed, wrapName as string, 'br')) {
          currentWrapElm = null;
          if (FormatUtils.isBlockFormat(format)) {
            dom.remove(n);
          }
          return;
        }

        if (isMatchingWrappingBlock(n)) {
          currentWrapElm = null;
          return;
        }

        if (canRenameBlock(n, parentName, isEditableDescendant)) {
          const elm = dom.rename(n as Element, wrapName as string);
          setElementFormat(elm);
          newWrappers.push(elm);
          currentWrapElm = null;
          return;
        }

        if (FormatUtils.isSelectorFormat(format)) {
          let found = applyNodeStyle(formatList, n);
          // Include the parent for expanded (non-inline) selector formats, e.g. aligning text styles its block.
          if (!found && parentNode && !FormatUtils.isCaretNode(parentNode) && format.expand !== false && !FormatUtils.isInlineFormat(format)) {
            found = applyNodeStyle(formatList, parentNode);
          }
          if (!FormatUtils.isInlineFormat(format) || found) {
            currentWrapElm = null;
            return;
          }
        }

        if (wrapElm && canWrapNode(n, parentName, isEditableDescendant, isWrappableNoneditableElm)) {
          if (!currentWrapElm) {
            currentWrapElm = dom.clone(wrapElm, false);
            parentNode.insertBefore(currentWrapElm, n);
            newWrappers.push(currentWrapElm);
          }
          if (isWrappableNoneditableElm && hasContentEditableState) {
            contentEditable = lastContentEditable;
          }
          currentWrapElm.appendChild(n);
        } else {
          currentWrapElm = null;
          each(Array.from(n.childNodes), process);
          if (hasContentEditableState) {
            contentEditable = lastContentEditable;
          }
          currentWrapElm = null;
        }
      };

      each(nodes, process);
    });

    if (format.links === true) {
      each(newWrappers, (n) => {
        const processLinks = (node2: Node) => {
          if (node2.nodeName === 'A') {
            setElementFormat(node2 as Element, format);
          }
          each(Array.from(node2.childNodes), processLinks);
        };
        processLinks(n);
      });
    }

    each(newWrappers, (n) => {
      let wrapper: Element = n;
      const childCount = getChildCount(wrapper);
      if ((newWrappers.length > 1 || !dom.isBlock(wrapper)) && childCount === 0) {
        dom.remove(wrapper, true);
        return;
      }
      if (FormatUtils.isInlineFormat(format) || (FormatUtils.isBlockFormat(format) && format.wrapper)) {
        if (!format.exact && childCount === 1) {
          wrapper = mergeStyles(wrapper);
        }
        MergeFormats.mergeWithChildren(ed, formatList, vars, wrapper);
        MergeFormats.mergeWithParents(ed, format, name, vars, wrapper);
        MergeFormats.mergeBackgroundColorAndFontSize(dom, format, vars, wrapper);
        MergeFormats.mergeTextDecorationsAndColor(dom, format, vars, wrapper);
        MergeFormats.mergeSubSup(dom, format, vars, wrapper);
        MergeFormats.mergeSiblings(ed, format, vars, wrapper);
      }
    });
  };

  if (node) {
    if (FormatUtils.isNode(node)) {
      if (!applyNodeStyle(formatList, node)) {
        const rng = dom.createRng();
        rng.setStartBefore(node);
        rng.setEndAfter(node);
        applyRngStyle(expandRng(ed, rng, formatList), true);
      }
    } else {
      applyRngStyle(node as RangeLikeObject, true);
    }
  } else {
    if (!isCollapsed || !FormatUtils.isInlineFormat(format) || FormatUtils.getCellsFromEditor(ed).length) {
      FormatUtils.preserveSelection(ed, () => {
        const selectionRng = selection.getRng();
        applyRngStyle(expandRng(ed, selectionRng, formatList), false);
      });
      FormatUtils.moveStart(dom, selection, selection.getRng());
      ed.nodeChanged();
    } else {
      applyCaretFormat(ed, name, vars);
    }
  }
};
