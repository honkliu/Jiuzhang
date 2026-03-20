import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import * as d3 from 'd3';
import type { FamilyNode, FamilyTreeDto } from '@/services/family.service';
import './FamilyTreeCanvas.css';

interface Props {
  root: FamilyNode | null;
  tree: FamilyTreeDto | null;
  visibleStartDepth: number;
  maxVisibleDepth: number;
  canShiftUp: boolean;
  canShiftDown: boolean;
  onNodeClick: (node: FamilyNode) => void;
  onNodeRightClick: (node: FamilyNode, x: number, y: number) => void;
  onExpandDepth: (personId: string) => void;
  onShiftUp: () => void;
  onShiftDown: () => void;
  onClearSelection: () => void;
}

export interface FamilyTreeCanvasHandle {
  centerOnPerson: (personId: string) => void;
  setPendingHighlight: (personId: string | null) => void;
  setShiftDirection: (dir: number) => void;
}

const NODE_GAP = 55;
const GEN_STRIP_W = 34;
const NODE_STEP_MS = 50;   // delay between each new node reveal
const FADE_MS = 20;       // opacity transition for enter/exit
const MOVE_MS = 20;       // position transition for sliding nodes

// ─── Vertical zone constants (all in tree-coordinate px) ──────────────────
// Each person occupies a vertical span:
//   AA: ancestor stub line (above box)
//   AE: the name box itself
//   AC: child stub line (below box)
// The sibling horizontal connector (AB) sits at the midpoint between
// the parent's AE bottom and this node's AE top — which is at the boundary
// between the parent's AC zone and this node's AA zone.

const STUB_LEN = 20;        // length of AA and AC stub lines
const BOX_Y_OFFSET = -16;   // name box top relative to _y
const TYPICAL_BOX_H = 78;   // 3-char name: 3*18+24

// Total vertical span per generation:
//   AA (stub above) + AE (box) + AC (stub below) + gap to next gen
// LEVEL_HEIGHT must be >= STUB_LEN + TYPICAL_BOX_H + STUB_LEN + some_gap
const LEVEL_HEIGHT = STUB_LEN + TYPICAL_BOX_H + STUB_LEN + 32; // = 150

const COLORS = {
  bg: '#eef2f6',
  link: '#8ea4b8',
  linkHighlight: 'rgb(42,175,71)',
  nodeBg: '#fff',
  nodeBorder: '#7a8fa0',
  nodeHighlightBorder: 'rgb(42,175,71)',
  nameText: '#1e293b',
  nameHighlight: 'rgb(42,175,71)',
  spouseText: '#64748b',
  stubLine: '#94a3b8',
  dimOpacity: 0.15,
};

// ─── Layout types and functions ───────────────────────────────────────────

interface LayoutNode {
  data: FamilyNode;
  depth: number;
  absoluteDepth: number;
  children: LayoutNode[] | null;
  hasHiddenChildren: boolean;
  _x: number;
  _y: number;
  parent: LayoutNode | null;
}

type ZoomBehaviorRef = d3.ZoomBehavior<SVGSVGElement, unknown> | null;

function buildLayoutTree(
  node: FamilyNode, absoluteDepth: number, relativeDepth: number,
  maxRelativeDepth: number, parent: LayoutNode | null
): LayoutNode {
  const hasRealChildren = node.children.length > 0;
  const canExpand = relativeDepth < maxRelativeDepth && hasRealChildren;
  const ln: LayoutNode = {
    data: node, depth: relativeDepth, absoluteDepth,
    children: null, hasHiddenChildren: hasRealChildren && !canExpand,
    _x: 0, _y: relativeDepth * LEVEL_HEIGHT, parent,
  };
  if (canExpand) {
    ln.children = node.children.map(c =>
      buildLayoutTree(c, absoluteDepth + 1, relativeDepth + 1, maxRelativeDepth, ln)
    );
  }
  return ln;
}

function buildLayoutTreeWithReveal(
  node: FamilyNode, absoluteDepth: number, relativeDepth: number,
  maxRelativeDepth: number, parent: LayoutNode | null, revealSet: Set<string>
): LayoutNode | null {
  if (!revealSet.has(node.id)) return null;
  const hasRealChildren = node.children.length > 0;
  const canExpand = relativeDepth < maxRelativeDepth && hasRealChildren;
  const ln: LayoutNode = {
    data: node, depth: relativeDepth, absoluteDepth,
    children: null, hasHiddenChildren: hasRealChildren && !canExpand,
    _x: 0, _y: relativeDepth * LEVEL_HEIGHT, parent,
  };
  if (canExpand) {
    const kids: LayoutNode[] = [];
    for (const c of node.children) {
      const child = buildLayoutTreeWithReveal(
        c, absoluteDepth + 1, relativeDepth + 1, maxRelativeDepth, ln, revealSet
      );
      if (child) kids.push(child);
    }
    ln.children = kids.length > 0 ? kids : null;
  }
  return ln;
}


