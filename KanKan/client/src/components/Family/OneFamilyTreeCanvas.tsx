import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import * as d3 from 'd3';
import type { FamilyNode, FamilyTreeDto } from '@/services/family.service';
import './FamilyTreeCanvas.css';

type Props = {
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
};

export type OneFamilyTreeCanvasHandle = {
  centerOnPerson: (personId: string) => void;
  setPendingHighlight: (personId: string | null) => void;
  setShiftDirection: (dir: number) => void;
};

const H_GAP = 55;
const STUB_LEN = 20;
const BOX_TOP = -16;
const BOX_TYP_H = 78;
const ROW_GAP = STUB_LEN + BOX_TYP_H + STUB_LEN + 32;
const STRIP_WIDTH = 34;
const REVEAL_STEP_MS = 50;
const MOVE_FADE_MS = 20;

const PALETTE = {
  paper: '#eef2f6',
  wire: '#8ea4b8',
  wireHi: 'rgb(42,175,71)',
  boxFill: '#fff',
  boxStroke: '#7a8fa0',
  boxHi: 'rgb(42,175,71)',
  name: '#1e293b',
  nameHi: 'rgb(42,175,71)',
  spouse: '#64748b',
  stub: '#94a3b8',
  male: '#60a5fa',
  female: '#f472b6',
  dim: 0.15,
} as const;

type VisualNode = {
  id: string;
  data: FamilyNode;
  row: number;
  gen: number;
  kids: VisualNode[];
  parent: VisualNode | null;
  x: number;
  y: number;
  isLeaf: boolean;
};

type Wire = { from: VisualNode; to: VisualNode };

const boxHeight = (p: FamilyNode): number => {
  const spouseLen = p.spouses.length > 0 ? p.spouses[0].name.length : 0;
  return Math.max(p.name.length, spouseLen) * 18 + 24;
};

const boxWidth = (p: FamilyNode): number => (p.spouses.length > 0 ? 42 : 26);

const findPerson = (root: FamilyNode, id: string): FamilyNode | null => {
  if (root.id === id) return root;
  for (const c of root.children) {
    const hit = findPerson(c, id);
    if (hit) return hit;
  }
  return null;
};

const collectAtDepth = (root: FamilyNode, depth: number): FamilyNode[] => {
  const out: FamilyNode[] = [];
  const walk = (n: FamilyNode, d: number) => {
    if (d === depth) {
      out.push(n);
      return;
    }
    if (d < depth) n.children.forEach(c => walk(c, d + 1));
  };
  walk(root, 0);
  return out;
};

const buildForest = (
  root: FamilyNode,
  startDepth: number,
  visibleCount: number,
): VisualNode[] => {
  const seeds = collectAtDepth(root, startDepth);
  const cap = visibleCount - 1;
  const build = (n: FamilyNode, row: number, gen: number, parent: VisualNode | null): VisualNode => {
    const hasKids = n.children.length > 0;
    const expand = row < cap && hasKids;
    const vn: VisualNode = {
      id: n.id,
      data: n,
      row,
      gen,
      kids: [],
      parent,
      x: 0,
      y: row * ROW_GAP,
      isLeaf: hasKids && !expand,
    };
    if (expand) vn.kids = n.children.map(c => build(c, row + 1, gen + 1, vn));
    return vn;
  };
  return seeds.map(s => build(s, 0, startDepth, null));
};

const buildForestPartial = (
  root: FamilyNode,
  startDepth: number,
  visibleCount: number,
  keep: Set<string>,
): VisualNode[] => {
  const seeds = collectAtDepth(root, startDepth);
  const cap = visibleCount - 1;
  const build = (n: FamilyNode, row: number, gen: number, parent: VisualNode | null): VisualNode | null => {
    if (!keep.has(n.id)) return null;
    const hasKids = n.children.length > 0;
    const expand = row < cap && hasKids;
    const vn: VisualNode = {
      id: n.id,
      data: n,
      row,
      gen,
      kids: [],
      parent,
      x: 0,
      y: row * ROW_GAP,
      isLeaf: hasKids && !expand,
    };
    if (expand) {
      for (const c of n.children) {
        const child = build(c, row + 1, gen + 1, vn);
        if (child) vn.kids.push(child);
      }
    }
    return vn;
  };
  const out: VisualNode[] = [];
  for (const s of seeds) {
    const v = build(s, 0, startDepth, null);
    if (v) out.push(v);
  }
  return out;
};

