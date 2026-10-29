import { useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useGameNavigate } from '../useGameNavigate';
import { api } from '../api';
import type { TownDetail, BuildingDef, CreatureDef, HeroDef, ArmySlot } from '../types';
import { Btn, Loading, Modal, Panel, Txt } from '../ui/Layout';
import { toast } from '../ui/Toast';
import { RES_ORDER, ResIcon, buildingName, factionLabel, resLabel } from '../ui/homm';
import { useLanguage } from '@/i18n/LanguageContext';
import { errText, nm, serverText } from '../text';
import { DefImg, Pcx, ScreenBackdrop, alphaAt, drawFrame, getDef, onAssetLoaded, useH3 } from '../h3/assets';
import { FACTION_PLAYER_COLOR, creaturePortraitFrame, heroPortrait, townListFrame } from '../h3/catalog';
import { HORDE_TIER, TOWN_BACK, townStructures } from '../h3/town';
import { BlacksmithWindow, BuildingDialog, CreatureInfo, DefButton, FortWindow, GuildWindow, HallWindow, MarketWindow, SplitDialog, TownMessageContext, TransformerWindow } from './TownWindows';
import { NativeMessage } from './HeroWindows';

const HERO_COST = 2500;


/** Which window is open over the town screen. */
type View =
  | { kind: 'hall' | 'fort' | 'market' | 'guild' | 'tavern' | 'smith' | 'transform' | 'tower' | 'wall' }
  | { kind: 'recruit'; tier: number }
  | { kind: 'info'; key: string };

export function TownScreen() {
  const { gameId, townId } = useParams<{ gameId: string; townId: string }>();
  const navigate = useGameNavigate();
  const [town, setTown] = useState<TownDetail | null>(null);
  const [buildings, setBuildings] = useState<BuildingDef[]>([]);
  const [creatures, setCreatures] = useState<Record<string, CreatureDef>>({});
  const [view, setView] = useState<View | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { t } = useLanguage();

  const refresh = useCallback(async () => {
    if (!townId) return;
    try { setTown(await api.getTown(townId)); }
    catch (e) { setMessage(errText(t, e, 'homm.ui.common.somethingWrong')); }
  }, [townId, t]);

  useEffect(() => { refresh(); }, [refresh]);
  const faction = town?.faction;
  useEffect(() => {
    if (!faction) return;
    api.getBuildings(faction).then(setBuildings).catch(() => {});
    api.getCreatures().then((cs) => {
      const m: Record<string, CreatureDef> = {};
      for (const c of cs) m[c.key] = c;
      setCreatures(m);
    }).catch(() => {});
  }, [faction]);

  if (!town) return <><Loading />{message && <NativeMessage text={message} onClose={() => setMessage(null)} />}</>;
  return (
    <TownMessageContext.Provider value={setMessage}>
      <TownH3 town={town} buildings={buildings} creatures={creatures} onView={setView} onChanged={refresh}
        onHero={(id) => navigate(`/game/${gameId}/hero/${id}?from=town/${townId}`)}
        onExit={() => navigate(`/game/${gameId}`)} />
      {view && windowFor(town, buildings, creatures, view, setView, refresh)}
      {message && <NativeMessage text={message} onClose={() => setMessage(null)} />}
    </TownMessageContext.Provider>
  );
}

function windowFor(town: TownDetail, buildings: BuildingDef[], creatures: Record<string, CreatureDef>,
  view: View, setView: (v: View | null) => void, refresh: () => void) {
  const close = () => setView(null);
  switch (view.kind) {
    case 'hall': return <HallWindow town={town} buildings={buildings} onBuilt={refresh} onClose={close} />;
    case 'fort': return <FortWindow town={town} creatures={creatures} onRecruit={(tier) => setView({ kind: 'recruit', tier })} onClose={close} />;
    case 'recruit': return <RecruitPanel key={view.tier} town={town} creatures={creatures} tier={view.tier} onRecruited={() => { refresh(); close(); }} onClose={close} />;
    case 'market': return <MarketWindow town={town} onTraded={refresh} onClose={close} />;
    case 'guild': return <GuildWindow town={town} onChanged={refresh} onClose={close} />;
    case 'tavern': return <TavernPanel town={town} onHired={refresh} onClose={close} />;
    case 'smith': return <BlacksmithWindow town={town} onChanged={refresh} onClose={close} />;
    case 'transform': return <TransformerWindow town={town} creatures={creatures} onChanged={refresh} onClose={close} />;
    case 'tower': return <TowerPanel town={town} onClose={close} />;
    case 'wall': return <WallPanel town={town} onClose={close} />;
    case 'info': {
      const b = buildings.find((d) => d.key === view.key);
      return b ? <BuildingDialog town={town} building={b} byKey={new Map(buildings.map((d) => [d.key, d]))}
        state={town.buildings.includes(b.key) ? 'built' : undefined} onClose={close} /> : null;
    }
  }
}

const lastBuilt = (chain: string[], built: Set<string>) => chain.reduce((acc, k, i) => (built.has(k) ? i : acc), -1);
const RES_X: Record<string, number> = { wood: 37, mercury: 121, ore: 205, sulfur: 289, crystal: 373, gems: 457, gold: 541 };

