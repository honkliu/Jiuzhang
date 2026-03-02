import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef, useState } from 'react';
import * as d3 from 'd3';
import type { FamilyNode, FamilyTreeDto } from '@/services/family.service';

interface Props {
  root: FamilyNode | null;
  tree: FamilyTreeDto | null;
  onNodeClick: (node: FamilyNode) => void;
  onNodeRightClick: (node: FamilyNode, x: number, y: number) => void;
}

export interface FamilyTreeCanvasHandle {
  centerOnPerson: (personId: string) => void;
}

const NODE_GAP = 55;
const LEVEL_HEIGHT = 150;
const GEN_STRIP_W = 34;      // width of each generation cell

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
  dimOpacity: 0.15,
};

// ─── Custom layout ────────────────────────────────────────────────────────

interface LayoutNode {
  data: FamilyNode;
  depth: number;
  children: LayoutNode[] | null;
  _x: number;
  _y: number;
  parent: LayoutNode | null;
}

function buildLayoutTree(node: FamilyNode, depth: number, parent: LayoutNode | null): LayoutNode {
  const ln: LayoutNode = { data: node, depth, children: null, _x: 0, _y: depth * LEVEL_HEIGHT, parent };
  if (node.children.length > 0) {
    ln.children = node.children.map(c => buildLayoutTree(c, depth + 1, ln));
  }
  return ln;
}

function layoutSubtree(node: LayoutNode, leftEdge: number): number {
  if (!node.children || node.children.length === 0) {
    node._x = leftEdge;
    return NODE_GAP;
  }
  let cursor = leftEdge;
  for (const child of node.children) { cursor += layoutSubtree(child, cursor); }
  node._x = node.children[node.children.length - 1]._x;
  return cursor - leftEdge;
}

function collectNodes(node: LayoutNode, result: LayoutNode[] = []): LayoutNode[] {
  result.push(node);
  if (node.children) for (const c of node.children) collectNodes(c, result);
  return result;
}

function collectLinks(node: LayoutNode, result: { source: LayoutNode; target: LayoutNode }[] = []) {
  if (node.children) {
    for (const c of node.children) { result.push({ source: node, target: c }); collectLinks(c, result); }
  }
  return result;
}

function getNodeBoxH(d: LayoutNode): number {
  const p = d.data;
  const hasSpouse = p.spouses.length > 0;
  return Math.max(p.name.length, hasSpouse ? p.spouses[0].name.length : 0) * 18 + 24;
}

// ─── Generation strip state ──────────────────────────────────────────────

interface GenCell {
  depth: number;
  label: string;
  screenY: number;
  cellHeight: number;
  fontSize: number;
  borderWidth: number;  // matches SVG link stroke at current zoom
}

