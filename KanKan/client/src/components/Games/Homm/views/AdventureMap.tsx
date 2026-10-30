import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useGameNavigate } from '../useGameNavigate';
import { api, ApiError } from '../api';
import { authService } from '@/services/auth.service';
import type { MapData, GameDetail, HeroDetail, MapTile, WorldView, AdventureNotice, CreatureDef, SpellDef, VisionTarget } from '../types';
import { Btn, Loading, Txt } from '../ui/Layout';
import { DefButton, DialogBox } from './TownWindows';
import { HeroExchange, HeroLevel, NativeMessage } from './HeroWindows';
import { Spellbook } from './Spellbook';
import { socket } from '../ws';
import { FACTION_COLOR, FACTION_SEAT, HeroPortrait, RES_ORDER, ResIcon, heroClassText, resLabel } from '../ui/homm';
import { useLanguage } from '@/i18n/LanguageContext';
import { errRaw, nm, serverText, type T } from '../text';
import { localPoint } from '../stageView';
import { DefImg, Pcx, pcxUrl, drawFrame, getDef, groupFrame, onAssetLoaded, useDef, useH3, type Sheet } from '../h3/assets';
import {
  MINE_DEF, MOUNTAIN_DEFS, OBJECT_DEF, RESOURCE_DEF, RES_FRAME, ROCK_DEFS, TERRAIN_DEF, TOWN_MAP_DEF, TREE_DEFS, artifactSeed, borderKind, edgeFrames, objectAnchorX,
  artifactDef, creaturePortraitFrame, flagDef, heroMapDef, heroPortrait, monsterDef, townListFrame
} from '../h3/catalog';

// Adventure screen on the 1920x1080 stage: the original 200x575 sidebar and 800x25 resource bar are
// scaled by HUD_K; the map takes the rest at 2x pixel art (64px tiles).
const TILE = 32;
const ZOOM = 2;
const HUD_K = 1.8;
const SIDE_X = 1920 - 200 * HUD_K;
const BAR_Y = 575 * HUD_K;
const MAP_X = 12;
const MAP_Y = 12;
const VIEW_TX = 24;
const VIEW_TY = 15;
const MAP_W = VIEW_TX * TILE;
const MAP_H = VIEW_TY * TILE;

const TERRAIN_COLOR: Record<string, string> = {
  dirt: '#8a6a44', sand: '#c8b070', grass: '#5a8a3a', snow: '#c8d0d8',
  swamp: '#4a6a4a', rough: '#7a6a50', subterranean: '#4a3a5a',
  lava: '#6a2a1a', water: '#2a4a8a', rock: '#3a3a3a'
};

// Minimap colours of the original game.
const MINIMAP_COLOR: Record<string, string> = {
  dirt: '#523808', sand: '#dece8c', grass: '#004000', snow: '#b5c7c6', swamp: '#4a846b',
  rough: '#846b31', subterranean: '#845a29', lava: '#4a4a4a', water: '#08528c', rock: '#000000'
};

// Sidebar buttons at their original positions; each original control maps to a social-game feature.
// `label` is the action key; the shown text is homm.ui.adv.btn.<k> and its tooltip homm.ui.adv.tip.<k>.
const BUTTONS: { label: string; k: string; def: string; x: number; y: number; w: number }[] = [
  { label: 'Social', k: 'social', def: 'IAM002', x: 679, y: 196, w: 32 },
  { label: 'Projects', k: 'projects', def: 'IAM010', x: 711, y: 196, w: 32 },
  { label: 'Obelisk', k: 'obelisk', def: 'IAM004', x: 679, y: 228, w: 32 },
  { label: 'Sleep', k: 'sleep', def: 'IAM005', x: 711, y: 228, w: 32 },
  { label: 'Hero', k: 'hero', def: 'IAM006', x: 679, y: 260, w: 32 },
  { label: 'Spells', k: 'spells', def: 'IAM007', x: 711, y: 260, w: 32 },
  { label: 'Town', k: 'town', def: 'IAM008', x: 679, y: 292, w: 32 },
  { label: 'Menu', k: 'menu', def: 'IAM009', x: 711, y: 292, w: 32 },
  { label: 'Move Hero', k: 'moveHero', def: 'IAM000', x: 679, y: 324, w: 64 },
  { label: 'End Turn', k: 'endTurn', def: 'IAM001', x: 679, y: 356, w: 64 }
];

const RESBAR_X: Record<string, number> = { wood: 37, mercury: 121, ore: 205, sulfur: 289, crystal: 373, gems: 457, gold: 541 };

function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function clampCam(map: MapData, x: number, y: number) {
  return {
    x: Math.max(0, Math.min(map.width - VIEW_TX, x)),
    y: Math.max(0, Math.min(map.height - VIEW_TY, y))
  };
}
const centerCam = (map: MapData, x: number, y: number) => clampCam(map, x - Math.floor(VIEW_TX / 2), y - Math.floor(VIEW_TY / 2));

type Facing = { group: number; mirror: boolean };
function facingFor(dx: number, dy: number): Facing {
  const g = dy < 0 ? (dx === 0 ? 0 : 1) : dy > 0 ? (dx === 0 ? 4 : 3) : 2;
  return { group: g, mirror: dx < 0 };
}

/** A hero sliding between tiles: fractional tile position, walking frame, path segment. */
type Glide = { id: string; x: number; y: number; frame: number; seg: number };
const STEP_MS = 60;
const FRAMES_PER_TILE = 4;

/** Edge-scrolls the camera just enough to keep (x, y) three tiles inside the view, pixel-aligned. */
function followCam(map: MapData, c: { x: number; y: number }, x: number, y: number) {
  const m = 3;
  let nx = c.x, ny = c.y;
  if (x - nx < m) nx = x - m; else if (x - nx > VIEW_TX - 1 - m) nx = x - (VIEW_TX - 1 - m);
  if (y - ny < m) ny = y - m; else if (y - ny > VIEW_TY - 1 - m) ny = y - (VIEW_TY - 1 - m);
  const r = clampCam(map, Math.round(nx * TILE) / TILE, Math.round(ny * TILE) / TILE);
  return r.x === c.x && r.y === c.y ? c : r;
}

/**
 * The tile a click on (x, y) means. Buildings cover several tiles but are entered at one
 * (the server links covered "block" tiles to it); the castle art above the footprint also counts.
 */
function targetTile(map: MapData, x: number, y: number): { x: number; y: number } {
  const t = map.tiles[y * map.width + x];
  if (t?.objectKind === 'block' && t.objectData) {
    const [ax, ay] = t.objectData.split(',').map(Number);
    if (Number.isFinite(ax) && Number.isFinite(ay)) return { x: ax, y: ay };
  }
  if (t && (t.passable || t.fog === 0)) {
    // town sprites are 6×6 tiles anchored at the gate (3 tiles in from the left, bottom row)
    const town = map.towns.find((tw) => x >= tw.x - 2 && x <= tw.x + 2 && y >= tw.y - 4 && y <= tw.y - 3);
    if (town) return { x: town.x, y: town.y };
  }
  return { x, y };
}

// HoMM3 path arrows (ADAG.def), from VCMI's MapRendererPath: indexed by the direction the path
// enters a tile and the direction it leaves it, each as (dx+1) + 3·(dy+1); frame 0 is the end cross.
const ARROW: number[][] = [
  [16, 17, 18, 7, 0, 19, 6, 5, 0],
  [8, 9, 18, 7, 0, 19, 6, 0, 20],
  [8, 1, 10, 7, 0, 19, 0, 21, 20],
  [24, 17, 18, 15, 0, 0, 6, 5, 4],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [8, 1, 2, 0, 0, 11, 22, 21, 20],
  [24, 17, 0, 23, 0, 3, 14, 5, 4],
  [24, 0, 2, 23, 0, 3, 22, 13, 4],
  [0, 1, 2, 23, 0, 3, 22, 21, 12]
];
function arrowFrame(path: { x: number; y: number }[], i: number): number {
  if (i >= path.length - 1) return 0;
  const dir = (a: { x: number; y: number }, b: { x: number; y: number }) => (b.x - a.x + 1) + 3 * (b.y - a.y + 1);
  return ARROW[dir(path[i - 1], path[i])][dir(path[i], path[i + 1])];
}

const terrainCost = (terrain: string | null, pathfinding = 0, nativeTerrain: string | null = null) =>
  terrain != null && terrain === nativeTerrain ? 100 :
    Math.max(100, (terrain === 'rough' ? 125 : terrain === 'snow' || terrain === 'sand' ? 150 : terrain === 'swamp' ? 175 : 100)
      - 25 * Math.max(0, Math.min(3, pathfinding)));

function stepCost(source: string | null, diagonal: boolean, remaining: number, pathfinding = 0,
  nativeTerrain: string | null = null, flightPenalty: number | null = null): number {
  const straight = flightPenalty == null ? terrainCost(source, pathfinding, nativeTerrain) : 100 * (100 + flightPenalty) / 100;
  const full = diagonal ? flightPenalty == null ? Math.floor(straight * Math.SQRT2) : Math.floor(141 * (100 + flightPenalty) / 100) : straight;
  return flightPenalty == null && diagonal && remaining >= straight && remaining < full ? remaining : full;
}

/** Index of the last path tile the hero can reach with today's movement points. */
function reachableSteps(map: MapData, path: { x: number; y: number }[], movement: number, pathfinding = 0, flightPenalty: number | null = null, nativeTerrain: string | null = null): number {
  let left = movement, last = 0;
  for (let i = 1; i < path.length; i++) {
    const tile = map.tiles[path[i].y * map.width + path[i].x];
    const final = i === path.length - 1;
    const town = map.towns.find(t => t.x === path[i].x && t.y === path[i].y);
    const exchange = final && map.heroes.some(h => h.x === path[i].x && h.y === path[i].y);
    const visit = final && ['mine', 'monster', 'shrine', 'obelisk', 'town'].includes(tile?.objectKind ?? '') && !town?.isMine;
    const diagonal = path[i].x !== path[i - 1].x && path[i].y !== path[i - 1].y;
    const source = map.tiles[path[i - 1].y * map.width + path[i - 1].x];
    left -= exchange || visit && town ? 0 : stepCost(source?.terrain, diagonal, left,
      pathfinding, nativeTerrain, visit ? null : flightPenalty);
    if (left < 0) break;
    if (flightPenalty == null && left < terrainCost((visit ? source : tile)?.terrain, pathfinding, nativeTerrain)) left = 0;
    if (flightPenalty == null || tile?.passable || town?.isMine || final && (visit || exchange) && last === i - 1)
      last = i;
  }
  return last;
}

function adventureCursor(map: MapData, hero: HeroDetail, x: number, y: number) {
  const target = targetTile(map, x, y);
  const tile = map.tiles[target.y * map.width + target.x];
  if (!tile || tile.fog === 0) return { action: 'blocked', frame: 0 };
  const other = map.heroes.find(h => h.x === target.x && h.y === target.y);
  if (other?.id === hero.id) return { action: tile.objectKind === 'town' ? 'town' : 'hero', frame: tile.objectKind === 'town' ? 3 : 2 };
  const p = findPath(map, hero.x, hero.y, target.x, target.y, hero.skills.pathfinding ?? 0, hero.flying ? hero.flightPenalty : null, hero);
  if (!p) return { action: 'blocked', frame: 0 };
  const action = other ? 'exchange'
    : ['resource', 'treasure', 'artifact', 'monster', 'mine', 'town', 'shrine', 'obelisk', 'grail'].includes(tile.objectKind ?? '') ? 'visit' : 'move';
  // CRADVNTR: walking horse, meeting heroes and visiting horse, with next-day variants.
  let turns = 0, start = 0;
  while (turns < 3) {
    const reached = reachableSteps(map, p.slice(start), turns ? hero.maxMovement - hero.hasteBonus : hero.movement,
      hero.skills.pathfinding ?? 0, !turns && hero.flying ? hero.flightPenalty : null, hero.nativeTerrain);
    if (start + reached === p.length - 1) break;
    start += reached;
    turns++;
  }
  return { action, frame: (action === 'exchange' ? 8 : action === 'visit' ? 9 : 4) + turns * 6 };
}

const cursorImages = new Map<number, string>();
function adventureCursorCss(sheet: Sheet, frame: number): string {
  let url = cursorImages.get(frame);
  if (!url) {
    const canvas = document.createElement('canvas');
    canvas.width = sheet.w; canvas.height = sheet.h;
    drawFrame(canvas.getContext('2d')!, sheet, frame, 0, 0);
    url = canvas.toDataURL();
    cursorImages.set(frame, url);
  }
  const base = frame >= 10 && frame <= 27 ? (frame - 4) % 6 + 4 : frame;
  const [x, y] = base === 2 ? [12, 10] : base === 3 ? [12, 12] : base === 4 ? [15, 13]
    : base === 8 ? [8, 9] : base === 9 || base === 41 ? [14, 16] : [0, 0];
  return `url("${url}") ${x} ${y}, auto`;
}