const layoutNode = (n: VisualNode, leftEdge: number): number => {
  if (n.kids.length === 0) {
    n.x = leftEdge;
    return H_GAP;
  }
  let cursor = leftEdge;
  for (const c of n.kids) cursor += layoutNode(c, cursor);
  n.x = n.kids[n.kids.length - 1].x;
  return cursor - leftEdge;
};

const layoutForest = (roots: VisualNode[]): void => {
  if (roots.length === 0) return;
  if (roots.length === 1) {
    layoutNode(roots[0], 0);
    return;
  }
  let cursor = 0;
  for (const r of roots) cursor += layoutNode(r, cursor);
};

const flatten = (roots: VisualNode[]): VisualNode[] => {
  const out: VisualNode[] = [];
  const walk = (n: VisualNode) => {
    out.push(n);
    n.kids.forEach(walk);
  };
  roots.forEach(walk);
  return out;
};

const gatherWires = (roots: VisualNode[]): Wire[] => {
  const out: Wire[] = [];
  const walk = (n: VisualNode) => {
    n.kids.forEach(c => {
      out.push({ from: n, to: c });
      walk(c);
    });
  };
  roots.forEach(walk);
  return out;
};

const rightAlign = (roots: VisualNode[], targetX: number): void => {
  const all = flatten(roots);
  if (all.length === 0) return;
  const maxX = Math.max(...all.map(n => n.x));
  const dx = targetX - maxX;
  if (dx === 0) return;
  const shift = (n: VisualNode) => {
    n.x += dx;
    n.kids.forEach(shift);
  };
  roots.forEach(shift);
};

const wirePath = (w: Wire): string => {
  const y1 = w.from.y + BOX_TOP + boxHeight(w.from.data);
  const y2 = w.to.y + BOX_TOP;
  const mid = (y1 + y2) / 2;
  return `M${w.from.x},${y1}V${mid}H${w.to.x}V${y2}`;
};

const wireKey = (w: Wire): string => `${w.from.id}->${w.to.id}`;

const zoneTop = (row: number): number => {
  if (row === 0) return BOX_TOP - STUB_LEN;
  const prevBottom = (row - 1) * ROW_GAP + BOX_TOP + BOX_TYP_H;
  const curTop = row * ROW_GAP + BOX_TOP;
  return (prevBottom + curTop) / 2;
};

const zoneBottom = (row: number, maxRow: number): number => {
  if (row === maxRow) return row * ROW_GAP + BOX_TOP + BOX_TYP_H + STUB_LEN;
  const curBottom = row * ROW_GAP + BOX_TOP + BOX_TYP_H;
  const nextTop = (row + 1) * ROW_GAP + BOX_TOP;
  return (curBottom + nextTop) / 2;
};

type Seg = { key: string; x1: number; y1: number; x2: number; y2: number };