/** The window a clicked structure opens, as in HoMM3. */
function viewFor(key: string, faction: string): View {
  if (/^(villageHall|townHall|cityHall|capitol)$/.test(key)) return { kind: 'hall' };
  if (/^(fort|citadel|castle)$/.test(key)) return { kind: 'fort' };
  const d = /^(?:dwelling|upg)(\d)$/.exec(key);
  if (d) return { kind: 'recruit', tier: +d[1] };
  const horde = HORDE_TIER[faction]?.[key];
  if (horde) return { kind: 'recruit', tier: horde };
  if (key.startsWith('mageGuild')) return { kind: 'guild' };
  if (key === 'blacksmith') return { kind: 'smith' };
  if (key === 'marketplace') return { kind: 'market' };
  // Castle's Brotherhood of the Sword is part of the tavern
  if (key === 'tavern' || (faction === 'castle' && key === 'special3')) return { kind: 'tavern' };
  if (faction === 'necropolis' && key === 'special3') return { kind: 'transform' };
  return { kind: 'info', key };
}
/** HoMM3 town screen: the painted 800×374 scene with the original structures, over the townscrn.pcx panel. */
function TownH3(props: {
  town: TownDetail; buildings: BuildingDef[]; creatures: Record<string, CreatureDef>;
  onView: (v: View) => void; onChanged: () => void; onHero: (id: string) => void; onExit: () => void;
}) {
  const { town, buildings, creatures, onView, onChanged, onHero, onExit } = props;
  const open = (v: View) => onView(town.isOwner ? v : { kind: 'tower' });
  const { t } = useLanguage();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  const [, setLoaded] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [rollover, setRollover] = useState<string | null>(null);
  const built = useMemo(() => new Set(town.buildings), [town.buildings]);
  const structures = useMemo(() => townStructures(town.faction, built), [town.faction, built]);
  const name = (k: string) => buildingName(t, k, town.faction, buildings.find((b) => b.key === k)?.name);
  const cn = (k: string) => nm(t, 'creature', k, creatures[k]?.name);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 150);
    const off = onAssetLoaded(() => setLoaded((n) => n + 1));
    return () => { clearInterval(id); off(); };
  }, []);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 800, 374);
    for (const { key, s } of structures) {
      const sheet = getDef(s[0]);
      if (!sheet) continue;
      ctx.filter = key === hover ? 'brightness(1.35)' : 'none';
      // only the animated extras cycle frames; buildings are static, as in HoMM3
      const frame = key.startsWith('extra') ? tick % sheet.count : 0;
      drawFrame(ctx, sheet, frame, s[1], s[2]);
    }
    ctx.filter = 'none';
  });

  function hit(e: React.MouseEvent): string | null {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // the stage may be scaled inside the KanKan tab; hit-test in unscaled stage pixels
    const k = r.width / ((e.currentTarget as HTMLElement).offsetWidth || r.width);
    const x = (e.clientX - r.left) / k, y = (e.clientY - r.top) / k;
    for (let i = structures.length - 1; i >= 0; i--) {
      const { key, s } = structures[i];
      if (key.startsWith('extra')) continue;
      const sheet = getDef(s[0]);
      if (!sheet) continue;
      // must match the frame the renderer drew, or the hit test samples the wrong pixels
      const frame = key.startsWith('extra') ? tick % sheet.count : 0;
      if (alphaAt(sheet, frame, x - s[1], y - s[2]) > 160) return key;
    }
    return null;
  }

  const hallLevel = Math.max(0, lastBuilt(['villageHall', 'townHall', 'cityHall', 'capitol'], built));
  const fortLevel = lastBuilt(['fort', 'citadel', 'castle'], built);
  const growth = town.available.filter((a) => a.creature);
  const label = (text: string) => setRollover(text);

  return (
    <>
      <div className="town-scene" style={{ position: 'absolute', left: 0, top: 0, width: 800, height: 374, cursor: hover ? 'pointer' : 'default' }}
        onMouseMove={(e) => { const k = hit(e); setHover(k); setRollover(k ? name(k) : null); }}
        onMouseLeave={() => { setHover(null); setRollover(null); }}
        onClick={(e) => { const k = hit(e); if (k) open(viewFor(k, town.faction)); }}>
        <Pcx name={TOWN_BACK[town.faction] ?? 'tbcsback'} x={0} y={0} alt={t('homm.ui.town.factionTown').replace('{faction}', factionLabel(t, town.faction))} />
        <canvas ref={canvas} width={800} height={374} style={{ position: 'absolute', left: 0, top: 0 }} />
        {structures.filter((s) => !s.key.startsWith('extra')).map(({ key, s }) => (
          <button key={key} className="abs h3hit" data-building-slot={key} aria-label={t('homm.ui.town.open').replace('{name}', name(key))}
            style={{ left: s[1], top: s[2], width: 1, height: 1, opacity: 0 }}
            onClick={(e) => { e.stopPropagation(); open(viewFor(key, town.faction)); }} />
        ))}
      </div>

      <Pcx name="townscrn" x={0} y={374} />
      {/* town icon, name, hall + fort levels, income */}
      <DefImg name="ITPT" frame={townListFrame(town.faction) + (town.builtThisTurn ? 1 : 0)} x={15} y={387} />
      <div className="abs h3text" style={{ left: 79, top: 389, width: 147, textAlign: 'center', fontSize: 13 }}>{serverText(t, town.name)}</div>
      <button className="abs h3hit" style={{ left: 80, top: 413, width: 38, height: 38 }} aria-label={t('homm.ui.town.hall')}
        onMouseEnter={() => label(name(['villageHall', 'townHall', 'cityHall', 'capitol'][hallLevel]))} onMouseLeave={() => setRollover(null)}
        onClick={() => open({ kind: 'hall' })}>
        <DefImg name="ITMTL" frame={hallLevel} x={0} y={0} />
      </button>
      <button className="abs h3hit" style={{ left: 122, top: 413, width: 38, height: 38 }} aria-label={t('homm.building.fort')}
        onMouseEnter={() => label(fortLevel >= 0 ? name(['fort', 'citadel', 'castle'][fortLevel]) : t('homm.ui.town.noFort'))} onMouseLeave={() => setRollover(null)}
        onClick={() => open({ kind: 'fort' })}>
        <DefImg name="ITMCL" frame={fortLevel >= 0 ? fortLevel : 3} x={0} y={0} />
      </button>
      <div className="abs h3text" title={t('homm.ui.town.growth').replace('{n}', String(town.growthMultiplier))}
        style={{ left: 165, top: 435, width: 60, textAlign: 'center', fontSize: 12 }}>{town.goldIncome}</div>

      {/* available creatures — clicking one opens the recruit window */}
      {growth.map((a, i) => (
        <button key={a.tier} className="abs h3hit" data-creature={a.tier}
          title={t('homm.ui.town.available').replace('{name}', cn(a.creature!)).replace('{n}', String(a.count))}
          style={{ left: 14 + 55 * (i % 4), top: 459 + 46 * Math.floor(i / 4), width: 48, height: 32 }}
          onMouseEnter={() => label(t('homm.ui.town.available').replace('{name}', cn(a.creature!)).replace('{n}', String(a.count)))} onMouseLeave={() => setRollover(null)}
          onClick={() => open({ kind: 'recruit', tier: a.tier })}>
          <DefImg name="CPRSMALL" frame={creaturePortraitFrame(a.creature!)} x={8} y={0} />
          <div className="abs h3text" style={{ right: 1, bottom: -1, fontSize: 10 }}>{a.count}</div>
        </button>
      ))}

      {/* Creature slots, as in HoMM3's townscrn.pcx: a portrait box at x=241 then 7 slots at
          x=305+62·i; the garrison row is on top (y=387), the visiting hero's army below (y=483). */}
      <DefImg name="CREST58" frame={FACTION_PLAYER_COLOR[town.faction] ?? 0} x={241} y={387} title={t('homm.ui.town.garrison')} />
      <ArmyBar town={town} creatures={creatures} label={label} clear={() => setRollover(null)} onChanged={onChanged} onHero={onHero} />

      {/* town list + exit */}
      <DefImg name="ITPA" frame={townListFrame(town.faction)} x={747} y={430} />
      <button className="abs h3hit" style={{ left: 744, top: 544, width: 48, height: 30 }} aria-label={t('homm.ui.town.exit')} onClick={onExit}
        onMouseEnter={() => label(t('homm.ui.town.exit'))} onMouseLeave={() => setRollover(null)} />

      {/* the town's visitor board (Tower) and its fortifications (Wall) */}
      <button className="abs h3hit" style={{ left: 747, top: 430, width: 48, height: 48 }} aria-label={t('homm.ui.town.tower')}
        title={t('homm.ui.town.towerTip')}
        onMouseEnter={() => label(t('homm.ui.town.magicTower'))} onMouseLeave={() => setRollover(null)}
        onClick={() => onView({ kind: 'tower' })} />
      <button className="abs h3hit" style={{ left: 747, top: 482, width: 48, height: 48 }} aria-label={t('homm.ui.town.wall')}
        title={t('homm.ui.town.wallTip')}
        onMouseEnter={() => label(t('homm.ui.town.cityWall'))} onMouseLeave={() => setRollover(null)}
        onClick={() => onView({ kind: 'wall' })} />

      <div className="abs h3text" style={{ left: 7, top: 556, width: 737, height: 18, textAlign: 'center', fontSize: 12, lineHeight: '18px' }}>
        {rollover ?? `${factionLabel(t, town.faction)} · ${serverText(t, town.ownerName)}${town.isOwner ? '' : t('homm.ui.town.visiting')}`}
      </div>
      <Pcx name="AResBar" x={3} y={575} />
      {RES_ORDER.map((r) => (
        <div key={r} className="abs h3text" title={resLabel(t, r)} style={{ left: 3 + RES_X[r], top: 578, fontSize: 12 }}>{town.resources[r]}</div>
      ))}
    </>
  );
}