function buildVisibleTree(fullRoot: FamilyNode, startDepth: number, maxVisible: number): LayoutNode | null {
  if (startDepth === 0) return buildLayoutTree(fullRoot, 0, 0, maxVisible - 1, null);
  const nodesAtStart: FamilyNode[] = [];
  const find = (node: FamilyNode, depth: number) => {
    if (depth === startDepth) { nodesAtStart.push(node); return; }
    if (depth < startDepth) for (const c of node.children) find(c, depth + 1);
  };
  find(fullRoot, 0);
  if (nodesAtStart.length === 0) return null;
  if (nodesAtStart.length === 1) return buildLayoutTree(nodesAtStart[0], startDepth, 0, maxVisible - 1, null);
  const vRoot: LayoutNode = {
    data: fullRoot, depth: -1, absoluteDepth: startDepth - 1,
    children: [], hasHiddenChildren: false, _x: 0, _y: -LEVEL_HEIGHT, parent: null,
  };
  vRoot.children = nodesAtStart.map(n => buildLayoutTree(n, startDepth, 0, maxVisible - 1, vRoot));
  return vRoot;
}

function buildVisibleTreeWithReveal(
  fullRoot: FamilyNode, startDepth: number, maxVisible: number, revealSet: Set<string>
): LayoutNode | null {
  if (startDepth === 0) {
    return buildLayoutTreeWithReveal(fullRoot, 0, 0, maxVisible - 1, null, revealSet);
  }
  const nodesAtStart: FamilyNode[] = [];
  const find = (node: FamilyNode, depth: number) => {
    if (depth === startDepth) { nodesAtStart.push(node); return; }
    if (depth < startDepth) for (const c of node.children) find(c, depth + 1);
  };
  find(fullRoot, 0);
  const visibleStarts = nodesAtStart.filter(n => revealSet.has(n.id));
  if (visibleStarts.length === 0) return null;
  if (visibleStarts.length === 1) {
    return buildLayoutTreeWithReveal(visibleStarts[0], startDepth, 0, maxVisible - 1, null, revealSet);
  }
  const vRoot: LayoutNode = {
    data: fullRoot, depth: -1, absoluteDepth: startDepth - 1,
    children: [], hasHiddenChildren: false, _x: 0, _y: -LEVEL_HEIGHT, parent: null,
  };
  vRoot.children = visibleStarts
    .map(n => buildLayoutTreeWithReveal(n, startDepth, 0, maxVisible - 1, vRoot, revealSet))
    .filter((n): n is LayoutNode => Boolean(n));
  return vRoot;
}


function layoutSubtree(node: LayoutNode, leftEdge: number): number {
  if (!node.children || node.children.length === 0) { node._x = leftEdge; return NODE_GAP; }
  let cursor = leftEdge;
  for (const child of node.children) { cursor += layoutSubtree(child, cursor); }
  node._x = node.children[node.children.length - 1]._x;
  return cursor - leftEdge;
}

function collectNodes(node: LayoutNode, result: LayoutNode[] = []): LayoutNode[] {
  if (node.depth >= 0) result.push(node);
  if (node.children) for (const c of node.children) collectNodes(c, result);
  return result;
}

function collectLinks(node: LayoutNode, result: { source: LayoutNode; target: LayoutNode }[] = []) {
  if (node.children) {
    for (const c of node.children) {
      if (node.depth >= 0 && c.depth >= 0) result.push({ source: node, target: c });
      collectLinks(c, result);
    }
  }
  return result;
}

function getNodeBoxH(d: LayoutNode): number {
  const p = d.data;
  const hs = p.spouses.length > 0;
  return Math.max(p.name.length, hs ? p.spouses[0].name.length : 0) * 18 + 24;
}

interface StubLine {
  key: string;
  x1: number; y1: number;
  x2: number; y2: number;
}

function linkKey(d: { source: LayoutNode; target: LayoutNode }): string {
  return `${d.source.data.id}->${d.target.data.id}`;
}

function linkPath(d: { source: LayoutNode; target: LayoutNode }): string {
  const srcBoxBottom = d.source._y + BOX_Y_OFFSET + getNodeBoxH(d.source);
  const tgtBoxTop = d.target._y + BOX_Y_OFFSET;
  const midY = (srcBoxBottom + tgtBoxTop) / 2;
  return `M${d.source._x},${srcBoxBottom}V${midY}H${d.target._x}V${tgtBoxTop}`;
}

// ─── Vertical zone helpers (in tree coords) ──────────────────────────────
// For a node at relative depth D:
//   boxTop    = D * LEVEL_HEIGHT + BOX_Y_OFFSET           (= D*150 - 16)
//   boxBottom = boxTop + boxH
//   AA top    = boxTop - STUB_LEN                          (ancestor stub)
//   AC bottom = boxBottom + STUB_LEN                       (child stub)
// The sibling horizontal line (AB) sits at the midpoint between
//   parent's boxBottom and child's boxTop, which equals:
//   midY = (parent.boxBottom + child.boxTop) / 2
// For the strip, each gen cell spans from AA_top to AC_bottom.

// For the strip, cell top = AB sibling line of this generation
//   = midpoint between previous gen's box bottom and this gen's box top
//   = for depth 0: BOX_Y_OFFSET - STUB_LEN (the AA/AB line)
// Cell bottom = midpoint between this gen's box bottom and next gen's box top
//   = for the last depth: box bottom + STUB_LEN