const stubSegments = (topRow: VisualNode[], fullRoot: FamilyNode): Seg[] => {
  if (topRow.length === 0) return [];
  const out: Seg[] = [];
  const siblingLineY = BOX_TOP - STUB_LEN;
  const groups = new Map<string, VisualNode[]>();

  for (const n of topRow) {
    const pid = n.data.parentRels.length > 0 ? n.data.parentRels[0].fromId : n.id;
    const bucket = groups.get(pid) ?? [];
    bucket.push(n);
    groups.set(pid, bucket);
  }

  const eldest = new Set<string>();
  for (const siblings of groups.values()) {
    const sorted = [...siblings].sort((a, b) => a.x - b.x);
    if (sorted.length > 0) eldest.add(sorted[sorted.length - 1].id);
  }

  for (const n of topRow) {
    const extra = eldest.has(n.id) ? siblingLineY - STUB_LEN : siblingLineY;
    out.push({
      key: `aa-${n.id}`,
      x1: n.x,
      y1: n.y + BOX_TOP,
      x2: n.x,
      y2: n.y + extra,
    });
  }

  const lookup = (id: string): FamilyNode | null => {
    const stack: FamilyNode[] = [fullRoot];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (cur.id === id) return cur;
      stack.push(...cur.children);
    }
    return null;
  };

  for (const siblings of groups.values()) {
    if (siblings.length <= 1) continue;
    const sample = siblings[0].data;
    let total = siblings.length;
    if (sample.parentRels.length > 0) {
      const par = lookup(sample.parentRels[0].fromId);
      if (par) total = par.children.length;
    }
    if (total <= 1) continue;
    const sorted = [...siblings].sort((a, b) => a.x - b.x);
    let left = sorted[0].x;
    let right = sorted[sorted.length - 1].x;
    if (total > siblings.length) {
      left -= 15;
      right += 15;
    }
    const y = sorted[0].y + siblingLineY;
    out.push({
      key: `ab-${sorted[0].id}-${sorted[sorted.length - 1].id}`,
      x1: left,
      y1: y,
      x2: right,
      y2: y,
    });
  }

  return out;
};

