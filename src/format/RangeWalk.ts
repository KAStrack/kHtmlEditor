import type { DOMUtils } from '../dom/DOMUtils';
import type { RangeLikeObject } from './Formatter';
import * as NodeType from '../dom/NodeType';

/**
 * Walks a range and calls back with arrays of sibling nodes covering it (port of TinyMCE's
 * RangeWalk), plus the text node splitting that precedes formatting operations.
 */

/** Splits the boundary text nodes so that the range starts/ends at node boundaries. */
export const splitRange = (rng: RangeLikeObject): RangeLikeObject => {
  let startContainer = rng.startContainer;
  let startOffset = rng.startOffset;
  let endContainer = rng.endContainer;
  let endOffset = rng.endOffset;

  if (startContainer === endContainer && NodeType.isText(startContainer)) {
    if (startOffset > 0 && startOffset < startContainer.data.length) {
      endContainer = startContainer.splitText(startOffset);
      startContainer = endContainer.previousSibling as Node;
      if (endOffset > startOffset) {
        endOffset = endOffset - startOffset;
        const newContainer = (endContainer as Text).splitText(endOffset).previousSibling as Text;
        startContainer = endContainer = newContainer;
        endOffset = newContainer.data.length;
        startOffset = 0;
      } else {
        endOffset = 0;
      }
    }
  } else {
    if (NodeType.isText(startContainer) && startOffset > 0 && startOffset < startContainer.data.length) {
      startContainer = startContainer.splitText(startOffset);
      startOffset = 0;
    }
    if (NodeType.isText(endContainer) && endOffset > 0 && endOffset < endContainer.data.length) {
      const newContainer = endContainer.splitText(endOffset).previousSibling as Text;
      endContainer = newContainer;
      endOffset = newContainer.data.length;
    }
  }
  return { startContainer, startOffset, endContainer, endOffset };
};

const getEndChild = (container: Node, offset: number): Node => {
  const childNodes = container.childNodes;
  let idx = offset - 1;
  if (idx > childNodes.length - 1) {
    idx = childNodes.length - 1;
  } else if (idx < 0) {
    idx = 0;
  }
  return childNodes[idx] || container;
};

export const walk = (dom: DOMUtils, rng: RangeLikeObject, callback: (nodes: Node[]) => void): void => {
  let startContainer = rng.startContainer;
  const startOffset = rng.startOffset;
  let endContainer = rng.endContainer;
  const endOffset = rng.endOffset;

  // Fake table cell selection.
  const cells = dom.select('td[data-mce-selected],th[data-mce-selected]');
  if (cells.length > 0) {
    cells.forEach((node) => callback([node]));
    return;
  }

  const exclude = (nodes: Node[]): Node[] => {
    let node = nodes[0];
    if (NodeType.isText(node) && node === startContainer && startOffset >= node.data.length) {
      nodes.splice(0, 1);
    }
    node = nodes[nodes.length - 1];
    if (endOffset === 0 && nodes.length > 0 && node === endContainer && NodeType.isText(node)) {
      nodes.splice(nodes.length - 1, 1);
    }
    return nodes;
  };

  const collectSiblings = (node: Node | null, name: 'nextSibling' | 'previousSibling', endNode?: Node | null): Node[] => {
    const siblings: Node[] = [];
    for (; node && node !== endNode; node = node[name]) {
      siblings.push(node);
    }
    return siblings;
  };

  const findEndPoint = (node: Node, root: Node): Node | null => dom.getParent(node, (n) => n.parentNode === root, root);

  const walkBoundary = (startNode: Node, endNode: Node | null, next?: boolean) => {
    const siblingName = next ? 'nextSibling' : 'previousSibling';
    for (let node: Node | null = startNode, parent = node.parentNode; node && node !== endNode; node = parent) {
      parent = node.parentNode;
      const siblings = collectSiblings(node === startNode ? node : node[siblingName], siblingName);
      if (siblings.length) {
        if (!next) {
          siblings.reverse();
        }
        callback(exclude(siblings));
      }
    }
  };

  if (NodeType.isElement(startContainer) && startContainer.hasChildNodes()) {
    startContainer = startContainer.childNodes[startOffset] || startContainer;
  }
  if (NodeType.isElement(endContainer) && endContainer.hasChildNodes()) {
    endContainer = getEndChild(endContainer, endOffset);
  }

  if (startContainer === endContainer) {
    callback(exclude([startContainer]));
    return;
  }

  const ancestor = dom.findCommonAncestor(startContainer, endContainer) as Node;

  // One container is an ancestor of the other: walk only the inner leaf.
  for (let node: Node | null = startContainer; node; node = node.parentNode) {
    if (node === endContainer) {
      walkBoundary(startContainer, ancestor, true);
      return;
    }
    if (node === ancestor) {
      break;
    }
  }
  for (let node: Node | null = endContainer; node; node = node.parentNode) {
    if (node === startContainer) {
      walkBoundary(endContainer, ancestor);
      return;
    }
    if (node === ancestor) {
      break;
    }
  }

  const startPoint = findEndPoint(startContainer, ancestor) || startContainer;
  const endPoint = findEndPoint(endContainer, ancestor) || endContainer;

  // Walk the left leaf up to the ancestor's child.
  walkBoundary(startContainer, startPoint, true);

  // Walk the middle from start point to end point.
  const siblings = collectSiblings(startPoint === startContainer ? startPoint : startPoint.nextSibling, 'nextSibling', endPoint === endContainer ? endPoint.nextSibling : endPoint);
  if (siblings.length) {
    callback(exclude(siblings));
  }

  // Walk the right leaf.
  walkBoundary(endContainer, endPoint);
};
