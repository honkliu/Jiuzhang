import {
  useRef, useEffect, useImperativeHandle, forwardRef, useCallback, useState,
} from 'react';
import * as d3 from 'd3';
import type { FamilyNode, FamilyTreeDto } from '@/services/family.service';

// ─── Layout constants (Right.md §2) ───
const NODE_GAP = 55;
const STUB_LEN = 20;
const TYPICAL_BOX_H = 78;
const LEVEL_HEIGHT = STUB_LEN + TYPICAL_BOX_H + STUB_LEN + 32; // 150
const BOX_Y_OFFSET = 0;
const GEN_STRIP_W = 34;
const NODE_STEP_MS = 10;

// ─── Colors (Right.md §13) ───
const C = {
  bg: '#eef2f6',
  link: '#8ea4b8',
  highlight: 'rgb(42,175,71)',
  nodeBackground: '#fff',
  nodeBorder: '#7a8fa0',
  nameText: '#1e293b',
  spouseText: '#64748b',
  stub: '#94a3b8',
  maleGender: '#60a5fa',
  femaleGender: '#f472b6',
};

function findNodeById(root: FamilyNode, id: string): FamilyNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}

// ─── Internal tree node used for layout ───
interface LayoutNode {
  id: string;
  data: FamilyNode;
  depth: number;         // relative depth within visible window (0-based)
  absDepth: number;      // absolute depth in the full tree
  children: LayoutNode[];
  _x: number;
  _y: number;
  hasHiddenChildren: boolean;
  parentId: string | null;
  // total siblings in data (not just visible)
  totalSiblingsInData: number;
  visibleSiblingCount: number;
  // for stub lines: who is eldest (rightmost)
  isEldestSibling: boolean;
}

export interface FamilyHistoHandle {
  centerOnPerson: (personId: string) => void;
  setPendingHighlight: (personId: string) => void;
  setShiftDirection: (dir: number) => void;
}

interface Props {
  root: FamilyNode;
  tree: FamilyTreeDto | null;
  visibleStartDepth: number;
  maxVisibleDepth: number;
  canShiftUp: boolean;
  canShiftDown: boolean;
  onNodeClick: (node: FamilyNode) => void;
  onNodeRightClick: (node: FamilyNode, x: number, y: number) => void;
  onExpandDepth: (personId: string) => void;
  onClearSelection: () => void;
  onShiftUp: () => void;
  onShiftDown: () => void;
}

// ─── Helpers ───

/** Build a flat depth map for the full tree */
function buildDepthMap(root: FamilyNode): Map<string, number> {
  const m = new Map<string, number>();
  function walk(n: FamilyNode, d: number) {
    m.set(n.id, d);
    n.children.forEach(c => walk(c, d + 1));
  }
  walk(root, 0);
  return m;
}

/** Build visible tree (Right.md §3.3) */
function buildVisibleTree(
  root: FamilyNode,
  fullRoot: FamilyNode,
  startDepth: number,
  maxVisible: number,
): LayoutNode[] {
  const depthMap = buildDepthMap(fullRoot);
  const endDepth = startDepth + maxVisible - 1;

  // Collect nodes from full tree whose absolute depth is in [startDepth, endDepth]
  function extract(node: FamilyNode): LayoutNode | null {
    const absD = depthMap.get(node.id) ?? 0;
    if (absD > endDepth) return null;
    if (absD < startDepth) {
      // Recurse into children to find nodes at startDepth
      const childResults: LayoutNode[] = [];
      for (const child of node.children) {
        const result = extract(child);
        if (result) childResults.push(result);
      }
      // Return children directly (they become top-level nodes at startDepth)
      return childResults.length === 1 ? childResults[0] : null;
    }

    // absD is within visible range
    const relativeDepth = absD - startDepth;
    const childNodes: LayoutNode[] = [];
    if (absD < endDepth) {
      for (const child of node.children) {
        const result = extract(child);
        if (result) childNodes.push(result);
      }
    }

    const hasHidden = absD === endDepth && node.children.length > 0;
    const parentRel = node.parentRels.length > 0 ? node.parentRels[0].fromId : null;

    return {
      id: node.id,
      data: node,
      depth: relativeDepth,
      absDepth: absD,
      children: childNodes,
      _x: 0,
      _y: relativeDepth * LEVEL_HEIGHT,
      hasHiddenChildren: hasHidden,
      parentId: parentRel,
      totalSiblingsInData: 1,
      visibleSiblingCount: 1,
      isEldestSibling: false,
    };
  }

  // Gather top-level nodes at startDepth
  function gatherAtStart(node: FamilyNode): LayoutNode[] {
    const absD = depthMap.get(node.id) ?? 0;
    if (absD === startDepth) {
      const r = extract(node);
      return r ? [r] : [];
    }
    if (absD < startDepth) {
      const results: LayoutNode[] = [];
      for (const child of node.children) {
        results.push(...gatherAtStart(child));
      }
      return results;
    }
    return [];
  }

  const topNodes = gatherAtStart(root);

  // For top-level nodes, we need to figure out their siblings in data
  // They share the same parent
  for (const tn of topNodes) {
    // Find this person's parent in the full tree to know total siblings
    const parentInFullTree = findParent(root, tn.id);
    const totalSibsInData = parentInFullTree ? parentInFullTree.children.length : 1;
    tn.totalSiblingsInData = totalSibsInData;
    tn.visibleSiblingCount = topNodes.filter(
      t => findParent(root, t.id)?.id === findParent(root, tn.id)?.id
    ).length;
    tn.isEldestSibling = false; // will set below
  }

  // Group top-level nodes by parent and set eldest
  const parentGroups = new Map<string, LayoutNode[]>();
  for (const tn of topNodes) {
    const p = findParent(root, tn.id);
    const key = p?.id ?? '__none__';
    if (!parentGroups.has(key)) parentGroups.set(key, []);
    parentGroups.get(key)!.push(tn);
  }
  for (const group of parentGroups.values()) {
    for (let i = 0; i < group.length; i++) {
      group[i].isEldestSibling = i === group.length - 1;
      group[i].visibleSiblingCount = group.length;
    }
  }

  // Recurse for children
  function setChildMeta(n: LayoutNode) {
    if (n.children.length > 0) {
      for (let i = 0; i < n.children.length; i++) {
        n.children[i].totalSiblingsInData = n.data.children.length;
        n.children[i].visibleSiblingCount = n.children.length;
        n.children[i].isEldestSibling = i === n.children.length - 1;
      }
      for (const c of n.children) setChildMeta(c);
    }
  }
  for (const tn of topNodes) setChildMeta(tn);

  return topNodes;
}