type Army = 'hero' | 'garrison';
type SlotRef = { army: Army; slot: number };

/**
 * The garrison (top) and visiting hero (bottom) rows of the HoMM3 town screen. Click a stack to
 * select it, then click another slot to move it there, merge with the same creature, or swap.
 * Click the selected stack again for its info and upgrade; Split (or shift-click) divides a stack.
 */
function ArmyBar(props: {
  town: TownDetail; creatures: Record<string, CreatureDef>;
  label: (t: string) => void; clear: () => void; onChanged: () => void; onHero: (id: string) => void;
}) {
  const { town, creatures, label, clear, onChanged, onHero } = props;
  const { t } = useLanguage();
  const showMessage = useContext(TownMessageContext);
  const [sel, setSel] = useState<SlotRef | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [split, setSplit] = useState<{ from: SlotRef; to: SlotRef } | null>(null);
  const [info, setInfo] = useState<SlotRef | null>(null);
  const hero = town.heroInTown;
  const rows: Record<Army, ArmySlot[]> = { garrison: town.garrison ?? [], hero: hero?.army ?? [] };
  const stackAt = (r: SlotRef): ArmySlot | null => {
    const s = rows[r.army][r.slot];
    return s && s.creature && s.count > 0 ? s : null;
  };
  const cname = (s: ArmySlot) => nm(t, 'creature', s.creature!, creatures[s.creature!]?.name);

  async function move(from: SlotRef, to: SlotRef, count = 0) {
    try { await api.moveArmy(town.id, from.army, from.slot, to.army, to.slot, count); onChanged(); }
    catch (e) { showMessage(errText(t, e, 'homm.ui.common.somethingWrong')); }
  }

  function click(r: SlotRef, shift: boolean) {
    if (!town.isOwner) return;
    if (r.army === 'hero' && !hero) return;
    const here = stackAt(r);
    if (!sel) {
      if (here) { setSel(r); setSplitting(shift); }
      return;
    }
    if (sel.army === r.army && sel.slot === r.slot) {
      setSel(null); setSplitting(false); setInfo(r);
      return;
    }
    const src = stackAt(sel);
    setSel(null);
    if (!src) return;
    if (splitting || shift) {
      setSplitting(false);
      if (here && here.creature !== src.creature) { showMessage(t('homm.ui.heroScreen.splitHint')); return; }
      setSplit({ from: sel, to: r });
      return;
    }
    move(sel, r);
  }

  const hint = (r: SlotRef) => {
    const here = stackAt(r);
    const src = sel && stackAt(sel);
    if (src && !(sel!.army === r.army && sel!.slot === r.slot)) {
      if (!here) return t('homm.ui.army.move').replace('{name}', cname(src));
      return here.creature === src.creature ? t('homm.ui.army.combine').replace('{name}', cname(src))
        : t('homm.ui.army.swap').replace('{name}', cname(src)).replace('{other}', cname(here));
    }
    if (here) return sel ? t('homm.ui.army.view').replace('{name}', cname(here)) : t('homm.ui.army.select').replace('{name}', cname(here)).replace('{n}', String(here.count));
    return r.army === 'hero' ? (hero ? t('homm.ui.common.empty') : t('homm.ui.army.noHero')) : t('homm.ui.common.empty');
  };

  const slot = (army: Army, i: number, y: number) => {
    const r = { army, slot: i };
    const s = stackAt(r);
    const on = sel?.army === army && sel.slot === i;
    return (
      <div key={`${army}-${i}`} className="abs h3hit" data-army={army} data-slot={i}
        {...(army === 'hero' ? { 'data-hero-slot': i } : { 'data-garrison-slot': i })}
        style={{ left: 305 + i * 62, top: y, width: 58, height: 64,         cursor: town.isOwner ? 'pointer' : 'default' }}
        onMouseEnter={() => label(hint(r))} onMouseLeave={clear}
        onClick={(e) => click(r, e.shiftKey)}>
        {s && <DefImg name="TWCRPORT" frame={creaturePortraitFrame(s.creature!)} x={0} y={0} />}
        {s && <div className="abs h3text" style={{ right: 3, bottom: 1, fontSize: 11 }}>{s.count}</div>}
        {on && <div className="abs" data-selected style={{ left: 0, top: 0, right: 0, bottom: 0, border: '2px solid #f8d870', pointerEvents: 'none' }} />}
      </div>
    );
  };

  const splitSrc = split && stackAt(split.from);
  const splitDst = split && stackAt(split.to);
  const infoStack = info && stackAt(info);

  return (
    <>
      <DefImg name="CREST58" frame={FACTION_PLAYER_COLOR[town.faction] ?? 0} x={241} y={387} title={t('homm.ui.town.garrison')} />
      {hero && (
        <button className="abs h3hit" data-hero-portrait style={{ left: 241, top: 483, width: 58, height: 64, padding: 0, border: 0, background: 'none' }}
          aria-label={t('homm.ui.army.view').replace('{name}', serverText(t, hero.name))}
          onMouseEnter={() => label(t('homm.ui.army.view').replace('{name}', serverText(t, hero.name)))} onMouseLeave={clear}
          onClick={() => onHero(hero.id)}>
          <Pcx name={heroPortrait(hero.heroKey || hero.name, town.faction, 'large')} x={0} y={0} alt={serverText(t, hero.name)} />
        </button>
      )}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => slot('garrison', i, 387))}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => slot('hero', i, 483))}
      {town.isOwner && (
        <DefButton def="TSBTNS" x={744} y={382} w={48} h={28} label={t('homm.ui.split.split')}
          disabled={!sel} onHover={(on) => (on ? label(t('homm.ui.army.splitHint')) : clear())}
          onClick={() => setSplitting(true)} />
      )}
      {split && splitSrc && (
        <SplitDialog name={cname(splitSrc)} total={splitSrc.count} target={splitDst?.count ?? 0}
          onClose={() => setSplit(null)}
          onSplit={(n) => { const s = split; setSplit(null); move(s.from, s.to, n); }} />
      )}
      {info && infoStack && (
        <CreatureInfo town={town} creatures={creatures} army={info.army} slot={info.slot} stack={infoStack}
          onChanged={onChanged} onClose={() => setInfo(null)} />
      )}
    </>
  );
}