export const OneFamilyTreeCanvas = forwardRef<OneFamilyTreeCanvasHandle, Props>(
  (props, ref) => {
    const {
      root,
      tree,
      visibleStartDepth,
      maxVisibleDepth,
      canShiftUp,
      canShiftDown,
      onNodeClick,
      onNodeRightClick,
      onExpandDepth,
      onShiftUp,
      onShiftDown,
      onClearSelection,
    } = props;

    const svgRef = useRef<SVGSVGElement | null>(null);
    const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const drawnRef = useRef<VisualNode[]>([]);
    const highlightIdsRef = useRef<Set<string>>(new Set());
    const maxRowRef = useRef(0);
    const startDepthRef = useRef(visibleStartDepth);
    startDepthRef.current = visibleStartDepth;
    const pendingHighlightRef = useRef<string | null>(null);
    const boundsRef = useRef<{ minX: number; maxX: number } | null>(null);
    const prevPosRef = useRef<Map<string, [number, number]>>(new Map());
    const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
    const animatingRef = useRef(false);
    const timersRef = useRef<number[]>([]);
    const shiftDirRef = useRef(0);

    const rootGen = tree?.rootGeneration ?? 1;

    const clearTimers = useCallback(() => {
      timersRef.current.forEach(t => window.clearTimeout(t));
      timersRef.current = [];
      animatingRef.current = false;
    }, []);

    const renderStrip = useCallback((t: d3.ZoomTransform) => {
      const svg = svgRef.current;
      if (!svg) return;
      const w = svg.clientWidth;
      const stripW = STRIP_WIDTH + 1;
      const x = w - stripW;
      const maxRow = maxRowRef.current;
      const startDepth = startDepthRef.current;
      const arrowH = 20;

      const s = d3.select(svg);
      let g = s.select<SVGGElement>('g.strip-group');
      if (g.empty()) g = s.append('g').attr('class', 'strip-group');
      g.attr('transform', `translate(${x},0)`);

      const cells = Array.from({ length: maxRow + 1 }, (_, i) => {
        const top = zoneTop(i);
        const bot = zoneBottom(i, maxRow);
        return {
          i,
          label: `第${rootGen + startDepth + i}世`,
          y: top * t.k + t.y,
          h: (bot - top) * t.k,
          fs: Math.max(9, Math.min(14, 14 * t.k)),
        };
      });

      const rects = g.selectAll<SVGRectElement, typeof cells[0]>('.strip-cell')
        .data(cells, d => String(d.i));
      rects.exit().remove();
      rects.enter().append('rect').attr('class', 'strip-cell')
        .merge(rects)
        .attr('x', 0)
        .attr('width', stripW)
        .attr('y', d => d.y)
        .attr('height', d => d.h)
        .attr('fill', d => d.i % 2 === 0 ? 'rgba(255,255,255,0.92)' : 'rgba(220,232,244,0.92)');

      const labels = g.selectAll<SVGTextElement, typeof cells[0]>('.strip-label')
        .data(cells, d => String(d.i));
      labels.exit().remove();
      labels.enter().append('text').attr('class', 'strip-label family-strip-text')
        .merge(labels)
        .attr('x', stripW / 2)
        .attr('y', d => d.y + d.h / 2)
        .attr('font-size', d => d.fs)
        .text(d => d.label);

      g.selectAll('.strip-border-v,.strip-border-h').remove();
      if (cells.length > 0) {
        const top = cells[0].y;
        const bottom = cells[cells.length - 1].y + cells[cells.length - 1].h;
        g.append('line').attr('class', 'strip-border-v family-strip-border')
          .attr('x1', 0.5).attr('y1', top).attr('x2', 0.5).attr('y2', bottom);
        g.append('line').attr('class', 'strip-border-v family-strip-border')
          .attr('x1', STRIP_WIDTH + 0.5).attr('y1', top)
          .attr('x2', STRIP_WIDTH + 0.5).attr('y2', bottom);
        for (const c of cells) {
          g.append('line').attr('class', 'strip-border-h family-strip-border')
            .attr('x1', 0).attr('y1', c.y).attr('x2', stripW).attr('y2', c.y);
        }
        g.append('line').attr('class', 'strip-border-h family-strip-border')
          .attr('x1', 0).attr('y1', bottom).attr('x2', stripW).attr('y2', bottom);
      }

      g.selectAll('.strip-arrow').remove();
      if (cells.length > 0) {
        const topY = cells[0].y;
        const bottomY = cells[cells.length - 1].y + cells[cells.length - 1].h;
        if (canShiftUp) {
          const ag = g.append('g').attr('class', 'strip-arrow').style('cursor', 'pointer')
            .on('click', () => onShiftUp());
          ag.append('rect').attr('class', 'family-strip-arrow-hit')
            .attr('x', 0).attr('y', topY - arrowH).attr('width', stripW).attr('height', arrowH);
          ag.append('text').attr('class', 'family-strip-arrow-text')
            .attr('x', stripW / 2).attr('y', topY - arrowH / 2).text('▲');
        }
        if (canShiftDown) {
          const ag = g.append('g').attr('class', 'strip-arrow').style('cursor', 'pointer')
            .on('click', () => onShiftDown());
          ag.append('rect').attr('class', 'family-strip-arrow-hit')
            .attr('x', 0).attr('y', bottomY).attr('width', stripW).attr('height', arrowH);
          ag.append('text').attr('class', 'family-strip-arrow-text')
            .attr('x', stripW / 2).attr('y', bottomY + arrowH / 2).text('▼');
        }
      }
    }, [rootGen, canShiftUp, canShiftDown, onShiftUp, onShiftDown]);

    const applyHighlight = useCallback(() => {
      const svg = svgRef.current;
      if (!svg) return;
      const g = d3.select(svg).select<SVGGElement>('g.tree-group');
      const set = highlightIdsRef.current;
      const active = set.size > 0;

      g.selectAll<SVGGElement, VisualNode>('.node').transition().duration(250)
        .attr('opacity', d => !active || set.has(d.id) ? 1 : PALETTE.dim);
      g.selectAll<SVGGElement, VisualNode>('.node').select('.node-border').transition().duration(250)
        .attr('stroke', d => set.has(d.id) ? PALETTE.boxHi : PALETTE.boxStroke)
        .attr('stroke-width', d => set.has(d.id) ? 2.5 : 1.2);
      g.selectAll<SVGGElement, VisualNode>('.node').selectAll<SVGTSpanElement, unknown>('.name-char')
        .transition().duration(250)
        .attr('fill', function () {
          const group = (this as SVGElement).closest('.node');
          if (!group) return PALETTE.name;
          const datum = d3.select<SVGGElement, VisualNode>(group as SVGGElement).datum();
          return set.has(datum.id) ? PALETTE.nameHi : PALETTE.name;
        })
        .attr('font-weight', function () {
          const group = (this as SVGElement).closest('.node');
          if (!group) return '500';
          const datum = d3.select<SVGGElement, VisualNode>(group as SVGGElement).datum();
          return set.has(datum.id) ? '700' : '500';
        });
      g.selectAll<SVGPathElement, Wire>('.link').transition().duration(250)
        .attr('stroke', d => set.has(d.to.id) ? PALETTE.wireHi : PALETTE.wire)
        .attr('stroke-width', d => set.has(d.to.id) ? 2 : 1)
        .attr('opacity', d => !active || (set.has(d.from.id) && set.has(d.to.id)) ? 1 : PALETTE.dim);
    }, []);

    const markBranch = useCallback((target: VisualNode) => {
      highlightIdsRef.current.clear();
      let cur: VisualNode | null = target;
      while (cur) {
        highlightIdsRef.current.add(cur.id);
        cur = cur.parent;
      }
      const walk = (n: VisualNode) => {
        highlightIdsRef.current.add(n.id);
        n.kids.forEach(walk);
      };
      walk(target);
    }, []);

    const drawFrame = useCallback((nodes: VisualNode[], wires: Wire[], animated: boolean) => {
      const svg = svgRef.current;
      if (!svg) return;
      const s = d3.select(svg);
      const g = s.selectAll<SVGGElement, unknown>('g.tree-group')
        .data([null]).join('g').attr('class', 'tree-group');

      const prev = prevPosRef.current;
      const next = new Map<string, [number, number]>();
      nodes.forEach(n => next.set(n.id, [n.x, n.y]));

      g.selectAll('.node,.link,.stub-line').interrupt('m').interrupt('f');

      const links = g.selectAll<SVGPathElement, Wire>('.link')
        .data(wires, d => wireKey(d));
      links.exit().remove();
      const linkEnter = links.enter().append('path').attr('class', 'link')
        .attr('fill', 'none').attr('stroke', PALETTE.wire)
        .attr('stroke-width', 1).attr('stroke-linecap', 'round')
        .attr('opacity', animated ? 0 : 1)
        .attr('d', d => wirePath(d));
      links.merge(linkEnter).transition('m').duration(MOVE_FADE_MS)
        .attr('d', d => wirePath(d)).attr('opacity', 1);

      const nodesSel = g.selectAll<SVGGElement, VisualNode>('.node')
        .data(nodes, d => d.id);
      nodesSel.exit().remove();
      const nodeEnter = nodesSel.enter().append('g').attr('class', 'node')
        .style('cursor', 'pointer')
        .style('opacity', animated ? 0 : 1)
        .attr('transform', d => {
          const p = prev.get(d.id);
          return p ? `translate(${p[0]},${p[1]})` : `translate(${d.x},${d.y})`;
        });
      nodeEnter.each(function (d) {
        buildNode(d3.select(this), d);
      });

      nodesSel.each(function (d) {
        if (!d.isLeaf) d3.select(this).selectAll('.expand-stub').remove();
      });

      const merged = nodesSel.merge(nodeEnter);
      merged.transition('m').duration(MOVE_FADE_MS)
        .attr('transform', d => `translate(${d.x},${d.y})`);

      if (animated) {
        nodeEnter.transition('f').duration(MOVE_FADE_MS).style('opacity', 1);
        linkEnter.transition('f').duration(MOVE_FADE_MS).attr('opacity', 1);
      }

      merged.on('click', (ev: MouseEvent, d) => {
        ev.stopPropagation();
        markBranch(d);
        applyHighlight();
        onNodeClick(d.data);
      });
      merged.on('contextmenu', (ev: MouseEvent, d) => {
        ev.preventDefault();
        ev.stopPropagation();
        onNodeRightClick(d.data, ev.pageX, ev.pageY);
      });
      merged.on('mouseenter', function () {
        d3.select(this).select('.node-border').transition().duration(120).attr('stroke-width', 2.2);
      });
      merged.on('mouseleave', function (_, d) {
        d3.select(this).select('.node-border').transition().duration(200)
          .attr('stroke-width', highlightIdsRef.current.has(d.id) ? 2.5 : 1.2);
      });

      const topRow = nodes.filter(n => n.row === 0);
      const segments = startDepthRef.current > 0 && root ? stubSegments(topRow, root) : [];
      const stubs = g.selectAll<SVGLineElement, Seg>('.stub-line')
        .data(segments, d => d.key);
      stubs.exit().remove();
      const stubEnter = stubs.enter().append('line').attr('class', 'stub-line')
        .attr('stroke', PALETTE.wire).attr('stroke-width', 1)
        .attr('opacity', animated ? 0 : 1);
      stubs.merge(stubEnter).transition('m').duration(MOVE_FADE_MS)
        .attr('x1', d => d.x1).attr('y1', d => d.y1)
        .attr('x2', d => d.x2).attr('y2', d => d.y2).attr('opacity', 1);

      prevPosRef.current = next;
      drawnRef.current = nodes;
    }, [applyHighlight, markBranch, onNodeClick, onNodeRightClick, root]);

    const buildNode = (
      el: d3.Selection<SVGGElement, VisualNode, null, undefined>,
      v: VisualNode,
    ) => {
      const p = v.data;
      const hasSpouse = p.spouses.length > 0;
      const h = boxHeight(p);
      const w = boxWidth(p);

      el.append('rect').attr('class', 'node-border')
        .attr('x', -w / 2).attr('y', BOX_TOP)
        .attr('width', w).attr('height', h)
        .attr('rx', 6).attr('ry', 6)
        .attr('fill', PALETTE.boxFill)
        .attr('stroke', PALETTE.boxStroke)
        .attr('stroke-width', 1.2);

      const nameX = hasSpouse ? -10 : 0;
      const mainText = el.append('text')
        .attr('class', 'name-text')
        .attr('y', BOX_TOP + 14);
      for (const ch of p.name) {
        mainText.append('tspan').attr('class', 'name-char')
          .attr('x', nameX).attr('dy', '1.25em')
          .attr('text-anchor', 'middle')
          .attr('font-size', '14px')
          .attr('font-family', '"Microsoft YaHei","PingFang SC",sans-serif')
          .attr('fill', PALETTE.name).attr('font-weight', '500').text(ch);
      }

      if (hasSpouse) {
        const spouseText = el.append('text').attr('y', BOX_TOP + 14);
        for (const ch of p.spouses[0].name) {
          spouseText.append('tspan')
            .attr('x', 10).attr('dy', '1.25em')
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('font-family', '"Microsoft YaHei","PingFang SC",sans-serif')
            .attr('fill', PALETTE.spouse).text(ch);
        }
      }

      el.append('circle')
        .attr('cx', -(w / 2) + 5).attr('cy', BOX_TOP + 6)
        .attr('r', 3)
        .attr('fill', p.gender === 'female' ? PALETTE.female : PALETTE.male);

      if (p.isAlive === false) {
        el.append('text').attr('x', w / 2 - 5).attr('y', BOX_TOP + 9)
          .attr('text-anchor', 'middle').attr('font-size', '8px')
          .attr('fill', PALETTE.stub).text('†');
      }

      if (v.isLeaf) {
        const base = BOX_TOP + h;
        el.append('line').attr('class', 'expand-stub')
          .attr('x1', 0).attr('y1', base)
          .attr('x2', 0).attr('y2', base + STUB_LEN)
          .attr('stroke', PALETTE.wire).attr('stroke-width', 1);
        el.append('text').attr('class', 'expand-stub')
          .attr('x', 0).attr('y', base + STUB_LEN + 10)
          .attr('text-anchor', 'middle').attr('font-size', '10px')
          .attr('fill', PALETTE.stub).attr('cursor', 'pointer').text('▼')
          .on('click', (ev: MouseEvent) => {
            ev.stopPropagation();
            markBranch(v);
            applyHighlight();
            shiftDirRef.current = 1;
            onNodeClick(v.data);
            onExpandDepth(v.id);
          });
      }
    };

    const revealOrder = (nodes: VisualNode[]): string[] =>
      [...nodes]
        .sort((a, b) => (b.x - a.x) || (b.row - a.row))
        .map(n => n.id);

    const recalcBounds = (nodes: VisualNode[]) => {
      if (nodes.length === 0) return;
      const minX = Math.min(...nodes.map(n => n.x));
      const maxX = Math.max(...nodes.map(n => n.x));
      boundsRef.current = { minX, maxX };
    };

    const adjustViewToRight = (maxX: number) => {
      const svg = svgRef.current;
      const zm = zoomRef.current;
      if (!svg || !zm) return;
      const w = svg.clientWidth;
      const k = transformRef.current.k;
      const pad = 30 + STRIP_WIDTH;
      const next = d3.zoomIdentity
        .translate(w - pad - maxX * k, transformRef.current.y)
        .scale(k);
      transformRef.current = next;
      d3.select(svg).call(zm.transform, next);
    };

    const draw = useCallback((animate: boolean) => {
      if (!svgRef.current || !root) return;
      clearTimers();
      const currentTransform = transformRef.current;

      const targetRoots = buildForest(root, visibleStartDepth, maxVisibleDepth);
      if (targetRoots.length === 0) return;
      layoutForest(targetRoots);
      const allNodes = flatten(targetRoots);
      const allWires = gatherWires(targetRoots);
      maxRowRef.current = Math.max(0, maxVisibleDepth - 1);
      recalcBounds(allNodes);

      const fullMaxX = allNodes.length > 0 ? Math.max(...allNodes.map(n => n.x)) : 0;
      const highlightIds = highlightIdsRef.current;
      const highlighted = highlightIds.size > 0
        ? allNodes.filter(n => highlightIds.has(n.id))
        : [];
      const highlightMaxX = highlighted.length > 0
        ? Math.max(...highlighted.map(n => n.x))
        : null;
      const anchorX = highlightMaxX ?? fullMaxX;

      if (drawnRef.current.length === 0) {
        const svg = svgRef.current;
        if (svg && zoomRef.current) {
          const w = svg.clientWidth;
          const init = d3.zoomIdentity
            .translate(w - 30 - STRIP_WIDTH - anchorX, 40 + STUB_LEN)
            .scale(transformRef.current.k);
          transformRef.current = init;
          d3.select(svg).call(zoomRef.current.transform, init);
        }
      }

      renderStrip(transformRef.current);

      const hasOld = drawnRef.current.length > 0;
      const shouldAnimate = animate && (shiftDirRef.current !== 0 || !hasOld);
      if (!shouldAnimate) {
        drawFrame(allNodes, allWires, animate);
        applyHighlight();
        return;
      }

      animatingRef.current = true;
      adjustViewToRight(anchorX);

      type Frame = { nodes: VisualNode[]; wires: Wire[] };
      const frames: Frame[] = [];
      const prevIds = new Set(drawnRef.current.map(n => n.id));
      const shown = new Set<string>();
      if (hasOld && shiftDirRef.current !== -1) {
        prevIds.forEach(id => shown.add(id));
      }
      const order = revealOrder(allNodes).filter(id => !shown.has(id));

      const snap = (ids: Set<string>): Frame => {
        const roots = buildForestPartial(root, visibleStartDepth, maxVisibleDepth, ids);
        layoutForest(roots);
        rightAlign(roots, anchorX);
        return { nodes: flatten(roots), wires: gatherWires(roots) };
      };

      frames.push(snap(shown));
      for (const id of order) {
        shown.add(id);
        frames.push(snap(shown));
      }

      const last = frames[frames.length - 1];
      recalcBounds(last.nodes);

      drawFrame(frames[0].nodes, frames[0].wires, true);
      for (let i = 1; i < frames.length; i++) {
        const fr = frames[i];
        timersRef.current.push(window.setTimeout(() => {
          drawFrame(fr.nodes, fr.wires, true);
        }, i * REVEAL_STEP_MS));
      }
      timersRef.current.push(window.setTimeout(() => {
        animatingRef.current = false;
        applyHighlight();
        renderStrip(transformRef.current);
        if (svgRef.current && zoomRef.current) {
          d3.select(svgRef.current).call(zoomRef.current.transform, transformRef.current);
        }
      }, frames.length * REVEAL_STEP_MS));
    }, [
      applyHighlight,
      clearTimers,
      drawFrame,
      maxVisibleDepth,
      renderStrip,
      root,
      visibleStartDepth,
    ]);

    useImperativeHandle(ref, () => ({
      centerOnPerson(personId: string) {
        const svg = svgRef.current;
        const zm = zoomRef.current;
        if (!svg || !zm) return;
        let target = drawnRef.current.find(n => n.id === personId);
        if (!target && root) {
          const climb = (id: string): VisualNode | undefined => {
            const p = findPerson(root, id);
            if (!p || p.parentRels.length === 0) return undefined;
            const pid = p.parentRels[0].fromId;
            return drawnRef.current.find(n => n.id === pid) ?? climb(pid);
          };
          target = climb(personId);
        }
        if (!target) return;
        const w = svg.clientWidth;
        const h = svg.clientHeight;
        const k = d3.zoomTransform(svg).k;
        const next = d3.zoomIdentity
          .translate(w / 2 - target.x * k, h / 3 - target.y * k)
          .scale(k);
        d3.select(svg).transition().duration(600).call(zm.transform, next);
        markBranch(target);
        applyHighlight();
      },
      setPendingHighlight(personId: string | null) {
        pendingHighlightRef.current = personId;
      },
      setShiftDirection(dir: number) {
        shiftDirRef.current = dir;
      },
    }));

    useEffect(() => {
      const svg = svgRef.current;
      if (!svg || !root) return;
      clearTimers();
      prevPosRef.current = new Map();

      const s = d3.select(svg);
      s.on('contextmenu', (e: Event) => e.preventDefault());

      const zm = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 3])
        .on('zoom', ev => {
          const t = ev.transform;
          let cx = t.x;
          const cy = transformRef.current.y;
          if (!animatingRef.current) {
            const w = svg.clientWidth;
            const bounds = boundsRef.current;
            if (bounds) {
              const leftLimit = -bounds.maxX * t.k + w - 30 - STRIP_WIDTH;
              const rightLimit = -bounds.minX * t.k + 30;
              if (leftLimit < rightLimit) {
                cx = Math.max(leftLimit, Math.min(rightLimit, cx));
              } else {
                cx = (w - STRIP_WIDTH) / 2 - (bounds.minX + bounds.maxX) / 2 * t.k;
              }
            }
          }
          const next = d3.zoomIdentity.translate(cx, cy).scale(t.k);
          transformRef.current = next;
          s.select<SVGGElement>('g.tree-group').attr('transform', next.toString());
          if (!animatingRef.current) renderStrip(next);
        });

      zoomRef.current = zm;
      s.call(zm);
      s.on('click.clear', () => {
        highlightIdsRef.current.clear();
        applyHighlight();
        onClearSelection();
      });

      shiftDirRef.current = 0;
      draw(true);

      return () => {
        s.on('.zoom', null);
        s.on('click.clear', null);
      };
    }, [applyHighlight, clearTimers, draw, onClearSelection, renderStrip, root]);

    useEffect(() => {
      if (!svgRef.current || !root || !zoomRef.current) return;
      draw(true);
      if (animatingRef.current) return;
      const pid = pendingHighlightRef.current;
      if (!pid) {
        applyHighlight();
        return;
      }
      pendingHighlightRef.current = null;
      requestAnimationFrame(() => {
        let target = drawnRef.current.find(n => n.id === pid);
        if (!target && root) {
          const climb = (id: string): VisualNode | undefined => {
            const p = findPerson(root, id);
            if (!p || p.parentRels.length === 0) return undefined;
            const pid2 = p.parentRels[0].fromId;
            return drawnRef.current.find(n => n.id === pid2) ?? climb(pid2);
          };
          target = climb(pid);
        }
        if (target) {
          markBranch(target);
          applyHighlight();
        }
      });
    }, [applyHighlight, draw, markBranch, root]);

    return (
      <div className="family-tree-container">
        <svg ref={svgRef} className="family-tree-canvas" />
      </div>
    );
  },
);