function findParent(root: FamilyNode, childId: string): FamilyNode | null {
  if (root.children.some(c => c.id === childId)) return root;
  for (const c of root.children) {
    const r = findParent(c, childId);
    if (r) return r;
  }
  return null;
}

/** Layout subtree (Right.md §3.2): bottom-up, parent aligns with rightmost child */
function layoutSubtree(node: LayoutNode, leftEdge: number): number {
  if (node.children.length === 0) {
    node._x = leftEdge;
    node._y = node.depth * LEVEL_HEIGHT;
    return NODE_GAP;
  }

  let cursor = leftEdge;
  for (const child of node.children) {
    const w = layoutSubtree(child, cursor);
    cursor += w;
  }

  // Parent aligns with rightmost (eldest) child
  const rightmostChild = node.children[node.children.length - 1];
  node._x = rightmostChild._x;
  node._y = node.depth * LEVEL_HEIGHT;

  return cursor - leftEdge;
}

/** Flatten all layout nodes */
function flattenLayout(nodes: LayoutNode[]): LayoutNode[] {
  const result: LayoutNode[] = [];
  function walk(n: LayoutNode) {
    result.push(n);
    n.children.forEach(walk);
  }
  nodes.forEach(walk);
  return result;
}

/** Right-align: shift all nodes so rightmost node lands on fullMaxX (Right.md §3.4) */
function alignRight(allNodes: LayoutNode[], fullMaxX: number) {
  if (allNodes.length === 0) return;
  const currentMax = Math.max(...allNodes.map(n => n._x));
  const shift = fullMaxX - currentMax;
  for (const n of allNodes) {
    n._x += shift;
  }
}

/** Compute box dimensions for a person */
function boxDims(node: FamilyNode): { w: number; h: number } {
  const hasSpouse = node.spouses.length > 0;
  const nameLen = node.name.length;
  const spouseLen = hasSpouse ? Math.max(...node.spouses.map(s => s.name.length)) : 0;
  const effectiveNameRows = Math.max(nameLen, spouseLen, 3);
  const h = effectiveNameRows * 18 + 24;
  const w = hasSpouse ? 42 : 26;
  return { w, h };
}

/** Build link path: vertical from parent bottom → horizontal → vertical to child top (Right.md §12.2) */
function linkPath(
  parentX: number, parentY: number, parentH: number,
  childX: number, childY: number,
): string {
  const parentBottom = parentY + BOX_Y_OFFSET + parentH;
  const childTop = childY + BOX_Y_OFFSET;
  const midY = (parentBottom + childTop) / 2;
  return `M${parentX},${parentBottom} V${midY} H${childX} V${childTop}`;
}

// ─── Component ───