/**
 * HoMM3 recruit window (TPRCRT.pcx, 485×395) for one dwelling: the base creature and, once the
 * dwelling is upgraded, the upgraded one; cost per troop / available / recruit / total cost,
 * a slider, and Max · Buy · Cancel. Recruits join the garrison (or the visiting hero if it is full).
 */
function RecruitPanel(props: {
  town: TownDetail; creatures: Record<string, CreatureDef>; tier: number;
  onRecruited: () => void; onClose: () => void;
}) {
  const showMessage = useContext(TownMessageContext);
  const { t } = useLanguage();
  const { town, creatures, onRecruited, onClose } = props;
  const cn = (k: string) => nm(t, 'creature', k, creatures[k]?.name);
  const [busy, setBusy] = useState(false);
  const row = town.available.find((a) => a.tier === props.tier) ?? town.available[0];
  const choices = [row?.creature, row?.upgradeBuilt ? row.upgraded : null].filter((k): k is string => !!k);
  const [pick, setPick] = useState(choices[choices.length - 1] ?? '');
  const [qty, setQty] = useState(0);
  const res = town.resources;

  const c = creatures[pick] ?? null;
  const cost = c?.cost ?? null;
  const costRes = cost ? RES_ORDER.filter((r) => cost[r] > 0) : [];
  const affordable = cost && costRes.length ? Math.min(...costRes.map((r) => Math.floor(res[r] / cost[r]))) : 0;
  const max = row?.dwellingBuilt ? Math.min(row.count, affordable) : 0;
  const n = Math.min(qty, max);
  const canBuy = !!row?.dwellingBuilt && n > 0;

  // HoMM3 sends recruits to the garrison; if it has no room they join the visiting hero
  const fits = (army: ArmySlot[] | undefined) => !!army && army.slice(0, 7).some((s) => !s.creature || s.count <= 0 || s.creature === pick);
  const dest = fits(town.garrison) ? t('homm.ui.recruit.joinsGarrison')
    : town.heroInTown && fits(town.heroInTown.army) ? t('homm.ui.recruit.joinsHero').replace('{name}', serverText(t, town.heroInTown.name))
    : t('homm.ui.recruit.noSlot');

  useEffect(() => { setQty(0); }, [pick]);

  async function recruit() {
    if (!row || n < 1) return;
    setBusy(true);
    try {
      await api.recruit(town.id, row.tier, n, pick);
      setQty(0);
      onRecruited();
    } catch (e) {
      showMessage(errText(t, e, 'homm.ui.common.somethingWrong'));
    } finally { setBusy(false); }
  }

  const ink = '#f0e0b0';
  const gilt = '#f8d870';
  const costBox = (mult: number, x: number) => (
    <div className="abs" style={{ left: x, top: 244, width: 96, display: 'flex', justifyContent: 'center', gap: 6 }}>
      {costRes.map((r) => (
        <div key={r} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: 12, fontWeight: 'bold',
          color: res[r] >= cost![r] * Math.max(1, mult) ? ink : '#e06050' }}>
          <ResIcon r={r} size={26} /><span style={{ marginTop: 8 }}>{cost![r] * mult}</span>
        </div>
      ))}
    </div>
  );

  return (
    <Modal w={485} h={395} onClose={onClose}>
      <ScreenBackdrop name="TPRCRT" w={485} h={395} alt={t('homm.ui.recruit.recruit')} />
      <Txt x={0} y={22} w={485} size={14} bold align="center" color={gilt}>
        {c ? t('homm.ui.fort.recruit').replace('{name}', cn(c.key)) : t('homm.ui.recruit.title')}
      </Txt>

      {/* the dwelling's creatures: base and (once built) upgraded */}
      {choices.map((k, i) => {
        const cc = creatures[k];
        const on = k === pick;
        const x = Math.round(485 / 2 - (choices.length * 110) / 2 + i * 110 + 20);
        return (
          <button key={k} data-recruit-creature={k} className="abs h3hit"
            style={{ left: x, top: 50, width: 70, height: 92, padding: 0,
              border: on ? `2px solid ${gilt}` : '1px solid #6a5030', background: 'rgba(0,0,0,0.35)' }}
            title={cn(k)} onClick={() => setPick(k)}>
            {cc && <DefImg name="TWCRPORT" frame={creaturePortraitFrame(cc.key)} x={5} y={4} />}
            <div className="abs h3text" style={{ left: 0, top: 72, width: 66, textAlign: 'center', fontSize: 10 }}>{cn(k)}</div>
          </button>
        );
      })}

      {c && (
        <Txt x={20} y={152} w={445} size={11} align="center" color={ink}>
          {[[t('homm.primary.attack'), c.attack], [t('homm.primary.defense'), c.defense], [t('homm.ui.stat.damage'), `${c.damageMin}-${c.damageMax}`], [t('homm.ui.stat.health'), c.health], [t('homm.ui.stat.speed'), c.speed]].map(([l, v]) => `${l} ${v}`).join(' · ')}
        </Txt>
      )}
      <Txt x={20} y={172} w={445} size={11} align="center" color={ink}>
        {!row?.dwellingBuilt ? t('homm.ui.recruit.notBuilt').replace('{name}', row ? buildingName(t, `dwelling${row.tier}`, town.faction, row.dwellingName) : t('homm.ui.recruit.dwelling')) : `${dest} · ${t('homm.ui.recruit.perWeek').replace('{n}', String(row.growth))}`}
      </Txt>

      <Txt x={65} y={226} w={96} size={11} align="center" color={ink}>{t('homm.ui.recruit.costPer')}</Txt>
      {costBox(1, 65)}

      <Txt x={174} y={226} w={64} size={11} align="center" color={ink}>{t('homm.ui.recruit.available')}</Txt>
      <Txt x={174} y={246} w={64} size={12} bold align="center" color={ink}>{row?.count ?? 0}</Txt>
      <Txt x={248} y={226} w={64} size={11} align="center" color={ink}>{t('homm.ui.recruit.recruit')}</Txt>
      <Txt x={248} y={246} w={64} size={12} bold align="center" color={ink} data-recruit-count>{n}</Txt>

      <Txt x={323} y={226} w={96} size={11} align="center" color={ink}>{t('homm.ui.recruit.totalCost')}</Txt>
      {costBox(n, 323)}

      <input type="range" aria-label={t('homm.ui.recruit.count')} min={0} max={Math.max(0, max)} value={n} disabled={max < 1}
        onChange={(e) => setQty(Number(e.target.value))}
        style={{ position: 'absolute', left: 176, top: 279, width: 135, height: 16, margin: 0, accentColor: gilt }} />

      <DefButton def="IRCBTNS" x={134} y={313} label={t('homm.ui.common.max')} disabled={busy || max < 1} onClick={() => setQty(max)} />
      <DefButton def="IBY6432" x={212} y={313} label={t('homm.ui.smith.buy')} disabled={busy || !canBuy} onClick={recruit} />
      <DefButton def="ICN6432" x={290} y={313} label={t('homm.ui.common.cancel')} onClick={onClose} />
    </Modal>
  );
}