function genZoneTop(depth: number): number {
  if (depth === 0) {
    // Top of first gen = AA/AB line position
    return depth * LEVEL_HEIGHT + BOX_Y_OFFSET - STUB_LEN;
  }
  // midY between previous gen's box bottom and this gen's box top
  const prevBoxBottom = (depth - 1) * LEVEL_HEIGHT + BOX_Y_OFFSET + TYPICAL_BOX_H;
  const thisBoxTop = depth * LEVEL_HEIGHT + BOX_Y_OFFSET;
  return (prevBoxBottom + thisBoxTop) / 2;
}

function genZoneBottom(depth: number, maxDepth: number): number {
  if (depth === maxDepth) {
    // Bottom of last gen = AC stub bottom
    return depth * LEVEL_HEIGHT + BOX_Y_OFFSET + TYPICAL_BOX_H + STUB_LEN;
  }
  // midY between this gen's box bottom and next gen's box top
  const thisBoxBottom = depth * LEVEL_HEIGHT + BOX_Y_OFFSET + TYPICAL_BOX_H;
  const nextBoxTop = (depth + 1) * LEVEL_HEIGHT + BOX_Y_OFFSET;
  return (thisBoxBottom + nextBoxTop) / 2;
}

// ─── Generation strip state ──────────────────────────────────────────────