export const FamilyHisto = forwardRef<FamilyHistoHandle, Props>((props, ref) => {
  const {
    root, tree, visibleStartDepth, maxVisibleDepth,
    canShiftUp, canShiftDown,
    onNodeClick, onNodeRightClick, onExpandDepth,
    onClearSelection, onShiftUp, onShiftDown,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const lastTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const animatingRef = useRef(false);
  const pendingHighlightRef = useRef<string | null>(null);
  const highlightSetRef = useRef<Set<string>>(new Set());
  const shiftDirRef = useRef<number>(0);
  const prevPosRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const maxDepthRef = useRef(0);
  const fullMaxXRef = useRef(0);
  const animTimersRef = useRef<number[]>([]);
  // Persist layout data across re-renders for event handlers
  const allFlatRef = useRef<LayoutNode[]>([]);
  const parentMapRef = useRef<Map<string, string>>(new Map());
  // State-driven highlight: bump version to trigger re-apply via useEffect
  const [highlightVersion, setHighlightVersion] = useState(0);
  const triggerHighlight = useCallback(() => setHighlightVersion(v => v + 1), []);
  // Rendering indicator
  const [rendering, setRendering] = useState(false);
  const rightmostVisibleRef = useRef<{ L0?: { id: string; name: string; depth: number }; L1?: { id: string; name: string; depth: number }; L2?: { id: string; name: string; depth: number } }>({});
  const onClearSelectionRef = useRef(onClearSelection);
  onClearSelectionRef.current = onClearSelection;
  const onNodeClickRef = useRef(onNodeClick);
  onNodeClickRef.current = onNodeClick;
  const onNodeRightClickRef = useRef(onNodeRightClick);
  onNodeRightClickRef.current = onNodeRightClick;
  // Keep latest values accessible from closures
  const visibleStartDepthRef = useRef(visibleStartDepth);
  visibleStartDepthRef.current = visibleStartDepth;
  const canShiftUpRef = useRef(canShiftUp);
  canShiftUpRef.current = canShiftUp;
  const canShiftDownRef = useRef(canShiftDown);
  canShiftDownRef.current = canShiftDown;
  const onShiftUpRef = useRef(onShiftUp);
  onShiftUpRef.current = onShiftUp;
  const onShiftDownRef = useRef(onShiftDown);
  onShiftDownRef.current = onShiftDown;

  const updateRightmostVisible = useCallback((svg: SVGSVGElement, t: d3.ZoomTransform) => {
    const nodes = allFlatRef.current;
    if (nodes.length === 0) return;

    const viewW = svg.clientWidth - GEN_STRIP_W;
    const viewH = svg.clientHeight;
    const bestByDepth: Record<number, { id: string; name: string; screenX: number } | null> = {
      0: null,
      1: null,
      2: null,
    };

    for (const node of nodes) {
      if (node.depth > 2) continue;
      const dims = boxDims(node.data);
      const left = (node._x - dims.w / 2) * t.k + t.x;
      const right = (node._x + dims.w / 2) * t.k + t.x;
      const top = (node._y + BOX_Y_OFFSET) * t.k + t.y;
      const bottom = (node._y + BOX_Y_OFFSET + dims.h) * t.k + t.y;
      const visible = right >= 0 && left <= viewW && bottom >= 0 && top <= viewH;
      if (!visible) continue;

      const current = bestByDepth[node.depth];
      if (!current || right > current.screenX) {
        bestByDepth[node.depth] = { id: node.id, name: node.data.name, screenX: right };
      }
    }

    rightmostVisibleRef.current = {
      L0: bestByDepth[0] ? { id: bestByDepth[0].id, name: bestByDepth[0].name, depth: 0 } : undefined,
      L1: bestByDepth[1] ? { id: bestByDepth[1].id, name: bestByDepth[1].name, depth: 1 } : undefined,
      L2: bestByDepth[2] ? { id: bestByDepth[2].id, name: bestByDepth[2].name, depth: 2 } : undefined,
    };
  }, [root]);

  // ─── Imperative handle (Right.md §11.3) ───
  useImperativeHandle(ref, () => ({
    centerOnPerson(personId: string) {
      requestAnimationFrame(() => {
        const svg = svgRef.current;
        if (!svg || !zoomRef.current) return;
        const nodeG = d3.select(svg).select<SVGGElement>(`.node[data-id="${personId}"]`);
        if (nodeG.empty()) return;
        const nx = parseFloat(nodeG.attr('data-x') ?? '0');
        const svgW = svg.clientWidth;
        const t = lastTransformRef.current;
        const targetX = svgW - GEN_STRIP_W - 30 - nx * t.k;
        const newT = d3.zoomIdentity.translate(targetX, t.y).scale(t.k);
        d3.select(svg)
          .transition()
          .duration(600)
          .call(zoomRef.current!.transform as any, newT);
      });
    },
    setPendingHighlight(personId: string) {
      pendingHighlightRef.current = personId;
    },
    setShiftDirection(dir: number) {
      shiftDirRef.current = dir;
    },
  }));

  // ─── Get visible tree + layout ───
  const computeTree = useCallback(() => {
    const topNodes = buildVisibleTree(root, root, visibleStartDepth, maxVisibleDepth);
    // Layout each top-level subtree. Children are ordered left-to-right (youngest left, eldest right).
    let cursor = 0;
    for (const tn of topNodes) {
      const w = layoutSubtree(tn, cursor);
      cursor += w;
    }
    const allFlat = flattenLayout(topNodes);
    const maxX = allFlat.length > 0 ? Math.max(...allFlat.map(n => n._x)) : 0;
    maxDepthRef.current = allFlat.length > 0 ? Math.max(...allFlat.map(n => n.depth)) + 1 : 0;
    return { topNodes, allFlat, maxX };
  }, [root, visibleStartDepth, maxVisibleDepth]);

  // ─── Rebuild the parent link map for visible tree (used to trace ancestors) ───
  const buildParentMap = useCallback((topNodes: LayoutNode[]): Map<string, string> => {
    const m = new Map<string, string>();
    function walk(n: LayoutNode) {
      for (const c of n.children) {
        m.set(c.id, n.id);
        walk(c);
      }
    }
    topNodes.forEach(walk);
    return m;
  }, []);

  // ─── Collect full branch from the ENTIRE data tree (not just visible) ───
  const collectFullBranch = useCallback((nodeId: string): Set<string> => {
    const result = new Set<string>();
    // Walk full data tree to find the node and collect ancestors + descendants
    function findAndCollectAncestors(n: FamilyNode, path: string[]): boolean {
      path.push(n.id);
      if (n.id === nodeId) {
        // Found — add all ancestors (the current path)
        path.forEach(id => result.add(id));
        return true;
      }
      for (const child of n.children) {
        if (findAndCollectAncestors(child, path)) return true;
      }
      path.pop();
      return false;
    }
    findAndCollectAncestors(root, []);

    // Now collect all descendants of the node
    function findNode(n: FamilyNode): FamilyNode | null {
      if (n.id === nodeId) return n;
      for (const c of n.children) {
        const found = findNode(c);
        if (found) return found;
      }
      return null;
    }
    const target = findNode(root);
    if (target) {
      function addDescendants(n: FamilyNode) {
        result.add(n.id);
        n.children.forEach(addDescendants);
      }
      addDescendants(target);
    }
    return result;
  }, [root]);

  // ─── Apply highlight (Right.md §10.3) ───
  const applyHighlight = useCallback((hSet: Set<string>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const sel = d3.select(svg);
    const active = hSet.size > 0;

    sel.selectAll<SVGGElement, unknown>('.node').each(function () {
      const g = d3.select(this);
      const id = g.attr('data-id');
      const highlighted = active && hSet.has(id);
      g.interrupt().style('opacity', 1);
      g.select('.node-border').interrupt()
        .attr('stroke', highlighted ? C.highlight : C.nodeBorder)
        .attr('stroke-width', highlighted ? 2.5 : 1.2);
      g.select('.name-text').interrupt()
        .attr('fill', highlighted ? C.highlight : C.nameText)
        .attr('font-weight', highlighted ? 700 : 500);
    });

    sel.selectAll<SVGPathElement, unknown>('.link').each(function () {
      const path = d3.select(this);
      const srcId = path.attr('data-source');
      const tgtId = path.attr('data-target');
      const highlighted = active && hSet.has(srcId) && hSet.has(tgtId);
      path.interrupt()
        .attr('stroke', highlighted ? C.highlight : C.link)
        .attr('stroke-width', highlighted ? 2 : 1.2)
        .style('opacity', 1);
    });
  }, []);

  // ─── Strip rendering (Right.md §5) ───
  const renderStrip = useCallback((
    svg: SVGSVGElement,
    startDepth: number,
    depthCount: number,
    transform: d3.ZoomTransform,
    rootGen: number,
  ) => {
    const svgW = svg.clientWidth;
    const stripG = d3.select(svg).select<SVGGElement>('.strip-group');
    stripG.selectAll('*').remove();

    const stripX = svgW - GEN_STRIP_W;
    stripG.attr('transform', `translate(${stripX}, 0)`);

    const rowTopByIndex = (i: number) => {
      const parentBottom = (i - 1) * LEVEL_HEIGHT + BOX_Y_OFFSET + TYPICAL_BOX_H;
      const childTop = i * LEVEL_HEIGHT + BOX_Y_OFFSET;
      return (parentBottom + childTop) / 2;
    };

    for (let i = 0; i < depthCount; i++) {
      const genZoneTop = rowTopByIndex(i);
      const genZoneBottom = genZoneTop + LEVEL_HEIGHT;
      const screenTop = genZoneTop * transform.k + transform.y;
      const screenH = (genZoneBottom - genZoneTop) * transform.k;
      const genNum = startDepth + i + rootGen;

      // Background rect
      stripG.append('rect')
        .attr('x', 0).attr('y', screenTop)
        .attr('width', GEN_STRIP_W).attr('height', screenH)
        .attr('fill', i % 2 === 0 ? '#fff' : '#f0f4f8')
        .attr('stroke', '#c0c8d0')
        .attr('stroke-width', 0.5);

      // Label
      const label = `第${genNum}世`;
      const textG = stripG.append('text')
        .attr('x', GEN_STRIP_W / 2)
        .attr('y', screenTop + screenH / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('font-size', 11)
        .attr('fill', C.nameText)
        .style('writing-mode', 'vertical-rl');
      textG.text(label);
    }

    // ▲ button
    if (canShiftUpRef.current) {
      const topY = rowTopByIndex(0) * transform.k + transform.y;
      stripG.append('text')
        .attr('x', GEN_STRIP_W / 2)
        .attr('y', topY - 8)
        .attr('text-anchor', 'middle')
        .attr('font-size', 14)
        .attr('fill', C.stub)
        .attr('cursor', 'pointer')
        .text('▲')
        .on('click', (event: any) => {
          event.stopPropagation();
          if (!animatingRef.current) onShiftUpRef.current();
        });
    }

    // ▼ button
    if (canShiftDownRef.current) {
      const botZoneBottom = rowTopByIndex(depthCount - 1) + LEVEL_HEIGHT;
      const screenBot = botZoneBottom * transform.k + transform.y;
      stripG.append('text')
        .attr('x', GEN_STRIP_W / 2)
        .attr('y', screenBot + 14)
        .attr('text-anchor', 'middle')
        .attr('font-size', 14)
        .attr('fill', C.stub)
        .attr('cursor', 'pointer')
        .text('▼')
        .on('click', (event: any) => {
          event.stopPropagation();
          if (!animatingRef.current) onShiftDownRef.current();
        });
    }
  }, []);

  // ─── Render nodes into SVG (no animation) ───
  const renderNodesImmediate = useCallback((
    svg: SVGSVGElement,
    allFlat: LayoutNode[],
    parentMap: Map<string, string>,
  ) => {
    const treeG = d3.select(svg).select<SVGGElement>('.tree-group');

    // Links (Right.md §12.2) + stub links for L0 nodes (Right.md §12.3)
    const linkData: { srcId: string; tgtId: string; d: string }[] = [];
    for (const node of allFlat) {
      const pId = parentMap.get(node.id);
      if (pId) {
        const parent = allFlat.find(n => n.id === pId);
        if (parent) {
          const { h: pH } = boxDims(parent.data);
          linkData.push({
            srcId: pId,
            tgtId: node.id,
            d: linkPath(parent._x, parent._y, pH, node._x, node._y),
          });
        }
      }
    }
    // Add L0 stub links (treated identically to regular links)
    linkData.push(...buildStubLinkData(allFlat));

    const links = treeG.selectAll<SVGPathElement, typeof linkData[0]>('.link')
      .data(linkData, d => `${d.srcId}->${d.tgtId}`);
    links.exit().remove();
    links.enter()
      .append('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', C.link)
      .attr('stroke-width', 1.2)
      .attr('data-source', d => d.srcId)
      .attr('data-target', d => d.tgtId)
      .attr('d', d => d.d);
    links.attr('d', d => d.d);

    renderRootStubs(treeG, allFlat);

    // Nodes (Right.md §12.1)
    const nodesSel = treeG.selectAll<SVGGElement, LayoutNode>('.node')
      .data(allFlat, d => d.id);

    nodesSel.exit().remove();

    const entered = nodesSel.enter()
      .append('g')
      .attr('class', 'node')
      .attr('data-id', d => d.id)
      .attr('data-x', d => d._x)
      .attr('data-y', d => d._y)
      .attr('transform', d => `translate(${d._x},${d._y})`)
      .style('opacity', 1);

    entered.each(function (d) {
      const g = d3.select(this);
      appendNodeContent(g, d);
    });

    // Update existing
    nodesSel
      .attr('data-x', d => d._x)
      .attr('data-y', d => d._y)
      .attr('transform', d => `translate(${d._x},${d._y})`);

    // Update expand stubs
    nodesSel.each(function (d) {
      const g = d3.select(this);
      g.selectAll('.expand-stub').remove();
      if (d.hasHiddenChildren) {
        appendExpandStub(g, d);
      }
    });

    // Event handlers — use refs for stable callbacks
    treeG.selectAll<SVGGElement, LayoutNode>('.node')
      .on('click', function (event, d) {
        event.stopPropagation();
        const hSet = collectFullBranch(d.id);
        highlightSetRef.current = hSet;
        applyHighlight(hSet);
        onNodeClickRef.current(d.data);
      })
      .on('contextmenu', function (event, d) {
        event.preventDefault();
        event.stopPropagation();
        onNodeRightClickRef.current(d.data, event.clientX, event.clientY);
      })
      .on('mouseenter', function () {
        const g = d3.select(this);
        g.select('.node-border')
          .transition().duration(120)
          .attr('stroke-width', 2.2);
      })
      .on('mouseleave', function () {
        const g = d3.select(this);
        const id = g.attr('data-id');
        const isHighlighted = highlightSetRef.current.has(id) && highlightSetRef.current.size > 0;
        g.select('.node-border')
          .transition().duration(200)
          .attr('stroke-width', isHighlighted ? 2.5 : 1.2);
      });

    // Store positions for next animation
    prevPosRef.current = new Map(allFlat.map(n => [n.id, { x: n._x, y: n._y }]));

  }, [root, visibleStartDepth, collectFullBranch, applyHighlight, onExpandDepth]);

  // ─── Build stub link data for L0 nodes (same format as regular links) ───
  function buildStubLinkData(allFlat: LayoutNode[]): { srcId: string; tgtId: string; d: string }[] {
    if (visibleStartDepthRef.current <= 0) return [];
    const result: { srcId: string; tgtId: string; d: string }[] = [];
    const topRow = allFlat.filter(n => n.depth === 0);

    // Group by parent in full tree
    const parentGroupsMap = new Map<string, LayoutNode[]>();
    for (const n of topRow) {
      const pk = findParent(root, n.id)?.id ?? '__none__';
      if (!parentGroupsMap.has(pk)) parentGroupsMap.set(pk, []);
      parentGroupsMap.get(pk)!.push(n);
    }

    for (const [parentId, group] of parentGroupsMap) {
      if (parentId === '__none__') continue;
      const parentNode = parentId === '__none__' ? null : findParent(root, group[0].id);
      const parentH = parentNode ? boxDims(parentNode).h : TYPICAL_BOX_H;
      // Eldest (rightmost) sibling — parent junction is at eldest's x
      const eldest = group[group.length - 1];
      const parentRowY = eldest._y - LEVEL_HEIGHT;
      const parentBottom = parentRowY + BOX_Y_OFFSET + parentH;
      const childTop = eldest._y + BOX_Y_OFFSET;
      const siblingY = (parentBottom + childTop) / 2;
      const junctionY = siblingY;

      for (const n of group) {
        let pathD: string;
        if (n.id === eldest.id) {
          // Eldest: straight vertical from box top to junction
          pathD = `M${n._x},${n._y + BOX_Y_OFFSET} V${junctionY - 20}`;
        } else {
          // Non-eldest: vertical up, horizontal to eldest x, vertical up to junction
          pathD = `M${n._x},${n._y + BOX_Y_OFFSET} V${siblingY} H${eldest._x} V${junctionY}`;
        }
        result.push({ srcId: parentId, tgtId: n.id, d: pathD });
      }
    }

    // Extension indicators for hidden siblings
    for (const [, group] of parentGroupsMap) {
      if (group.length >= 1 && group[0].totalSiblingsInData > group.length) {
        const eldest = group[group.length - 1];
        const parentNode = findParent(root, group[0].id);
        const parentH = parentNode ? boxDims(parentNode).h : TYPICAL_BOX_H;
        const parentRowY = eldest._y - LEVEL_HEIGHT;
        const parentBottom = parentRowY + BOX_Y_OFFSET + parentH;
        const childTop = eldest._y + BOX_Y_OFFSET;
        const siblingY = (parentBottom + childTop) / 2;
        const leftmost = group[0];
        result.push({
          srcId: '__ext__',
          tgtId: '__ext__',
          d: `M${leftmost._x - 15},${siblingY} H${leftmost._x}`,
        });
      }
    }

    return result;
  }

  // ─── Append node visual content (Right.md §12.1) ───
  function appendNodeContent(g: d3.Selection<SVGGElement, any, any, any>, d: LayoutNode) {
    const { w, h } = boxDims(d.data);
    const hasSpouse = d.data.spouses.length > 0;

    // Box
    g.append('rect')
      .attr('class', 'node-border')
      .attr('x', -w / 2).attr('y', BOX_Y_OFFSET)
      .attr('width', w).attr('height', h)
      .attr('rx', 6).attr('ry', 6)
      .attr('fill', C.nodeBackground)
      .attr('stroke', C.nodeBorder)
      .attr('stroke-width', 1.2);

    // Gender dot
    g.append('circle')
      .attr('cx', -(w / 2) + 5)
      .attr('cy', BOX_Y_OFFSET + 6)
      .attr('r', 3)
      .attr('fill', d.data.gender === 'female' ? C.femaleGender : C.maleGender);

    // Death marker
    if (d.data.isAlive === false) {
      g.append('text')
        .attr('x', (w / 2) - 5)
        .attr('y', BOX_Y_OFFSET + 9)
        .attr('text-anchor', 'middle')
        .attr('font-size', 8)
        .attr('fill', C.stub)
        .text('†');
    }

    // Primary name (vertical)
    const nameX = hasSpouse ? -10 : 0;
    const nameText = g.append('text')
      .attr('class', 'name-text')
      .attr('x', nameX)
      .attr('y', BOX_Y_OFFSET + 12)
      .attr('text-anchor', 'middle')
      .attr('font-size', 14)
      .attr('font-family', '"Noto Sans SC", "PingFang SC", "Source Han Sans SC", sans-serif')
      .attr('fill', C.nameText)
      .attr('font-weight', 500);
    for (const ch of d.data.name) {
      nameText.append('tspan')
        .attr('class', 'name-char')
        .attr('x', nameX)
        .attr('dy', '1.25em')
        .text(ch);
    }

    // Spouse name (vertical)
    if (hasSpouse) {
      const spouse = d.data.spouses[0];
      const spouseText = g.append('text')
        .attr('x', 10)
        .attr('y', BOX_Y_OFFSET + 12)
        .attr('text-anchor', 'middle')
        .attr('font-size', 12)
        .attr('font-family', '"Noto Sans SC", "PingFang SC", "Source Han Sans SC", sans-serif')
        .attr('fill', C.spouseText);
      for (const ch of spouse.name) {
        spouseText.append('tspan')
          .attr('x', 10)
          .attr('dy', '1.25em')
          .text(ch);
      }
    }

    // Expand stub
    if (d.hasHiddenChildren) {
      appendExpandStub(g, d);
    }
  }

  function appendExpandStub(g: d3.Selection<SVGGElement, any, any, any>, d: LayoutNode) {
    const { h } = boxDims(d.data);
    const boxBottom = BOX_Y_OFFSET + h;
    g.append('line')
      .attr('class', 'expand-stub')
      .attr('x1', 0).attr('y1', boxBottom)
      .attr('x2', 0).attr('y2', boxBottom + STUB_LEN)
      .attr('stroke', C.stub).attr('stroke-width', 1);
    g.append('text')
      .attr('class', 'expand-stub')
      .attr('x', 0).attr('y', boxBottom + STUB_LEN + 10)
      .attr('text-anchor', 'middle')
      .attr('font-size', 10)
      .attr('fill', C.stub)
      .attr('cursor', 'pointer')
      .text('▼')
      .on('click', (event) => {
        event.stopPropagation();
        // Step 1: highlight this node's branch
        const hSet = collectFullBranch(d.id);
        highlightSetRef.current = hSet;
        applyHighlight(hSet);
        onNodeClickRef.current(d.data);
        // Step 2: set shift direction then trigger expand (same as strip ▼)
        shiftDirRef.current = 1;
        onExpandDepth(d.id);
      });
  }

  // ─── Animated reveal (Right.md §4.2, §4.3, §4.4) ───
  const animatedReveal = useCallback((
    svg: SVGSVGElement,
    topNodes: LayoutNode[],
    allFlat: LayoutNode[],
    parentMap: Map<string, string>,
    fullMaxX: number,
    baseRevealIds: Set<string>, // nodes already visible (for shift animations)
  ) => {
    // Cancel pending timers
    animTimersRef.current.forEach(t => clearTimeout(t));
    animTimersRef.current = [];

    animatingRef.current = true;
    setRendering(true);
    const treeG = d3.select(svg).select<SVGGElement>('.tree-group');

    // Sort reveal queue: descending x, tie-break by deeper (larger depth) first
    const revealQueue = allFlat
      .filter(n => !baseRevealIds.has(n.id))
      .sort((a, b) => {
        if (b._x !== a._x) return b._x - a._x;
        return b.depth - a.depth;
      });

    // Compute frames: each frame adds one node and recomputes layout
    interface Frame {
      nodeId: string;
      positions: Map<string, { x: number; y: number }>;
      linkData: { srcId: string; tgtId: string; d: string }[];
    }

    const frames: Frame[] = [];
    const revealedIds = new Set<string>(baseRevealIds);

    for (const rNode of revealQueue) {
      revealedIds.add(rNode.id);

      // Recompute layout with only revealed nodes
      const partialTop = pruneToRevealed(topNodes, revealedIds);
      let cursor = 0;
      for (const tn of partialTop) {
        cursor += layoutSubtree(tn, cursor);
      }
      const partialFlat = flattenLayout(partialTop);
      alignRight(partialFlat, fullMaxX);

      const positions = new Map<string, { x: number; y: number }>();
      for (const n of partialFlat) {
        positions.set(n.id, { x: n._x, y: n._y });
      }

      const frameNodes = allFlat
        .filter(n => positions.has(n.id))
        .map(n => ({
          ...n,
          _x: positions.get(n.id)!.x,
          _y: positions.get(n.id)!.y,
        }));
      const linkData = buildLinkData(frameNodes, parentMap, new Set(positions.keys()));

      frames.push({ nodeId: rNode.id, positions, linkData });
    }

    // Now also render the base state first (nodes in baseRevealIds)
    if (baseRevealIds.size > 0) {
      // Render base state: remove old nodes not in allFlat, position base nodes
      treeG.selectAll('.link').remove();
      treeG.selectAll('.stub-line').remove();

      // Position base nodes
      const basePartial = pruneToRevealed(topNodes, baseRevealIds);
      let cursor = 0;
      for (const tn of basePartial) {
        cursor += layoutSubtree(tn, cursor);
      }
      const baseFlat = flattenLayout(basePartial);
      alignRight(baseFlat, fullMaxX);

      const basePositions = new Map<string, { x: number; y: number }>();
      for (const n of baseFlat) {
        basePositions.set(n.id, { x: n._x, y: n._y });
      }

      // Remove nodes not in base — immediate removal, no fade
      treeG.selectAll<SVGGElement, unknown>('.node').each(function () {
        const id = d3.select(this).attr('data-id');
        if (!baseRevealIds.has(id) && !revealedIds.has(id)) {
          d3.select(this).remove();
        }
      });

      // Update/create base nodes
      for (const n of baseFlat) {
        const existing = treeG.select(`.node[data-id="${n.id}"]`);
        const pos = basePositions.get(n.id)!;
        if (!existing.empty()) {
          existing
            .transition().duration(200)
            .attr('transform', `translate(${pos.x},${pos.y})`)
            .attr('data-x', pos.x)
            .attr('data-y', pos.y);
          // Update expand stub
          existing.selectAll('.expand-stub').remove();
          const layoutNode = allFlat.find(f => f.id === n.id);
          if (layoutNode?.hasHiddenChildren) {
            appendExpandStub(existing as any, layoutNode);
          }
        } else {
          // Create new node for base
          const layoutNode = allFlat.find(f => f.id === n.id);
          if (layoutNode) {
            const g = treeG.append('g')
              .attr('class', 'node')
              .attr('data-id', n.id)
              .attr('data-x', pos.x)
              .attr('data-y', pos.y)
              .attr('transform', `translate(${pos.x},${pos.y})`)
              .style('opacity', 1)
              .datum(layoutNode);
            appendNodeContent(g, layoutNode);
          }
        }
      }

      // Render base links
      const baseLinkData = buildLinkData(baseFlat, parentMap, baseRevealIds);
      renderLinkData(treeG, baseLinkData);
    }

    // Execute frames sequentially
    frames.forEach((frame, idx) => {
      const timer = window.setTimeout(() => {
        const { nodeId, positions, linkData } = frame;

        // Move existing nodes to new positions
        treeG.selectAll<SVGGElement, LayoutNode>('.node').each(function () {
          const g = d3.select(this);
          const id = g.attr('data-id');
          const pos = positions.get(id);
          if (pos && id !== nodeId) {
            g.transition().duration(NODE_STEP_MS * 0.8)
              .attr('transform', `translate(${pos.x},${pos.y})`)
              .attr('data-x', pos.x)
              .attr('data-y', pos.y);
          }
        });

        // Add the new node
        const newPos = positions.get(nodeId);
        const layoutNode = allFlat.find(n => n.id === nodeId);
        if (newPos && layoutNode) {
          // Remove expand stub from parent if this is the first child appearing
          const parentNodeId = parentMap.get(nodeId);
          if (parentNodeId) {
            const parentG = treeG.select(`.node[data-id="${parentNodeId}"]`);
            if (!parentG.empty()) {
              parentG.selectAll('.expand-stub').remove();
            }
          }

          const g = treeG.append('g')
            .attr('class', 'node')
            .attr('data-id', nodeId)
            .attr('data-x', newPos.x)
            .attr('data-y', newPos.y)
            .attr('transform', `translate(${newPos.x},${newPos.y})`)
            .style('opacity', 1)
            .datum(layoutNode);
          appendNodeContent(g as any, layoutNode);

          // Add event handlers — use refs for stable callbacks
          g.on('click', function (event) {
              event.stopPropagation();
              const hSet = collectFullBranch(layoutNode.id);
              highlightSetRef.current = hSet;
              applyHighlight(hSet);
              onNodeClickRef.current(layoutNode.data);
            })
            .on('contextmenu', function (event) {
              event.preventDefault();
              event.stopPropagation();
              onNodeRightClickRef.current(layoutNode.data, event.clientX, event.clientY);
            })
            .on('mouseenter', function () {
              d3.select(this).select('.node-border')
                .transition().duration(120)
                .attr('stroke-width', 2.2);
            })
            .on('mouseleave', function () {
              const isHighlighted = highlightSetRef.current.has(nodeId) && highlightSetRef.current.size > 0;
              d3.select(this).select('.node-border')
                .transition().duration(200)
                .attr('stroke-width', isHighlighted ? 2.5 : 1.2);
            });
        }

        renderLinkData(treeG, linkData);

        // Last frame: cleanup
        if (idx === frames.length - 1) {
          animatingRef.current = false;
          setRendering(false);
          prevPosRef.current = new Map(positions);

          renderRootStubs(treeG, allFlat);

          // Restore highlight if pending
          if (pendingHighlightRef.current) {
            const pid = pendingHighlightRef.current;
            highlightSetRef.current = collectFullBranch(pid);
            pendingHighlightRef.current = null;
          }
          // Trigger highlight via state-driven effect (decoupled from animation)
          if (highlightSetRef.current.size > 0) {
            triggerHighlight();
          }

          // Update strip with final transform
          const rootGen = tree?.rootGeneration ?? 1;
          renderStrip(svg, visibleStartDepth, maxDepthRef.current, lastTransformRef.current, rootGen);
        }
      }, (idx + 1) * NODE_STEP_MS);

      animTimersRef.current.push(timer);
    });

    // If no frames (all base), finish immediately
    if (frames.length === 0) {
      animatingRef.current = false;
      setRendering(false);
      renderRootStubs(treeG, allFlat);
      if (pendingHighlightRef.current) {
        const pid = pendingHighlightRef.current;
        highlightSetRef.current = collectFullBranch(pid);
        pendingHighlightRef.current = null;
      }
      if (highlightSetRef.current.size > 0) {
        triggerHighlight();
      }
    }
  }, [tree, visibleStartDepth, collectFullBranch, triggerHighlight, renderStrip, onExpandDepth]);

  /** Prune tree keeping only revealed nodes and their structural ancestors */
  function pruneToRevealed(topNodes: LayoutNode[], revealed: Set<string>): LayoutNode[] {
    function prune(n: LayoutNode): LayoutNode | null {
      // Recursively prune children first
      const keptChildren = n.children.map(prune).filter(Boolean) as LayoutNode[];

      // Keep this node if it's revealed OR has kept descendants (for tree structure)
      if (!revealed.has(n.id) && keptChildren.length === 0) return null;

      return {
        ...n,
        children: keptChildren,
        hasHiddenChildren: n.hasHiddenChildren ||
          (n.data.children.length > 0 && keptChildren.length === 0 && n.children.length > 0),
      };
    }
    return topNodes.map(prune).filter(Boolean) as LayoutNode[];
  }

  /** Render links for currently revealed nodes */
  function renderLinksForRevealed(
    treeG: d3.Selection<SVGGElement, unknown, null, undefined>,
    flatNodes: LayoutNode[],
    parentMap: Map<string, string>,
    visibleIds?: Set<string>,
  ) {
    const linkData = buildLinkData(flatNodes, parentMap, visibleIds);
    renderLinkData(treeG, linkData);
  }

  function buildLinkData(
    flatNodes: LayoutNode[],
    parentMap: Map<string, string>,
    visibleIds?: Set<string>,
  ): { srcId: string; tgtId: string; d: string }[] {
    const linkData: { srcId: string; tgtId: string; d: string }[] = [];
    const nodeMap = new Map(flatNodes.map(n => [n.id, n]));
    for (const node of flatNodes) {
      if (visibleIds && !visibleIds.has(node.id)) continue;
      const pId = parentMap.get(node.id);
      if (!pId) continue;
      if (visibleIds && !visibleIds.has(pId)) continue;
      const parent = nodeMap.get(pId);
      if (!parent) continue;
      const { h: pH } = boxDims(parent.data);
      linkData.push({
        srcId: pId,
        tgtId: node.id,
        d: linkPath(parent._x, parent._y, pH, node._x, node._y),
      });
    }

    for (const sl of buildStubLinkData(flatNodes)) {
      if (sl.srcId === '__ext__') {
        linkData.push(sl);
      } else if (!visibleIds || visibleIds.has(sl.tgtId)) {
        linkData.push(sl);
      }
    }

    return linkData;
  }

  function renderRootStubs(
    treeG: d3.Selection<SVGGElement, unknown, null, undefined>,
    flatNodes: LayoutNode[],
    visibleIds?: Set<string>,
  ) {
    if (visibleStartDepthRef.current !== 0) {
      treeG.selectAll('.root-stub-line').remove();
      treeG.selectAll('.root-stub-circle').remove();
      return;
    }

    const topRow = flatNodes.filter(n => n.depth === 0);
    const stubData = topRow
      .filter(n => !visibleIds || visibleIds.has(n.id))
      .map(n => ({
        id: n.id,
        x: n._x,
        yBottom: n._y + BOX_Y_OFFSET,
        yTop: n._y + BOX_Y_OFFSET - LEVEL_HEIGHT / 4,
      }));

    const lines = treeG.selectAll<SVGLineElement, typeof stubData[0]>('.root-stub-line')
      .data(stubData, d => d.id);
    lines.exit().remove();
    lines.enter()
      .append('line')
      .attr('class', 'root-stub-line')
      .attr('stroke', C.stub)
      .attr('stroke-width', 1)
      .merge(lines as any)
      .attr('x1', d => d.x)
      .attr('y1', d => d.yBottom)
      .attr('x2', d => d.x)
      .attr('y2', d => d.yTop);

    const circles = treeG.selectAll<SVGCircleElement, typeof stubData[0]>('.root-stub-circle')
      .data(stubData, d => d.id);
    circles.exit().remove();
    circles.enter()
      .append('circle')
      .attr('class', 'root-stub-circle')
      .attr('stroke', C.stub)
      .attr('stroke-width', 1)
      .attr('fill', 'none')
      .attr('r', 3)
      .merge(circles as any)
      .attr('cx', d => d.x)
      .attr('cy', d => d.yTop);
  }

  function renderLinkData(
    treeG: d3.Selection<SVGGElement, unknown, null, undefined>,
    linkData: { srcId: string; tgtId: string; d: string }[],
  ) {
    const links = treeG.selectAll<SVGPathElement, typeof linkData[0]>('.link')
      .data(linkData, d => `${d.srcId}->${d.tgtId}`);
    links.exit().remove();
    links.enter()
      .append('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', C.link)
      .attr('stroke-width', 1.2)
      .attr('data-source', d => d.srcId)
      .attr('data-target', d => d.tgtId)
      .attr('d', d => d.d)
      .style('opacity', 1);
    links.attr('d', d => d.d);
  }

  // ─── Main draw effect ───
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !root) return;

    const svgW = container.clientWidth;

    // Create or get SVG
    let svg = svgRef.current;
    if (!svg) {
      svg = d3.select(container)
        .append('svg')
        .attr('width', '100%')
        .attr('height', '100%')
        .style('background', C.bg)
        .node() as SVGSVGElement;

      d3.select(svg).append('g').attr('class', 'tree-group');
      d3.select(svg).append('g').attr('class', 'strip-group');
      svgRef.current = svg;

      // Set up zoom once (Right.md §9) — uses refs for all mutable state
      const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 3.0])
        .on('zoom', (event) => {
          if (animatingRef.current) return;

          const t = event.transform;
          // Lock vertical (Right.md §9.1)
          const constrained = d3.zoomIdentity
            .translate(t.x, lastTransformRef.current.y)
            .scale(t.k);

          // Horizontal constraints (Right.md §9.2)
          const treeWidth = fullMaxXRef.current * constrained.k;
          const viewW = svgRef.current!.clientWidth - GEN_STRIP_W;
          let cx = constrained.x;
          if (treeWidth > viewW) {
            const minPadding = 30;
            const maxXPos = viewW - GEN_STRIP_W - minPadding;
            const minXPos = viewW - treeWidth - minPadding;
            cx = Math.max(minXPos, Math.min(cx, maxXPos));
          }

          const finalT = d3.zoomIdentity
            .translate(cx, lastTransformRef.current.y)
            .scale(constrained.k);

          lastTransformRef.current = finalT;
          d3.select(svgRef.current!).select<SVGGElement>('.tree-group')
            .attr('transform', finalT.toString());

          updateRightmostVisible(svgRef.current!, finalT);

          // Sync strip (Right.md §5.3)
          if (!animatingRef.current) {
            const rg = tree?.rootGeneration ?? 1;
            renderStrip(svgRef.current!, visibleStartDepthRef.current, maxDepthRef.current, finalT, rg);
          }
        });

      zoomRef.current = zoomBehavior;
      d3.select(svg).call(zoomBehavior);
      d3.select(svg).on('dblclick.zoom', null);

      // Clear selection on SVG background click (set once)
      d3.select(svg).on('click.clear', () => {
        highlightSetRef.current = new Set();
        applyHighlight(new Set());
        onClearSelectionRef.current();
      });
    }

    // Compute tree
    const { topNodes, allFlat, maxX } = computeTree();
    const parentMap = buildParentMap(topNodes);
    fullMaxXRef.current = maxX;
    allFlatRef.current = allFlat;
    parentMapRef.current = parentMap;

    const rootGen = tree?.rootGeneration ?? 1;
    const shiftDir = shiftDirRef.current;
    shiftDirRef.current = 0;

    // Determine view transform (Right.md §4.1 step 5)
    // When a branch is highlighted, anchor on the highlighted branch's rightmost
    // visible node instead of the global maxX (Right.md §11.1)
    const rightPadding = 30 + GEN_STRIP_W;
    const hSet = highlightSetRef.current;
    let anchorX = maxX;
    if (hSet.size > 0) {
      const highlightedVisible = allFlat.filter(n => hSet.has(n.id));
      if (highlightedVisible.length > 0) {
        anchorX = Math.max(...highlightedVisible.map(n => n._x));
      }
    } else if (shiftDir !== 0) {
      const prev = rightmostVisibleRef.current;
      const pickDeepest = () => prev.L2 || prev.L1 || prev.L0;
      let anchorId: string | null = null;
      const base = pickDeepest();
      if (shiftDir > 0) {
        if (base?.depth === 2) {
          anchorId = base.id;
        } else if (base?.id) {
          const baseNode = findNodeById(root, base.id);
          const eldestChild = baseNode && baseNode.children.length > 0
            ? baseNode.children[baseNode.children.length - 1]
            : null;
          if (eldestChild) {
            anchorId = eldestChild.id;
          } else {
            anchorId = base.id;
          }
        }
      } else {
        if (base?.id) {
          const baseNode = findNodeById(root, base.id);
          const parentId = baseNode?.parentRels?.[0]?.fromId ?? null;
          if (parentId) {
            const parentNode = findNodeById(root, parentId);
            anchorId = parentId;
          } else {
            anchorId = base.id;
          }
        }
      }

      if (anchorId) {
        const anchorNode = allFlat.find(n => n.id === anchorId);
        if (anchorNode) {
          anchorX = anchorNode._x;
        }
      }
    }
    const hasPrevTransform = prevPosRef.current.size > 0;
    const prevT = lastTransformRef.current;
    const k = hasPrevTransform ? prevT.k : 1;
    const initX = svgW - rightPadding - anchorX * k;
    const initY = hasPrevTransform ? prevT.y : 40 + STUB_LEN;
    const newTransform = d3.zoomIdentity.translate(initX, initY).scale(k);

    // Apply initial transform
    lastTransformRef.current = newTransform;
    d3.select(svg)
      .call(zoomRef.current!.transform as any, newTransform);
    d3.select(svg).select<SVGGElement>('.tree-group')
      .attr('transform', newTransform.toString());
    updateRightmostVisible(svg, newTransform);

    // Render strip (Right.md §5)
    renderStrip(svg, visibleStartDepth, maxDepthRef.current, newTransform, rootGen);

    // Determine if this is shift animation or initial render
    if (shiftDir !== 0 && prevPosRef.current.size > 0) {
      // Shift animation (Right.md §6 / §7)
      if (shiftDir > 0) {
        // Shift down: base = nodes that were in previous view and still in new view (shifted up)
        const baseIds = new Set<string>();
        for (const n of allFlat) {
          if (prevPosRef.current.has(n.id)) {
            baseIds.add(n.id);
          }
        }
        // Remove nodes that are newly appearing
        const newNodes = allFlat.filter(n => !prevPosRef.current.has(n.id));
        for (const nn of newNodes) {
          baseIds.delete(nn.id);
        }
        animatedReveal(svg, topNodes, allFlat, parentMap, maxX, baseIds);
      } else {
        // Shift up (Right.md §7): full redraw from scratch
        d3.select(svg).select('.tree-group').selectAll('.node').remove();
        d3.select(svg).select('.tree-group').selectAll('.link').remove();
        d3.select(svg).select('.tree-group').selectAll('.stub-line').remove();
        animatedReveal(svg, topNodes, allFlat, parentMap, maxX, new Set());
      }
    } else if (prevPosRef.current.size === 0) {
      // Initial render with animation (Right.md §4.2)
      animatedReveal(svg, topNodes, allFlat, parentMap, maxX, new Set());
    } else {
      // No shift, just immediate re-render (e.g., data change or node expand)
      renderNodesImmediate(svg, allFlat, parentMap);
      // Check pending highlight (e.g., from node ▼ expand)
      if (pendingHighlightRef.current) {
        const pid = pendingHighlightRef.current;
        highlightSetRef.current = collectFullBranch(pid);
        pendingHighlightRef.current = null;
      }
      if (highlightSetRef.current.size > 0) {
        triggerHighlight();
      }
    }

  }, [root, visibleStartDepth, maxVisibleDepth, tree, updateRightmostVisible]);

  // ─── Update strip when shift buttons change ───
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !tree) return;
    const rootGen = tree.rootGeneration ?? 1;
    renderStrip(svg, visibleStartDepth, maxDepthRef.current, lastTransformRef.current, rootGen);
  }, [canShiftUp, canShiftDown, renderStrip, tree, visibleStartDepth]);

  // ─── Dedicated highlight effect — decoupled from animation timing ───
  useEffect(() => {
    if (highlightVersion === 0) return; // skip initial
    const svg = svgRef.current;
    if (!svg) return;
    // Delay to let pending D3 transitions / DOM mutations settle
    const raf = requestAnimationFrame(() => {
      applyHighlight(highlightSetRef.current);
    });
    return () => cancelAnimationFrame(raf);
  }, [highlightVersion, applyHighlight]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      animTimersRef.current.forEach(t => clearTimeout(t));
      if (svgRef.current) {
        svgRef.current.remove();
        svgRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
      />
      {rendering && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          paddingTop: 16, pointerEvents: 'all', cursor: 'wait',
        }}>
          <div style={{
            background: 'rgba(30,41,59,0.75)', color: '#e2e8f0',
            borderRadius: 6, padding: '6px 18px',
            fontSize: 13, fontFamily: '"Noto Sans SC", "PingFang SC", "Source Han Sans SC", sans-serif',
          }}>
            家谱绘制中
          </div>
        </div>
      )}
    </div>
  );
});

FamilyHisto.displayName = 'FamilyHisto';