function TavernPanel(props: { town: TownDetail; onHired: () => void; onClose: () => void }) {
  const { town, onHired, onClose } = props;
  const { t } = useLanguage();
  const showMessage = useContext(TownMessageContext);
  const h3 = useH3();
  const [busy, setBusy] = useState(false);
  const [heroes, setHeroes] = useState<Record<string, HeroDef>>({});
  const [index, setIndex] = useState(0);

  useEffect(() => {
    api.getHeroCatalog().then((hs) => {
      const m: Record<string, HeroDef> = {};
      for (const h of hs) m[h.key] = h;
      setHeroes(m);
    }).catch(() => {});
  }, []);

  const pool = town.tavern;
  const key = pool[Math.min(index, Math.max(0, pool.length - 1))];
  const h = key ? heroes[key] : null;
  const gold = town.resources.gold;
  const canAfford = gold >= HERO_COST;

  async function hire() {
    if (!key) return;
    setBusy(true);
    try {
      await api.hire(town.id, key);
      setIndex(0);
      onHired();
    } catch (e) {
      showMessage(errText(t, e, 'homm.ui.common.somethingWrong'));
    } finally { setBusy(false); }
  }

  // tptavern is a dark wooden interior (mean luminance 16-57): text must be
  // light, and the portrait sits in the upper-left window.
  const ink = '#f0e0b0';
  const dim = '#c0a878';

  return (
    <Modal w={395} h={504} onClose={onClose}>
      <ScreenBackdrop name="tptavern" w={395} h={504} alt={t('homm.building.tavern')} />

      {pool.length === 0 ? (
        <Txt x={0} y={230} w={395} size={11} align="center" color={dim}>
          {t('homm.ui.tavern.none')}
        </Txt>
      ) : (
        <>
          {/* hero portrait in the upper-left window */}
          <div style={{ position: 'absolute', left: 22, top: 18, width: 58, height: 64, overflow: 'hidden' }}>
            {h3 && <Pcx name={heroPortrait(key, town.faction, 'small')} x={0} y={0} w={58} h={64} alt={nm(t, 'hero', key, h?.name)} />}
          </div>

          <Txt x={90} y={22} w={280} size={14} bold color={ink}>{nm(t, 'hero', key, h?.name)}</Txt>
          <Txt x={90} y={42} w={280} size={10} color={dim}>
            {h ? t(h.might ? 'homm.ui.tavern.might' : 'homm.ui.tavern.magic') : ''}
          </Txt>

          {/* stats block */}
          <Txt x={24} y={100} w={120} size={10} color={dim}>{t('homm.primary.attack')}</Txt>
          <Txt x={150} y={100} w={60} size={11} bold color={ink}>{h?.attack ?? '—'}</Txt>
          <Txt x={24} y={120} w={120} size={10} color={dim}>{t('homm.primary.defense')}</Txt>
          <Txt x={150} y={120} w={60} size={11} bold color={ink}>{h?.defense ?? '—'}</Txt>
          <Txt x={24} y={140} w={120} size={10} color={dim}>{t('homm.primary.power')}</Txt>
          <Txt x={150} y={140} w={60} size={11} bold color={ink}>{h?.power ?? '—'}</Txt>
          <Txt x={24} y={160} w={120} size={10} color={dim}>{t('homm.primary.knowledge')}</Txt>
          <Txt x={150} y={160} w={60} size={11} bold color={ink}>{h?.knowledge ?? '—'}</Txt>

          {/* skills */}
          <Txt x={24} y={192} w={340} size={10} color={dim}>{t('homm.ui.tavern.skills')}</Txt>
          {(h?.skills ?? []).map((s, j) => (
            <Txt key={s} x={24} y={210 + j * 18} w={340} size={11} color={ink}>· {nm(t, 'skill', s)}</Txt>
          ))}

          {/* cost */}
          <div style={{ position: 'absolute', left: 24, top: 300, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ResIcon r="gold" size={22} />
            <span style={{ fontSize: 14, fontWeight: 'bold', color: canAfford ? ink : '#e06050' }}>{HERO_COST}</span>
          </div>

          {/* cycle between the visiting heroes */}
          {pool.length > 1 && (
            <Btn x={24} y={336} w={130} h={28} label={t('homm.ui.tavern.nOf').replace('{n}', String(index + 1)).replace('{total}', String(pool.length))} size={10}
              disabled={busy} onClick={() => setIndex((i) => (i + 1) % pool.length)} />
          )}

          {town.heroInTown && (
            <Txt x={24} y={380} w={345} size={11} color={dim}>
              {t('homm.ui.tavern.sendOut')}
            </Txt>
          )}

          {/* buttons sit on the light band at y≈432 */}
          <Btn x={24} y={432} w={120} h={34} label={busy ? '…' : t('homm.ui.tavern.hire')} size={12}
            disabled={busy || !canAfford || !!town.heroInTown} onClick={hire} />
        </>
      )}

      <Btn x={251} y={432} w={120} h={34} label={t('homm.ui.town.exit')} size={12} onClick={onClose} />
    </Modal>
  );
}

function TowerPanel(props: { town: TownDetail; onClose: () => void }) {
  const { town, onClose } = props;
  const { t } = useLanguage();
  const [posts, setPosts] = useState<{ id: string; title: string; body: string; createdAt: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [comments, setComments] = useState<{ id: string; author: string; body: string }[]>([]);
  const [draft, setDraft] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [writing, setWriting] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await api.getPosts(town.id);
      setPosts(p);
      if (!selected && p.length) setSelected(p[0].id);
    } catch { /* ignore */ }
  }, [town.id, selected]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selected) { setComments([]); return; }
    api.getComments(selected).then(setComments).catch(() => {});
  }, [selected]);

  const post = posts.find((p) => p.id === selected) ?? null;

  async function addComment() {
    if (!selected || !draft.trim()) return;
    try {
      await api.addComment(selected, draft.trim());
      setDraft('');
      setComments(await api.getComments(selected));
    } catch (e) { toast(errText(t, e, 'homm.ui.common.somethingWrong')); }
  }

  async function savePost() {
    try {
      await api.createPost(town.id, title, body, null);
      setWriting(false);
      setTitle('');
      setBody('');
      await load();
      toast(t('homm.ui.tower.published'));
    } catch (e) { toast(errText(t, e, 'homm.ui.common.somethingWrong')); }
  }

  return (
    <Modal w={700} h={500} onClose={onClose}>
      <Txt x={0} y={10} w={700} size={16} bold align="center" className="heading">{t('homm.ui.tower.title')}</Txt>
      <Txt x={24} y={36} w={652} size={10} color="var(--text-dim)">
        {t('homm.ui.tower.count').replace('{n}', String(posts.length))}
      </Txt>

      <Panel x={24} y={58} w={200} h={400}>
        <div className="scroll" style={{ position: 'absolute', inset: 3 }}>
          {posts.length === 0 && (
            <Txt x={8} y={10} w={180} size={10} color="var(--text-mute)">{t('homm.ui.tower.noPosts')}</Txt>
          )}
          {posts.map((p) => (
            <div key={p.id} onClick={() => setSelected(p.id)}
              style={{
                padding: '6px 8px', fontSize: 11, cursor: 'pointer',
                color: selected === p.id ? 'var(--accent)' : 'var(--text)',
                background: selected === p.id ? 'rgba(200,160,80,0.18)' : 'transparent',
                borderLeft: selected === p.id ? '3px solid var(--accent)' : '3px solid transparent',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
              }}>
              ▸ {p.title}
            </div>
          ))}
        </div>
      </Panel>

      <Panel x={236} y={58} w={440} h={400}>
        {post ? (
          <div className="scroll" style={{ position: 'absolute', inset: 6, padding: '4px 8px' }}>
            <div style={{ fontSize: 14, fontWeight: 'bold' }}>{post.title}</div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
              {new Date(post.createdAt).toLocaleDateString(t('homm.ui.locale'))}
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.5, marginTop: 8, whiteSpace: 'pre-wrap' }}>{post.body}</div>
            <div style={{ marginTop: 14, borderTop: '1px solid var(--gold-0)', paddingTop: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 'bold' }}>{t('homm.ui.tower.comments').replace('{n}', String(comments.length))}</div>
              {comments.map((c) => (
                <div key={c.id} style={{ marginTop: 4, fontSize: 10 }}>
                  <span style={{ color: 'var(--accent)' }}>{serverText(t, c.author)}: </span>{c.body}
                </div>
              ))}
              <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                <input className="inp" style={{ position: 'relative', width: 300, height: 26 }}
                  placeholder={t('homm.ui.tower.writeComment')} value={draft} maxLength={2000}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addComment(); }} />
                <Btn x={0} y={0} w={60} h={26} label={t('homm.ui.common.post')} size={10} onClick={addComment} />
              </div>
            </div>
          </div>
        ) : (
          <Txt x={0} y={180} w={440} size={11} align="center" color="var(--text-mute)">{t('homm.ui.tower.noPosts')}</Txt>
        )}
      </Panel>

      {writing ? (
        <Panel x={24} y={58} w={652} h={400}>
          <Txt x={16} y={12} size={12} bold>{t('homm.ui.tower.newPost')}</Txt>
          <input className="inp" style={{ left: 16, top: 36, width: 620, height: 28 }}
            placeholder={t('homm.ui.tower.titlePh')} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="inp" style={{ left: 16, top: 72, width: 620, height: 240 }}
            placeholder={t('homm.ui.tower.bodyPh')} value={body} maxLength={20000}
            onChange={(e) => setBody(e.target.value)} />
          <Btn x={440} y={330} w={90} h={30} label={t('homm.ui.tower.publish')} size={11} onClick={savePost} />
          <Btn x={540} y={330} w={90} h={30} label={t('homm.ui.common.cancel')} size={11} onClick={() => setWriting(false)} />
        </Panel>
      ) : (
        <Btn x={24} y={466} w={200} h={26} label={'+ ' + t('homm.ui.tower.newPost')} size={11} onClick={() => setWriting(true)} />
      )}
    </Modal>
  );
}

