import { translations } from '@/i18n/LanguageContext';
import { ApiError } from './api';

/**
 * Display-time translation helpers for the game. All strings live in Kankan's LanguageContext
 * (`homm.*` keys); these helpers only pick keys and delegate to the `t` from `useLanguage()`.
 * The server keeps speaking English, so its messages and content names are mapped back to keys here.
 */
export type T = (key: string) => string;
type Vars = Record<string, string | number>;

/** `{var}` interpolation, as in Kankan's `t('key').replace('{name}', v)`. */
export function fmt(s: string, vars: Vars): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Translate a key and interpolate. */
export function tf(t: T, key: string, vars: Vars): string {
  return fmt(t(key), vars);
}

/** A content name by kind and key (`homm.<kind>.<key>`), falling back to the given English text or the key. */
export function nm(t: T, kind: string, key: string | number | null | undefined, fallback?: string): string {
  if (key === null || key === undefined || key === '') return fallback ?? '';
  const k = `homm.${kind}.${key}`;
  const v = t(k);
  return v !== k ? v : fallback !== undefined ? serverText(t, fallback) : String(key);
}

/** A town building name: faction-specific first, then the shared tree, then the server's English name. */
export function buildingText(t: T, faction: string, key: string, fallback?: string): string {
  const own = `homm.building.${faction}.${key}`;
  const v = t(own);
  if (v !== own) return v;
  return nm(t, 'building', key, fallback);
}

// ---------------------------------------------------------------- server text
let index: Map<string, string[]> | null = null;
let lowerIndex: Map<string, string[]> | null = null;
let patterns: { key: string; re: RegExp; names: string[] }[] | null = null;

function build() {
  index = new Map();
  lowerIndex = new Map();
  patterns = [];
  for (const [key, en] of Object.entries(translations.en)) {
    if (!key.startsWith('homm.') || key.startsWith('homm.ui.')) continue;
    if (key.startsWith('homm.srvt.')) {
      const names: string[] = [];
      const body = en.split(/(\{\w+\})/).map((part) => {
        const m = /^\{(\w+)\}$/.exec(part);
        if (!m) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        names.push(m[1]);
        return /^n\d*$/.test(m[1]) ? '(-?[\\d,]+)' : '(.+?)';
      }).join('');
      patterns.push({ key, re: new RegExp('^' + body + '$'), names });
      continue;
    }
    for (const [map, k] of [[index, en], [lowerIndex, en.toLowerCase()]] as const) {
      const list = map.get(k);
      if (list) list.push(key); else map.set(k, [key]);
    }
  }
  // most specific templates (most literal text) first
  patterns.sort((a, b) => b.re.source.replace(/\(.*?\)/g, '').length - a.re.source.replace(/\(.*?\)/g, '').length);
}

function lookup(s: string, kind?: string): string | undefined {
  if (!index) build();
  const list = index!.get(s) ?? lowerIndex!.get(s.toLowerCase());
  if (!list) return undefined;
  const prefix = kind ? `homm.${kind.replace(/\d+$/, '')}.` : '';
  return (prefix && list.find((k) => k.startsWith(prefix))) || list[0];
}

/**
 * Translate English text produced by the server (errors, notices, event texts, content names).
 * Exact messages and names map to their keys; messages with embedded values match the `homm.srvt.*`
 * templates and have their names translated too. Unknown text is shown as-is.
 */
export function serverText(t: T, s: string | null | undefined): string {
  if (!s) return s ?? '';
  // client-side messages are stored as their `homm.*` key and translated when shown
  if (s.startsWith('homm.') && s in translations.en) return t(s);
  const key = lookup(s);
  if (key) return t(key);
  for (const p of patterns!) {
    const m = p.re.exec(s);
    if (!m) continue;
    const vars: Vars = {};
    p.names.forEach((name, i) => {
      const v = m[i + 1];
      if (/^n\d*$/.test(name)) { vars[name] = v; return; }
      const k = lookup(v, name);
      vars[name] = k ? t(k) : v;
    });
    return tf(t, p.key, vars);
  }
  return s;
}

/** The message of a failed request: the server's error (translated), else a generic fallback key. */
export function errText(t: T, e: unknown, fallbackKey: string): string {
  return e instanceof ApiError ? serverText(t, e.message) : t(fallbackKey);
}

/** Like errText, but untranslated (the server's English or the fallback key) for storing in state; show it with serverText. */
export function errRaw(e: unknown, fallbackKey: string): string {
  return e instanceof ApiError ? e.message : fallbackKey;
}
