/**
 * Document-order node walker bounded by a root node (port of TinyMCE's DomTreeWalker).
 */
export class TreeWalker {
  private node: Node | null | undefined;
  private readonly rootNode: Node;

  constructor(startNode: Node, rootNode: Node) {
    this.node = startNode;
    this.rootNode = rootNode;
  }

  current(): Node | null | undefined {
    return this.node;
  }

  next(shallow?: boolean): Node | null | undefined {
    this.node = this.findSibling(this.node, 'firstChild', 'nextSibling', shallow);
    return this.node;
  }

  prev(shallow?: boolean): Node | null | undefined {
    this.node = this.findSibling(this.node, 'lastChild', 'previousSibling', shallow);
    return this.node;
  }

  prev2(shallow?: boolean): Node | null | undefined {
    this.node = this.findPreviousNode(this.node, shallow);
    return this.node;
  }

  private findSibling(node: Node | null | undefined, startName: 'firstChild' | 'lastChild', siblingName: 'nextSibling' | 'previousSibling', shallow?: boolean): Node | null | undefined {
    if (node) {
      if (!shallow && node[startName]) {
        return node[startName];
      }
      if (node !== this.rootNode) {
        let sibling = node[siblingName];
        if (sibling) {
          return sibling;
        }
        for (let parent = node.parentNode; parent && parent !== this.rootNode; parent = parent.parentNode) {
          sibling = parent[siblingName];
          if (sibling) {
            return sibling;
          }
        }
      }
    }
    return undefined;
  }

  private findPreviousNode(node: Node | null | undefined, shallow?: boolean): Node | null | undefined {
    if (node) {
      const sibling = node.previousSibling;
      if (this.rootNode && sibling === this.rootNode) {
        return undefined;
      }
      if (sibling) {
        if (!shallow) {
          for (let child = sibling.lastChild; child; child = child.lastChild) {
            if (!child.lastChild) {
              return child;
            }
          }
        }
        return sibling;
      }
      const parent = node.parentNode;
      if (parent && parent !== this.rootNode) {
        return parent;
      }
    }
    return undefined;
  }
}
