/**
 * NewFamilyTreeCanvas — a from-scratch rewrite of the family tree SVG renderer.
 *
 * Architecture:
 *   1. A pure "model" layer computes tree shape (no DOM, no D3).
 *   2. A "renderer" draws/updates SVG via D3 data joins.
 *   3. An "animator" orchestrates multi-frame reveals.
 *   4. A "controller" wires zoom, pan, strip, and user interaction.
 *
 * All section references (§N) point to Right.md.
 */

import {
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import * as d3 from 'd3';
import type { FamilyNode, FamilyTreeDto } from '@/services/family.service';
import './FamilyTreeCanvas.css';

// ────────────────────────────────────────────────────────────────────
// Public interface
// ────────────────────────────────────────────────────────────────────

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

export interface NewFamilyTreeCanvasHandle {
  centerOnPerson: (personId: string) => void;
  setPendingHighlight: (personId: string | null) => void;
  setShiftDirection: (dir: number) => void;
}

// ────────────────────────────────────────────────────────────────────
// §2  Constants
// ────────────────────────────────────────────────────────────────────

const GAP = 55;           // horizontal leaf spacing
const STUB = 20;          // stub line length
const BOX_OFF = -16;      // box top relative to anchor _y
const BOX_H_TYP = 78;     // typical 3-char box height
const ROW_H = STUB + BOX_H_TYP + STUB + 32; // 150 — one generation
const STRIP_W = 34;
const STEP_MS = 50;       // ms between node reveals
const TRANS_MS = 20;      // transition duration for slide/fade

const C = {
  bg: '#eef2f6',
  wire: '#8ea4b8',
  wireHL: 'rgb(42,175,71)',
  boxBg: '#fff',
  boxStroke: '#7a8fa0',
  boxHL: 'rgb(42,175,71)',
  name: '#1e293b',
  nameHL: 'rgb(42,175,71)',
  spouse: '#64748b',
  stub: '#94a3b8',
  male: '#60a5fa',
  female: '#f472b6',
  dim: 0.15,
} as const;

// ────────────────────────────────────────────────────────────────────
// §3  Model layer — pure data, zero DOM
// ────────────────────────────────────────────────────────────────────

/** Position-aware wrapper around a FamilyNode visible in the current window. */
interface VNode {
  id: string;
  person: FamilyNode;
  /** 0-based depth within visible window */
  row: number;
  /** absolute generation index */
  gen: number;
  children: VNode[];
  up: VNode | null;           // parent VNode (null for top row / virtual root)
  x: number;
  y: number;
  leaf: boolean;              // true when children hidden or absent
}

/** Compute box height for a node. */
function boxH(p: FamilyNode): number {
  const sp = p.spouses.length > 0 ? p.spouses[0].name.length : 0;
  return Math.max(p.name.length, sp) * 18 + 24;
}

function boxW(p: FamilyNode): number {
  return p.spouses.length > 0 ? 42 : 26;
}

// § 3.3 — Slice the full FamilyNode tree to the visible window [start..start+count).
// Returns an array of root-level VNodes (may be >1 when startDepth > 0).
function sliceTree(
  root: FamilyNode,
  startDepth: number,
  depthCount: number,
): VNode[] {
  // Collect FamilyNodes at startDepth
  const seeds: FamilyNode[] = [];
  (function dig(n: FamilyNode, d: number) {
    if (d === startDepth) { seeds.push(n); return; }
    if (d < startDepth) n.children.forEach(c => dig(c, d + 1));
  })(root, 0);

  if (seeds.length === 0) return [];

  // Recursively build VNode subtrees
  function build(fn: FamilyNode, row: number, gen: number, parent: VNode | null): VNode {
    const maxRow = depthCount - 1;
    const hasKids = fn.children.length > 0;
    const expand = row < maxRow && hasKids;
    const vn: VNode = {
      id: fn.id,
      person: fn,
      row,
      gen,
      children: [],
      up: parent,
      x: 0,
      y: row * ROW_H,
      leaf: hasKids && !expand,
    };
    if (expand) {
      vn.children = fn.children.map(c => build(c, row + 1, gen + 1, vn));
    }
    return vn;
  }

  return seeds.map(s => build(s, 0, startDepth, null));
}

// Like sliceTree but only keeps nodes whose id is in `keep`.
function sliceTreePartial(
  root: FamilyNode,
  startDepth: number,
  depthCount: number,
  keep: Set<string>,
): VNode[] {
  const seeds: FamilyNode[] = [];
  (function dig(n: FamilyNode, d: number) {
    if (d === startDepth) { seeds.push(n); return; }
    if (d < startDepth) n.children.forEach(c => dig(c, d + 1));
  })(root, 0);

  function build(fn: FamilyNode, row: number, gen: number, parent: VNode | null): VNode | null {
    if (!keep.has(fn.id)) return null;
    const maxRow = depthCount - 1;
    const hasKids = fn.children.length > 0;
    const expand = row < maxRow && hasKids;
    const vn: VNode = {
      id: fn.id,
      person: fn,
      row,
      gen,
      children: [],
      up: parent,
      x: 0,
      y: row * ROW_H,
      leaf: hasKids && !expand,
    };
    if (expand) {
      for (const c of fn.children) {
        const cv = build(c, row + 1, gen + 1, vn);
        if (cv) vn.children.push(cv);
      }
    }
    return vn;
  }

  const out: VNode[] = [];
  for (const s of seeds) {
    if (!keep.has(s.id)) continue;
    const v = build(s, 0, startDepth, null);
    if (v) out.push(v);
  }
  return out;
}

/** § 3.2 — Assign x positions. Returns width consumed. */
function assignX(vn: VNode, left: number): number {
  if (vn.children.length === 0) {
    vn.x = left;
    return GAP;
  }
  let cursor = left;
  for (const c of vn.children) cursor += assignX(c, cursor);
  // parent aligns with rightmost (eldest) child
  vn.x = vn.children[vn.children.length - 1].x;
  return cursor - left;
}

/** Lay out a forest (multiple roots sharing a virtual parent at row -1). */
function layoutForest(roots: VNode[]): void {
  if (roots.length === 0) return;
  if (roots.length === 1) { assignX(roots[0], 0); return; }
  let cursor = 0;
  for (const r of roots) cursor += assignX(r, cursor);
}

/** Flatten a forest into a single array (only row >= 0). */
function flatten(roots: VNode[]): VNode[] {
  const out: VNode[] = [];
  function walk(v: VNode) { out.push(v); v.children.forEach(walk); }
  roots.forEach(walk);
  return out;
}

/** Edges between parent-child pairs (both visible). */
interface Edge { from: VNode; to: VNode }
function edges(roots: VNode[]): Edge[] {
  const out: Edge[] = [];
  function walk(v: VNode) { v.children.forEach(c => { out.push({ from: v, to: c }); walk(c); }); }
  roots.forEach(walk);
  return out;
}

/** Shift all nodes so that the max-x equals `target`. */
function shiftRight(roots: VNode[], target: number): void {
  const all = flatten(roots);
  if (all.length === 0) return;
  const mx = Math.max(...all.map(n => n.x));
  const dx = target - mx;
  if (dx === 0) return;
  function shift(v: VNode) { v.x += dx; v.children.forEach(shift); }
  roots.forEach(shift);
}

// ────────────────────────────────────────────────────────────────────
// §12.2  Link path helper
// ────────────────────────────────────────────────────────────────────

function wirePath(e: Edge): string {
  const srcBot = e.from.y + BOX_OFF + boxH(e.from.person);
  const tgtTop = e.to.y + BOX_OFF;
  const mid = (srcBot + tgtTop) / 2;
  return `M${e.from.x},${srcBot}V${mid}H${e.to.x}V${tgtTop}`;
}

function wireKey(e: Edge): string { return `${e.from.id}->${e.to.id}`; }

// ────────────────────────────────────────────────────────────────────
// §5.2  Strip zone helpers (tree-coord → screen via transform)
// ────────────────────────────────────────────────────────────────────

function zoneTop(row: number): number {
  if (row === 0) return BOX_OFF - STUB;
  const prevBot = (row - 1) * ROW_H + BOX_OFF + BOX_H_TYP;
  const curTop = row * ROW_H + BOX_OFF;
  return (prevBot + curTop) / 2;
}

function zoneBot(row: number, maxRow: number): number {
  if (row === maxRow) return row * ROW_H + BOX_OFF + BOX_H_TYP + STUB;
  const curBot = row * ROW_H + BOX_OFF + BOX_H_TYP;
  const nxtTop = (row + 1) * ROW_H + BOX_OFF;
  return (curBot + nxtTop) / 2;
}

// ────────────────────────────────────────────────────────────────────
// §12.3  Stub line computation
// ────────────────────────────────────────────────────────────────────

interface Seg { key: string; x1: number; y1: number; x2: number; y2: number }

function stubLines(topRow: VNode[], fullRoot: FamilyNode): Seg[] {
  if (topRow.length === 0) return [];
  const out: Seg[] = [];
  const sibLineY = BOX_OFF - STUB; // y offset for AB connector

  // Group by parent id
  const groups = new Map<string, VNode[]>();
  for (const n of topRow) {
    const pid = n.person.parentRels.length > 0 ? n.person.parentRels[0].fromId : n.id;
    let arr = groups.get(pid);
    if (!arr) { arr = []; groups.set(pid, arr); }
    arr.push(n);
  }

  // Identify eldest (rightmost x) per group
  const eldest = new Set<string>();
  for (const sibs of groups.values()) {
    const sorted = [...sibs].sort((a, b) => a.x - b.x);
    eldest.add(sorted[sorted.length - 1].id);
  }

  // AA stubs (vertical)
  for (const n of topRow) {
    const top = eldest.has(n.id) ? sibLineY - STUB : sibLineY;
    out.push({ key: `aa-${n.id}`, x1: n.x, y1: n.y + BOX_OFF, x2: n.x, y2: n.y + top });
  }

  // AB connectors (horizontal)
  const lookup = (id: string): FamilyNode | null => {
    const q: FamilyNode[] = [fullRoot];
    while (q.length) { const c = q.pop()!; if (c.id === id) return c; q.push(...c.children); }
    return null;
  };

  for (const sibs of groups.values()) {
    if (sibs.length === 0) continue;
    const sample = sibs[0].person;
    let total = sibs.length;
    if (sample.parentRels.length > 0) {
      const par = lookup(sample.parentRels[0].fromId);
      if (par) total = par.children.length;
    }
    if (total <= 1) continue;
    const sorted = [...sibs].sort((a, b) => a.x - b.x);
    let lx = sorted[0].x, rx = sorted[sorted.length - 1].x;
    if (total > sibs.length) { lx -= 15; rx += 15; }
    const y = sorted[0].y + sibLineY;
    out.push({ key: `ab-${sorted[0].id}-${sorted[sorted.length - 1].id}`, x1: lx, y1: y, x2: rx, y2: y });
  }

  return out;
}

// ────────────────────────────────────────────────────────────────────
// Utility: walk up FamilyNode tree to find a visible ancestor
// ────────────────────────────────────────────────────────────────────

function findPerson(root: FamilyNode, id: string): FamilyNode | null {
  if (root.id === id) return root;
  for (const c of root.children) { const f = findPerson(c, id); if (f) return f; }
  return null;
}

// ────────────────────────────────────────────────────────────────────
// COMPONENT
// ────────────────────────────────────────────────────────────────────

export const NewFamilyTreeCanvas = forwardRef<NewFamilyTreeCanvasHandle, Props>(
  (props, ref) => {
    const {
      root, tree,
      visibleStartDepth, maxVisibleDepth,
      canShiftUp, canShiftDown,
      onNodeClick, onNodeRightClick, onExpandDepth,
      onShiftUp, onShiftDown, onClearSelection,
    } = props;

    const svgEl = useRef<SVGSVGElement>(null);
    const zoomBeh = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const drawn = useRef<VNode[]>([]);            // currently rendered flat list
    const hlSet = useRef<Set<string>>(new Set());  // highlighted node ids
    const maxRow = useRef(0);
    const vsdRef = useRef(visibleStartDepth);     // up-to-date in callbacks
    vsdRef.current = visibleStartDepth;
    const pendingHL = useRef<string | null>(null);
    const xBounds = useRef<{ lo: number; hi: number } | null>(null);
    const oldPos = useRef<Map<string, [number, number]>>(new Map());
    const tform = useRef<d3.ZoomTransform>(d3.zoomIdentity);
    const busy = useRef(false);                   // true during animation
    const timers = useRef<number[]>([]);
    const shiftDir = useRef(0);                   // -1 up, +1 down, 0 init

    const rootGen = tree?.rootGeneration ?? 1;

    // ── timer housekeeping ───────────────────────────────────────
    const killTimers = useCallback(() => {
      timers.current.forEach(t => clearTimeout(t));
      timers.current = [];
      busy.current = false;
    }, []);

    // ── §5  Generation strip ─────────────────────────────────────

    const paintStrip = useCallback((tf: d3.ZoomTransform) => {
      const svg = svgEl.current;
      if (!svg) return;
      const w = svg.clientWidth;
      const sw = STRIP_W + 1;
      const sx = w - sw;
      const mr = maxRow.current;
      const sd = vsdRef.current;
      const arH = 20;

      const s = d3.select(svg);
      let g = s.select<SVGGElement>('g.strip-group');
      if (g.empty()) g = s.append('g').attr('class', 'strip-group');
      g.attr('transform', `translate(${sx},0)`);

      // cells
      const cells = Array.from({ length: mr + 1 }, (_, i) => {
        const t = zoneTop(i), b = zoneBot(i, mr);
        return {
          i,
          label: `第${rootGen + sd + i}世`,
          y: t * tf.k + tf.y,
          h: (b - t) * tf.k,
          fs: Math.max(9, Math.min(14, 14 * tf.k)),
        };
      });

      // backgrounds
      const rc = g.selectAll<SVGRectElement, typeof cells[0]>('.strip-cell').data(cells, d => String(d.i));
      rc.exit().remove();
      rc.enter().append('rect').attr('class', 'strip-cell')
        .merge(rc)
        .attr('x', 0).attr('width', sw)
        .attr('y', d => d.y).attr('height', d => d.h)
        .attr('fill', d => d.i % 2 === 0 ? 'rgba(255,255,255,0.92)' : 'rgba(220,232,244,0.92)');

      // labels
      const tc = g.selectAll<SVGTextElement, typeof cells[0]>('.strip-label').data(cells, d => String(d.i));
      tc.exit().remove();
      tc.enter().append('text').attr('class', 'strip-label family-strip-text')
        .merge(tc)
        .attr('x', sw / 2).attr('y', d => d.y + d.h / 2)
        .attr('font-size', d => d.fs).text(d => d.label);

      // borders
      g.selectAll('.strip-border-v,.strip-border-h').remove();
      if (cells.length) {
        const top = cells[0].y, bot = cells[cells.length - 1].y + cells[cells.length - 1].h;
        g.append('line').attr('class', 'strip-border-v family-strip-border')
          .attr('x1', 0.5).attr('y1', top).attr('x2', 0.5).attr('y2', bot);
        g.append('line').attr('class', 'strip-border-v family-strip-border')
          .attr('x1', STRIP_W + 0.5).attr('y1', top).attr('x2', STRIP_W + 0.5).attr('y2', bot);
        for (const c of cells)
          g.append('line').attr('class', 'strip-border-h family-strip-border')
            .attr('x1', 0).attr('y1', c.y).attr('x2', sw).attr('y2', c.y);
        g.append('line').attr('class', 'strip-border-h family-strip-border')
          .attr('x1', 0).attr('y1', bot).attr('x2', sw).attr('y2', bot);
      }

      // arrows
      g.selectAll('.strip-arrow').remove();
      if (cells.length) {
        if (canShiftUp) {
          const ay = cells[0].y;
          const ag = g.append('g').attr('class', 'strip-arrow').style('cursor', 'pointer')
            .on('click', () => onShiftUp());
          ag.append('rect').attr('class', 'family-strip-arrow-hit')
            .attr('x', 0).attr('y', ay - arH).attr('width', sw).attr('height', arH);
          ag.append('text').attr('class', 'family-strip-arrow-text')
            .attr('x', sw / 2).attr('y', ay - arH / 2).text('▲');
        }
        if (canShiftDown) {
          const ay = cells[cells.length - 1].y + cells[cells.length - 1].h;
          const ag = g.append('g').attr('class', 'strip-arrow').style('cursor', 'pointer')
            .on('click', () => onShiftDown());
          ag.append('rect').attr('class', 'family-strip-arrow-hit')
            .attr('x', 0).attr('y', ay).attr('width', sw).attr('height', arH);
          ag.append('text').attr('class', 'family-strip-arrow-text')
            .attr('x', sw / 2).attr('y', ay + arH / 2).text('▼');
        }
      }
    }, [rootGen, canShiftUp, canShiftDown, onShiftUp, onShiftDown]);

    // ── §10  Highlighting ────────────────────────────────────────

    const paintHL = useCallback(() => {
      const svg = svgEl.current;
      if (!svg) return;
      const g = d3.select(svg).select<SVGGElement>('g.tree-group');
      const hl = hlSet.current;
      const on = hl.size > 0;

      g.selectAll<SVGGElement, VNode>('.node').transition().duration(250)
        .attr('opacity', d => !on || hl.has(d.id) ? 1 : C.dim);

      g.selectAll<SVGGElement, VNode>('.node').select('.node-border').transition().duration(250)
        .attr('stroke', d => hl.has(d.id) ? C.boxHL : C.boxStroke)
        .attr('stroke-width', d => hl.has(d.id) ? 2.5 : 1.2);

      g.selectAll<SVGGElement, VNode>('.node').selectAll<SVGTSpanElement, unknown>('.name-char')
        .transition().duration(250)
        .attr('fill', function () {
          const nd = (this as SVGElement).closest('.node');
          if (!nd) return C.name;
          const datum = d3.select<SVGGElement, VNode>(nd as SVGGElement).datum();
          return hl.has(datum.id) ? C.nameHL : C.name;
        })
        .attr('font-weight', function () {
          const nd = (this as SVGElement).closest('.node');
          if (!nd) return '500';
          const datum = d3.select<SVGGElement, VNode>(nd as SVGGElement).datum();
          return hl.has(datum.id) ? '700' : '500';
        });

      g.selectAll<SVGPathElement, Edge>('.link').transition().duration(250)
        .attr('stroke', d => hl.has(d.to.id) ? C.wireHL : C.wire)
        .attr('stroke-width', d => hl.has(d.to.id) ? 2 : 1)
        .attr('opacity', d => !on || (hl.has(d.from.id) && hl.has(d.to.id)) ? 1 : C.dim);
    }, []);

    /** Populate hlSet for a branch (ancestors + descendants). */
    const markBranch = useCallback((target: VNode) => {
      hlSet.current.clear();
      // ancestors
      let cur: VNode | null = target;
      while (cur) { hlSet.current.add(cur.id); cur = cur.up; }
      // descendants
      (function desc(v: VNode) { hlSet.current.add(v.id); v.children.forEach(desc); })(target);
    }, []);

    // ── §12  D3 rendering ────────────────────────────────────────

    const paint = useCallback((
      nodes: VNode[], wires: Edge[], anim: boolean,
    ) => {
      const svg = svgEl.current;
      if (!svg) return;
      const sel = d3.select(svg);
      const g = sel.selectAll<SVGGElement, unknown>('g.tree-group')
        .data([null]).join('g').attr('class', 'tree-group');

      const prev = oldPos.current;
      const next = new Map<string, [number, number]>();
      nodes.forEach(n => next.set(n.id, [n.x, n.y]));

      // kill in-flight transitions
      g.selectAll('.node,.link,.stub-line').interrupt('m').interrupt('f');

      // ── links ────────────────────────────────────────────────
      const lk = g.selectAll<SVGPathElement, Edge>('.link')
        .data(wires, d => wireKey(d));
      lk.exit().remove();
      const lkE = lk.enter().append('path').attr('class', 'link')
        .attr('fill', 'none').attr('stroke', C.wire)
        .attr('stroke-width', 1).attr('stroke-linecap', 'round')
        .attr('opacity', anim ? 0 : 1)
        .attr('d', d => wirePath(d));
      lk.merge(lkE).transition('m').duration(TRANS_MS)
        .attr('d', d => wirePath(d)).attr('opacity', 1);

      // ── nodes ────────────────────────────────────────────────
      const nd = g.selectAll<SVGGElement, VNode>('.node')
        .data(nodes, d => d.id);
      nd.exit().remove();
      const ndE = nd.enter().append('g').attr('class', 'node')
        .style('cursor', 'pointer')
        .style('opacity', anim ? 0 : 1)
        .attr('transform', d => {
          const p = prev.get(d.id);
          return p ? `translate(${p[0]},${p[1]})` : `translate(${d.x},${d.y})`;
        });
      ndE.each(function (d) { stampNode(d3.select(this), d); });

      // update: only strip expand-stub when children revealed
      nd.each(function (d) {
        if (!d.leaf) d3.select(this).selectAll('.expand-stub').remove();
      });

      const merged = nd.merge(ndE);
      merged.transition('m').duration(TRANS_MS)
        .attr('transform', d => `translate(${d.x},${d.y})`);

      if (anim) {
        ndE.transition('f').duration(TRANS_MS).style('opacity', 1);
        lkE.transition('f').duration(TRANS_MS).attr('opacity', 1);
      }

      // events
      merged.on('click', (ev: MouseEvent, d) => {
        ev.stopPropagation();
        markBranch(d); paintHL(); onNodeClick(d.person);
      });
      merged.on('contextmenu', (ev: MouseEvent, d) => {
        ev.preventDefault(); ev.stopPropagation();
        onNodeRightClick(d.person, ev.pageX, ev.pageY);
      });
      merged.on('mouseenter', function () {
        d3.select(this).select('.node-border').transition().duration(120).attr('stroke-width', 2.2);
      });
      merged.on('mouseleave', function (_, d) {
        d3.select(this).select('.node-border').transition().duration(200)
          .attr('stroke-width', hlSet.current.has(d.id) ? 2.5 : 1.2);
      });

      // ── stubs ────────────────────────────────────────────────
      const topNodes = nodes.filter(n => n.row === 0);
      const segs = vsdRef.current > 0 && root ? stubLines(topNodes, root) : [];
      const sb = g.selectAll<SVGLineElement, Seg>('.stub-line').data(segs, d => d.key);
      sb.exit().remove();
      const sbE = sb.enter().append('line').attr('class', 'stub-line')
        .attr('stroke', C.wire).attr('stroke-width', 1).attr('opacity', anim ? 0 : 1);
      sb.merge(sbE).transition('m').duration(TRANS_MS)
        .attr('x1', d => d.x1).attr('y1', d => d.y1)
        .attr('x2', d => d.x2).attr('y2', d => d.y2).attr('opacity', 1);

      oldPos.current = next;
      drawn.current = nodes;
    }, [markBranch, paintHL, onNodeClick, onNodeRightClick, root]);

    /** Build the inner DOM for one node <g>. */
    function stampNode(el: d3.Selection<SVGGElement, VNode, null, undefined>, v: VNode) {
      const p = v.person;
      const hs = p.spouses.length > 0;
      const bh = boxH(p), bw = boxW(p);

      el.append('rect').attr('class', 'node-border')
        .attr('x', -bw / 2).attr('y', BOX_OFF)
        .attr('width', bw).attr('height', bh)
        .attr('rx', 6).attr('ry', 6)
        .attr('fill', C.boxBg).attr('stroke', C.boxStroke).attr('stroke-width', 1.2);

      const nx = hs ? -10 : 0;
      const nt = el.append('text').attr('class', 'name-text').attr('y', BOX_OFF + 14);
      for (const ch of p.name)
        nt.append('tspan').attr('class', 'name-char')
          .attr('x', nx).attr('dy', '1.25em').attr('text-anchor', 'middle')
          .attr('font-size', '14px')
          .attr('font-family', '"Microsoft YaHei","PingFang SC",sans-serif')
          .attr('fill', C.name).attr('font-weight', '500').text(ch);

      if (hs) {
        const st = el.append('text').attr('y', BOX_OFF + 14);
        for (const ch of p.spouses[0].name)
          st.append('tspan').attr('x', 10).attr('dy', '1.25em').attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('font-family', '"Microsoft YaHei","PingFang SC",sans-serif')
            .attr('fill', C.spouse).text(ch);
      }

      el.append('circle')
        .attr('cx', -(bw / 2) + 5).attr('cy', BOX_OFF + 6).attr('r', 3)
        .attr('fill', p.gender === 'female' ? C.female : C.male);

      if (p.isAlive === false)
        el.append('text').attr('x', bw / 2 - 5).attr('y', BOX_OFF + 9)
          .attr('text-anchor', 'middle').attr('font-size', '8px').attr('fill', C.stub).text('†');

      if (v.leaf) {
        const bb = BOX_OFF + bh;
        el.append('line').attr('class', 'expand-stub')
          .attr('x1', 0).attr('y1', bb).attr('x2', 0).attr('y2', bb + STUB)
          .attr('stroke', C.wire).attr('stroke-width', 1);
        el.append('text').attr('class', 'expand-stub')
          .attr('x', 0).attr('y', bb + STUB + 10)
          .attr('text-anchor', 'middle').attr('font-size', '10px')
          .attr('fill', C.stub).attr('cursor', 'pointer').text('▼')
          .on('click', (ev: MouseEvent) => { ev.stopPropagation(); onExpandDepth(v.id); });
      }
    }

    // ── main draw orchestrator (§4, §6, §7) ──────────────────

    const draw = useCallback((animate: boolean) => {
      if (!svgEl.current || !root) return;
      killTimers();
      hlSet.current.clear();
      const ct = tform.current;

      // 1) build full target tree
      const targetRoots = sliceTree(root, visibleStartDepth, maxVisibleDepth);
      if (targetRoots.length === 0) return;
      layoutForest(targetRoots);
      const allTarget = flatten(targetRoots);
      const allEdges = edges(targetRoots);
      maxRow.current = allTarget.length ? Math.max(...allTarget.map(n => n.row)) : 0;
      if (allTarget.length) {
        xBounds.current = {
          lo: Math.min(...allTarget.map(n => n.x)),
          hi: Math.max(...allTarget.map(n => n.x)),
        };
      }

      // §5.4 — update strip labels immediately
      paintStrip(ct);

      const prevIds = new Set(drawn.current.map(n => n.id));
      const shouldAnimate = animate && shiftDir.current !== 0 && drawn.current.length > 0;

      if (!shouldAnimate) {
        paint(allTarget, allEdges, animate);
        paintHL();
        return;
      }

      // ── animated path ────────────────────────────────────────
      busy.current = true;
      const fullMaxX = Math.max(...allTarget.map(n => n.x));

      // §6.2 step 4 — reposition view so rightmost sits near right edge
      if (svgEl.current && zoomBeh.current) {
        const w = svgEl.current.clientWidth;
        const k = ct.k;
        const pad = 30 + STRIP_W;
        const aligned = d3.zoomIdentity.translate(w - pad - fullMaxX * k, ct.y).scale(k);
        tform.current = aligned;
        d3.select(svgEl.current).call(zoomBeh.current.transform, aligned);
      }

      // pre-compute frames
      type Frame = { nodes: VNode[]; wires: Edge[] };
      const frames: Frame[] = [];

      const revealed = new Set<string>(
        shiftDir.current === -1 ? [] : prevIds, // §7: up → full redraw; §6: down → keep existing
      );

      const queue = (shiftDir.current === -1 ? allTarget : allTarget.filter(n => !prevIds.has(n.id)))
        .sort((a, b) => (b.x - a.x) || (b.row - a.row))
        .map(n => n.id);

      const snap = (ids: Set<string>): Frame => {
        const r = sliceTreePartial(root, visibleStartDepth, maxVisibleDepth, ids);
        layoutForest(r);
        shiftRight(r, fullMaxX);
        return { nodes: flatten(r), wires: edges(r) };
      };

      frames.push(snap(revealed));
      for (const nid of queue) { revealed.add(nid); frames.push(snap(revealed)); }

      // final bounds
      const last = frames[frames.length - 1];
      if (last.nodes.length) {
        xBounds.current = {
          lo: Math.min(...last.nodes.map(n => n.x)),
          hi: Math.max(...last.nodes.map(n => n.x)),
        };
      }

      // play
      paint(frames[0].nodes, frames[0].wires, true);
      for (let i = 1; i < frames.length; i++) {
        const fr = frames[i];
        timers.current.push(window.setTimeout(() => paint(fr.nodes, fr.wires, true), i * STEP_MS));
      }
      timers.current.push(window.setTimeout(() => {
        busy.current = false;
        paintHL();
        paintStrip(tform.current);
        if (svgEl.current && zoomBeh.current)
          d3.select(svgEl.current).call(zoomBeh.current.transform, tform.current);
      }, frames.length * STEP_MS));
    }, [killTimers, maxVisibleDepth, paint, paintHL, paintStrip, root, visibleStartDepth]);

    // ── imperative handle (§11.3) ────────────────────────────

    useImperativeHandle(ref, () => ({
      centerOnPerson(personId: string) {
        if (!svgEl.current || !zoomBeh.current) return;
        let target = drawn.current.find(n => n.id === personId);
        if (!target && root) {
          // walk up until we find someone in the layout
          const climb = (id: string): VNode | undefined => {
            const p = findPerson(root, id);
            if (!p || p.parentRels.length === 0) return undefined;
            const pid = p.parentRels[0].fromId;
            return drawn.current.find(n => n.id === pid) ?? climb(pid);
          };
          target = climb(personId);
        }
        if (!target) return;
        const w = svgEl.current.clientWidth, h = svgEl.current.clientHeight;
        const k = d3.zoomTransform(svgEl.current).k;
        const t2 = d3.zoomIdentity.translate(w / 2 - target.x * k, h / 3 - target.y * k).scale(k);
        d3.select(svgEl.current).transition().duration(600).call(zoomBeh.current!.transform, t2);
        markBranch(target);
        paintHL();
      },
      setPendingHighlight(id) { pendingHL.current = id; },
      setShiftDirection(d) { shiftDir.current = d; },
    }));

    // ── §9  Zoom setup (once per root) ───────────────────────

    useEffect(() => {
      const svg = svgEl.current;
      if (!svg || !root) return;
      killTimers();
      oldPos.current = new Map();
      const s = d3.select(svg);
      s.on('contextmenu', (e: Event) => e.preventDefault());

      const zm = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 3])
        .on('zoom', ev => {
          const t = ev.transform;
          let cx = t.x;
          const cy = tform.current.y; // §9.1 vertical locked

          if (!busy.current) {
            const w = svg.clientWidth;
            const b = xBounds.current;
            if (b) {
              const lo = -b.hi * t.k + w - 30 - STRIP_W;
              const hi2 = -b.lo * t.k + 30;
              if (lo < hi2) cx = Math.max(lo, Math.min(hi2, cx));
              else cx = (w - STRIP_W) / 2 - (b.lo + b.hi) / 2 * t.k;
            }
          }

          const ct = d3.zoomIdentity.translate(cx, cy).scale(t.k);
          tform.current = ct;
          s.select<SVGGElement>('g.tree-group').attr('transform', ct.toString());
          if (!busy.current) paintStrip(ct);
        });

      zoomBeh.current = zm;
      s.call(zm);
      s.on('click.clear', () => { hlSet.current.clear(); paintHL(); onClearSelection(); });

      // §4.1 initial draw
      shiftDir.current = 0;
      draw(false);

      const all = drawn.current;
      if (all.length) {
        const mx = Math.max(...all.map(n => n.x));
        const w = svg.clientWidth;
        const initT = d3.zoomIdentity.translate(w - 30 - STRIP_W - mx, 40 + STUB);
        tform.current = initT;
        s.call(zm.transform, initT);
        paintStrip(initT);
      }

      return () => { s.on('.zoom', null); s.on('click.clear', null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [root]);

    // ── redraw on depth change ───────────────────────────────

    useEffect(() => {
      if (!svgEl.current || !root || !zoomBeh.current) return;
      draw(true);
      if (busy.current) return;

      const pid = pendingHL.current;
      if (!pid) { paintHL(); return; }
      pendingHL.current = null;
      requestAnimationFrame(() => {
        let target = drawn.current.find(n => n.id === pid);
        if (!target && root) {
          const climb = (id: string): VNode | undefined => {
            const p = findPerson(root, id);
            if (!p || p.parentRels.length === 0) return undefined;
            const pid2 = p.parentRels[0].fromId;
            return drawn.current.find(n => n.id === pid2) ?? climb(pid2);
          };
          target = climb(pid);
        }
        if (target) { markBranch(target); paintHL(); }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draw]);

    return (
      <div className="family-tree-container">
        <svg ref={svgEl} className="family-tree-canvas" />
      </div>
    );
  },
);
