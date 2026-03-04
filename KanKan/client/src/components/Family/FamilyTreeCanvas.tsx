import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef, useState } from 'react';
import * as d3 from 'd3';
import type { FamilyNode, FamilyTreeDto } from '@/services/family.service';

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

interface GenCell {
  depth: number;
  label: string;
  screenY: number;
  cellHeight: number;
  fontSize: number;
}

export const FamilyTreeCanvas = forwardRef<FamilyTreeCanvasHandle, Props>(
  ({ root, tree, visibleStartDepth, maxVisibleDepth, canShiftUp, canShiftDown,
     onNodeClick, onNodeRightClick, onExpandDepth, onShiftUp, onShiftDown, onClearSelection }, ref) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const allLayoutNodesRef = useRef<LayoutNode[]>([]);
    const highlightedSetRef = useRef<Set<LayoutNode>>(new Set());
    const maxDepthRef = useRef(0);
    const visibleStartDepthRef = useRef(visibleStartDepth);
    visibleStartDepthRef.current = visibleStartDepth;
    const pendingCenterRef = useRef<string | null>(null);

    const [genCells, setGenCells] = useState<GenCell[]>([]);

    const rootGen = tree?.rootGeneration ?? 1;

    const updateGenStrip = useCallback((transform: d3.ZoomTransform) => {
      const maxDepth = maxDepthRef.current;
      const startDepth = visibleStartDepthRef.current;
      const cells: GenCell[] = [];

      for (let depth = 0; depth <= maxDepth; depth++) {
        const treeTop = genZoneTop(depth);
        const treeBottom = genZoneBottom(depth, maxDepth);
        const screenTop = treeTop * transform.k + transform.y;
        const screenBottom = treeBottom * transform.k + transform.y;
        cells.push({
          depth,
          label: `第${rootGen + startDepth + depth}世`,
          screenY: screenTop,
          cellHeight: screenBottom - screenTop,
          fontSize: Math.max(9, Math.min(14, 14 * transform.k)),
        });
      }
      setGenCells(cells);
    }, [rootGen]);

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

    const ANIM_MS = 1200;
    const shiftDirRef = useRef<number>(0); // -1=up, +1=down, 0=initial

    const drawTree = useCallback((animated = false) => {
      if (!svgRef.current || !root) return;
      const svg = d3.select(svgRef.current);
      highlightedSetRef.current.clear();

      const layoutRoot = buildVisibleTree(root, visibleStartDepth, maxVisibleDepth);
      if (!layoutRoot) return;
      layoutSubtree(layoutRoot, 0);
      const allNodes = collectNodes(layoutRoot);
      const allLinks = collectLinks(layoutRoot);
      allLayoutNodesRef.current = allNodes;
      maxDepthRef.current = allNodes.length > 0 ? Math.max(...allNodes.map(n => n.depth)) : 0;

      const dir = shiftDirRef.current; // +1 = shift down (new gen appears), -1 = shift up
      // Slide distance: one full generation height in SVG coords
      const slideY = dir * LEVEL_HEIGHT;

      // ── Helper: fully draw a complete tree into a <g> ────────────────
      const renderInto = (g: d3.Selection<SVGGElement, unknown, null, undefined>) => {
        // Links
        const visibleLinks = allLinks.filter(l => l.source.depth >= 0 && l.target.depth >= 0);
        g.selectAll<SVGPathElement, { source: LayoutNode; target: LayoutNode }>('.link')
          .data(visibleLinks).join('path')
          .attr('class', 'link').attr('fill', 'none')
          .attr('stroke', COLORS.link).attr('stroke-width', 1).attr('stroke-linecap', 'round')
          .attr('d', d => {
            const srcBoxBottom = d.source._y + BOX_Y_OFFSET + getNodeBoxH(d.source);
            const tgtBoxTop = d.target._y + BOX_Y_OFFSET;
            const midY = (srcBoxBottom + tgtBoxTop) / 2;
            return `M${d.source._x},${srcBoxBottom}V${midY}H${d.target._x}V${tgtBoxTop}`;
          });

        // Nodes
        const node = g.selectAll<SVGGElement, LayoutNode>('.node')
          .data(allNodes).join('g')
          .attr('class', 'node')
          .attr('transform', d => `translate(${d._x},${d._y})`)
          .style('cursor', 'pointer');

        node.each(function (d) {
          const el = d3.select(this);
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
              .attr('font-size', '14px').attr('font-family', '"Microsoft YaHei","PingFang SC",sans-serif')
              .attr('fill', COLORS.nameText).attr('font-weight', '500').text(ch)
          );
          if (hs) {
            const st = el.append('text').attr('y', BOX_Y_OFFSET + 14);
            p.spouses[0].name.split('').forEach(ch =>
              st.append('tspan').attr('x', 10).attr('dy', '1.25em').attr('text-anchor', 'middle')
                .attr('font-size', '12px').attr('font-family', '"Microsoft YaHei","PingFang SC",sans-serif')
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
            el.append('line')
              .attr('x1', 0).attr('y1', boxBottom).attr('x2', 0).attr('y2', boxBottom + STUB_LEN)
              .attr('stroke', COLORS.link).attr('stroke-width', 1);
            el.append('text')
              .attr('x', 0).attr('y', boxBottom + STUB_LEN + 10)
              .attr('text-anchor', 'middle').attr('font-size', '10px')
              .attr('fill', COLORS.stubLine).attr('cursor', 'pointer').text('▼')
              .on('click', (event: MouseEvent) => { event.stopPropagation(); onExpandDepth(d.data.id); });
          }
        });

        // Interactions
        node.on('click', (event: MouseEvent, d) => {
          event.stopPropagation();
          highlightedSetRef.current.clear();
          let anc: LayoutNode | null = d;
          while (anc) { if (anc.depth >= 0) highlightedSetRef.current.add(anc); anc = anc.parent; }
          const addDesc = (n: LayoutNode) => { if (n.depth >= 0) highlightedSetRef.current.add(n); n.children?.forEach(addDesc); };
          addDesc(d); applyHighlight(); onNodeClick(d.data);
        });
        node.on('contextmenu', (event: MouseEvent, d) => {
          event.preventDefault(); event.stopPropagation();
          onNodeRightClick(d.data, event.pageX, event.pageY);
        });
        node.on('mouseenter', function () {
          d3.select(this).select('.node-border').transition().duration(120).attr('stroke-width', 2.2);
        });
        node.on('mouseleave', function (_, d) {
          const isHL = highlightedSetRef.current.has(d);
          d3.select(this).select('.node-border').transition().duration(200).attr('stroke-width', isHL ? 2.5 : 1.2);
        });

        // AA + AB stubs
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
            g.append('line')
              .attr('x1', n._x).attr('y1', n._y + BOX_Y_OFFSET)
              .attr('x2', n._x).attr('y2', n._y + aaTopY)
              .attr('stroke', COLORS.link).attr('stroke-width', 1);
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
              const fp = findInTree(root, anyChild.parentRels[0].fromId);
              if (fp) total = fp.children.length;
            }
            if (total <= 1) continue;
            const sorted = [...visibleSiblings].sort((a, b) => a._x - b._x);
            let abLeft = sorted[0]._x; let abRight = sorted[sorted.length - 1]._x;
            if (total > visibleSiblings.length) { abLeft -= 15; abRight += 15; }
            g.append('line')
              .attr('x1', abLeft).attr('y1', sorted[0]._y + sibY)
              .attr('x2', abRight).attr('y2', sorted[0]._y + sibY)
              .attr('stroke', COLORS.link).attr('stroke-width', 1);
          }
        }
      };

      if (!animated) {
        // ── Initial / non-animated draw ────────────────────────────────
        let g = svg.select<SVGGElement>('g.tree-group');
        if (g.node()) g.remove();
        g = svg.append('g').attr('class', 'tree-group');
        renderInto(g);
      } else {
        // ── Animated crossfade + slide ─────────────────────────────────
        // 1. Rename old group to 'tree-group-old' so it won't conflict
        const oldG = svg.select<SVGGElement>('g.tree-group');
        if (oldG.node()) oldG.attr('class', 'tree-group-old');

        // 2. Build new group, starting offset in the incoming direction
        const newG = svg.append('g').attr('class', 'tree-group');
        renderInto(newG);

        // Read the current zoom transform so both groups start aligned
        const currentXform = svg.select<SVGGElement>('g.tree-group-old').attr('transform') || '';

        // New group: start offset in direction of travel, opacity 0
        // e.g. shift-down (dir=+1): new content comes from below (+slideY), exits upward
        newG.attr('transform', `${currentXform} translate(0,${slideY})`)
            .attr('opacity', 0);

        // 3. Animate old group: slide away opposite direction, fade out
        if (oldG.node()) {
          oldG.transition().duration(ANIM_MS)
            .ease(d3.easeCubicInOut)
            .attr('transform', `${currentXform} translate(0,${-slideY})`)
            .attr('opacity', 0)
            .on('end', function () { d3.select(this).remove(); });
        }

        // 4. Animate new group: slide into place, fade in
        newG.transition().duration(ANIM_MS)
          .ease(d3.easeCubicInOut)
          .attr('transform', currentXform)
          .attr('opacity', 1);
      }
    }, [root, tree, visibleStartDepth, maxVisibleDepth, onNodeClick, onNodeRightClick, onExpandDepth, applyHighlight]);

    // Zoom setup (once per root change)
    useEffect(() => {
      if (!svgRef.current || !root) return;
      const svg = d3.select(svgRef.current);
      svg.on('contextmenu', (e: Event) => e.preventDefault());

      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 3])
        .on('zoom', event => {
          const t = event.transform;
          const nodes = allLayoutNodesRef.current;
          let cx = t.x;
          let cy = t.y;
          if (nodes.length > 0 && svgRef.current) {
            const w = svgRef.current.clientWidth;
            const h = svgRef.current.clientHeight;
            const minNodeX = Math.min(...nodes.map(n => n._x));
            const maxNodeX = Math.max(...nodes.map(n => n._x));
            const minTx = -maxNodeX * t.k + w - 30 - GEN_STRIP_W;
            const maxTx = -minNodeX * t.k + 30;
            if (minTx < maxTx) {
              cx = Math.max(minTx, Math.min(maxTx, cx));
            } else {
              // Tree fits in viewport — center it horizontally
              const treeCenterX = (minNodeX + maxNodeX) / 2;
              cx = (w - GEN_STRIP_W) / 2 - treeCenterX * t.k;
            }
            const minNodeY = genZoneTop(0);
            const maxNodeY = genZoneBottom(maxDepthRef.current, maxDepthRef.current);
            const minTy = -maxNodeY * t.k + h - 30;
            const maxTy = -minNodeY * t.k + 30;
            if (minTy < maxTy) {
              cy = Math.max(minTy, Math.min(maxTy, cy));
            } else {
              // Tree fits in viewport — center it vertically
              const treeCenterY = (minNodeY + maxNodeY) / 2;
              cy = h / 2 - treeCenterY * t.k;
            }
          }
          const constrained = d3.zoomIdentity.translate(cx, cy).scale(t.k);
          svg.select<SVGGElement>('g.tree-group').attr('transform', constrained.toString());
          updateGenStrip(constrained);
        });
      zoomRef.current = zoom;
      svg.call(zoom);
      svg.on('click.clear', () => { highlightedSetRef.current.clear(); applyHighlight(); onClearSelection(); });

      // Initial center
      shiftDirRef.current = 0;
      drawTree(false);
      const allNodes = allLayoutNodesRef.current;
      if (allNodes.length > 0) {
        const minX = Math.min(...allNodes.map(n => n._x));
        const maxX = Math.max(...allNodes.map(n => n._x));
        const centerX = (minX + maxX) / 2;
        const width = svgRef.current.clientWidth;
        const initialY = 40 + STUB_LEN;
        const initialTransform = d3.zoomIdentity.translate(width / 2 - centerX, initialY);
        svg.call(zoom.transform, initialTransform);
        updateGenStrip(initialTransform);
      }

      return () => { svg.on('.zoom', null); svg.on('click.clear', null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [root]);

    // Redraw tree when depth window changes
    useEffect(() => {
      if (!svgRef.current || !root || !zoomRef.current) return;
      const svg = d3.select(svgRef.current);
      const currentTransform = d3.zoomTransform(svgRef.current);
      drawTree(true);
      svg.call(zoomRef.current.transform, currentTransform);
      // Re-highlight pending person after redraw
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
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', transform: 'translateZ(0)' }}>
        <svg
          ref={svgRef}
          style={{
            width: '100%', height: '100%', background: COLORS.bg, display: 'block',
            fontFamily: '"Microsoft YaHei","PingFang SC",sans-serif',
            textRendering: 'geometricPrecision',
            shapeRendering: 'crispEdges',
          }}
        />
        {/* ─── Generation strip text + arrows ─── */}
        {genCells.length > 0 && (() => {
          const first = genCells[0];
          const last = genCells[genCells.length - 1];
          const tableTop = first.screenY;
          const tableBottom = last.screenY + last.cellHeight;
          const arrowH = 20;
          const arrowStyle: React.CSSProperties = {
            position: 'absolute', right: 0, width: GEN_STRIP_W + 1, height: arrowH,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(71,85,105,0.10)',
            cursor: 'pointer', pointerEvents: 'auto', fontSize: 10,
            color: '#475569', userSelect: 'none',
            boxSizing: 'border-box', padding: 0, margin: 0, lineHeight: 1,
          };
          return (
            <>
              {canShiftUp && (
                <div style={{ ...arrowStyle, top: tableTop - arrowH }} onClick={onShiftUp} title="上一代">▲</div>
              )}
              {genCells.map(cell => (
                <div
                  key={cell.depth}
                  style={{
                    position: 'absolute',
                    top: cell.screenY,
                    right: 0,
                    width: GEN_STRIP_W + 1,
                    height: cell.cellHeight,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: cell.depth % 2 === 0 ? 'rgba(255,255,255,0.92)' : 'rgba(220,232,244,0.92)',
                    pointerEvents: 'none',
                    writingMode: 'vertical-rl',
                    textOrientation: 'upright',
                    fontFamily: '"Microsoft YaHei","PingFang SC",sans-serif',
                    fontSize: cell.fontSize,
                    fontWeight: 600,
                    color: '#475569',
                    letterSpacing: 2,
                    lineHeight: 1,
                    userSelect: 'none',
                  }}
                >
                  {cell.label}
                </div>
              ))}
              {canShiftDown && (
                <div style={{ ...arrowStyle, top: tableBottom }} onClick={onShiftDown} title="下一代">▼</div>
              )}
            </>
          );
        })()}
        {/* ─── Strip border lines (SVG overlay ON TOP of backgrounds) ─── */}
        {genCells.length > 0 && (
          <svg
            style={{
              position: 'absolute', top: 0, right: 0,
              width: GEN_STRIP_W + 1, height: '100%',
              pointerEvents: 'none', overflow: 'visible',
            }}
          >
            {/* Vertical left/right borders */}
            <line x1={0.5} y1={genCells[0].screenY} x2={0.5} y2={genCells[genCells.length - 1].screenY + genCells[genCells.length - 1].cellHeight}
              stroke="#90a4ae" strokeWidth={1} />
            <line x1={GEN_STRIP_W + 0.5} y1={genCells[0].screenY} x2={GEN_STRIP_W + 0.5} y2={genCells[genCells.length - 1].screenY + genCells[genCells.length - 1].cellHeight}
              stroke="#90a4ae" strokeWidth={1} />
            {/* Horizontal cell borders (top of each cell + bottom of last) */}
            {genCells.map(cell => (
              <line key={`top-${cell.depth}`}
                x1={0} y1={cell.screenY} x2={GEN_STRIP_W + 1} y2={cell.screenY}
                stroke="#90a4ae" strokeWidth={1} />
            ))}
            <line
              x1={0} y1={genCells[genCells.length - 1].screenY + genCells[genCells.length - 1].cellHeight}
              x2={GEN_STRIP_W + 1} y2={genCells[genCells.length - 1].screenY + genCells[genCells.length - 1].cellHeight}
              stroke="#90a4ae" strokeWidth={1} />
          </svg>
        )}
      </div>
    );
  }
);