export const FamilyTreeCanvas = forwardRef<FamilyTreeCanvasHandle, Props>(
  ({ root, tree, onNodeClick, onNodeRightClick }, ref) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const allLayoutNodesRef = useRef<LayoutNode[]>([]);
    const highlightedSetRef = useRef<Set<LayoutNode>>(new Set());
    const maxDepthRef = useRef(0);
    // Stores the actual link midY (in tree coords) between depth D and D+1
    // linkMidYs[D] = midY of horizontal line from depth D to depth D+1
    const linkMidYsRef = useRef<Map<number, number>>(new Map());

    // Generation strip overlay state
    const [genCells, setGenCells] = useState<GenCell[]>([]);

    const updateGenStrip = useCallback((transform: d3.ZoomTransform) => {
      const rootGen = tree?.rootGeneration ?? 1;
      const maxDepth = maxDepthRef.current;
      const linkMidYs = linkMidYsRef.current;
      const cells: GenCell[] = [];

      // Node box top for a given depth
      const nodeBoxTop = (d: number) => d * LEVEL_HEIGHT - 16;
      // Node box bottom (use typical 3-char = 78px)
      const typicalBoxH = 3 * 18 + 24;
      const nodeBoxBottom = (d: number) => nodeBoxTop(d) + typicalBoxH;

      for (let depth = 0; depth <= maxDepth; depth++) {
        // Top edge: actual link midY from parent, or node box top for root
        const treeTop = depth === 0
          ? nodeBoxTop(0)
          : (linkMidYs.get(depth - 1) ?? ((nodeBoxBottom(depth - 1) + nodeBoxTop(depth)) / 2));

        // Bottom edge: actual link midY to children, or node box bottom for deepest
        const treeBottom = depth === maxDepth
          ? nodeBoxBottom(depth)
          : (linkMidYs.get(depth) ?? ((nodeBoxBottom(depth) + nodeBoxTop(depth + 1)) / 2));

        const screenTop = treeTop * transform.k + transform.y;
        const screenBottom = treeBottom * transform.k + transform.y;
        const bw = Math.max(0.5, transform.k);

        cells.push({
          depth,
          label: `第${rootGen + depth}世`,
          screenY: screenTop - bw / 2,
          cellHeight: screenBottom - screenTop + bw,
          fontSize: Math.max(9, Math.min(14, 14 * transform.k)),
          borderWidth: bw,
        });
      }
      setGenCells(cells);
    }, [tree]);

    useImperativeHandle(ref, () => ({
      centerOnPerson: (personId: string) => {
        if (!svgRef.current || !zoomRef.current) return;
        const target = allLayoutNodesRef.current.find(n => n.data.id === personId);
        if (!target) return;
        const svg = d3.select(svgRef.current);
        const width = svgRef.current.clientWidth;
        const height = svgRef.current.clientHeight;
        const transform = d3.zoomIdentity
          .translate(width / 2 - target._x, height / 3 - target._y).scale(1);
        svg.transition().duration(600).call(zoomRef.current.transform, transform);
        highlightedSetRef.current.clear();
        let anc: LayoutNode | null = target;
        while (anc) { highlightedSetRef.current.add(anc); anc = anc.parent; }
        const addDesc = (n: LayoutNode) => { highlightedSetRef.current.add(n); n.children?.forEach(addDesc); };
        addDesc(target);
        applyHighlight();
      },
    }));

    const applyHighlight = useCallback(() => {
      if (!svgRef.current) return;
      const g = d3.select(svgRef.current).select<SVGGElement>('g.tree-group');
      const hl = highlightedSetRef.current;
      const hasHL = hl.size > 0;

      g.selectAll<SVGGElement, LayoutNode>('.node')
        .transition().duration(250)
        .attr('opacity', d => !hasHL || hl.has(d) ? 1 : COLORS.dimOpacity);
      g.selectAll<SVGGElement, LayoutNode>('.node').select('.node-border')
        .transition().duration(250)
        .attr('stroke', d => hl.has(d) ? COLORS.nodeHighlightBorder : COLORS.nodeBorder)
        .attr('stroke-width', d => hl.has(d) ? 2.5 : 1.2);
      g.selectAll<SVGGElement, LayoutNode>('.node').selectAll<SVGTSpanElement, unknown>('.name-char')
        .transition().duration(250)
        .attr('fill', function () {
          const gNode = (this as SVGElement).closest('.node');
          if (!gNode) return COLORS.nameText;
          const datum = d3.select<SVGGElement, LayoutNode>(gNode as SVGGElement).datum();
          return hl.has(datum) ? COLORS.nameHighlight : COLORS.nameText;
        })
        .attr('font-weight', function () {
          const gNode = (this as SVGElement).closest('.node');
          if (!gNode) return '500';
          const datum = d3.select<SVGGElement, LayoutNode>(gNode as SVGGElement).datum();
          return hl.has(datum) ? '700' : '500';
        });
      g.selectAll<SVGPathElement, { source: LayoutNode; target: LayoutNode }>('.link')
        .transition().duration(250)
        .attr('stroke', d => hl.has(d.target) ? COLORS.linkHighlight : COLORS.link)
        .attr('stroke-width', d => hl.has(d.target) ? 2 : 1)
        .attr('opacity', d => !hasHL || (hl.has(d.source) && hl.has(d.target)) ? 1 : COLORS.dimOpacity);
    }, []);

    const drawTree = useCallback(() => {
      if (!svgRef.current || !root) return;
      const svg = d3.select(svgRef.current);
      let g = svg.select<SVGGElement>('g.tree-group');
      if (!g.node()) { g = svg.append('g').attr('class', 'tree-group'); }
      g.selectAll('*').remove();

      const layoutRoot = buildLayoutTree(root, 0, null);
      layoutSubtree(layoutRoot, 0);
      const allNodes = collectNodes(layoutRoot);
      const allLinks = collectLinks(layoutRoot);
      allLayoutNodesRef.current = allNodes;
      maxDepthRef.current = Math.max(...allNodes.map(n => n.depth));

      // Links
      g.selectAll<SVGPathElement, { source: LayoutNode; target: LayoutNode }>('.link')
        .data(allLinks).join('path')
        .attr('class', 'link').attr('fill', 'none')
        .attr('stroke', COLORS.link).attr('stroke-width', 1).attr('stroke-linecap', 'round')
        .attr('d', d => {
          const srcBottom = d.source._y - 16 + getNodeBoxH(d.source);
          const tgtTop = d.target._y - 16;
          const midY = (srcBottom + tgtTop) / 2;
          return `M${d.source._x},${srcBottom}V${midY}H${d.target._x}V${tgtTop}`;
        });

      // Compute actual link midY per parent depth for generation strip alignment
      const midYMap = new Map<number, number>();
      for (const link of allLinks) {
        const d = link.source.depth;
        if (!midYMap.has(d)) {
          const srcBottom = link.source._y - 16 + getNodeBoxH(link.source);
          const tgtTop = link.target._y - 16;
          midYMap.set(d, (srcBottom + tgtTop) / 2);
        }
      }
      linkMidYsRef.current = midYMap;

      // Nodes
      const node = g.selectAll<SVGGElement, LayoutNode>('.node')
        .data(allNodes).join('g')
        .attr('class', 'node')
        .attr('transform', d => `translate(${d._x},${d._y})`)
        .style('cursor', 'pointer');

      node.each(function (d) {
        const p = d.data;
        const hasSpouse = p.spouses.length > 0;
        const boxH = getNodeBoxH(d);
        const boxW = hasSpouse ? 42 : 26;
        d3.select(this).append('rect').attr('class', 'node-border')
          .attr('x', -boxW / 2).attr('y', -16).attr('width', boxW).attr('height', boxH)
          .attr('rx', 6).attr('ry', 6)
          .attr('fill', COLORS.nodeBg).attr('stroke', COLORS.nodeBorder).attr('stroke-width', 1.2)
          .attr('filter', 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))');
      });

      node.each(function (d) {
        const p = d.data;
        const hasSpouse = p.spouses.length > 0;
        const xPos = hasSpouse ? -10 : 0;
        const t = d3.select(this).append('text').attr('class', 'name-text').attr('y', -2);
        p.name.split('').forEach(ch => {
          t.append('tspan').attr('class', 'name-char')
            .attr('x', xPos).attr('dy', '1.25em').attr('text-anchor', 'middle')
            .attr('font-size', '14px').attr('font-family', '"Microsoft YaHei","PingFang SC",sans-serif')
            .attr('fill', COLORS.nameText).attr('font-weight', '500').text(ch);
        });
      });

      node.filter(d => d.data.spouses.length > 0).each(function (d) {
        const t = d3.select(this).append('text').attr('y', -2);
        d.data.spouses[0].name.split('').forEach(ch => {
          t.append('tspan').attr('x', 10).attr('dy', '1.25em').attr('text-anchor', 'middle')
            .attr('font-size', '12px').attr('font-family', '"Microsoft YaHei","PingFang SC",sans-serif')
            .attr('fill', COLORS.spouseText).text(ch);
        });
      });

      node.each(function (d) {
        const p = d.data; const hasSpouse = p.spouses.length > 0; const boxW = hasSpouse ? 42 : 26;
        d3.select(this).append('circle')
          .attr('cx', -(boxW / 2) + 5).attr('cy', -10).attr('r', 3)
          .attr('fill', p.gender === 'female' ? '#f472b6' : '#60a5fa');
      });

      node.filter(d => d.data.isAlive === false).each(function (d) {
        const hasSpouse = d.data.spouses.length > 0; const boxW = hasSpouse ? 42 : 26;
        d3.select(this).append('text')
          .attr('x', (boxW / 2) - 5).attr('y', -7)
          .attr('text-anchor', 'middle').attr('font-size', '8px').attr('fill', '#94a3b8').text('†');
      });

      // Interactions
      node.on('click', (event: MouseEvent, d) => {
        event.stopPropagation();
        highlightedSetRef.current.clear();
        let anc: LayoutNode | null = d;
        while (anc) { highlightedSetRef.current.add(anc); anc = anc.parent; }
        const addDesc = (n: LayoutNode) => { highlightedSetRef.current.add(n); n.children?.forEach(addDesc); };
        addDesc(d); applyHighlight(); onNodeClick(d.data);
      });
      node.on('contextmenu', (event: MouseEvent, d) => {
        event.preventDefault(); event.stopPropagation();
        onNodeRightClick(d.data, event.pageX, event.pageY);
      });
      node.on('mouseenter', function () {
        d3.select(this).select('.node-border').transition().duration(120)
          .attr('stroke-width', 2.2).attr('filter', 'drop-shadow(0 2px 6px rgba(0,0,0,0.15))');
      });
      node.on('mouseleave', function (_, d) {
        const isHL = highlightedSetRef.current.has(d);
        d3.select(this).select('.node-border').transition().duration(200)
          .attr('stroke-width', isHL ? 2.5 : 1.2).attr('filter', 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))');
      });
    }, [root, tree, onNodeClick, onNodeRightClick, applyHighlight]);

    // Zoom + initial render
    useEffect(() => {
      if (!svgRef.current || !root) return;
      const svg = d3.select(svgRef.current);
      svg.on('contextmenu', (e: Event) => e.preventDefault());

      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 3])
        .on('zoom', event => {
          svg.select<SVGGElement>('g.tree-group').attr('transform', event.transform.toString());
          updateGenStrip(event.transform);
        });
      zoomRef.current = zoom;
      svg.call(zoom);
      svg.on('click.clear', () => { highlightedSetRef.current.clear(); applyHighlight(); });

      drawTree();

      const allNodes = allLayoutNodesRef.current;
      if (allNodes.length > 0) {
        const minX = Math.min(...allNodes.map(n => n._x));
        const maxX = Math.max(...allNodes.map(n => n._x));
        const centerX = (minX + maxX) / 2;
        const width = svgRef.current.clientWidth;
        const initialTransform = d3.zoomIdentity.translate(width / 2 - centerX, 40);
        svg.call(zoom.transform, initialTransform);
      }

      return () => { svg.on('.zoom', null); svg.on('click.clear', null); };
    }, [root, drawTree, applyHighlight, updateGenStrip]);

    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        <svg
          ref={svgRef}
          style={{
            width: '100%', height: '100%',
            background: COLORS.bg, display: 'block',
            fontFamily: '"Microsoft YaHei","PingFang SC",sans-serif',
          }}
        />
        {/* ─── Floating generation strip ─── */}
        {genCells.length > 0 && (() => {
          const first = genCells[0];
          return (
            <table
              style={{
                position: 'absolute',
                top: Math.round(first.screenY),
                right: 8,
                borderCollapse: 'collapse',
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            >
              <tbody>
                {genCells.map(cell => (
                  <tr key={cell.depth}>
                    <td
                      style={{
                        width: GEN_STRIP_W,
                        height: Math.round(cell.cellHeight),
                        border: `${cell.borderWidth}px solid #90a4ae`,
                        background: 'rgba(255,255,255,0.90)',
                        textAlign: 'center',
                        verticalAlign: 'middle',
                        padding: 0,
                        writingMode: 'vertical-rl',
                        textOrientation: 'upright',
                        fontFamily: '"Microsoft YaHei","PingFang SC",sans-serif',
                        fontSize: cell.fontSize,
                        fontWeight: 600,
                        color: '#475569',
                        letterSpacing: 2,
                        lineHeight: 1,
                      }}
                    >
                      {cell.label}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })()}
      </div>
    );
  }
);
