import { createElement, useEffect, useState, type CSSProperties } from 'react';
import { HOMM_API } from '../paths';

// Original HoMM3 art, decoded at runtime by the server from the player's own game files
// (served to loopback clients only). When unavailable, views fall back to built-in art.

export interface Sheet {
  img: HTMLImageElement;
  url: string;
  w: number;
  h: number;
  cols: number;
  count: number;
  groups: Record<string, number[]>;
}

let status: Promise<boolean> | null = null;
let statusValue: boolean | null = null;

export function h3Status(): Promise<boolean> {
  if (!status) {
    status = fetch(`${HOMM_API}/h3/status`)
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((j: { available?: boolean }) => !!j.available)
      .catch(() => false)
      .then((v) => { statusValue = v; return v; });
  }
  return status;
}

/** null while probing, then true/false. */
export function useH3(): boolean | null {
  const [v, setV] = useState<boolean | null>(statusValue);
  useEffect(() => {
    let live = true;
    h3Status().then((x) => { if (live) setV(x); });
    return () => { live = false; };
  }, []);
  return v;
}

export const pcxUrl = (name: string) => `${HOMM_API}/h3/pcx/${encodeURIComponent(name)}`;

const sheets = new Map<string, Sheet | null>();
const pending = new Map<string, Promise<Sheet | null>>();
const listeners = new Set<() => void>();

export function loadDef(name: string): Promise<Sheet | null> {
  const key = name.toLowerCase();
  if (sheets.has(key)) return Promise.resolve(sheets.get(key)!);
  let p = pending.get(key);
  if (!p) {
    p = (async () => {
      try {
        const r = await fetch(`${HOMM_API}/h3/def/${encodeURIComponent(name)}.json`);
        if (!r.ok) throw new Error();
        const j = await r.json();
        const url = `${HOMM_API}/h3/def/${encodeURIComponent(name)}.png`;
        const img = new Image();
        img.src = url;
        await img.decode();
        const s: Sheet = { img, url, w: j.w, h: j.h, cols: j.cols, count: j.count, groups: j.groups ?? {} };
        sheets.set(key, s);
        return s;
      } catch {
        sheets.set(key, null);
        return null;
      } finally {
        pending.delete(key);
        listeners.forEach((l) => l());
      }
    })();
    pending.set(key, p);
  }
  return p;
}

/** Returns the sheet if already loaded (null if missing); otherwise starts loading and returns undefined. */
export function getDef(name: string): Sheet | null | undefined {
  const key = name.toLowerCase();
  if (sheets.has(key)) return sheets.get(key);
  loadDef(name);
  return undefined;
}

export function onAssetLoaded(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useDef(name: string | null | undefined): Sheet | null | undefined {
  const [, force] = useState(0);
  const s = name ? getDef(name) : null;
  useEffect(() => {
    if (!name || s !== undefined) return;
    let live = true;
    loadDef(name).then(() => { if (live) force((n) => n + 1); });
    return () => { live = false; };
  }, [name, s]);
  return s;
}

/** Resolve a frame number within a group (looping by tick). */
export function groupFrame(s: Sheet, group: number, tick: number): number {
  const g = s.groups[String(group)];
  if (!g || g.length === 0) return 0;
  return g[tick % g.length];
}

export function drawFrame(ctx: CanvasRenderingContext2D, s: Sheet, frame: number, dx: number, dy: number, mirror = false, flipY = false) {
  const f = Math.max(0, Math.min(s.count - 1, frame));
  const sx = (f % s.cols) * s.w, sy = Math.floor(f / s.cols) * s.h;
  if (mirror || flipY) {
    ctx.save();
    ctx.translate(dx + (mirror ? s.w : 0), dy + (flipY ? s.h : 0));
    ctx.scale(mirror ? -1 : 1, flipY ? -1 : 1);
    ctx.drawImage(s.img, sx, sy, s.w, s.h, 0, 0, s.w, s.h);
    ctx.restore();
  } else {
    ctx.drawImage(s.img, sx, sy, s.w, s.h, dx, dy, s.w, s.h);
  }
}

const pixels = new Map<string, ImageData>();

/** Alpha (0-255) of a sheet frame at a frame-local pixel; 0 outside the frame. */
export function alphaAt(s: Sheet, frame: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= s.w || y >= s.h) return 0;
  let data = pixels.get(s.url);
  if (!data) {
    const c = document.createElement('canvas');
    c.width = s.img.naturalWidth; c.height = s.img.naturalHeight;
    const cx = c.getContext('2d', { willReadFrequently: true })!;
    cx.drawImage(s.img, 0, 0);
    data = cx.getImageData(0, 0, c.width, c.height);
    pixels.set(s.url, data);
  }
  const f = Math.max(0, Math.min(s.count - 1, frame));
  const px = (f % s.cols) * s.w + Math.floor(x), py = Math.floor(f / s.cols) * s.h + Math.floor(y);
  return data.data[(py * data.width + px) * 4 + 3];
}

/** A single DEF frame as a positioned element. */
export function DefImg(props: { name: string; frame?: number; x?: number; y?: number; style?: CSSProperties; title?: string; className?: string }) {
  const s = useDef(props.name);
  if (!s) return null;
  const f = Math.max(0, Math.min(s.count - 1, props.frame ?? 0));
  return createElement('div', {
    className: props.className,
    title: props.title,
    style: {
      position: props.x !== undefined ? 'absolute' : 'relative',
      left: props.x, top: props.y,
      width: s.w, height: s.h,
      backgroundImage: `url(${s.url})`,
      backgroundPosition: `-${(f % s.cols) * s.w}px -${Math.floor(f / s.cols) * s.h}px`,
      backgroundRepeat: 'no-repeat',
      pointerEvents: 'none',
      ...props.style
    }
  });
}

/** A PCX bitmap as a positioned <img>. */
export function Pcx(props: { name: string; x: number; y: number; w?: number; h?: number; style?: CSSProperties; alt?: string }) {
  return createElement('img', {
    src: pcxUrl(props.name),
    alt: props.alt ?? '',
    draggable: false,
    style: { position: 'absolute', left: props.x, top: props.y, width: props.w, height: props.h, pointerEvents: 'none', ...props.style }
  });
}

/**
 * Full-screen backdrop for a town window. Uses the original PCX when the player has
 * HoMM3 data installed, and a plain panel otherwise so the controls stay readable.
 */
export function ScreenBackdrop(props: { name: string; w: number; h: number; alt?: string }) {
  const h3 = useH3();
  if (h3) return Pcx({ name: props.name, x: 0, y: 0, w: props.w, h: props.h, alt: props.alt });
  return createElement('div', {
    className: 'panel',
    style: { position: 'absolute', left: 0, top: 0, width: props.w, height: props.h, borderRadius: 0 }
  });
}