export const FamilyTreeCanvas = forwardRef<FamilyTreeCanvasHandle, Props>(
  ({ root, tree, visibleStartDepth, maxVisibleDepth, canShiftUp, canShiftDown,
     onNodeClick, onNodeRightClick, onExpandDepth, onShiftUp, onShiftDown, onClearSelection }, ref) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const zoomRef = useRef<ZoomBehaviorRef>(null);
    const allLayoutNodesRef = useRef<LayoutNode[]>([]);
    const highlightedSetRef = useRef<Set<LayoutNode>>(new Set());
    const maxDepthRef = useRef(0);
    const visibleStartDepthRef = useRef(visibleStartDepth);
    visibleStartDepthRef.current = visibleStartDepth;
    const pendingCenterRef = useRef<string | null>(null);

    const panBoundsRef = useRef<{ minX: number; maxX: number } | null>(null);
    const prevPosRef = useRef<Map<string, { x: number; y: number }>>(new Map());
    const lastTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
    const animatingRef = useRef(false);
    const animTimersRef = useRef<number[]>([]);

    const clearAnimTimers = useCallback(() => {
      animTimersRef.current.forEach(t => window.clearTimeout(t));
      animTimersRef.current = [];
      animatingRef.current = false;
    }, []);

    const rootGen = tree?.rootGeneration ?? 1;

    // Render gen strip via D3 inside the main SVG (not React state)
    const updateGenStrip = useCallback((transform: d3.ZoomTransform) => {
      if (!svgRef.current) return;
      const svg = d3.select(svgRef.current);
      const svgW = svgRef.current.clientWidth;
      const stripW = GEN_STRIP_W + 1;
      const stripX = svgW - stripW;
      const maxDepth = maxDepthRef.current;
      const startDepth = visibleStartDepthRef.current;
      const arrowH = 20;

      // Ensure strip group exists
      let sg = svg.select<SVGGElement>('g.strip-group');
      if (sg.empty()) sg = svg.append('g').attr('class', 'strip-group');
      sg.attr('transform', `translate(${stripX},0)`);

      // Compute cells
      const cells: { depth: number; label: string; y: number; h: number; fontSize: number }[] = [];
      for (let depth = 0; depth <= maxDepth; depth++) {
        const treeTop = genZoneTop(depth);
        const treeBottom = genZoneBottom(depth, maxDepth);
        const y = treeTop * transform.k + transform.y;
        const h = (treeBottom - treeTop) * transform.k;
        cells.push({
          depth,
          label: `第${rootGen + startDepth + depth}世`,
          y, h,
          fontSize: Math.max(9, Math.min(14, 14 * transform.k)),
        });
      }

      // Cell backgrounds
      const cellSel = sg.selectAll<SVGRectElement, typeof cells[0]>('.strip-cell')
        .data(cells, d => String(d.depth));
      cellSel.exit().remove();
      const cellEnter = cellSel.enter().append('rect').attr('class', 'strip-cell');
      cellSel.merge(cellEnter)
        .attr('x', 0).attr('width', stripW)
        .attr('y', d => d.y).attr('height', d => d.h)
        .attr('fill', d => d.depth % 2 === 0 ? 'rgba(255,255,255,0.92)' : 'rgba(220,232,244,0.92)');

      // Cell labels
      const textSel = sg.selectAll<SVGTextElement, typeof cells[0]>('.strip-label')
        .data(cells, d => String(d.depth));
      textSel.exit().remove();
      const textEnter = textSel.enter().append('text').attr('class', 'strip-label family-strip-text');
      textSel.merge(textEnter)
        .attr('x', stripW / 2).attr('y', d => d.y + d.h / 2)
        .attr('font-size', d => d.fontSize)
        .text(d => d.label);

      // Borders
      sg.selectAll('.strip-border-v').remove();
      if (cells.length > 0) {
        const first = cells[0];
        const last = cells[cells.length - 1];
        const top = first.y;
        const bot = last.y + last.h;
        sg.append('line').attr('class', 'strip-border-v family-strip-border')
          .attr('x1', 0.5).attr('y1', top).attr('x2', 0.5).attr('y2', bot);
        sg.append('line').attr('class', 'strip-border-v family-strip-border')
          .attr('x1', GEN_STRIP_W + 0.5).attr('y1', top).attr('x2', GEN_STRIP_W + 0.5).attr('y2', bot);
      }

      sg.selectAll('.strip-border-h').remove();
      cells.forEach(c => {
        sg.append('line').attr('class', 'strip-border-h family-strip-border')
          .attr('x1', 0).attr('y1', c.y).attr('x2', stripW).attr('y2', c.y);
      });
      if (cells.length > 0) {
        const last = cells[cells.length - 1];
        sg.append('line').attr('class', 'strip-border-h family-strip-border')
          .attr('x1', 0).attr('y1', last.y + last.h).attr('x2', stripW).attr('y2', last.y + last.h);
      }

      // Up/Down arrows
      sg.selectAll('.strip-arrow').remove();
      if (cells.length > 0) {
        const first = cells[0];
        const last = cells[cells.length - 1];
        if (canShiftUp) {
          const ag = sg.append('g').attr('class', 'strip-arrow').style('cursor', 'pointer')
            .on('click', () => onShiftUp());
          ag.append('rect').attr('class', 'family-strip-arrow-hit')
            .attr('x', 0).attr('y', first.y - arrowH).attr('width', stripW).attr('height', arrowH);
          ag.append('text').attr('class', 'family-strip-arrow-text')
            .attr('x', stripW / 2).attr('y', first.y - arrowH / 2).text('▲');
        }
        if (canShiftDown) {
          const ag = sg.append('g').attr('class', 'strip-arrow').style('cursor', 'pointer')
            .on('click', () => onShiftDown());
          ag.append('rect').attr('class', 'family-strip-arrow-hit')
            .attr('x', 0).attr('y', last.y + last.h).attr('width', stripW).attr('height', arrowH);
          ag.append('text').attr('class', 'family-strip-arrow-text')
            .attr('x', stripW / 2).attr('y', last.y + last.h + arrowH / 2).text('▼');
        }
      }
    }, [rootGen, canShiftUp, canShiftDown, onShiftUp, onShiftDown]);

    useImperativeHandle(ref, () => ({
      centerOnPerson: (personId: string) => {
        if (!svgRef.current || !zoomRef.current) return;
        let target = allLayoutNodesRef.current.find(n => n.data.id === personId);

        // If person not in visible tree, find their nearest visible ancestor
        if (!target && root) {
          const findAncestorInLayout = (id: string): LayoutNode | undefined => {
            // Walk up through FamilyNode parentRels to find an ancestor in the layout
            const findInFullTree = (node: FamilyNode, targetId: string): FamilyNode | null => {
              if (node.id === targetId) return node;
              for (const c of node.children) {
                const found = findInFullTree(c, targetId);
                if (found) return found;
              }
              return null;
            };
            const person = findInFullTree(root, id);
            if (!person || person.parentRels.length === 0) return undefined;
            const parentId = person.parentRels[0].fromId;
            const parentInLayout = allLayoutNodesRef.current.find(n => n.data.id === parentId);
            if (parentInLayout) return parentInLayout;
            return findAncestorInLayout(parentId);
          };
          target = findAncestorInLayout(personId);
        }

        if (!target) return;
        const svg = d3.select(svgRef.current);
        const width = svgRef.current.clientWidth;
        const height = svgRef.current.clientHeight;
        const currentTransform = d3.zoomTransform(svgRef.current);
        const scale = currentTransform.k;
        const transform = d3.zoomIdentity
          .translate(width / 2 - target._x * scale, height / 3 - target._y * scale)
          .scale(scale);
        svg.transition().duration(600).call(zoomRef.current.transform, transform);
        highlightedSetRef.current.clear();
        let anc: LayoutNode | null = target;
        while (anc) { if (anc.depth >= 0) highlightedSetRef.current.add(anc); anc = anc.parent; }
        const addDesc = (n: LayoutNode) => { if (n.depth >= 0) highlightedSetRef.current.add(n); n.children?.forEach(addDesc); };
        addDesc(target);
        applyHighlight();
      },
      setPendingHighlight: (personId: string | null) => {
        pendingCenterRef.current = personId;
      },
      setShiftDirection: (dir: number) => {
        shiftDirRef.current = dir;
      },
    }));

    const applyHighlight = useCallback(() => {
      if (!svgRef.current) return;
      const g = d3.select(svgRef.current).select<SVGGElement>('g.tree-group');
      const hl = highlightedSetRef.current;
      const hasHL = hl.size > 0;
      g.selectAll<SVGGElement, LayoutNode>('.node').transition().duration(250)
        .attr('opacity', d => !hasHL || hl.has(d) ? 1 : COLORS.dimOpacity);
      g.selectAll<SVGGElement, LayoutNode>('.node').select('.node-border').transition().duration(250)
        .attr('stroke', d => hl.has(d) ? COLORS.nodeHighlightBorder : COLORS.nodeBorder)
        .attr('stroke-width', d => hl.has(d) ? 2.5 : 1.2);
      g.selectAll<SVGGElement, LayoutNode>('.node').selectAll<SVGTSpanElement, unknown>('.name-char')
        .transition().duration(250)
        .attr('fill', function () {
          const gn = (this as SVGElement).closest('.node');
          if (!gn) return COLORS.nameText;
          return hl.has(d3.select<SVGGElement, LayoutNode>(gn as SVGGElement).datum()) ? COLORS.nameHighlight : COLORS.nameText;
        })
        .attr('font-weight', function () {
          const gn = (this as SVGElement).closest('.node');
          if (!gn) return '500';
          return hl.has(d3.select<SVGGElement, LayoutNode>(gn as SVGGElement).datum()) ? '700' : '500';
        });
      g.selectAll<SVGPathElement, { source: LayoutNode; target: LayoutNode }>('.link').transition().duration(250)
        .attr('stroke', d => hl.has(d.target) ? COLORS.linkHighlight : COLORS.link)
        .attr('stroke-width', d => hl.has(d.target) ? 2 : 1)
        .attr('opacity', d => !hasHL || (hl.has(d.source) && hl.has(d.target)) ? 1 : COLORS.dimOpacity);
    }, []);

    const shiftDirRef = useRef<number>(0); // -1=up, +1=down, 0=initial

    const renderLayout = useCallback(
      (allNodes: LayoutNode[], allLinks: { source: LayoutNode; target: LayoutNode }[], animated: boolean) => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);
        const g = svg.selectAll<SVGGElement, unknown>('g.tree-group')
          .data([null])
          .join('g')
          .attr('class', 'tree-group');

        const prevPos = prevPosRef.current;
        const nextPos = new Map<string, { x: number; y: number }>();
        allNodes.forEach(n => nextPos.set(n.data.id, { x: n._x, y: n._y }));

        // Cancel any in-progress transitions to avoid conflicts with rapid calls
        g.selectAll('.node').interrupt('move').interrupt('fade');
        g.selectAll('.link').interrupt('move').interrupt('fade');
        g.selectAll('.stub-line').interrupt('move');

        const visibleLinks = allLinks.filter(l => l.source.depth >= 0 && l.target.depth >= 0);
        const linkSel = g.selectAll<SVGPathElement, { source: LayoutNode; target: LayoutNode }>('.link')
          .data(visibleLinks, d => linkKey(d));

        linkSel.exit().remove();

        const linkEnter = linkSel.enter()
          .append('path')
          .attr('class', 'link')
          .attr('fill', 'none')
          .attr('stroke', COLORS.link)
          .attr('stroke-width', 1)
          .attr('stroke-linecap', 'round')
          .attr('opacity', animated ? 0 : 1)
          .attr('d', d => linkPath(d));

        linkSel.merge(linkEnter)
          .transition('move').duration(MOVE_MS)
          .attr('d', d => linkPath(d))
          .attr('opacity', 1);

        const nodeSel = g.selectAll<SVGGElement, LayoutNode>('.node')
          .data(allNodes, d => d.data.id);

        nodeSel.exit().remove();

        const nodeEnter = nodeSel.enter().append('g')
          .attr('class', 'node')
          .style('cursor', 'pointer')
          .style('opacity', animated ? 0 : 1)
          .attr('transform', d => {
            const prev = prevPos.get(d.data.id);
            if (prev) return `translate(${prev.x},${prev.y})`;
            return `translate(${d._x},${d._y})`;
          });

        // Render node internals (used for both enter and update)
        const renderNodeContent = (el: d3.Selection<SVGGElement, LayoutNode, null, undefined>, d: LayoutNode) => {
          el.selectAll('*').remove(); // Clear old content
          const p = d.data; const hs = p.spouses.length > 0;
          const boxH = getNodeBoxH(d); const boxW = hs ? 42 : 26;
          el.append('rect').attr('class', 'node-border')
            .attr('x', -boxW / 2).attr('y', BOX_Y_OFFSET).attr('width', boxW).attr('height', boxH)
            .attr('rx', 6).attr('ry', 6)
            .attr('fill', COLORS.nodeBg).attr('stroke', COLORS.nodeBorder).attr('stroke-width', 1.2);
          const xPos = hs ? -10 : 0;
          const t = el.append('text').attr('class', 'name-text').attr('y', BOX_Y_OFFSET + 14);
          p.name.split('').forEach(ch =>
            t.append('tspan').attr('class', 'name-char')
              .attr('x', xPos).attr('dy', '1.25em').attr('text-anchor', 'middle')
              .attr('font-size', '14px').attr('font-family', '"Noto Sans SC","PingFang SC","Source Han Sans SC",sans-serif')
              .attr('fill', COLORS.nameText).attr('font-weight', '500').text(ch)
          );
          if (hs) {
            const st = el.append('text').attr('y', BOX_Y_OFFSET + 14);
            p.spouses[0].name.split('').forEach(ch =>
              st.append('tspan').attr('x', 10).attr('dy', '1.25em').attr('text-anchor', 'middle')
                .attr('font-size', '12px').attr('font-family', '"Noto Sans SC","PingFang SC","Source Han Sans SC",sans-serif')
                .attr('fill', COLORS.spouseText).text(ch)
            );
          }
          el.append('circle')
            .attr('cx', -(boxW / 2) + 5).attr('cy', BOX_Y_OFFSET + 6).attr('r', 3)
            .attr('fill', p.gender === 'female' ? '#f472b6' : '#60a5fa');
          if (p.isAlive === false)
            el.append('text').attr('x', (boxW / 2) - 5).attr('y', BOX_Y_OFFSET + 9)
              .attr('text-anchor', 'middle').attr('font-size', '8px').attr('fill', '#94a3b8').text('†');
          if (d.hasHiddenChildren) {
            const boxBottom = BOX_Y_OFFSET + boxH;
            el.append('line').attr('class', 'expand-stub')
              .attr('x1', 0).attr('y1', boxBottom).attr('x2', 0).attr('y2', boxBottom + STUB_LEN)
              .attr('stroke', COLORS.link).attr('stroke-width', 1);
            el.append('text').attr('class', 'expand-stub')
              .attr('x', 0).attr('y', boxBottom + STUB_LEN + 10)
              .attr('text-anchor', 'middle').attr('font-size', '10px')
              .attr('fill', COLORS.stubLine).attr('cursor', 'pointer').text('▼')
              .on('click', (event: MouseEvent) => { event.stopPropagation(); onExpandDepth(d.data.id); });
          }
        };

        nodeEnter.each(function (d) {
          renderNodeContent(d3.select<SVGGElement, LayoutNode>(this as SVGGElement), d);
        });

        // Update existing nodes: remove expand stub when children are revealed
        nodeSel.each(function (d) {
          if (!d.hasHiddenChildren) {
            d3.select(this).selectAll('.expand-stub').remove();
          }
        });

        const nodeMerged = nodeSel.merge(nodeEnter);
        nodeMerged
          .transition('move').duration(MOVE_MS)
          .attr('transform', d => `translate(${d._x},${d._y})`);

        if (animated) {
          nodeEnter
            .transition('fade').duration(FADE_MS)
            .style('opacity', 1);
          linkEnter
            .transition('fade').duration(FADE_MS)
            .attr('opacity', 1);
        }

        nodeMerged.on('click', (event: MouseEvent, d) => {
          event.stopPropagation();
          highlightedSetRef.current.clear();
          let anc: LayoutNode | null = d;
          while (anc) { if (anc.depth >= 0) highlightedSetRef.current.add(anc); anc = anc.parent; }
          const addDesc = (n: LayoutNode) => { if (n.depth >= 0) highlightedSetRef.current.add(n); n.children?.forEach(addDesc); };
          addDesc(d); applyHighlight(); onNodeClick(d.data);
        });
        nodeMerged.on('contextmenu', (event: MouseEvent, d) => {
          event.preventDefault(); event.stopPropagation();
          onNodeRightClick(d.data, event.pageX, event.pageY);
        });
        nodeMerged.on('mouseenter', function () {
          d3.select(this).select('.node-border').transition().duration(120).attr('stroke-width', 2.2);
        });
        nodeMerged.on('mouseleave', function (_, d) {
          const isHL = highlightedSetRef.current.has(d);
          d3.select(this).select('.node-border').transition().duration(200).attr('stroke-width', isHL ? 2.5 : 1.2);
        });

        const stubLines: StubLine[] = [];
        if (visibleStartDepth > 0) {
          const topNodes = allNodes.filter(n => n.depth === 0);
          const sibY = BOX_Y_OFFSET - STUB_LEN;
          const byParent = new Map<string, LayoutNode[]>();
          for (const n of topNodes) {
            const pid = n.data.parentRels.length > 0 ? n.data.parentRels[0].fromId : n.data.id;
            if (!byParent.has(pid)) byParent.set(pid, []);
            byParent.get(pid)!.push(n);
          }
          const eldestIds = new Set<string>();
          for (const [, siblings] of byParent) {
            const sorted = [...siblings].sort((a, b) => a._x - b._x);
            eldestIds.add(sorted[sorted.length - 1].data.id);
          }
          topNodes.forEach(n => {
            const aaTopY = eldestIds.has(n.data.id) ? (sibY - STUB_LEN) : sibY;
            stubLines.push({
              key: `aa-${n.data.id}`,
              x1: n._x, y1: n._y + BOX_Y_OFFSET, x2: n._x, y2: n._y + aaTopY,
            });
          });
          const findInTree = (node: FamilyNode, id: string): FamilyNode | null => {
            if (node.id === id) return node;
            for (const c of node.children) { const f = findInTree(c, id); if (f) return f; }
            return null;
          };
          for (const [, visibleSiblings] of byParent) {
            if (visibleSiblings.length === 0) continue;
            const anyChild = visibleSiblings[0].data;
            let total = visibleSiblings.length;
            if (anyChild.parentRels.length > 0) {
              const fp = root ? findInTree(root, anyChild.parentRels[0].fromId) : null;
              if (fp) total = fp.children.length;
            }
            if (total <= 1) continue;
            const sorted = [...visibleSiblings].sort((a, b) => a._x - b._x);
            let abLeft = sorted[0]._x; let abRight = sorted[sorted.length - 1]._x;
            if (total > visibleSiblings.length) { abLeft -= 15; abRight += 15; }
            stubLines.push({
              key: `ab-${sorted[0].data.id}-${sorted[sorted.length - 1].data.id}`,
              x1: abLeft, y1: sorted[0]._y + sibY, x2: abRight, y2: sorted[0]._y + sibY,
            });
          }
        }

        const stubSel = g.selectAll<SVGLineElement, StubLine>('.stub-line')
          .data(stubLines, d => d.key);
        stubSel.exit().remove();
        const stubEnter = stubSel.enter().append('line')
          .attr('class', 'stub-line')
          .attr('stroke', COLORS.link).attr('stroke-width', 1)
          .attr('opacity', animated ? 0 : 1);
        stubSel.merge(stubEnter)
          .transition('move').duration(MOVE_MS)
          .attr('x1', d => d.x1).attr('y1', d => d.y1)
          .attr('x2', d => d.x2).attr('y2', d => d.y2)
          .attr('opacity', 1);

        prevPosRef.current = nextPos;
        allLayoutNodesRef.current = allNodes;
      },
      [applyHighlight, onExpandDepth, onNodeClick, onNodeRightClick, root, visibleStartDepth]
    );

    const drawTree = useCallback((animated = false) => {
      if (!svgRef.current || !root) return;
      clearAnimTimers();
      highlightedSetRef.current.clear();
      const currentTransform = lastTransformRef.current ?? d3.zoomTransform(svgRef.current);

      const fullRoot = buildVisibleTree(root, visibleStartDepth, maxVisibleDepth);
      if (!fullRoot) return;
      layoutSubtree(fullRoot, 0);
      const fullNodes = collectNodes(fullRoot);
      const fullLinks = collectLinks(fullRoot);
      maxDepthRef.current = fullNodes.length > 0 ? Math.max(...fullNodes.map(n => n.depth)) : 0;
      if (fullNodes.length > 0) {
        panBoundsRef.current = {
          minX: Math.min(...fullNodes.map(n => n._x)),
          maxX: Math.max(...fullNodes.map(n => n._x)),
        };
      }

      // Update strip immediately for the new generation window.
      updateGenStrip(currentTransform);

      const prevLayoutNodes = allLayoutNodesRef.current;
      const prevIds = new Set(prevLayoutNodes.map(n => n.data.id));
      const canAnimate = animated && shiftDirRef.current !== 0 && prevLayoutNodes.length > 0;

      if (!canAnimate) {
        renderLayout(fullNodes, fullLinks, animated);
        applyHighlight();
        return;
      }

      animatingRef.current = true;

      const fullMaxX = Math.max(...fullNodes.map(n => n._x));

      // Reposition view so fullMaxX (rightmost node) stays near the right edge
      if (svgRef.current && zoomRef.current) {
        const w = svgRef.current.clientWidth;
        const k = currentTransform.k;
        const rightPadding = 30 + GEN_STRIP_W;
        const newTx = w - rightPadding - fullMaxX * k;
        const alignedTransform = d3.zoomIdentity.translate(newTx, currentTransform.y).scale(k);
        lastTransformRef.current = alignedTransform;
        d3.select(svgRef.current).call(zoomRef.current.transform, alignedTransform);
      }

      const alignRight = (treeRoot: LayoutNode) => {
        const nodes = collectNodes(treeRoot);
        if (nodes.length === 0) return;
        const maxX = Math.max(...nodes.map(n => n._x));
        const dx = fullMaxX - maxX;
        if (dx === 0) return;
        const shift = (n: LayoutNode) => { n._x += dx; if (n.children) n.children.forEach(shift); };
        shift(treeRoot);
      };

      // ── Pre-compute all animation frames ──────────────────────────────
      interface AnimFrame { nodes: LayoutNode[]; links: { source: LayoutNode; target: LayoutNode }[] }
      const frames: AnimFrame[] = [];

      // Determine reveal order: new nodes sorted right-to-left
      const baseReveal = new Set<string>(prevIds);
      let revealQueue: string[];

      if (shiftDirRef.current === -1) {
        // Shift UP: redraw entire tree from right to left
        // Start with no nodes revealed — every node gets animated in
        baseReveal.clear();
        revealQueue = fullNodes
          .sort((a, b) => (b._x - a._x) || (b.depth - a.depth))
          .map(n => n.data.id);
      } else {
        // Shift DOWN: reveal only new descendant nodes
        revealQueue = fullNodes
          .filter(n => !baseReveal.has(n.data.id))
          .sort((a, b) => (b._x - a._x) || (b.depth - a.depth))
          .map(n => n.data.id);
      }

      // Frame 0: only previously-existing nodes
      const computeFrame = (reveal: Set<string>): AnimFrame => {
        const stepRoot = buildVisibleTreeWithReveal(root, visibleStartDepth, maxVisibleDepth, reveal);
        if (!stepRoot) return { nodes: [], links: [] };
        layoutSubtree(stepRoot, 0);
        alignRight(stepRoot);
        return { nodes: collectNodes(stepRoot), links: collectLinks(stepRoot) };
      };

      frames.push(computeFrame(baseReveal));

      // Frames 1..N: add one new node per frame
      for (const nodeId of revealQueue) {
        baseReveal.add(nodeId);
        frames.push(computeFrame(baseReveal));
      }

      // Set panBoundsRef from the FINAL frame (all nodes, aligned)
      const lastFrame = frames[frames.length - 1];
      if (lastFrame.nodes.length > 0) {
        panBoundsRef.current = {
          minX: Math.min(...lastFrame.nodes.map(n => n._x)),
          maxX: Math.max(...lastFrame.nodes.map(n => n._x)),
        };
      }

      // ── Play animation frames ─────────────────────────────────────────
      // Frame 0: render immediately (existing nodes shift to new positions)
      renderLayout(frames[0].nodes, frames[0].links, true);

      // Frames 1..N: schedule with delay
      for (let i = 1; i < frames.length; i++) {
        const delay = i * NODE_STEP_MS;
        const frame = frames[i];
        const t = window.setTimeout(() => {
          renderLayout(frame.nodes, frame.links, true);
        }, delay);
        animTimersRef.current.push(t);
      }

      // Final cleanup
      const finalDelay = frames.length * NODE_STEP_MS;
      const tFinal = window.setTimeout(() => {
        animatingRef.current = false;
        applyHighlight();
        updateGenStrip(currentTransform);
        // Re-apply zoom transform so constraints position the view correctly
        if (svgRef.current && zoomRef.current) {
          const ct = lastTransformRef.current;
          d3.select(svgRef.current).call(zoomRef.current.transform, ct);
        }
      }, finalDelay);
      animTimersRef.current.push(tFinal);
    }, [applyHighlight, clearAnimTimers, maxVisibleDepth, renderLayout, root, updateGenStrip, visibleStartDepth]);

    // Zoom setup (once per root change)
    useEffect(() => {
      if (!svgRef.current || !root) return;
      clearAnimTimers();
      prevPosRef.current = new Map();
      const svg = d3.select(svgRef.current);
      svg.on('contextmenu', (e: Event) => e.preventDefault());

      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 3])
        .on('zoom', event => {
          const t = event.transform;
          let cx = t.x;
          // Always lock vertical position — no vertical panning
          const cy = lastTransformRef.current.y;
          // During animation, skip horizontal constraints — view stays where it was
          if (!animatingRef.current && svgRef.current) {
            const w = svgRef.current.clientWidth;
            const bounds = panBoundsRef.current;
            if (bounds) {
              const minTx = -bounds.maxX * t.k + w - 30 - GEN_STRIP_W;
              const maxTx = -bounds.minX * t.k + 30;
              if (minTx < maxTx) {
                cx = Math.max(minTx, Math.min(maxTx, cx));
              } else {
                const treeCenterX = (bounds.minX + bounds.maxX) / 2;
                cx = (w - GEN_STRIP_W) / 2 - treeCenterX * t.k;
              }
            }
          }
          const constrained = d3.zoomIdentity.translate(cx, cy).scale(t.k);
          lastTransformRef.current = constrained;
          svg.select<SVGGElement>('g.tree-group').attr('transform', constrained.toString());
          if (!animatingRef.current) {
            updateGenStrip(constrained);
          }
        });
      zoomRef.current = zoom;
      svg.call(zoom);
      svg.on('click.clear', () => { highlightedSetRef.current.clear(); applyHighlight(); onClearSelection(); });

      // Initial center
      shiftDirRef.current = 0;
      drawTree(false);
      const allNodes = allLayoutNodesRef.current;
      if (allNodes.length > 0) {
        const maxX = Math.max(...allNodes.map(n => n._x));
        const width = svgRef.current.clientWidth;
        const initialY = 40 + STUB_LEN;
        const rightPadding = 30 + GEN_STRIP_W;
        const initialTransform = d3.zoomIdentity.translate(width - rightPadding - maxX, initialY);
        lastTransformRef.current = initialTransform;
        svg.call(zoom.transform, initialTransform);
        updateGenStrip(initialTransform);
      }

      return () => { svg.on('.zoom', null); svg.on('click.clear', null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [root]);

    // Redraw tree when depth window changes
    useEffect(() => {
      if (!svgRef.current || !root || !zoomRef.current) return;
      drawTree(true);
      if (animatingRef.current) return;
      const pid = pendingCenterRef.current;
      if (!pid) { applyHighlight(); return; }
      pendingCenterRef.current = null;
      requestAnimationFrame(() => {
        const target = allLayoutNodesRef.current.find(n => n.data.id === pid);
        if (target) {
          highlightedSetRef.current.clear();
          let anc: LayoutNode | null = target;
          while (anc) { if (anc.depth >= 0) highlightedSetRef.current.add(anc); anc = anc.parent; }
          const addDesc = (n: LayoutNode) => { if (n.depth >= 0) highlightedSetRef.current.add(n); n.children?.forEach(addDesc); };
          addDesc(target);
          applyHighlight();
        } else if (root) {
          const findInFullTree = (node: FamilyNode, id: string): FamilyNode | null => {
            if (node.id === id) return node;
            for (const c of node.children) { const f = findInFullTree(c, id); if (f) return f; }
            return null;
          };
          const findAncestor = (id: string): LayoutNode | undefined => {
            const p = findInFullTree(root, id);
            if (!p || p.parentRels.length === 0) return undefined;
            const parentInLayout = allLayoutNodesRef.current.find(n => n.data.id === p.parentRels[0].fromId);
            if (parentInLayout) return parentInLayout;
            return findAncestor(p.parentRels[0].fromId);
          };
          const ancestor = findAncestor(pid);
          if (ancestor) {
            highlightedSetRef.current.clear();
            let anc2: LayoutNode | null = ancestor;
            while (anc2) { if (anc2.depth >= 0) highlightedSetRef.current.add(anc2); anc2 = anc2.parent; }
            const addDesc2 = (n: LayoutNode) => { if (n.depth >= 0) highlightedSetRef.current.add(n); n.children?.forEach(addDesc2); };
            addDesc2(ancestor);
            applyHighlight();
          }
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drawTree]);

    return (
      <div className="family-tree-container">
        <svg ref={svgRef} className="family-tree-canvas" />
      </div>
    );
  }
);