export function AdventureMap() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useGameNavigate();
  const { t, language } = useLanguage();
  const h3 = useH3() === true;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [map, setMap] = useState<MapData | null>(null);
  const [game, setGame] = useState<GameDetail | null>(null);
  const [hero, setHero] = useState<HeroDetail | null>(null);
  const [heroes, setHeroes] = useState<HeroDetail[]>([]);
  const selectedRef = useRef<string | null>(null);
  const [cam, setCam] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [path, setPath] = useState<{ x: number; y: number }[] | null>(null);
  const [tick, setTick] = useState(0);
  const [assetGen, setAssetGen] = useState(0);
  const [pressed, setPressed] = useState<string | null>(null);
  const [heroScroll, setHeroScroll] = useState(0);
  const [townScroll, setTownScroll] = useState(0);
  const [encounter, setEncounter] = useState<{ creature: string; count: number } | null>(null);
  const [meeting, setMeeting] = useState<{ heroName: string; playerId: string; ownerName: string } | null>(null);
  const [meetingText, setMeetingText] = useState('');
  const [exchange, setExchange] = useState<[HeroDetail, HeroDetail] | null>(null);
  const [creatures, setCreatures] = useState<Record<string, CreatureDef>>({});
  const [mineSharing, setMineSharing] = useState<{ x: number; y: number; shared: boolean } | null>(null);
  const [annotations, setAnnotations] = useState<{ id: string; x: number; y: number; text: string; author: string }[]>([]);
  const [noteAt, setNoteAt] = useState<{ x: number; y: number } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [spellbookOpen, setSpellbookOpen] = useState(false);
  const [teleportTarget, setTeleportTarget] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const [portalTown, setPortalTown] = useState<string | null>(null);
  const [visionTargets, setVisionTargets] = useState<VisionTarget[]>([]);
  const [visionInfo, setVisionInfo] = useState<VisionTarget | null>(null);
  const spellBusyRef = useRef(false);
  const [worldView, setWorldView] = useState<WorldView | null>(null);
  const [treasureBusy, setTreasureBusy] = useState(false);
  const [treasureChoice, setTreasureChoice] = useState<'gold' | 'experience'>('gold');
  const [pickupQueue, setPickupQueue] = useState<AdventureNotice[]>([]);
  const [noticeQueue, setNoticeQueue] = useState<AdventureNotice[]>([]);
  const [dateNotice, setDateNotice] = useState<GameDetail | null>(null);
  const lastTurnRef = useRef<number | null>(null);
  const [sleeping, setSleeping] = useState<string[]>([]);
  const [endTurnConfirm, setEndTurnConfirm] = useState(false);
  const [endingTurn, setEndingTurn] = useState(false);
  const endingTurnRef = useRef(false);
  const [encounterBusy, setEncounterBusy] = useState(false);
  const encounterBusyRef = useRef(false);
  const [spellDefs, setSpellDefs] = useState<Record<string, SpellDef>>({});
  const movingRef = useRef<string | null>(null);
  const glideRef = useRef<Glide | null>(null);
  const [animGen, setAnimGen] = useState(0);
  const facingRef = useRef(new Map<string, Facing>());
  const myPlayerIdRef = useRef<string | null>(null);
  const playerId = authService.getCurrentUser()?.id ?? '';
  const sleepKey = `cityoftowers.sleeping.${gameId}.${playerId}`;
  function teleportLegal(x: number, y: number) {
    if (!map || !hero || x < 0 || y < 0 || x >= map.width || y >= map.height
      || Math.abs(x - hero.x) > 9 || Math.abs(y - hero.y) > 8 || (x === hero.x && y === hero.y)
      || map.heroes.some(h => h.x === x && h.y === y)) return false;
    const tile = map.tiles[y * map.width + x];
    return tile.fog === 0 || (!tile.objectKind && tile.terrain !== 'rock' && (tile.passable || tile.terrain === 'water'));
  }
  const cursor = useMemo(() => map && hero && hover ? teleportTarget
    ? { action: teleportLegal(hover.x, hover.y) ? 'teleport' : 'blocked', frame: teleportLegal(hover.x, hover.y) ? 41 : 0 }
    : adventureCursor(map, hero, hover.x, hover.y) : { action: 'default', frame: 0 }, [map, hero, hover, teleportTarget]);

  useEffect(() => {
    api.getCreatures().then(cs => setCreatures(Object.fromEntries(cs.map(c => [c.key, c])))).catch(() => {});
  }, []);

  useEffect(() => {
    lastTurnRef.current = null;
    setDateNotice(null);
    setEndTurnConfirm(false);
    try {
      const saved = JSON.parse(localStorage.getItem(sleepKey) ?? '[]');
      setSleeping(Array.isArray(saved) ? saved.filter(id => typeof id === 'string') : []);
    } catch { setSleeping([]); }
  }, [sleepKey]);

  const refresh = useCallback(async () => {
    if (!gameId) return;
    try {
      const [m, g, hs] = await Promise.all([api.getMap(gameId), api.getGame(gameId), api.getHeroes(gameId)]);
      if (lastTurnRef.current != null && g.turn > lastTurnRef.current) setDateNotice(g);
      lastTurnRef.current = Math.max(lastTurnRef.current ?? g.turn, g.turn);
      setMap(m);
      setGame(g);
      setHeroes(hs);
      api.getAnnotations(gameId).then(setAnnotations).catch(() => {});
      api.getSpells().then((ss) => {
        const m: Record<string, SpellDef> = {};
        for (const s of ss) m[s.key] = s;
        setSpellDefs(m);
      }).catch(() => {});
      const cur = hs.find(h => h.pendingLevel) ?? hs.find((h) => h.id === selectedRef.current) ?? hs[0];
      if (cur) {
        const visions = cur.visions ? await api.getVisions(cur.id).catch(() => []) : [];
        setVisionTargets(visions);
        setHero(cur);
        setPath(current => {
          const end = current?.[current.length - 1];
          return end ? findPath(m, cur.x, cur.y, end.x, end.y, cur.skills.pathfinding ?? 0, cur.flying ? cur.flightPenalty : null, cur) : null;
        });
        if (cur.pendingEncounter) {
          try { setEncounter(JSON.parse(cur.pendingEncounter)); } catch { /* ignore */ }
        } else {
          setEncounter(null);
        }
        if (!movingRef.current) {
          setCam((c) => (c.x === 0 && c.y === 0 ? centerCam(m, cur.x, cur.y) : c));
        }
      } else {
        setHero(null);
        setVisionTargets([]);
        setEncounter(null);
        setPath(null);
      }
    } catch (e) {
      if (e instanceof ApiError) showMessage(e.message);
    }
  }, [gameId]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (game?.state === 'Finished') navigate(`/game/${gameId}/over`); }, [game?.state, gameId, navigate]);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') { setTeleportTarget(false); setPortalOpen(false); } };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);

  const pickup = pickupQueue[0];
  useEffect(() => {
    if (!pickup || dateNotice) return;
    const timer = window.setTimeout(() => setPickupQueue(queue => queue.slice(1)), 3000);
    return () => window.clearTimeout(timer);
  }, [pickup, dateNotice]);

  function showNotices(notices: AdventureNotice[]) {
    setPickupQueue(queue => queue.concat(notices.filter(n => n.kind === 'resource' || n.kind === 'experience')));
    setNoticeQueue(queue => queue.concat(notices.filter(n => n.kind !== 'resource' && n.kind !== 'experience')));
  }

  function showMessage(message: string) {
    showNotices([{ kind: 'message', key: 'Adventure', amount: 0, message }]);
  }

  // N adds a note on the hovered tile, as in HoMM3's map notes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.key === 'n' || e.key === 'N') {
        if (!hover) return;
        setNoteAt({ x: hover.x, y: hover.y });
        setNoteText('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hover]);

  // Adventure-map animation (flags, monsters, chests) at the original ~180ms frame rate.
  useEffect(() => {
    if (!h3) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 180);
    const off = onAssetLoaded(() => setAssetGen((n) => n + 1));
    return () => { window.clearInterval(id); off(); };
  }, [h3]);

  useEffect(() => {
    if (!gameId) return;
    socket.connect(gameId);
    const off = socket.on((e) => {
      if (movingRef.current) return;
      if (e.type === 'turnAdvanced' || e.type === 'turnEnded' || e.type === 'heroMoved' || e.type === 'encounter' || e.type === 'project' || e.type === 'agreement') refresh();
      if (e.type === 'message' && e.payload.toPlayerId === myPlayerIdRef.current) showMessage('homm.ui.adv.newMessage');
      if (e.type === 'trade' && e.payload.toPlayerId === myPlayerIdRef.current) showMessage('homm.ui.adv.newTrade');
    });
    return off;
  }, [gameId, refresh]);

  // ---------------------------------------------------------------- render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ZOOM, 0, 0, ZOOM, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    if (h3) renderH3(ctx, map, cam, tick, facingRef.current, movingRef.current, annotations, glideRef.current);
    else renderFallback(ctx, map, cam);

    if (path && path.length > 1) {
      const from = glideRef.current ? glideRef.current.seg + 1 : 1;
      const arrows = h3 ? getDef('ADAG') : null;
      const reach = reachableSteps(map, path, hero?.movement ?? 0, hero?.skills.pathfinding ?? 0, hero?.flying ? hero.flightPenalty : null, hero?.nativeTerrain);
      for (let i = from; i < path.length; i++) {
        const p = path[i];
        const sx = (p.x - cam.x) * TILE, sy = (p.y - cam.y) * TILE;
        if (arrows) {
          drawFrame(ctx, arrows, arrowFrame(path, i) + (i <= reach ? 0 : 25), sx, sy);
          continue;
        }
        const px = sx + TILE / 2, py = sy + TILE / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath(); ctx.arc(px + 1, py + 1, 4, 0, 7); ctx.fill();
        ctx.fillStyle = i === path.length - 1 ? '#f0e040' : i <= reach ? '#40d040' : '#d04040';
        ctx.beginPath(); ctx.arc(px, py, 4, 0, 7); ctx.fill();
      }
    }

    if (hover && !h3) {
      const sx = (hover.x - cam.x) * TILE, sy = (hover.y - cam.y) * TILE;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
    }
  }, [map, cam, hover, path, h3, tick, assetGen, annotations, animGen, hero]);

  // ---------------------------------------------------------------- input
  function toTile(e: React.MouseEvent<HTMLCanvasElement>) {
    const p = localPoint(e, e.currentTarget);
    return { x: Math.floor(p.x / ZOOM / TILE + cam.x), y: Math.floor(p.y / ZOOM / TILE + cam.y) };
  }

  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const t = toTile(e);
    if (map && t.x >= 0 && t.y >= 0 && t.x < map.width && t.y < map.height) {
      if (!hover || hover.x !== t.x || hover.y !== t.y) setHover(t);
    } else setHover(null);
  }

  async function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!map || !hero || !game || movingRef.current || encounter || meeting || exchange || hero.pendingTreasure || hero.pendingLevel || worldView || noticeQueue.length || endTurnConfirm || endingTurn || spellBusyRef.current) return;
    const raw = toTile(e);
    if (raw.x < 0 || raw.y < 0 || raw.x >= map.width || raw.y >= map.height) return;
    if (teleportTarget) {
      if (!teleportLegal(raw.x, raw.y)) return;
      setTeleportTarget(false);
      await castSpell('dimensionDoor', raw.x, raw.y);
      return;
    }
    // a click anywhere on a town or mine targets its entrance, as in HoMM3
    const t = targetTile(map, raw.x, raw.y);

    // Towns are entered by walking the hero into the gate, as in HoMM3; the town screen
    // opens when the hero arrives (the server answers with enter-town / visit-town).
    const town = map.towns.find((tw) => tw.x === t.x && tw.y === t.y);
    if (town && hero.x === t.x && hero.y === t.y) { navigate(`/game/${gameId}/town/${town.id}`); return; }
    const p = findPath(map, hero.x, hero.y, t.x, t.y, hero.skills.pathfinding ?? 0, hero.flying ? hero.flightPenalty : null, hero);
    if (!p || p.length < 2) {
      if (!p) setPath(null);
      return;
    }
    const end = path?.[path.length - 1];
    if (!end || end.x !== t.x || end.y !== t.y || path?.[0].x !== hero.x || path?.[0].y !== hero.y) {
      setPath(p);
      return;
    }
    await followPath(p);
  }

  async function followPath(p: { x: number; y: number }[]) {
    if (!map || !hero || !game || movingRef.current || encounter || meeting || exchange || hero.pendingTreasure || worldView || noticeQueue.length || endTurnConfirm || endingTurn) return;
    const t = p[p.length - 1];
    const other = map.heroes.find(h => h.id !== hero.id && h.x === t.x && h.y === t.y);
    const route = other ? p.slice(0, -1) : p;
    if (route.length > 1 && reachableSteps(map, route, hero.movement, hero.skills.pathfinding ?? 0, hero.flying ? hero.flightPenalty : null, hero.nativeTerrain) === 0) return;
    if (sleeping.includes(hero.id)) storeSleeping(sleeping.filter(id => id !== hero.id));
    const end = await walk(route);
    if (!end || !other) return;
    if (Math.max(Math.abs(end.x - t.x), Math.abs(end.y - t.y)) > 1) return;
    if (other.isMine) {
      try {
        const result = await api.exchangeHeroes(hero.id, other.id);
        setExchange([result.hero, result.other]);
      } catch (e) { showMessage(errRaw(e, 'homm.ui.adv.exchangeFailed')); }
      return;
    }
    const owner = game.players.find((pl) => pl.heroIds.includes(other.id));
    if (owner) setMeeting({ heroName: other.name, playerId: owner.playerId, ownerName: owner.name });
  }

  /** Slides the hero tile to tile with its walking frames, scrolling the map to follow. */
  function glide(id: string, seq: { x: number; y: number }[]): Promise<void> {
    return new Promise((resolve) => {
      if (seq.length < 2) { resolve(); return; }
      const t0 = performance.now();
      const step = (now: number) => {
        // rAF's timestamp is the frame start, which can precede t0
        const f = Math.max(0, now - t0) / STEP_MS;
        const seg = Math.floor(f);
        if (seg >= seq.length - 1) {
          const last = seq[seq.length - 1];
          glideRef.current = { id, x: last.x, y: last.y, frame: 0, seg: seq.length - 1 };
          resolve();
          return;
        }
        const a = seq[seg], b = seq[seg + 1], u = f - seg;
        facingRef.current.set(id, facingFor(Math.sign(b.x - a.x), Math.sign(b.y - a.y)));
        const x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u;
        glideRef.current = { id, x, y, frame: Math.floor(f * FRAMES_PER_TILE), seg };
        setCam((c) => followCam(map!, c, x, y));
        setAnimGen((n) => n + 1);
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  async function walk(p: { x: number; y: number }[]): Promise<{ x: number; y: number } | null> {
    if (!hero) return null;
    let pos = { x: hero.x, y: hero.y };
    if (p.length < 2) return pos;
    movingRef.current = hero.id;
    setPath(p);
    let message: string | null = null;
    let notices: AdventureNotice[] = [];
    let remainingPath: { x: number; y: number }[] | null = null;
    let hasEncounter = false;
    try {
      // one request for the whole route; the server stops at pickups, visits and when movement runs out
      const res = await api.moveHero(hero.id, p.slice(1));
      const updated = res.hero;
      hasEncounter = updated.pendingEncounter != null;
      message = res.message ?? null;
      notices = res.notices;
      pos = { x: updated.x, y: updated.y };
      const k = Math.max(0, p.findIndex((q) => q.x === pos.x && q.y === pos.y));
      if (!message && !notices.length && !hasEncounter && k < p.length - 1) remainingPath = p.slice(k);
      await glide(hero.id, p.slice(0, k + 1));
      // face the object the hero stopped next to
      if (k < p.length - 1) facingRef.current.set(hero.id, facingFor(Math.sign(p[k + 1].x - p[k].x), Math.sign(p[k + 1].y - p[k].y)));
      setHero(updated);
      setHeroes((hs) => hs.map((h) => (h.id === updated.id ? updated : h)));
      setMap((m) => m ? {
        ...m,
        heroes: m.heroes.map((h) => h.id === updated.id
          ? { ...h, x: updated.x, y: updated.y, movement: updated.movement } : h)
      } : m);
    } catch (e) {
      if (e instanceof ApiError) showNotices([{ kind: 'message', key: 'Movement', amount: 0, message: e.message }]);
    } finally {
      movingRef.current = null;
      glideRef.current = null;
      setPath(remainingPath);
    }
    // stepping into a town's gate enters it, as in HoMM3
    const enter = /^(?:enter|visit)-town:(.+)$/.exec(message ?? '');
    if (enter) { navigate(`/game/${gameId}/town/${enter[1]}`); return pos; }
    // walking up to the Obelisk opens it
    if (message?.startsWith('obelisk:open')) { navigate(`/game/${gameId}/obelisk`); return pos; }
    if (notices.length) showNotices(notices);
    else if (message && message !== 'treasure:choose' && !hasEncounter)
      showNotices([{ kind: 'message', key: 'Adventure', amount: 0, message }]);
    await refresh();
    return pos;
  }
  async function endTurn() {
    if (!gameId || endingTurnRef.current || movingRef.current) return;
    endingTurnRef.current = true;
    setEndingTurn(true);
    setEndTurnConfirm(false);
    try {
      await api.endTurn(gameId);
      await refresh();
    } catch (e) {
      showMessage(errRaw(e, 'homm.ui.adv.endTurnFailed'));
    } finally {
      endingTurnRef.current = false;
      setEndingTurn(false);
    }
  }

  function chooseSpell(key: string) {
    if (!hero || !map) return;
    if (key === 'dimensionDoor') { setSpellbookOpen(false); setPath(null); setTeleportTarget(true); return; }
    if (key === 'townPortal' && (hero.skills.earth ?? 0) >= 2) {
      setSpellbookOpen(false); setPortalTown(null); setPortalOpen(true); return;
    }
    void castSpell(key);
  }
  async function castSpell(key: string, x?: number, y?: number, townId?: string) {
    if (!hero || spellBusyRef.current) return;
    spellBusyRef.current = true;
    try {
      const r = await api.castSpell(hero.id, key, x, y, townId);
      setPath(null);
      await refresh();
      setSpellbookOpen(false);
      if (r.view) setWorldView(r.view);
      if (key === 'dimensionDoor' && r.message === 'Dimension Door failed!') showMessage(r.message);
      if (key === 'townPortal') {
        const town = map?.towns.find(t => t.isMine && t.x === r.x && t.y === r.y);
        if (town) navigate(`/game/${gameId}/town/${town.id}`);
      }
    } catch (e) {
      showMessage(errRaw(e, 'homm.ui.adv.spellFailed'));
    } finally { spellBusyRef.current = false; }
  }

  async function addNote() {
    if (!gameId || !noteAt || !noteText.trim()) return;
    try {
      await api.addAnnotation(gameId, noteAt.x, noteAt.y, noteText.trim());
      setNoteAt(null);
      setNoteText('');
      api.getAnnotations(gameId).then(setAnnotations).catch(() => {});
    } catch (e) {
      showMessage(errRaw(e, 'homm.ui.adv.noteFailed'));
    }
  }

  async function sendMeetingMessage() {
    if (!gameId || !meeting || !meetingText.trim()) return;
    try {
      await api.sendMessage(gameId, meeting.playerId, meetingText.trim());
      setMeetingText('');
      setMeeting(null);
    } catch (e) {
      showMessage(errRaw(e, 'homm.ui.adv.messageFailed'));
    }
  }

  async function onContextMenu(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (teleportTarget) { setTeleportTarget(false); return; }
    if (!map || hero?.pendingLevel) return;
    const t = toTile(e);
    const target = targetTile(map, t.x, t.y);
    const tile = map.tiles[target.y * map.width + target.x];
    const factionSeat = FACTION_SEAT[game?.players.find(p => p.isMe)?.faction ?? ''];
    if (tile?.objectKind === 'mine' && tile.owner === (1 << factionSeat)) {
      setMineSharing({ ...target, shared: !!tile.mineShared });
      return;
    }
    let vision = hero?.visions ? visionTargets.find(v => v.x === t.x && v.y === t.y) : undefined;
    if (hero?.visions && !vision) {
      const targets = await api.getVisions(hero.id).catch(() => []);
      if (selectedRef.current !== hero.id) return;
      setVisionTargets(targets);
      vision = targets.find(v => v.x === t.x && v.y === t.y);
    }
    if (vision) { setVisionInfo(vision); return; }
    if (!hero) return;
    setPath(findPath(map, hero.x, hero.y, t.x, t.y, hero.skills.pathfinding ?? 0, hero.flying ? hero.flightPenalty : null, hero));
  }

  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    if (!map) return;
    const d = Math.sign(e.deltaY);
    setCam((c) => clampCam(map, c.x + d * 2, c.y + d * 2));
  }

  async function resolveEncounter(action: string) {
    if (!hero || encounterBusyRef.current) return;
    encounterBusyRef.current = true;
    setEncounterBusy(true);
    try {
      await api.resolveEncounter(hero.id, action);
      setEncounter(null);
      await refresh();
    } catch (e) {
      showMessage(errRaw(e, 'homm.ui.adv.encounterFailed'));
    } finally {
      encounterBusyRef.current = false;
      setEncounterBusy(false);
    }
  }

  async function resolveTreasure(choice: 'gold' | 'experience' | 'leave') {
    if (!hero || treasureBusy) return;
    setTreasureBusy(true);
    try {
      const result = await api.resolveTreasure(hero.id, choice);
      showNotices(result.notices);
      setTreasureChoice('gold');
      await refresh();
    } catch (e) {
      showMessage(errRaw(e, 'homm.ui.adv.treasureFailed'));
    } finally { setTreasureBusy(false); }
  }

  if (!map || !game) return <Loading />;

  const me = game.players.find((p) => p.isMe);
  myPlayerIdRef.current = me?.playerId ?? null;
  const res = me?.resources;
  const myTowns = map.towns.filter((t) => t.isMine);
  const seat = me ? FACTION_SEAT[me.faction] : -1;
  const minesOwned = map.tiles.filter((t) => t.objectKind === 'mine' && seat >= 0 && (t.owner & (1 << seat)) !== 0).length;

  function selectHero(h: HeroDetail) {
    selectedRef.current = h.id;
    setVisionTargets([]);
    setHero(h);
    setPath(null);
    setCam(centerCam(map!, h.x, h.y));
    if (h.pendingEncounter) { try { setEncounter(JSON.parse(h.pendingEncounter)); } catch { /* ignore */ } }
    else setEncounter(null);
  }

  function storeSleeping(ids: string[]) {
    setSleeping(ids);
    localStorage.setItem(sleepKey, JSON.stringify(ids));
  }

  function toggleSleep() {
    if (!hero || movingRef.current || encounter || hero.pendingTreasure || endingTurn) return;
    if (sleeping.includes(hero.id)) { storeSleeping(sleeping.filter(id => id !== hero.id)); return; }
    const ids = [...sleeping, hero.id];
    storeSleeping(ids);
    const index = heroes.findIndex(h => h.id === hero.id);
    const next = [...heroes.slice(index + 1), ...heroes.slice(0, index)].find(h => !ids.includes(h.id) && h.movement > 0);
    if (next) selectHero(next);
  }

  function requestEndTurn() {
    if (movingRef.current || endingTurn || encounter || hero?.pendingTreasure || noticeQueue.length) return;
    const reminder = heroes.some(h => h.movement > 0 && !sleeping.includes(h.id)
      && (h.id !== hero?.id || !path || reachableSteps(map!, path, h.movement, h.skills.pathfinding ?? 0, h.flying ? h.flightPenalty : null, h.nativeTerrain) > 0));
    if (reminder) setEndTurnConfirm(true);
    else void endTurn();
  }

  const actions: Record<string, () => void> = {
    Social: () => navigate(`/game/${gameId}/social`),
    Projects: () => navigate(`/game/${gameId}/projects`),
    Obelisk: () => navigate(`/game/${gameId}/obelisk`),
    Sleep: toggleSleep,
    Hero: () => { if (hero) navigate(`/game/${gameId}/hero/${hero.id}`); },
    Spells: () => setSpellbookOpen(true),
    Note: () => {
      if (!hover) return;
      setNoteAt({ x: hover.x, y: hover.y });
      setNoteText('');
    },
    Town: () => { const t = myTowns[0]; if (t) navigate(`/game/${gameId}/town/${t.id}`); },
    Menu: () => navigate('/'),
    'Move Hero': () => {
      const end = path?.[path.length - 1];
      if (!hero || !end) return;
      const p = findPath(map!, hero.x, hero.y, end.x, end.y, hero.skills.pathfinding ?? 0, hero.flying ? hero.flightPenalty : null, hero);
      if (p) void followPath(p);
    },
    'End Turn': requestEndTurn
  };

  const hoverAt = hover && map ? targetTile(map, hover.x, hover.y) : null;
  const hoverTile = hoverAt && map ? map.tiles[hoverAt.y * map.width + hoverAt.x] : null;
  const hoverTown = hoverAt ? map.towns.find((t) => t.x === hoverAt.x && t.y === hoverAt.y) : null;
  const hoverHero = hover ? map.heroes.find((h) => h.x === hover.x && h.y === hover.y) : null;
  const rollover = hoverHero ? serverText(t, hoverHero.name)
    : hoverTown ? serverText(t, hoverTown.name)
      : hoverTile && hoverTile.fog > 0
        ? (hoverTile.objectKind ? objectName(t, language, hoverTile) : (hoverTile.terrain ? nm(t, 'terrain', hoverTile.terrain) : ''))
        : '';
  const visibleHeroes = heroes.slice(heroScroll, heroScroll + 5);
  const visibleTowns = myTowns.slice(townScroll, townScroll + 5);
  const dateText = t('homm.ui.adv.date').replace('{m}', String(game.month)).replace('{w}', String(game.week)).replace('{d}', String(game.day));
  const cursorSheet = h3 ? getDef('CRADVNTR') : null;
  const cursorFrame = movingRef.current ? 1 : cursor.frame;
  const cursorStyle = cursorSheet ? adventureCursorCss(cursorSheet, cursorFrame)
    : cursor.action === 'blocked' ? 'not-allowed' : cursor.action === 'visit' ? 'grab'
      : cursor.action === 'exchange' ? 'alias' : 'crosshair';

  return (
    <>
      {/* map frame */}
      <div className="abs advframe" style={{ left: 0, top: 0, width: SIDE_X, height: BAR_Y }} />

      {/* adventure map */}
      <canvas
        ref={canvasRef}
        width={MAP_W * ZOOM}
        height={MAP_H * ZOOM}
        aria-label={t('homm.ui.adv.map')}
        data-cam-x={cam.x}
        data-cam-y={cam.y}
        data-tile={TILE}
        data-hover={hover ? `${hover.x},${hover.y}` : ''}
        data-hover-kind={hoverTile?.objectKind ?? ''}
        data-hover-fog={hoverTile ? String(hoverTile.fog) : ''}
        data-cursor-action={cursor.action}
        data-cursor-frame={cursorFrame}
        data-path-end={path?.length ? `${path[path.length - 1].x},${path[path.length - 1].y}` : ''}
        style={{ position: 'absolute', left: MAP_X, top: MAP_Y, width: MAP_W * ZOOM, height: MAP_H * ZOOM, cursor: cursorStyle }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onWheel={onWheel}
      />

      {/* status bar */}
      <div className={'abs' + (h3 ? ' h3text' : '')} data-rollover
        style={{ left: MAP_X, top: MAP_Y * 2 + MAP_H * ZOOM, width: MAP_W * ZOOM, height: 32, textAlign: 'center', fontSize: 22, lineHeight: '32px', color: h3 ? undefined : 'var(--text-dim)' }}>
        {rollover}
      </div>

      {/* sidebar: original 200x575 column at 1.8x */}
      <div className="abs" style={{ left: SIDE_X, top: 0, width: 200, height: 575, overflow: 'hidden', transform: `scale(${HUD_K})`, transformOrigin: '0 0' }}>
      <div className="abs" style={{ left: -600, top: 0, width: 800, height: 600 }}>
      {h3
        ? <Pcx name="advmap" x={0} y={0} w={800} h={600} />
        : <div className="abs advframe" style={{ left: 0, top: 0, width: 800, height: 600 }} />}

      <Minimap map={map} cam={cam} h3={h3} onJump={(x, y) => setCam(centerCam(map, x, y))} />

      {/* hero list */}
      <ListArrow h3={h3} def="IAM012" x={609} y={196} w={64} label={t('homm.ui.adv.heroesUp')} onClick={() => setHeroScroll((s) => Math.max(0, s - 1))} />
      {[0, 1, 2, 3, 4].map((i) => {
        const h = visibleHeroes[i];
        if (!h) return null;
        const sel = h.id === hero?.id;
        return (
          <div key={h.id} className="abs clickable" style={{ left: 610, top: 212 + i * 32, width: 62, height: 32 }}
            role="button" aria-label={serverText(t, h.name)} title={t('homm.ui.adv.heroTitle').replace('{name}', serverText(t, h.name)).replace('{n}', String(h.level)).replace('{class}', heroClassText(t, h.heroClass, h.faction))}
            data-movement={h.movement} data-max-movement={h.maxMovement} data-sleeping={sleeping.includes(h.id)}
            onClick={() => selectHero(h)} onDoubleClick={() => navigate(`/game/${gameId}/hero/${h.id}`)}>
            {h3 ? (<>
              <div role="meter" aria-label={t('homm.ui.adv.movePoints')} aria-valuenow={h.movement} aria-valuemin={0} aria-valuemax={h.maxMovement}
                className="abs" style={{ left: 0, top: 1, width: 7, height: 30 }}>
                <DefImg name="imobil" frame={Math.min(25, Math.floor(h.movement / 100))} x={0} y={0} />
              </div>
              <H3Img name={heroPortrait(h.heroKey || h.name, h.faction, 'small')} x={7} y={0} w={48} h={32}
                fallback={<HeroPortrait faction={h.faction} size={32} />} />
              <DefImg name="imana" frame={Math.min(25, Math.floor(h.mana / 5))} x={56} y={1} />
              {sel && <div className="abs" style={{ left: 7, top: 0, width: 46, height: 30, border: '1px solid #f8e060' }} />}
            </>) : (<>
              <Bar x={0} value={h.movement} max={h.maxMovement} color="#40c040" />
              <div className="abs" style={{ left: 7, top: 0, width: 48, height: 32, overflow: 'hidden', border: sel ? '1px solid #f8e060' : '1px solid var(--gold-0)' }}>
                <HeroPortrait faction={h.faction} size={32} />
              </div>
              <Bar x={56} value={h.mana} max={h.maxMana} color="#4070e0" />
            </>)}
          </div>
        );
      })}
      <ListArrow h3={h3} def="IAM013" x={609} y={372} w={64} label={t('homm.ui.adv.heroesDown')} onClick={() => setHeroScroll((s) => Math.max(0, Math.min(heroes.length - 5, s + 1)))} />

      {/* town list */}
      <ListArrow h3={h3} def="IAM014" x={747} y={196} w={48} label={t('homm.ui.adv.townsUp')} onClick={() => setTownScroll((s) => Math.max(0, s - 1))} />
      {[0, 1, 2, 3, 4].map((i) => {
        const tw = visibleTowns[i];
        if (!tw) return null;
        return (
          <div key={tw.id} className="abs clickable" style={{ left: 748, top: 212 + i * 32, width: 48, height: 32 }}
            role="button" aria-label={serverText(t, tw.name)} title={serverText(t, tw.name)}
            onClick={() => setCam(centerCam(map, tw.x, tw.y))}
            onDoubleClick={() => navigate(`/game/${gameId}/town/${tw.id}`)}>
            {h3 ? <DefImg name="ITPA" frame={townListFrame(tw.faction)} x={0} y={0} /> : <TownThumb faction={tw.faction} />}
          </div>
        );
      })}
      <ListArrow h3={h3} def="IAM015" x={747} y={372} w={48} label={t('homm.ui.adv.townsDown')} onClick={() => setTownScroll((s) => Math.max(0, Math.min(myTowns.length - 5, s + 1)))} />

      {/* command buttons */}
      {BUTTONS.map((b) => {
        const awake = b.label === 'Sleep' && hero && sleeping.includes(hero.id);
        const text = awake ? t('homm.ui.adv.btn.wake') : t('homm.ui.adv.btn.' + b.k);
        return (
        <button key={b.label} type="button" aria-label={text}
          title={awake ? t('homm.ui.adv.tip.wake') : t('homm.ui.adv.tip.' + b.k)}
          disabled={endingTurn}
          className={h3 ? 'h3hit' : 'btn h3btn-fallback'}
          style={{ position: 'absolute', left: b.x, top: b.y, width: b.w, height: 32, fontSize: 9, padding: 0 }}
          onMouseDown={() => setPressed(b.label)} onMouseUp={() => setPressed(null)} onMouseLeave={() => setPressed(null)}
          onClick={actions[b.label]}>
          {h3 ? <DefImg name={b.def} frame={pressed === b.label || b.label === 'Sleep' && hero && sleeping.includes(hero.id) ? 1 : 0} x={0} y={0} />
            : text}
        </button>
        );
      })}

      {/* info bar: selected hero */}
      <div className="abs" style={{ left: 605, top: 389, width: 175, height: 168 }}>
        {dateNotice ? <NewDayInfo key={dateNotice.turn} date={dateNotice} onClose={() => setDateNotice(null)} /> : pickup ? (
          <div className={h3 ? 'h3text' : 'well'} role="status" aria-label={t('homm.ui.adv.reward')}
            data-adventure-info data-kind={pickup.kind} data-resource={pickup.key} data-amount={pickup.amount}
            style={{ position: 'absolute', inset: 0, textAlign: 'center', cursor: 'pointer' }}
            onClick={() => setPickupQueue(queue => queue.slice(1))}>
            {h3 && <Pcx name="ADSTATOT" x={0} y={0} />}
            <Txt x={10} y={12} w={155} size={11} align="center">{serverText(t, pickup.message)}</Txt>
            {h3 ? <DefImg name={pickup.kind === 'resource' ? 'RESOUR82' : 'PSKILL'}
              frame={pickup.kind === 'resource' ? RES_FRAME[pickup.key] : 4} x={46} y={49} />
              : <div style={{ position: 'absolute', left: 62, top: 65 }}><ResIcon r={pickup.key} size={48} /></div>}
            <Txt x={0} y={140} w={175} size={14} align="center">{pickup.amount}</Txt>
          </div>
        ) : h3 && hero ? (<>
          <Pcx name="ADSTATHR" x={0} y={0} />
          <H3Img name={heroPortrait(hero.heroKey || hero.name, hero.faction, 'large')} x={3} y={2} w={58} h={64}
            fallback={<HeroPortrait faction={hero.faction} size={58} />} />
          <div className="abs h3text" style={{ left: 66, top: 3, fontSize: 12 }}>{serverText(t, hero.name)}</div>
          {[hero.attack, hero.defense, hero.power, hero.knowledge].map((v, i) => (
            <div key={i} className="abs h3text" style={{ left: [77, 104, 132, 160][i] - 12, top: 52, width: 25, textAlign: 'center', fontSize: 12 }}>{v}</div>
          ))}
          <DefImg name="IMRL22" frame={3} x={5} y={74} />
          <DefImg name="ILCK22" frame={3} x={5} y={91} />
          <div className="abs h3text" style={{ left: 143, top: 94, width: 30, textAlign: 'center', fontSize: 10 }}>{hero.mana}</div>
          {hero.army.slice(0, 7).map((slot, i) => {
            const [sx, sy] = [[36, 73], [72, 73], [108, 73], [18, 122], [54, 122], [90, 122], [126, 122]][i];
            if (!slot.creature) return null;
            return (
              <div key={i}>
                <DefImg name="CPRSMALL" frame={creaturePortraitFrame(slot.creature)} x={sx} y={sy} />
                <div className="abs h3text" style={{ left: sx, top: sy + 34, width: 34, textAlign: 'center', fontSize: 10 }}>{slot.count}</div>
              </div>
            );
          })}
        </>) : hero ? (
          <div className="well" style={{ position: 'absolute', inset: 0 }}>
            <div className="abs" style={{ left: 4, top: 4 }}><HeroPortrait faction={hero.faction} size={56} /></div>
            <Txt x={66} y={4} size={12} bold>{serverText(t, hero.name)}</Txt>
            <Txt x={66} y={22} size={10} color="var(--text-dim)">{t('homm.ui.adv.attDef').replace('{a}', String(hero.attack)).replace('{d}', String(hero.defense))}</Txt>
            <Txt x={66} y={36} size={10} color="var(--text-dim)">{t('homm.ui.adv.powKno').replace('{p}', String(hero.power)).replace('{k}', String(hero.knowledge))}</Txt>
            <Txt x={66} y={50} size={10} color="#80a0ff">{t('homm.ui.adv.mana').replace('{n}', String(hero.mana))}</Txt>
            {hero.army.slice(0, 7).map((slot, i) => {
              const [sx, sy] = [[36, 73], [72, 73], [108, 73], [18, 118], [54, 118], [90, 118], [126, 118]][i];
              return (
                <div key={i} className="slot" style={{ left: sx, top: sy, width: 32, height: 40 }}>
                  {slot.creature && (<>
                    <CreatureIcon creature={slot.creature} size={30} />
                    <div style={{ position: 'absolute', bottom: 0, width: '100%', textAlign: 'center', fontSize: 9, color: '#fff' }}>{slot.count}</div>
                  </>)}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      </div>
      </div>

      {/* resource bar: original 800x25 strip at 1.8x */}
      <div className="abs" style={{ left: 0, top: BAR_Y, width: 1920, height: 1080 - BAR_Y, background: '#1a120a' }} />
      <div className="abs" style={{ left: 0, top: BAR_Y, width: 800, height: 25, overflow: 'hidden', transform: `scale(${HUD_K})`, transformOrigin: '0 0' }}>
      <div className="abs" style={{ left: 0, top: -575, width: 800, height: 600 }}>
      {h3 ? <Pcx name="AResBar" x={3} y={575} /> : <div className="abs panel" style={{ left: 3, top: 575, width: 794, height: 22, borderRadius: 0 }} />}
      {RES_ORDER.map((r) => (
        <div key={r} className={'abs' + (h3 ? ' h3text' : '')} title={resLabel(t, r)}
          style={{ left: 3 + RESBAR_X[r], top: 578, fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
          {!h3 && <span style={{ marginLeft: -22 }}><ResIcon r={r} size={16} /></span>}
          {res ? String(res[r]) : '—'}
        </div>
      ))}
      <div className={'abs' + (h3 ? ' h3text' : '')} title={t('homm.ui.adv.minesTip').replace('{n}', String(minesOwned)).replace('{o}', String(me?.obeliskVisits ?? 0))}
        style={{ left: 3 + 619, top: 578, fontSize: 12 }}>{dateText}</div>
      </div>
      </div>

      {/* dialogs: classic 800x600 coordinates, centred at 1.8x */}
      <div className="layer800">

      {/* spellbook */}
      {spellbookOpen && hero && <Spellbook hero={hero} spells={spellDefs} onCast={chooseSpell} onClose={() => setSpellbookOpen(false)} />}
      {portalOpen && <div className="backdrop">
        <div className="modal" role="dialog" aria-label={t('homm.ui.adv.portalDest')} style={{ position: 'relative', width: 400, height: 360 }}>
          <DialogBox w={400} h={360} />
          <div className="abs h3text" style={{ left: 32, top: 28, width: 336, textAlign: 'center', color: '#f8d870' }}>{nm(t, 'spell', 'townPortal')}</div>
          <div className="abs" style={{ left: 40, top: 68, width: 320, height: 208, overflowY: 'auto' }}>
            {myTowns.map(tw => <button key={tw.id} className="h3hit" aria-label={t('homm.ui.adv.portalTo').replace('{name}', serverText(t, tw.name))}
              disabled={map.heroes.some(h => h.x === tw.x && h.y === tw.y)} aria-pressed={portalTown === tw.id}
              style={{ position: 'relative', display: 'block', width: 304, height: 40, marginBottom: 8,
                outline: portalTown === tw.id ? '2px solid #f8d870' : undefined }}
              onClick={() => setPortalTown(tw.id)}>
              <DefImg name="ITPA" frame={townListFrame(tw.faction)} x={0} y={2} />
              <span className="abs h3text" style={{ left: 56, top: 10, fontSize: 13 }}>{serverText(t, tw.name)}</span>
            </button>)}
          </div>
          <DefButton def="IOKAY" x={98} y={300} label={t('homm.ui.adv.confirmTown')} disabled={!portalTown} onClick={() => {
            const town = portalTown!; setPortalOpen(false); void castSpell('townPortal', undefined, undefined, town);
          }} />
          <DefButton def="ICANCEL" x={238} y={300} label={t('homm.ui.adv.cancelPortal')} onClick={() => setPortalOpen(false)} />
        </div>
      </div>}
      {visionInfo && <NativeMessage text={(visionInfo.level ? t('homm.ui.hero.nameLevel').replace('{name}', serverText(t, visionInfo.name)).replace('{n}', String(visionInfo.level)) : serverText(t, visionInfo.name)) + '\n'
        + visionInfo.army.filter(s => s.creature).map(s => `${s.count} ${creatureCount(t, language, s.creature!, creatures[s.creature!]?.name, s.count)}`).join('\n')
        + (visionInfo.canRecruit == null ? '' : '\n' + (visionInfo.canRecruit ? t('homm.ui.adv.willJoin').replace('{n}', String(visionInfo.gold)) : t('homm.ui.adv.wontJoin')))}
        onClose={() => setVisionInfo(null)} />}

      {worldView && <WorldViewDialog view={worldView} onClose={() => setWorldView(null)} />}

      {hero?.pendingTreasure && (
        <div className="backdrop">
          <div className="modal panel" style={{ width: 420, height: 320 }} role="dialog" aria-modal="true" aria-label={t('homm.ui.adv.treasure')}>
            <DialogBox w={420} h={320} />
            <Txt x={0} y={20} w={420} size={16} bold align="center" className="heading">{t('homm.ui.adv.treasure')}</Txt>
            <Txt x={25} y={54} w={370} size={11} align="center">{t('homm.ui.adv.treasureHint')}</Txt>
            {(['gold', 'experience'] as const).map((choice, i) => <button key={choice} type="button" className="abs h3hit"
              aria-label={choice === 'gold' ? t('homm.ui.adv.takeGold').replace('{n}', String(hero.pendingTreasure!.gold)) : t('homm.ui.adv.gainXp').replace('{n}', String(hero.pendingTreasure!.experience))}
              aria-pressed={treasureChoice === choice} disabled={treasureBusy} onClick={() => setTreasureChoice(choice)}
              style={{ left: 90 + i * 145, top: 100, width: 94, height: 126, background: 'none',
                border: `1px solid ${treasureChoice === choice ? '#f8d870' : 'transparent'}`, color: '#f0e0b0' }}>
              {h3 ? <DefImg name={choice === 'gold' ? 'RESOUR82' : 'PSKILL'} frame={choice === 'gold' ? 6 : 4} x={5} y={4} />
                : <ResIcon r={choice} size={64} />}
              <span style={{ position: 'absolute', left: 0, top: 94, width: '100%', textAlign: 'center' }}>
                {choice === 'gold' ? hero.pendingTreasure!.gold : hero.pendingTreasure!.experience}
              </span>
            </button>)}
            {h3 ? <>
              <DefButton def="IOKAY" x={110} y={262} label={t('homm.ui.common.ok')} disabled={treasureBusy} onClick={() => resolveTreasure(treasureChoice)} />
              <DefButton def="ICANCEL" x={245} y={262} label={t('homm.ui.adv.leaveChest')} disabled={treasureBusy} onClick={() => resolveTreasure('leave')} />
            </> : <>
              <Btn x={80} y={262} w={100} h={30} label={t('homm.ui.common.ok')} disabled={treasureBusy} onClick={() => resolveTreasure(treasureChoice)} />
              <Btn x={220} y={262} w={130} h={30} label={t('homm.ui.adv.leaveChest')} disabled={treasureBusy} onClick={() => resolveTreasure('leave')} />
            </>}
          </div>
        </div>
      )}

      {/* map annotation dialog */}
      {noteAt && (
        <div className="backdrop">
          <div className="modal panel" style={{ width: 420, height: 200 }} role="dialog" aria-label={t('homm.ui.adv.addNote')}>
            <DialogBox w={420} h={200} />
            <Txt x={0} y={16} w={420} size={15} bold align="center" className="heading">{t('homm.ui.adv.addNoteTitle')}</Txt>
            <Txt x={24} y={44} w={372} size={10} color="var(--text-dim)">
              {t('homm.ui.adv.noteTile').replace('{x}', String(noteAt.x)).replace('{y}', String(noteAt.y))}
            </Txt>
            <input className="inp" style={{ position: 'absolute', left: 24, top: 68, width: 372, height: 30 }}
              placeholder={t('homm.ui.adv.notePh')} maxLength={200} value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addNote(); }} />
            <Btn x={24} y={116} w={120} h={32} label={t('homm.ui.adv.save')} size={12}
              disabled={!noteText.trim()} onClick={addNote} />
            <Btn x={276} y={116} w={120} h={32} label={t('homm.ui.common.cancel')} size={12}
              onClick={() => { setNoteAt(null); setNoteText(''); }} />
          </div>
        </div>
      )}

      {/* encounter dialog */}
      {encounter && hero && <CreatureEncounterDialog offer={hero.encounterOffer ?? {
        creature: encounter.creature, name: encounter.creature, count: encounter.count, gold: 0, canRecruit: false
      }} h3={h3}
        busy={encounterBusy} onAccept={() => resolveEncounter('recruit')} onDecline={() => resolveEncounter('pass')} />}

      {endTurnConfirm && <AdventureQuestion label={t('homm.ui.adv.btn.endTurn')} h3={h3}
        message={t('homm.ui.adv.endTurnAsk')}
        onYes={() => void endTurn()} onNo={() => setEndTurnConfirm(false)} />}

      {hero?.pendingLevel && <HeroLevel key={`${hero.id}-${hero.pendingLevel.level}`} hero={hero}
        onChanged={updated => { setHero(updated); setHeroes(hs => hs.map(h => h.id === updated.id ? updated : h)); void refresh(); }} />}
      {mineSharing && <NativeMessage text={mineSharing.shared ? t('homm.ui.adv.unshareAsk') : t('homm.ui.adv.shareAsk')}
        onClose={() => setMineSharing(null)} onConfirm={() => {
          const mine = mineSharing; setMineSharing(null);
          api.shareMine(gameId!, mine.x, mine.y, !mine.shared).then(refresh).catch(e => showMessage(errRaw(e, 'homm.ui.adv.shareFailed')));
        }} />}
      {exchange && <HeroExchange first={exchange[0]} second={exchange[1]} creatures={creatures}
        onChanged={updated => {
          setExchange([updated[0], updated[1]]);
          setHeroes(current => current.map(h => updated.find(u => u.id === h.id) ?? h));
          setHero(current => updated.find(h => h.id === current?.id) ?? current);
        }} onClose={() => { setExchange(null); void refresh(); }} />}

      {/* hero meeting: replaces hero-vs-hero battle */}
      {meeting && (
        <div className="backdrop">
          <div className="modal panel" style={{ width: 420, height: 296 }} role="dialog" aria-label={t('homm.ui.adv.meeting')}>
            <DialogBox w={420} h={296} />
            <Txt x={0} y={18} w={420} size={16} bold align="center" className="heading">
              {t('homm.ui.adv.youMeet').replace('{name}', serverText(t, meeting.heroName))}
            </Txt>
            <Txt x={30} y={48} w={360} size={11} align="center" color="var(--text-dim)">
              {t('homm.ui.adv.greets').replace('{name}', serverText(t, meeting.ownerName))}
            </Txt>
            <textarea
              aria-label={t('homm.ui.hero.message')}
              value={meetingText}
              maxLength={2000}
              onChange={(e) => setMeetingText(e.target.value)}
              placeholder={t('homm.ui.adv.saySomething')}
              style={{ position: 'absolute', left: 30, top: 74, width: 360, height: 70, resize: 'none' }}
            />
            <Btn x={30} y={156} w={360} h={30} label={t('homm.ui.adv.sendMessage')} size={12}
              disabled={!meetingText.trim()} onClick={sendMeetingMessage} />
            <Btn x={30} y={192} w={176} h={28} label={t('homm.ui.adv.offerTrade')} size={12}
              onClick={() => navigate(`/game/${gameId}/social?to=${meeting.playerId}`)} />
            <Btn x={214} y={192} w={176} h={28} label={t('homm.ui.adv.shareMarker')} size={12}
              onClick={() => { setMeeting(null); if (hero) setNoteAt({ x: hero.x, y: hero.y }); }} />
            <Btn x={30} y={228} w={360} h={28} label={t('homm.ui.adv.partWays')} size={12}
              onClick={() => setMeeting(null)} />
          </div>
        </div>
      )}

      {noticeQueue[0] && <AdventureNoticeDialog notice={noticeQueue[0]}
        spellName={spellDefs[noticeQueue[0].key] && nm(t, 'spell', noticeQueue[0].key, spellDefs[noticeQueue[0].key].name)} spellId={spellDefs[noticeQueue[0].key]?.id} h3={h3}
        onClose={() => setNoticeQueue(queue => queue.slice(1))} />}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- H3 art renderer

function viewBounds(cam: { x: number; y: number }) {
  const startX = Math.floor(cam.x), startY = Math.floor(cam.y);
  return { startX, startY, cols: Math.ceil(MAP_W / TILE) + 1, rows: Math.ceil(MAP_H / TILE) + 1 };
}

function pick<T>(list: T[], x: number, y: number, s: number): T {
  return list[Math.floor(hash(x, y, s) * list.length) % list.length];
}

function objectSprite(t: MapTile, x: number, y: number): { def: string; ox: number; animated: boolean } | null {
  const sprite = (def: string, animated: boolean) => ({ def, ox: objectAnchorX(def), animated });
  switch (t.objectKind) {
    case 'tree': return sprite(t.sprite ?? pick(TREE_DEFS[t.terrain ?? ''] ?? TREE_DEFS.default, x, y, 3), false);
    case 'rock': return sprite(t.sprite ?? pick(ROCK_DEFS, x, y, 4), false);
    case 'mountain': return sprite(t.sprite ?? pick(MOUNTAIN_DEFS, x, y, 5), false);
    case 'mine': return sprite(MINE_DEF[t.objectData ?? 'gold'] ?? MINE_DEF.gold, true);
    case 'resource': return sprite(RESOURCE_DEF[(t.objectData ?? 'gold').split(':')[0]] ?? RESOURCE_DEF.gold, true);
    case 'treasure': return sprite(OBJECT_DEF.treasure, true);
    case 'artifact': return sprite(artifactDef(artifactSeed(t.objectData)), true);
    case 'shrine': return sprite(t.sprite ?? OBJECT_DEF.shrine, true);
    case 'obelisk': return sprite(OBJECT_DEF.obelisk, true);
    case 'grail': return null;
    case 'monster': return sprite(monsterDef((t.objectData ?? '').split(':')[0]), true);
    default: return null;
  }
}

function anchorDraw(ctx: CanvasRenderingContext2D, s: Sheet, frame: number, px: number, py: number, ox: number, mirror = false) {
  drawFrame(ctx, s, frame, px + (1 + ox) * TILE - s.w, py + TILE - s.h, mirror);
}

const SEAT_FACTION = Object.fromEntries(Object.entries(FACTION_SEAT).map(([f, s]) => [s, f])) as Record<number, string>;

const FLIPS: [number, number][] = [[1, 1], [-1, 1], [1, -1], [-1, -1]];

// Shroud-edge lookup from VCMI MapRenderer.cpp (NeighborTilesInfo); ids >= 34 are left-right mirrors of SHROUD_ROT.
const SHROUD_ROT = [22, 15, 2, 13, 12, 16, 28, 17, 20, 19, 7, 24, 26, 25, 30, 32, 27];
const SHROUD_IDS = [
  -1, 34, 4, 4, 22, 23, 4, 4, 36, 36, 38, 38, 47, 47, 38, 38, 3, 25, 12, 12, 3, 25, 12, 12, 9, 9, 6, 6, 9, 9, 6, 6,
  35, 39, 48, 48, 41, 43, 48, 48, 36, 36, 38, 38, 47, 47, 38, 38, 26, 49, 28, 28, 26, 49, 28, 28, 9, 9, 6, 6, 9, 9, 6, 6,
  0, 45, 29, 29, 24, 33, 29, 29, 37, 37, 7, 7, 50, 50, 7, 7, 13, 27, 44, 44, 13, 27, 44, 44, 8, 8, 10, 10, 8, 8, 10, 10,
  0, 45, 29, 29, 24, 33, 29, 29, 37, 37, 7, 7, 50, 50, 7, 7, 13, 27, 44, 44, 13, 27, 44, 44, 8, 8, 10, 10, 8, 8, 10, 10,
  15, 17, 30, 30, 16, 19, 30, 30, 46, 46, 40, 40, 32, 32, 40, 40, 2, 25, 12, 12, 2, 25, 12, 12, 9, 9, 6, 6, 9, 9, 6, 6,
  18, 42, 31, 31, 20, 21, 31, 31, 46, 46, 40, 40, 32, 32, 40, 40, 26, 49, 28, 28, 26, 49, 28, 28, 9, 9, 6, 6, 9, 9, 6, 6,
  0, 45, 29, 29, 24, 33, 29, 29, 37, 37, 7, 7, 50, 50, 7, 7, 13, 27, 44, 44, 13, 27, 44, 44, 8, 8, 10, 10, 8, 8, 10, 10,
  0, 45, 29, 29, 24, 33, 29, 29, 37, 37, 7, 7, 50, 50, 7, 7, 13, 27, 44, 44, 13, 27, 44, 44, 8, 8, 10, 10, 8, 8, 10, 10
];

function neighbourTerrain(map: MapData, x: number, y: number): string | null {
  for (const [dx, dy] of [[0, 1], [0, -1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
    const n = map.tiles[ny * map.width + nx];
    if (n.fog !== 0 && n.terrain) return n.terrain;
  }
  return null;
}

function shroudFrame(map: MapData, x: number, y: number): number {
  const vis = (dx: number, dy: number) => {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) return false;
    const t = map.tiles[ny * map.width + nx];
    return t.fog !== 0 && !!t.terrain;
  };
  const d1 = vis(0, 1), d3 = vis(-1, 0), d4 = vis(1, 0), d6 = vis(0, -1);
  const d0 = d1 || d3 || vis(-1, 1), d2 = d1 || d4 || vis(1, 1), d5 = d3 || d6 || vis(-1, -1), d7 = d4 || d6 || vis(1, -1);
  const bits = [d0, d1, d2, d3, d4, d5, d6, d7].reduce((a, v, i) => a | (v ? 1 << i : 0), 0);
  return SHROUD_IDS[bits];
}

/** Picks an H3 edge-transition frame range + flip for a tile, or null for a plain interior tile. */
function terrainView(map: MapData, x: number, y: number, terrain: string): { range: [number, number]; fx: number; fy: number } | null {
  const edges = edgeFrames(terrain);
  if (!edges) return null;
  const b = (dx: number, dy: number) => {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) return null;
    return borderKind(terrain, map.tiles[ny * map.width + nx].terrain);
  };
  if (![-1, 0, 1].some(dy => [-1, 0, 1].some(dx => (dx || dy) && b(dx, dy)))) return null;
  // pattern checks in pattern space: border expected at left/top
  const patterns: [string, (p: (px: number, py: number) => 'D' | 'S' | null) => 'D' | 'S' | null][] = [
    ['left', p => p(-1, 0) && !p(0, -1) && !p(1, -1) && !p(1, 0) && !p(1, 1) && !p(0, 1) ? p(-1, 0) : null],
    ['top', p => p(0, -1) && !p(-1, 0) && !p(1, 0) && !p(-1, 1) && !p(0, 1) && !p(1, 1) ? p(0, -1) : null],
    ['inner', p => p(1, 1) && !p(-1, -1) && !p(0, -1) && !p(1, -1) && !p(-1, 0) && !p(1, 0) && !p(-1, 1) && !p(0, 1) ? p(1, 1) : null],
    ['outer', p => p(-1, -1) && p(0, -1) && p(-1, 0) && !p(1, 0) && !p(0, 1) && !p(1, 1) ? p(0, -1) : null],
    ['fallback', p => (p(0, -1) || p(-1, 0)) && !p(1, 0) && !p(0, 1) && !p(1, 1) ? (p(0, -1) || p(-1, 0)) : null]
  ];
  for (const [name, test] of patterns) {
    for (const [fx, fy] of FLIPS) {
      const kind = test((px, py) => b(px * fx, py * fy));
      if (kind) return { range: edges[name][kind === 'D' ? 0 : 1], fx, fy };
    }
  }
  return null;
}

export function renderH3(ctx: CanvasRenderingContext2D, map: MapData, cam: { x: number; y: number }, tick: number,
  facing: Map<string, Facing>, moving: string | null,
  notes: { x: number; y: number }[] = [], glide: Glide | null = null) {
  const { startX, startY, cols, rows } = viewBounds(cam);
  const ox0 = (cam.x - startX) * TILE, oy0 = (cam.y - startY) * TILE;
  const at = (x: number, y: number) => map.tiles[y * map.width + x];

  // terrain
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      const mx = startX + rx, my = startY + ry;
      if (mx < 0 || my < 0 || mx >= map.width || my >= map.height) continue;
      const t = at(mx, my);
      const terrain = t.terrain && t.fog !== 0 ? t.terrain : shroudFrame(map, mx, my) >= 0 ? neighbourTerrain(map, mx, my) : null;
      if (!terrain) continue;
      const sx = rx * TILE - ox0, sy = ry * TILE - oy0;
      const td = TERRAIN_DEF[terrain] ?? TERRAIN_DEF.grass;
      const s = getDef(td.def);
      if (s) {
        const view = terrain === t.terrain ? terrainView(map, mx, my, terrain) : null;
        if (view) {
          const [lo, hi] = view.range;
          drawFrame(ctx, s, Math.min(lo + Math.floor(hash(mx, my, 11) * (hi - lo + 1)), s.count - 1), sx, sy, view.fx < 0, view.fy < 0);
        } else {
          const [lo, hi] = td.frames;
          const f = lo + Math.floor(hash(mx, my, 11) * (hi - lo + 1));
          drawFrame(ctx, s, Math.min(f, s.count - 1), sx, sy, hash(mx, my, 12) > 0.5);
        }
      } else {
        ctx.fillStyle = TERRAIN_COLOR[terrain] ?? '#5a8a3a';
        ctx.fillRect(sx, sy, TILE, TILE);
      }
    }
  }

  // fog of war — painted over the terrain, before objects/towns/heroes so they stay visible
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      const mx = startX + rx, my = startY + ry;
      const sx = rx * TILE - ox0, sy = ry * TILE - oy0;
      if (mx < 0 || my < 0 || mx >= map.width || my >= map.height) { ctx.fillStyle = '#000'; ctx.fillRect(sx, sy, TILE, TILE); continue; }
      const t = at(mx, my);
      if (t.fog === 0 || !t.terrain) {
        const shroud = shroudFrame(map, mx, my);
        const edge = getDef('TSHRE'), full = getDef('TSHRC');
        if (shroud >= 0 && edge) {
          drawFrame(ctx, edge, shroud < 34 ? shroud : SHROUD_ROT[shroud - 34], sx, sy, shroud >= 34);
        } else if (shroud < 0 && full) {
          drawFrame(ctx, full, (((mx * 997) ^ (my * 1009)) / 101 | 0) % full.count, sx, sy);
        } else { ctx.fillStyle = '#000'; ctx.fillRect(sx, sy, TILE, TILE); }
      }
    }
  }

  // objects, towns and heroes sorted by their base row (painter's order)
  type D = { y: number; x: number; draw: () => void };
  const list: D[] = [];
  for (let my = startY - 1; my < startY + rows + 6; my++) {
    for (let mx = startX - 3; mx < startX + cols + 4; mx++) {
      if (mx < 0 || my < 0 || mx >= map.width || my >= map.height) continue;
      const t = at(mx, my);
      if (!t.objectKind || t.fog === 0) continue;
      if (t.objectKind === 'grail') {
        list.push({ y: my, x: mx, draw: () => drawGrailSite(ctx, (mx - cam.x) * TILE, (my - cam.y) * TILE) });
        continue;
      }
      const spr = objectSprite(t, mx, my);
      if (!spr) continue;
      const s = getDef(spr.def) ?? (t.objectKind === 'monster' ? getDef('AVWMON1') : null);
      if (!s) continue;
      const px = (mx - cam.x) * TILE, py = (my - cam.y) * TILE;
      list.push({
        y: my, x: mx, draw: () => {
          const frame = spr.animated ? groupFrame(s, 0, tick + mx * 3 + my) : 0;
          anchorDraw(ctx, s, frame, px, py, spr.ox, t.objectKind === 'monster' && hash(mx, my, 9) > 0.5);
          if (t.objectKind === 'mine' && t.owner > 0) {
            // owner is a bitmask: one flag per city working the mine
            let slot = 0;
            for (let seat = 0; seat < 8; seat++) {
              if ((t.owner & (1 << seat)) === 0) continue;
              const f = getDef(flagDef(SEAT_FACTION[seat] ?? 'castle'));
              if (f) drawFrame(ctx, f, groupFrame(f, 2, tick), px - 40 + slot * 14, py - 30);
              slot++;
            }
          }
        }
      });
    }
  }
  for (const town of map.towns) {
    const s = getDef(TOWN_MAP_DEF[town.faction] ?? 'AVCcasx0');
    if (!s) continue;
    const px = (town.x - cam.x) * TILE, py = (town.y - cam.y) * TILE;
    if (px < -4 * TILE || py < -TILE || px > MAP_W + 6 * TILE || py > MAP_H + 6 * TILE) continue;
    list.push({ y: town.y, x: town.x + 2, draw: () => anchorDraw(ctx, s, 0, px, py, objectAnchorX(TOWN_MAP_DEF[town.faction] ?? 'AVCcasx0')) });
  }
  for (const h of map.heroes) {
    const g0 = glide && glide.id === h.id ? glide : null;
    const hx = g0 ? g0.x : h.x, hy = g0 ? g0.y : h.y;
    const px = (hx - cam.x) * TILE, py = (hy - cam.y) * TILE;
    if (px < -3 * TILE || py < -TILE || px > MAP_W + 3 * TILE || py > MAP_H + 2 * TILE) continue;
    const s = getDef(heroMapDef(h.name, h.faction)) ?? getDef('AH00_');
    if (!s) continue;
    const fl = getDef(flagDef(h.faction));
    const dir = facing.get(h.id) ?? { group: 2, mirror: false };
    const isMoving = moving === h.id;
    // while gliding, the walking frames advance with the distance covered
    const f = g0 ? g0.frame : tick;
    list.push({
      y: Math.ceil(hy), x: 1e6 + hx, draw: () => {
        const g = isMoving ? dir.group + 5 : dir.group;
        anchorDraw(ctx, s, groupFrame(s, g, f), px, py, 1, dir.mirror);
        if (fl) anchorDraw(ctx, fl, groupFrame(fl, g, f), px, py, 1, dir.mirror);
      }
    });
  }
  list.sort((a, b) => a.y - b.y || a.x - b.x);
  for (const d of list) d.draw();

  // map annotations: a small pin on each noted tile
  for (const a of notes) {
    const px = (a.x - cam.x) * TILE, py = (a.y - cam.y) * TILE;
    if (px < -TILE || py < -TILE || px > MAP_W + TILE || py > MAP_H + TILE) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(px + 2, py + 2, 12, 12);
    ctx.fillStyle = '#e8c060';
    ctx.fillRect(px + 3, py + 3, 10, 10);
    ctx.fillStyle = '#2a1a08';
    ctx.fillRect(px + 6, py + 5, 4, 6);
  }
}

// ---------------------------------------------------------------- built-in art renderer

export function renderFallback(ctx: CanvasRenderingContext2D, map: MapData, cam: { x: number; y: number }) {
  const { startX, startY, cols, rows } = viewBounds(cam);
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      const mx = startX + rx, my = startY + ry;
      if (mx < 0 || my < 0 || mx >= map.width || my >= map.height) continue;
      const t = map.tiles[my * map.width + mx];
      const sx = rx * TILE - (cam.x - startX) * TILE;
      const sy = ry * TILE - (cam.y - startY) * TILE;

      if (t.fog === 0 || !t.terrain) {
        ctx.fillStyle = '#07070a';
        ctx.fillRect(sx, sy, TILE, TILE);
        continue;
      }

      const base = TERRAIN_COLOR[t.terrain] ?? '#5a8a3a';
      ctx.fillStyle = base;
      ctx.fillRect(sx, sy, TILE, TILE);
      for (let py = 0; py < TILE; py += 4) {
        for (let px = 0; px < TILE; px += 4) {
          const n = hash(mx * TILE + px, my * TILE + py, t.variant);
          if (n > 0.6) {
            ctx.fillStyle = shade(base, (n - 0.6) * 0.5);
            ctx.fillRect(sx + px, sy + py, 4, 4);
          }
        }
      }
      if (t.objectKind) drawObject(ctx, t, sx, sy);
    }
  }
  for (const town of map.towns) {
    const sx = (town.x - cam.x) * TILE, sy = (town.y - cam.y) * TILE;
    if (sx < -TILE || sy < -TILE || sx > MAP_W || sy > MAP_H) continue;
    drawTown(ctx, sx, sy, FACTION_COLOR[town.faction] ?? '#888');
  }
  for (const h of map.heroes) {
    const sx = (h.x - cam.x) * TILE, sy = (h.y - cam.y) * TILE;
    if (sx < -TILE || sy < -TILE || sx > MAP_W || sy > MAP_H) continue;
    drawHero(ctx, sx, sy, FACTION_COLOR[h.faction] ?? '#888', h.isMine);
  }
}

// ---------------------------------------------------------------- small widgets

function ListArrow(props: { h3: boolean; def: string; x: number; y: number; w: number; label: string; onClick: () => void }) {
  const { h3, def, x, y, w, label, onClick } = props;
  return (
    <button type="button" aria-label={label} title={label} className={h3 ? 'h3hit' : 'btn'}
      style={{ position: 'absolute', left: x, top: y, width: w, height: 16, padding: 0, fontSize: 9 }} onClick={onClick}>
      {h3 ? <DefImg name={def} frame={0} x={0} y={0} /> : (def === 'IAM012' || def === 'IAM014' ? '▲' : '▼')}
    </button>
  );
}

function Bar(props: { x: number; value: number; max: number; color: string }) {
  const hgt = Math.round(30 * Math.min(1, props.value / Math.max(1, props.max)));
  return (
    <div className="abs" style={{ left: props.x, top: 1, width: 6, height: 30, background: '#000' }}>
      <div style={{ position: 'absolute', bottom: 0, width: 6, height: hgt, background: props.color }} />
    </div>
  );
}

/** An original bitmap with a built-in fallback if this PCX is absent from the player's files. */
function H3Img(props: { name: string; x: number; y: number; w: number; h: number; fallback: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [props.name]);
  if (failed) return <div className="abs" style={{ left: props.x, top: props.y, width: props.w, height: props.h, overflow: 'hidden' }}>{props.fallback}</div>;
  return (
    <img src={pcxUrl(props.name)} alt="" draggable={false} onError={() => setFailed(true)}
      style={{ position: 'absolute', left: props.x, top: props.y, width: props.w, height: props.h, pointerEvents: 'none' }} />
  );
}

// ---------------------------------------------------------------- drawing

function drawObject(ctx: CanvasRenderingContext2D, t: MapTile, sx: number, sy: number) {
  const kind = t.objectKind;
  if (kind === 'tree') {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(sx + 16, sy + 28, 9, 3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#4a3020'; ctx.fillRect(sx + 14, sy + 18, 4, 10);
    ctx.fillStyle = '#3a6a2a'; ctx.beginPath(); ctx.arc(sx + 16, sy + 14, 10, 0, 7); ctx.fill();
    ctx.fillStyle = '#4a8a3a'; ctx.beginPath(); ctx.arc(sx + 13, sy + 11, 6, 0, 7); ctx.fill();
  } else if (kind === 'rock') {
    ctx.fillStyle = '#7a7a7a';
    ctx.beginPath();
    ctx.moveTo(sx + 6, sy + 26); ctx.lineTo(sx + 10, sy + 12);
    ctx.lineTo(sx + 20, sy + 8); ctx.lineTo(sx + 27, sy + 18);
    ctx.lineTo(sx + 24, sy + 26); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9a9a9a';
    ctx.beginPath();
    ctx.moveTo(sx + 10, sy + 12); ctx.lineTo(sx + 20, sy + 8);
    ctx.lineTo(sx + 18, sy + 16); ctx.closePath(); ctx.fill();
  } else if (kind === 'mountain') {
    ctx.fillStyle = '#5a5a62';
    ctx.beginPath();
    ctx.moveTo(sx + 2, sy + 30); ctx.lineTo(sx + 16, sy + 2);
    ctx.lineTo(sx + 30, sy + 30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8e8f0';
    ctx.beginPath();
    ctx.moveTo(sx + 11, sy + 12); ctx.lineTo(sx + 16, sy + 2);
    ctx.lineTo(sx + 21, sy + 12); ctx.lineTo(sx + 16, sy + 9); ctx.closePath(); ctx.fill();
  } else if (kind === 'mine') {
    ctx.fillStyle = '#5a5048';
    ctx.beginPath();
    ctx.moveTo(sx + 4, sy + 28); ctx.lineTo(sx + 16, sy + 6);
    ctx.lineTo(sx + 28, sy + 28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1a1410';
    ctx.beginPath(); ctx.arc(sx + 16, sy + 24, 6, Math.PI, 0); ctx.fill();
    ctx.fillRect(sx + 10, sy + 24, 12, 4);
    ctx.fillStyle = RES_COLOR[t.objectData ?? 'gold'] ?? '#e8c040';
    ctx.beginPath(); ctx.arc(sx + 16, sy + 10, 3, 0, 7); ctx.fill();
  } else if (kind === 'resource') {
    const type = (t.objectData ?? 'gold').split(':')[0];
    ctx.fillStyle = RES_COLOR[type] ?? '#e8c040';
    ctx.beginPath(); ctx.arc(sx + 16, sy + 18, 7, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(sx + 13, sy + 15, 2.5, 0, 7); ctx.fill();
  } else if (kind === 'treasure') {
    ctx.fillStyle = '#8a5a20'; ctx.fillRect(sx + 7, sy + 14, 18, 12);
    ctx.fillStyle = '#a06a28'; ctx.beginPath(); ctx.arc(sx + 16, sy + 14, 9, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#e0c040'; ctx.fillRect(sx + 14, sy + 14, 4, 6);
  } else if (kind === 'artifact') {
    ctx.fillStyle = '#e0c040';
    ctx.beginPath();
    ctx.moveTo(sx + 16, sy + 6); ctx.lineTo(sx + 22, sy + 16);
    ctx.lineTo(sx + 16, sy + 26); ctx.lineTo(sx + 10, sy + 16);
    ctx.closePath(); ctx.fill();
  } else if (kind === 'shrine') {
    ctx.fillStyle = '#a0a0a8'; ctx.fillRect(sx + 8, sy + 20, 16, 8); ctx.fillRect(sx + 11, sy + 8, 10, 12);
    ctx.fillStyle = '#c0c0c8';
    ctx.beginPath();
    ctx.moveTo(sx + 9, sy + 8); ctx.lineTo(sx + 16, sy + 2);
    ctx.lineTo(sx + 23, sy + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#60c0ff'; ctx.beginPath(); ctx.arc(sx + 16, sy + 14, 3, 0, 7); ctx.fill();
  } else if (kind === 'monster') {
    ctx.fillStyle = '#8a2a2a'; ctx.beginPath(); ctx.arc(sx + 16, sy + 16, 9, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd040';
    ctx.beginPath(); ctx.arc(sx + 12, sy + 14, 2, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 20, sy + 14, 2, 0, 7); ctx.fill();
  } else if (kind === 'grail') {
    drawGrailSite(ctx, sx, sy);
  }
}

function drawGrailSite(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.strokeStyle = '#e0c040';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 9, y + 9); ctx.lineTo(x + 23, y + 23);
  ctx.moveTo(x + 23, y + 9); ctx.lineTo(x + 9, y + 23);
  ctx.stroke();
}

// Town drawn ~2x2 tiles: gate sits on the town tile, walls extend up and to the sides.
function drawTown(ctx: CanvasRenderingContext2D, sx: number, sy: number, color: string) {
  const L = sx - 16, T = sy - 22;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.ellipse(sx + 16, sy + 30, 34, 7, 0, 0, 7); ctx.fill();
  // curtain wall
  ctx.fillStyle = '#9a8e78'; ctx.fillRect(L + 4, T + 30, 56, 24);
  ctx.fillStyle = '#7a705e'; ctx.fillRect(L + 4, T + 50, 56, 4);
  for (let i = 0; i < 7; i++) { ctx.fillStyle = '#b0a48c'; ctx.fillRect(L + 4 + i * 8, T + 26, 5, 5); }
  // keep
  ctx.fillStyle = '#b8ac94'; ctx.fillRect(L + 22, T + 8, 20, 30);
  ctx.fillStyle = '#8a7e68'; ctx.fillRect(L + 38, T + 8, 4, 30);
  // side towers
  for (const tx of [L, L + 52]) {
    ctx.fillStyle = '#a89c84'; ctx.fillRect(tx, T + 18, 12, 36);
    ctx.fillStyle = '#7a705e'; ctx.fillRect(tx + 9, T + 18, 3, 36);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(tx - 2, T + 18); ctx.lineTo(tx + 6, T + 4); ctx.lineTo(tx + 14, T + 18); ctx.closePath(); ctx.fill();
  }
  // keep roof + banner
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(L + 19, T + 8); ctx.lineTo(L + 32, T - 10); ctx.lineTo(L + 45, T + 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3a2a18'; ctx.fillRect(L + 31, T - 20, 2, 12);
  ctx.fillStyle = color; ctx.fillRect(L + 33, T - 20, 9, 6);
  // windows + gate
  ctx.fillStyle = '#2a2018'; ctx.fillRect(L + 28, T + 14, 3, 5); ctx.fillRect(L + 34, T + 14, 3, 5);
  ctx.fillStyle = '#241a10';
  ctx.beginPath(); ctx.moveTo(sx + 9, sy + 32); ctx.lineTo(sx + 9, sy + 22); ctx.arc(sx + 16, sy + 22, 7, Math.PI, 0); ctx.lineTo(sx + 23, sy + 32); ctx.closePath(); ctx.fill();
}

// Mounted hero with a faction banner, HoMM3 style.
function drawHero(ctx: CanvasRenderingContext2D, sx: number, sy: number, color: string, mine: boolean) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.ellipse(sx + 16, sy + 29, 13, 3.5, 0, 0, 7); ctx.fill();
  // horse
  ctx.fillStyle = '#6a4a2a';
  ctx.beginPath(); ctx.ellipse(sx + 15, sy + 20, 10, 5, 0, 0, 7); ctx.fill();
  ctx.fillRect(sx + 7, sy + 22, 2, 7); ctx.fillRect(sx + 11, sy + 23, 2, 6);
  ctx.fillRect(sx + 18, sy + 23, 2, 6); ctx.fillRect(sx + 22, sy + 22, 2, 7);
  ctx.beginPath(); ctx.moveTo(sx + 22, sy + 18); ctx.lineTo(sx + 29, sy + 11); ctx.lineTo(sx + 31, sy + 14); ctx.lineTo(sx + 25, sy + 21); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2a1a0a'; ctx.fillRect(sx + 4, sy + 17, 3, 7);
  // caparison in faction colour
  ctx.fillStyle = color; ctx.fillRect(sx + 9, sy + 17, 12, 6);
  // rider
  ctx.fillStyle = '#c8c8d0'; ctx.fillRect(sx + 12, sy + 8, 6, 10);
  ctx.fillStyle = '#d8b090'; ctx.beginPath(); ctx.arc(sx + 15, sy + 6, 3, 0, 7); ctx.fill();
  ctx.fillStyle = '#909098'; ctx.fillRect(sx + 12, sy + 2, 6, 3);
  // banner pole
  ctx.fillStyle = '#3a2a18'; ctx.fillRect(sx + 9, sy - 4, 2, 22);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(sx + 11, sy - 4); ctx.lineTo(sx + 1, sy - 1); ctx.lineTo(sx + 11, sy + 3); ctx.closePath(); ctx.fill();
  if (mine) {
    ctx.strokeStyle = 'rgba(255,208,64,0.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(sx + 16, sy + 29, 14, 4, 0, 0, 7); ctx.stroke();
  }
}

const RES_COLOR: Record<string, string> = {
  wood: '#8a5a2b', ore: '#7a7a84', mercury: '#c0c0d0', sulfur: '#e8d060',
  crystal: '#60c0e0', gems: '#40c060', gold: '#e8c040'
};

function TownThumb({ faction }: { faction: string }) {
  const color = FACTION_COLOR[faction] ?? '#888';
  return (
    <svg width={68} height={44} viewBox="0 0 68 44" style={{ position: 'absolute', left: 0, top: 0 }}>
      <rect width={68} height={44} fill="#3a5a2a" />
      <rect y={30} width={68} height={14} fill="#2a4a1e" />
      <rect x={12} y={20} width={44} height={18} fill="#9a8e78" />
      <rect x={26} y={8} width={16} height={30} fill="#b8ac94" />
      <rect x={8} y={14} width={10} height={24} fill="#a89c84" />
      <rect x={50} y={14} width={10} height={24} fill="#a89c84" />
      <path d="M6 14 L13 4 L20 14Z M48 14 L55 4 L62 14Z M23 8 L34 -4 L45 8Z" fill={color} />
      <path d="M30 38 V31 A4 4 0 0 1 38 31 V38Z" fill="#241a10" />
    </svg>
  );
}
function CreatureIcon({ creature, size }: { creature: string; size: number }) {
  const tier = creatureTier(creature);
  const hue = (tier * 40) % 360;
  return (
    <svg width={size} height={size} viewBox="0 0 38 38">
      <circle cx={19} cy={19} r={13} fill={`hsl(${hue},45%,45%)`} />
      <circle cx={14} cy={16} r={2.5} fill="#ffd040" />
      <circle cx={24} cy={16} r={2.5} fill="#ffd040" />
      <path d="M14 24 Q19 28 24 24" stroke="#1a1410" strokeWidth={1.5} fill="none" />
    </svg>
  );
}

function creatureTier(key: string): number {
  const tiers: Record<string, number> = {
    pikeman: 1, halberdier: 1, archer: 2, marksman: 2, griffin: 3, royalGriffin: 3,
    swordsman: 4, crusader: 4, monk: 5, zealot: 5, cavalier: 6, champion: 6,
    angel: 7, archangel: 7, centaur: 1, centaurCaptain: 1, dwarf: 2, battleDwarf: 2,
    woodElf: 3, grandElf: 3, pegasus: 4, silverPegasus: 4, dendroid: 5, dendroidSoldier: 5,
    unicorn: 6, warUnicorn: 6, greenDragon: 7, goldDragon: 7, skeleton: 1, skeletonWarrior: 1,
    walkingDead: 2, zombie: 2, wight: 3, wraith: 3, vampire: 4, vampireLord: 4,
    lich: 5, powerLich: 5, blackKnight: 6, dreadKnight: 6, boneDragon: 7, ghostDragon: 7
  };
  return tiers[key] ?? 1;
}

function creatureLabel(key: string): string {
  return pluralCreatureName(key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()));
}

function pluralCreatureName(name: string): string {
  if (/Cyclops$/.test(name)) return name;
  if (/Pegasus$/.test(name)) return name.slice(0, -2) + 'i';
  if (/Efreet$/.test(name)) return name + 'i';
  if (/man$/.test(name)) return name.slice(0, -3) + 'men';
  if (/(?:Elf|Dwarf)$/.test(name)) return name.slice(0, -1) + 'ves';
  if (/[^aeiou]y$/.test(name)) return name.slice(0, -1) + 'ies';
  if (/Mage$/.test(name)) return name.slice(0, -4) + 'Magi';
  return name + (/(?:s|x|z|ch|sh)$/.test(name) ? 'es' : 's');
}

/** A creature name for a count: English plurals in English, the plain name otherwise. */
function creatureCount(t: T, language: string, key: string, name: string | undefined, count: number): string {
  if (language !== 'en') return nm(t, 'creature', key, name);
  const en = name ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
  return count === 1 ? en : pluralCreatureName(en);
}

function objectName(t: T, language: string, tile: MapTile): string {
  switch (tile.objectKind) {
    case 'mine': return `${nm(t, 'mine', tile.objectData, `${tile.objectData} Mine`)}${tile.owner > 0 ? t('homm.ui.adv.claimed') : ''}`;
    case 'resource': return `${(tile.objectData ?? '').split(':')[1]} ${resLabel(t, (tile.objectData ?? '').split(':')[0])}`;
    case 'treasure': return t('homm.ui.adv.treasure');
    case 'artifact': return t('homm.ui.adv.artifact');
    case 'shrine': return t('homm.srv.shrine');
    case 'obelisk': return t('homm.ui.adv.obelisk');
    case 'monster': {
      const [c, n] = (tile.objectData ?? '').split(':');
      return c && n ? `${n} ${language === 'en' ? creatureLabel(c) : nm(t, 'creature', c)}` : t('homm.ui.adv.wandering');
    }
    case 'grail': return t('homm.ui.adv.grail');
    case 'tree': return t('homm.ui.adv.trees');
    case 'rock': return t('homm.ui.adv.rocks');
    case 'mountain': return t('homm.ui.adv.mountains');
    case 'town': return t('homm.ui.adv.town');
    default: return '';
  }
}

function NewDayInfo({ date, onClose }: { date: GameDetail; onClose: () => void }) {
  const { t } = useLanguage();
  const h3 = useH3();
  const week = date.day === 1 && date.turn > 1;
  const requested = week ? `NEWWEEK${date.week}` : 'NEWDAY';
  const sheet = useDef(h3 ? requested : null);
  const fallback = useDef(h3 && week && sheet === null ? 'NEWWEEK1' : null);
  const name = sheet === null && week ? 'NEWWEEK1' : requested;
  const count = (sheet ?? fallback)?.count ?? 1;
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const animation = window.setInterval(() => setElapsed(performance.now() - start), 50);
    const timer = window.setTimeout(onClose, 3000);
    return () => { window.clearInterval(animation); window.clearTimeout(timer); };
  }, []);
  return (
    <div role="status" aria-label={t('homm.ui.adv.newTurn')} data-day={date.day} data-week={date.week} data-animation={name}
      style={{ position: 'absolute', inset: 0, cursor: 'pointer' }} onClick={onClose}>
      {h3 && <DefImg name={name} frame={Math.min(count - 1, Math.floor(elapsed * count / 1500))} x={1} y={0} />}
      <Txt x={20} y={20} w={150} size={16} align="center">{week ? t('homm.ui.adv.week').replace('{n}', String(date.week)) : t('homm.ui.adv.day').replace('{n}', String(date.day))}</Txt>
    </div>
  );
}

function AdventureQuestion({ label, message, h3, gold, busy, onYes, onNo }: {
  label: string; message: string; h3: boolean; gold?: number; busy?: boolean; onYes: () => void; onNo: () => void;
}) {
  const { t } = useLanguage();
  const height = gold == null ? 190 : 300;
  return <div className="backdrop">
    <div className="modal panel" role="dialog" aria-modal="true" aria-label={label} style={{ width: 440, height }}>
      <DialogBox w={440} h={height} />
      <Txt x={30} y={40} w={380} size={12} align="center">{message}</Txt>
      {gold != null && <>
        {h3 ? <DefImg name="RESOUR82" frame={6} x={179} y={100} />
          : <div className="abs" style={{ left: 196, top: 120 }}><ResIcon r="gold" size={48} /></div>}
        <Txt x={30} y={200} w={380} size={12} align="center">{gold}</Txt>
      </>}
      {h3 ? <>
        <DefButton def="IOKAY" x={114} y={height - 55} label={t('homm.ui.common.yes')} disabled={busy} onClick={onYes} />
        <DefButton def="ICANCEL" x={264} y={height - 55} label={t('homm.ui.common.no')} disabled={busy} onClick={onNo} />
      </> : <>
        <Btn x={100} y={height - 55} w={90} h={30} label={t('homm.ui.common.yes')} disabled={busy} onClick={onYes} />
        <Btn x={250} y={height - 55} w={90} h={30} label={t('homm.ui.common.no')} disabled={busy} onClick={onNo} />
      </>}
    </div>
  </div>;
}

function CreatureEncounterDialog({ offer, h3, busy, onAccept, onDecline }: {
  offer: NonNullable<HeroDetail['encounterOffer']>; h3: boolean; busy: boolean; onAccept: () => void; onDecline: () => void;
}) {
  const { t, language } = useLanguage();
  const name = creatureCount(t, language, offer.creature, offer.name, offer.count);
  if (offer.canRecruit) return <AdventureQuestion label={t('homm.ui.adv.encounter')} h3={h3} gold={offer.gold} busy={busy}
    message={t(offer.count === 1 ? 'homm.ui.adv.joinOne' : 'homm.ui.adv.joinMany').replace('{n}', String(offer.count)).replace('{name}', name).replace('{gold}', String(offer.gold))}
    onYes={onAccept} onNo={onDecline} />;
  return <div className="backdrop">
    <div className="modal panel" role="dialog" aria-modal="true" aria-label={t('homm.ui.adv.encounter')} style={{ width: 400, height: 250 }}>
      <DialogBox w={400} h={250} />
      <Txt x={30} y={40} w={340} size={12} align="center">{t('homm.ui.adv.wontJoinArmy')}</Txt>
      {h3 ? <DefImg name="TWCRPORT" frame={creaturePortraitFrame(offer.creature)} x={171} y={88} />
        : <div className="abs" style={{ left: 175, top: 90 }}><CreatureIcon creature={offer.creature} size={48} /></div>}
      <Txt x={30} y={163} w={340} size={12} align="center">{offer.count} {name}</Txt>
      {h3 ? <DefButton def="IOKAY" x={168} y={195} label={t('homm.ui.common.ok')} disabled={busy} onClick={onDecline} />
        : <Btn x={155} y={195} w={90} h={30} label={t('homm.ui.common.ok')} disabled={busy} onClick={onDecline} />}
    </div>
  </div>;
}

function AdventureNoticeDialog({ notice, spellName, spellId, h3, onClose }: {
  notice: AdventureNotice; spellName?: string; spellId?: number; h3: boolean; onClose: () => void;
}) {
  const { t } = useLanguage();
  const title = notice.kind === 'shrine' ? t('homm.ui.adv.shrineOfMagic') : notice.kind === 'artifact' ? t('homm.ui.adv.artifact')
    : notice.kind === 'mine' ? t('homm.srv.mine') : notice.kind === 'grail' ? t('homm.ui.adv.grail') : serverText(t, notice.key);
  return (
    <div className="backdrop">
      <div className="modal panel" style={{ width: 440, height: 280 }} role="dialog" aria-modal="true" aria-label={title}>
        <DialogBox w={440} h={280} />
        {notice.kind !== 'message' && <Txt x={20} y={20} w={400} size={16} bold align="center" className="heading">{title}</Txt>}
        <Txt x={32} y={54} w={376} size={12} align="center">{serverText(t, notice.message)}</Txt>
        {h3 && notice.kind === 'shrine' && spellId != null &&
          <DefImg name="SPELLSCR" frame={spellId} x={172} y={101} />}
        {h3 && notice.icon != null && <DefImg name="Artifact" frame={notice.icon} x={198} y={119} />}
        {notice.kind === 'mine' && (h3
          ? <DefImg name="RESOUR82" frame={RES_FRAME[notice.key]} x={179} y={100} />
          : <div style={{ position: 'absolute', left: 196, top: 114 }}><ResIcon r={notice.key} size={48} /></div>)}
        <Txt x={24} y={194} w={392} size={12} align="center">
          {notice.kind === 'shrine' ? spellName ?? nm(t, 'spell', notice.key) : notice.kind === 'mine' ? t('homm.ui.adv.perDay').replace('{n}', String(notice.amount)) : ''}
        </Txt>
        {h3 ? <DefButton def="IOKAY" x={188} y={230} label={t('homm.ui.common.ok')} onClick={onClose} />
          : <Btn x={170} y={230} w={100} h={30} label={t('homm.ui.common.ok')} onClick={onClose} />}
      </div>
    </div>
  );
}

function WorldViewDialog({ view, onClose }: { view: WorldView; onClose: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="backdrop">
      <div className="modal panel" style={{ width: 520, height: 480 }} role="dialog" aria-label={t('homm.ui.adv.worldView')}>
        <Txt x={0} y={16} w={520} size={16} bold align="center" className="heading">{t('homm.ui.adv.worldView')}</Txt>
        <svg role="img" aria-label={t('homm.ui.adv.revealed')} viewBox={`0 0 ${view.width} ${view.height}`}
          style={{ position: 'absolute', left: 24, top: 50, width: 472, height: 230, background: '#111' }}>
          {view.terrain.map((terrain, i) => terrain && <rect key={i} x={i % view.width} y={Math.floor(i / view.width)}
            width={1} height={1} fill={TERRAIN_COLOR[terrain] ?? '#555'} />)}
          {view.locations.map((location, i) => <circle key={i} cx={location.x + 0.5} cy={location.y + 0.5}
            r={0.65} fill="#ffdb72"><title>{serverText(t, location.name)} ({location.x}, {location.y})</title></circle>)}
        </svg>
        <div style={{ position: 'absolute', left: 24, top: 292, width: 472, height: 120, overflowY: 'auto', fontSize: 12 }}>
          {view.locations.length === 0 && <p>{t('homm.ui.adv.noLocations')}</p>}
          {view.locations.map((location, i) => <div key={i} data-location-kind={location.kind}
            data-x={location.x} data-y={location.y}>{serverText(t, location.name)} ({location.x}, {location.y})</div>)}
        </div>
        <Btn x={376} y={432} w={120} h={30} label={t('homm.ui.common.close')} onClick={onClose} />
      </div>
    </div>
  );
}

function Minimap(props: { map: MapData; cam: { x: number; y: number }; h3: boolean; onJump: (x: number, y: number) => void }) {
  const { map, cam, h3, onJump } = props;
  const { t } = useLanguage();
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 144, H = 144;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const sx = W / map.width, sy = H / map.height;
    const palette = h3 ? MINIMAP_COLOR : TERRAIN_COLOR;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const t = map.tiles[y * map.width + x];
        if (t.fog === 0 || !t.terrain) continue;
        const blocked = !t.passable && t.terrain !== 'water';
        ctx.fillStyle = blocked && h3 ? shade(palette[t.terrain] ?? '#333', -0.45) : (palette[t.terrain] ?? '#333');
        ctx.fillRect(x * sx, y * sy, Math.ceil(sx), Math.ceil(sy));
      }
    }
    for (const t of map.towns) {
      ctx.fillStyle = t.neutral ? '#a0a0a0' : FACTION_COLOR[t.faction] ?? '#fff';
      ctx.fillRect(t.x * sx - 2, t.y * sy - 2, 5, 5);
    }
    for (const h of map.heroes) {
      ctx.fillStyle = FACTION_COLOR[h.faction] ?? '#fff';
      ctx.fillRect(h.x * sx - 1, h.y * sy - 1, 3, 3);
    }
    ctx.strokeStyle = h3 ? '#ffffff' : '#ff4040';
    ctx.lineWidth = 1;
    ctx.strokeRect(cam.x * sx + 0.5, cam.y * sy + 0.5, (MAP_W / TILE) * sx, (MAP_H / TILE) * sy);
  }, [map, cam, h3]);

  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      aria-label={t('homm.ui.adv.minimap')}
      className={h3 ? undefined : 'well'}
      style={{ position: 'absolute', left: 630, top: 26, width: W, height: H, cursor: 'pointer' }}
      onClick={(e) => {
        const p = localPoint(e, e.currentTarget);
        onJump(Math.floor(p.x / W * map.width), Math.floor(p.y / H * map.height));
      }}
    />
  );
}
function findPath(map: MapData, sx: number, sy: number, tx: number, ty: number, pathfinding = 0, flightPenalty: number | null = null, hero?: HeroDetail): { x: number; y: number }[] | null {
  const W = map.width, H = map.height;
  if (sx === tx && sy === ty) return [{ x: sx, y: sy }];
  const key = (x: number, y: number) => y * W + x;
  const start = key(sx, sy), goal = key(tx, ty);
  const N = W * H, phase = flightPenalty == null ? 1 : 0, first = start + phase * N;
  const g = new Float64Array(N * 2).fill(Infinity);
  const came = new Int32Array(N * 2).fill(-1);
  const closed = new Uint8Array(N * 2);
  g[first] = 0;
  const h = (i: number) => Math.max(0, Math.max(Math.abs((i % W) - tx), Math.abs(Math.floor(i / W) - ty)) - 1) * 100;
  const occupied = new Set(map.heroes.map((hh) => key(hh.x, hh.y)));
  const daily = Math.max(100, (hero?.maxMovement ?? 1e9) - (hero?.hasteBonus ?? 0));
  type Node = { i: number; phase: number; left: number; cost: number; f: number };
  const open: Node[] = [{ i: start, phase, left: hero?.movement ?? 1e9, cost: 0, f: h(start) }];
  function push(i: number, nextPhase: number, left: number, cost: number, from: number) {
    const id = i + nextPhase * N;
    if (cost >= g[id]) return;
    g[id] = cost; came[id] = from;
    open.push({ i, phase: nextPhase, left, cost, f: cost + h(i) });
  }
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let iter = 0;
  // Solid objects are visitable destinations, never transit tiles.
  const visitable = (i: number) => occupied.has(i) ||
    ['mine', 'monster', 'town', 'obelisk', 'shrine'].includes(map.tiles[i].objectKind ?? '');
  const solid = (i: number) => !map.tiles[i].passable ||
    ['town', 'mine', 'monster', 'obelisk', 'shrine', 'block', 'tree', 'rock', 'mountain'].includes(map.tiles[i].objectKind ?? '');
  const pinches = (i: number) => solid(i) || occupied.has(i);
  const landable = (i: number) => i === start || !occupied.has(i) &&
    ((!solid(i) && !['water', 'rock'].includes(map.tiles[i].terrain ?? ''))
      || map.towns.some(t => t.isMine && key(t.x, t.y) === i));

  while (open.length && iter++ < 20000) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    const id = cur.i + cur.phase * N;
    if (closed[id] || cur.cost !== g[id]) continue;
    if (cur.i === goal) {
      const path: { x: number; y: number }[] = [];
      let c = id;
      while (c !== -1) {
        const i = c % N, p = { x: i % W, y: Math.floor(i / W) };
        if (!path.length || path[path.length - 1].x !== p.x || path[path.length - 1].y !== p.y) path.push(p);
        c = came[c];
      }
      return path.reverse();
    }
    closed[id] = 1;
    const cx = cur.i % W, cy = Math.floor(cur.i / W);
    const flying = cur.phase === 0;
    if (hero && flying && landable(cur.i)) push(cur.i, 1, daily, cur.cost + cur.left, id);
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = key(nx, ny);
      if (closed[ni + cur.phase * N]) continue;
      const t = map.tiles[ni];
      if (t.fog === 0) continue;
      if (flying && t.terrain === 'rock') continue;
      if (ni === goal) {
        if (solid(ni) && !visitable(ni)) continue;
        if (flying && !landable(ni) && !landable(cur.i)) continue;
      } else if (!flying && (solid(ni) || occupied.has(ni))) continue;
      if (dx && dy && !flying) {
        if (pinches(key(cx + dx, cy)) || pinches(key(cx, cy + dy))) continue;
      }
      const free = ni === goal && (occupied.has(ni) || map.towns.some(town => !town.isMine && key(town.x, town.y) === ni));
      const visit = ni === goal && solid(ni);
      const penalty = flying && !visit ? flightPenalty : null;
      const source = map.tiles[cur.i].terrain;
      let cost = free ? 0 : stepCost(source, !!(dx && dy), cur.left, pathfinding, hero?.nativeTerrain, penalty);
      let left = cur.left, waited = 0;
      if (cost > left) {
        if (flying) continue;
        waited = left; left = daily;
        cost = free ? 0 : stepCost(source, !!(dx && dy), left, pathfinding, hero?.nativeTerrain);
        if (cost > left) continue;
      }
      left -= cost;
      let spent = cost + waited;
      if (!flying && left < terrainCost((visit ? map.tiles[cur.i] : t).terrain, pathfinding, hero?.nativeTerrain)) {
        spent += left; left = 0;
      }
      push(ni, cur.phase, left, cur.cost + spent, id);
    }
  }
  return null;
}