function WallPanel(props: { town: TownDetail; onClose: () => void }) {
  const { town, onClose } = props;
  const { t } = useLanguage();
  const [msgs, setMsgs] = useState<{ id: string; author: string; body: string; parentId: string | null }[]>([]);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    try { setMsgs(await api.getWall(town.id)); } catch { /* ignore */ }
  }, [town.id]);

  useEffect(() => { load(); }, [load]);

  async function post() {
    if (!draft.trim()) return;
    try {
      await api.addWallMessage(town.id, draft.trim(), null);
      setDraft('');
      await load();
    } catch (e) { toast(errText(t, e, 'homm.ui.common.somethingWrong')); }
  }

  return (
    <Modal w={560} h={440} onClose={onClose}>
      <Txt x={0} y={10} w={560} size={16} bold align="center" className="heading">{t('homm.ui.wall.title')}</Txt>
      <Panel x={24} y={44} w={512} h={320}>
        <div className="scroll" style={{ position: 'absolute', inset: 6 }}>
          {msgs.length === 0 && (
            <Txt x={8} y={10} w={480} size={10} color="var(--text-mute)">{t('homm.ui.wall.empty')}</Txt>
          )}
          {msgs.map((m) => (
            <div key={m.id} style={{ marginBottom: 8, marginLeft: m.parentId ? 16 : 0 }}>
              <div style={{ fontSize: 10, color: 'var(--accent)' }}>{m.parentId ? '↳ ' : ''}{serverText(t, m.author)}</div>
              <div style={{ fontSize: 11, lineHeight: 1.4 }}>{m.body}</div>
            </div>
          ))}
        </div>
      </Panel>
      <input className="inp" style={{ left: 24, top: 380, width: 400, height: 28 }}
        placeholder={t('homm.ui.wall.placeholder')} value={draft} maxLength={2000}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') post(); }} />
      <Btn x={432} y={380} w={104} h={28} label={t('homm.ui.common.post')} size={11} onClick={post} />
    </Modal>
  );
}
