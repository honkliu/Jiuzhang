// Shared UI primitives, implementing the design tokens from docs/03-ui-spec.md §0.
import type { T } from '../text';

export const TOKENS = {
  bg: '#0d0b08',
  panel: '#2a2016',
  panelHi: '#3d2f20',
  panelLo: '#1a130c',
  border: '#c8a050',
  borderDim: '#7a6030',
  text: '#f0e0c0',
  textDim: '#a89070',
  textMute: '#6a5a40',
  accent: '#ffd040',
  danger: '#e05040',
  ok: '#60c060',
  wood: '#8a5a2b',
  ore: '#6a6a72',
  mercury: '#b8b8c8',
  sulfur: '#d8c040',
  crystal: '#60c0e0',
  gems: '#40c060',
  gold: '#e8c040'
} as const;

export const FONT = 'Georgia, "Times New Roman", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", serif';

/** Create an element with attributes and children. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | undefined> = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'text') node.textContent = String(v);
    else if (k.startsWith('on') && typeof v === 'string') {
      node.setAttribute(k, v);
    } else {
      node.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

/** Absolutely-positioned box at exact logical coordinates. */
export function box(
  x: number, y: number, w: number, h: number,
  cls = '', ...children: (Node | string | null | undefined)[]
): HTMLDivElement {
  const d = el('div', { class: 'abs ' + cls }, ...children);
  d.style.left = x + 'px';
  d.style.top = y + 'px';
  d.style.width = w + 'px';
  d.style.height = h + 'px';
  return d;
}

export function panel(
  x: number, y: number, w: number, h: number,
  ...children: (Node | string | null | undefined)[]
): HTMLDivElement {
  return box(x, y, w, h, 'panel', ...children);
}

export function text(
  content: string, x: number, y: number, w: number,
  opts: { size?: number; bold?: boolean; color?: string; align?: string; cls?: string } = {}
): HTMLDivElement {
  const d = el('div', { class: 'abs ' + (opts.cls || ''), text: content });
  d.style.left = x + 'px';
  d.style.top = y + 'px';
  d.style.width = w + 'px';
  d.style.fontSize = (opts.size ?? 14) + 'px';
  d.style.fontWeight = opts.bold ? 'bold' : 'normal';
  d.style.color = opts.color ?? TOKENS.text;
  d.style.textAlign = opts.align ?? 'left';
  return d;
}

export function button(
  label: string, x: number, y: number, w: number, h: number,
  onClick: () => void,
  opts: { disabled?: boolean; title?: string; size?: number } = {}
): HTMLButtonElement {
  const b = el('button', { class: 'btn', text: label });
  b.style.left = x + 'px';
  b.style.top = y + 'px';
  b.style.width = w + 'px';
  b.style.height = h + 'px';
  b.style.fontSize = (opts.size ?? 14) + 'px';
  if (opts.disabled) b.disabled = true;
  if (opts.title) b.title = opts.title;
  b.addEventListener('click', onClick);
  return b;
}

export function input(
  x: number, y: number, w: number, h: number,
  opts: { type?: string; value?: string; placeholder?: string; maxLength?: number; id?: string } = {}
): HTMLInputElement {
  const i = el('input', { class: 'inp', type: opts.type ?? 'text' });
  i.style.left = x + 'px';
  i.style.top = y + 'px';
  i.style.width = w + 'px';
  i.style.height = h + 'px';
  if (opts.value !== undefined) i.value = opts.value;
  if (opts.placeholder) i.placeholder = opts.placeholder;
  if (opts.maxLength) i.maxLength = opts.maxLength;
  if (opts.id) i.id = opts.id;
  return i;
}

export function textarea(
  x: number, y: number, w: number, h: number,
  opts: { value?: string; maxLength?: number; placeholder?: string } = {}
): HTMLTextAreaElement {
  const t = el('textarea', { class: 'inp' });
  t.style.left = x + 'px';
  t.style.top = y + 'px';
  t.style.width = w + 'px';
  t.style.height = h + 'px';
  if (opts.value !== undefined) t.value = opts.value;
  if (opts.placeholder) t.placeholder = opts.placeholder;
  if (opts.maxLength) t.maxLength = opts.maxLength;
  return t;
}

export function select(
  x: number, y: number, w: number, h: number,
  options: { value: string; label: string }[], selected: string
): HTMLSelectElement {
  const s = el('select', { class: 'inp' });
  s.style.left = x + 'px';
  s.style.top = y + 'px';
  s.style.width = w + 'px';
  s.style.height = h + 'px';
  for (const o of options) {
    const opt = el('option', { value: o.value, text: o.label });
    if (o.value === selected) opt.selected = true;
    s.append(opt);
  }
  return s;
}

// ---------------------------------------------------------------- toast
let toastTimer: number | null = null;

export function toast(message: string): void {
  let node = document.getElementById('toast');
  if (!node) {
    node = el('div', { id: 'toast' });
    document.getElementById('app')!.append(node);
  }
  node.textContent = message;
  node.classList.add('show');
  if (toastTimer !== null) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => node!.classList.remove('show'), 2800);
}

// ---------------------------------------------------------------- modal
export interface ModalHandle { close: () => void; }

export function modal(
  w: number, h: number,
  build: (close: () => void) => (Node | string | null | undefined)[],
  opts: { destructive?: boolean } = {}
): ModalHandle {
  const backdrop = el('div', { class: 'backdrop' });
  const p = el('div', { class: 'modal panel' });
  p.style.width = w + 'px';
  p.style.height = h + 'px';

  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  for (const c of build(close)) {
    if (c === null || c === undefined) continue;
    p.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }

  backdrop.append(p);
  if (!opts.destructive) {
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  }
  document.addEventListener('keydown', onKey);
  document.getElementById('app')!.append(backdrop);

  // focus the first input, else the first button
  const first = p.querySelector('input, textarea, select, button') as HTMLElement | null;
  if (first) first.focus();

  return { close };
}

// ---------------------------------------------------------------- misc
export function relativeTime(t: T, iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  const ago = (n: number, unit: string) => n === 1 ? t(`homm.ui.time.${unit}`) : t(`homm.ui.time.${unit}s`).replace('{n}', String(n));
  if (secs < 60) return t('homm.ui.time.justNow');
  const mins = Math.floor(secs / 60);
  if (mins < 60) return ago(mins, 'minute');
  const hours = Math.floor(mins / 60);
  if (hours < 24) return ago(hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days < 30) return ago(days, 'day');
  return ago(Math.floor(days / 30), 'month');
}

export function clear(root: HTMLElement): void {
  while (root.firstChild) root.removeChild(root.firstChild);
}