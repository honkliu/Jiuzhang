import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { ArmySlot, BuildingDef, CreatureDef, SpellDef, TownDetail } from '../types';
import { Modal, Txt } from '../ui/Layout';
import { RES_ORDER, ResIcon, buildingName, resLabel } from '../ui/homm';
import { useLanguage } from '@/i18n/LanguageContext';
import { errText, nm, serverText } from '../text';
import { DefImg, Pcx, ScreenBackdrop, pcxUrl, useDef, useH3 } from '../h3/assets';
import { creaturePortraitFrame } from '../h3/catalog';
import { HALL_DEF, h3BuildingId } from '../h3/town';

const INK = '#f0e0b0';
const GILT = '#f8d870';
const RED = '#e06050';
type Res = TownDetail['resources'];
const RES_X: Record<string, number> = { wood: 37, mercury: 121, ore: 205, sulfur: 289, crystal: 373, gems: 457, gold: 541 };

export const TownMessageContext = createContext<(text: string) => void>(() => {});

/** A HoMM3 button drawn from its 4-frame def (0 normal, 1 pressed, 2 disabled, 3 hover). */
export function DefButton(props: {
  def: string; x: number; y: number; w?: number; h?: number; label: string;
  disabled?: boolean; onClick: () => void; onHover?: (on: boolean) => void;
}) {
  const [state, setState] = useState(0);
  const frame = props.disabled ? 2 : state;
  return (
    <button className="abs h3hit" aria-label={props.label} title={props.label} disabled={props.disabled}
      style={{ left: props.x, top: props.y, width: props.w ?? 64, height: props.h ?? 32, padding: 0, border: 0, background: 'none',
        cursor: props.disabled ? 'default' : 'pointer' }}
      onMouseEnter={() => { setState(3); props.onHover?.(true); }}
      onMouseLeave={() => { setState(0); props.onHover?.(false); }}
      onMouseDown={() => setState(1)} onMouseUp={() => setState(3)}
      onClick={props.onClick}>
      <DefImg name={props.def} frame={frame} x={0} y={0} />
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{props.label}</span>
    </button>
  );
}

/** A building's picture from the faction's HALL*.def (indexed by the original building id). */
export function HallIcon(props: { faction: string; building: string; x: number; y: number; dim?: boolean }) {
  const name = HALL_DEF[props.faction] ?? HALL_DEF.castle;
  const sheet = useDef(name);
  const id = h3BuildingId(props.building);
  const frame = sheet?.groups['0']?.[id] ?? 0;
  return (
    <div className="abs" style={{ left: props.x, top: props.y, opacity: props.dim ? 0.45 : 1 }}>
      <DefImg name={name} frame={frame} x={0} y={0} />
    </div>
  );
}

/** HoMM3 message box: DIBOXBCK tiled behind the DIALGBOX gold-and-blue border. */
export function DialogBox(props: { w: number; h: number }) {
  const { w, h } = props;
  const h3 = useH3();
  if (!h3) return <ScreenBackdrop name="DIBOXBCK" w={w} h={h} />;
  const tiles: { f: number; x: number; y: number }[] = [];
  for (let x = 64; x < w - 64; x += 64) tiles.push({ f: 6, x, y: 0 }, { f: 7, x, y: h - 64 });
  for (let y = 64; y < h - 64; y += 64) tiles.push({ f: 4, x: 0, y }, { f: 5, x: w - 64, y });
  tiles.push({ f: 0, x: 0, y: 0 }, { f: 1, x: w - 64, y: 0 }, { f: 2, x: 0, y: h - 64 }, { f: 3, x: w - 64, y: h - 64 });
  return (
    <div className="abs" style={{ left: 0, top: 0, width: w, height: h, overflow: 'hidden', pointerEvents: 'none',
      backgroundImage: `url(${pcxUrl('DIBOXBCK')})`, backgroundRepeat: 'repeat' }}>
      {tiles.map((t, i) => <DefImg key={i} name="DIALGBOX" frame={t.f} x={t.x} y={t.y} />)}
    </div>
  );
}

/** Bottom status line and resource bar shared by the 800×600 town windows. */
function StatusAndResources(props: { text: string; res?: Res }) {
  return (
    <>
      <div className="abs h3text" style={{ left: 7, top: 556, width: 737, height: 18, textAlign: 'center', fontSize: 12, lineHeight: '18px' }}>
        {props.text}
      </div>
      {props.res && RES_ORDER.map((r) => (
        <div key={r} className="abs h3text" style={{ left: 3 + RES_X[r], top: 578, fontSize: 12 }}>{props.res![r]}</div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Hall: the HoMM3 build screen (TPTHBK*.pcx). Each box is a chain; it shows the next structure.
// ---------------------------------------------------------------------------------------------

const HALLS = ['villageHall', 'townHall', 'cityHall', 'capitol'];
const FORTS = ['fort', 'citadel', 'castle'];
const GUILD = ['mageGuild1', 'mageGuild2', 'mageGuild3', 'mageGuild4', 'mageGuild5'];
const MARKET = ['marketplace', 'resourceSilo'];
const dw = (n: number) => [`dwelling${n}`, `upg${n}`];
const DWELL_ROWS = [[dw(1), dw(2), dw(3), dw(4)], [dw(5), dw(6), dw(7)]];

/** Box rows per faction; each row must match the boxes printed on the background. */
const HALL_LAYOUT: Record<string, { bg: string; rows: string[][][] }> = {
  castle: {
    bg: 'TPTHBKCS',
    rows: [
      [HALLS, FORTS, ['tavern', 'special3'], ['blacksmith']],
      [MARKET, GUILD, ['shipyard']],
      [['special2'], ['horde1']],
      ...DWELL_ROWS
    ]
  },
  rampart: {
    bg: 'TPTHBKNC',
    rows: [
      [HALLS, FORTS, ['tavern'], ['blacksmith']],
      [MARKET, GUILD, ['special3'], ['shipyard']],
      [['special1', 'special2'], ['horde1'], ['horde2']],
      ...DWELL_ROWS
    ]
  },
  necropolis: {
    bg: 'TPTHBKNC',
    rows: [
      [HALLS, FORTS, ['tavern'], ['blacksmith']],
      [MARKET, GUILD, ['shipyard'], ['special2']],
      [['special1'], ['special3'], ['horde1']],
      ...DWELL_ROWS
    ]
  }
};

type BoxState = 'built' | 'ready' | 'today' | 'locked' | 'poor' | 'forbidden';
/** TPTHBAR frame (0 gold, 1 green, 2 red, 3 grey) and TPTHCHK mark (0 tick, 1 cross, 2 coins). */
const BAR: Record<BoxState, number> = { built: 0, ready: 1, today: 2, locked: 2, poor: 2, forbidden: 3 };
const MARK: Record<BoxState, number | null> = { built: 0, ready: null, today: 1, locked: 1, poor: 2, forbidden: null };

export function HallWindow(props: {
  town: TownDetail; buildings: BuildingDef[]; onBuilt: () => void; onClose: () => void;
}) {
  const { town, buildings, onBuilt, onClose } = props;
  const { t } = useLanguage();
  const showMessage = useContext(TownMessageContext);
  const [status, setStatus] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const built = useMemo(() => new Set(town.buildings), [town.buildings]);
  const byKey = useMemo(() => new Map(buildings.map((b) => [b.key, b])), [buildings]);
  const layout = HALL_LAYOUT[town.faction] ?? HALL_LAYOUT.castle;
  const name = (k: string) => buildingName(t, k, town.faction, byKey.get(k)?.name);
  const hallKey = [...HALLS].reverse().find((h) => built.has(h)) ?? 'villageHall';

  const stateOf = (k: string): BoxState => {
    const b = byKey.get(k);
    if (!b) return 'forbidden';
    if (built.has(k)) return 'built';
    if (town.builtThisTurn) return 'today';
    if (!b.requires.every((r) => built.has(r))) return 'locked';
    if (!RES_ORDER.every((r) => town.resources[r] >= b.cost[r])) return 'poor';
    return 'ready';
  };
  const hint = (k: string, st: BoxState) => (k === 'shipyard' && st === 'forbidden'
    ? t('homm.ui.hall.noWater') : t('homm.ui.hall.' + st).replace('{name}', name(k)));

  return (
    <Modal w={800} h={600} onClose={onClose}>
      <ScreenBackdrop name={layout.bg} w={800} h={600} alt={t('homm.ui.hall.title')} />
      <div className="abs h3text" style={{ left: 0, top: 3, width: 800, textAlign: 'center', fontSize: 15, fontWeight: 'bold', color: GILT }}>
        {name(hallKey)}
      </div>
      {layout.rows.map((row, r) => row.map((chain, c) => {
        const keys = chain.filter((k) => k === 'shipyard' || byKey.has(k));
        if (!keys.length) return null;
        const key = keys.find((k) => !built.has(k)) ?? keys[keys.length - 1];
        const st = stateOf(key);
        const x = 400 - (row.length * 154) / 2 - (row.length - 1) * 20 + 194 * c;
        const y = 35 + 104 * r;
        const mark = MARK[st];
        return (
          <div key={key} data-building={key} data-state={st} className="abs h3hit"
            style={{ left: x, top: y, width: 154, height: 92, cursor: st === 'forbidden' ? 'default' : 'pointer' }}
            onMouseEnter={() => setStatus(hint(key, st))} onMouseLeave={() => setStatus(null)}
            onClick={() => { if (st !== 'forbidden') setSelected(key); else showMessage(hint(key, st)); }}>
            {key !== 'shipyard' && <HallIcon faction={town.faction} building={key} x={2} y={2} />}
            {key === 'shipyard' && <HallIcon faction={town.faction} building="villageHall" x={2} y={2} dim />}
            <DefImg name="TPTHBAR" frame={BAR[st]} x={1} y={73} />
            <div className="abs h3text" style={{ left: 1, top: 74, width: 152, textAlign: 'center', fontSize: 11, lineHeight: '16px' }}>
              {name(key)}
            </div>
            {mark !== null && <DefImg name="TPTHCHK" frame={mark} x={136} y={56} />}
          </div>
        );
      }))}
      <StatusAndResources text={status ?? `${serverText(t, town.name)} · ${town.builtThisTurn ? t('homm.ui.hall.builtThisTurn') : t('homm.ui.hall.onePerTurn')}`} res={town.resources} />
      <DefButton def="TPMAGE1" x={748} y={556} w={48} h={40} label={t('homm.ui.town.exit')} onClick={onClose} />
      {selected && byKey.get(selected) && (
        <BuildingDialog town={town} building={byKey.get(selected)!} state={stateOf(selected)} byKey={byKey}
          onClose={() => setSelected(null)}
          onBuilt={() => { setSelected(null); onBuilt(); }} />
      )}
    </Modal>
  );
}

/** HoMM3 "build structure" dialog (TPUBUILD.pcx): picture, description, requirements, cost, Buy/Cancel. */
export function BuildingDialog(props: {
  town: TownDetail; building: BuildingDef; state?: BoxState; byKey?: Map<string, BuildingDef>;
  onBuilt?: () => void; onClose: () => void;
}) {
  const { town, building: b, state, byKey, onBuilt, onClose } = props;
  const { t } = useLanguage();
  const showMessage = useContext(TownMessageContext);
  const [busy, setBusy] = useState(false);
  const built = new Set(town.buildings);
  const bn = (k: string) => buildingName(t, k, town.faction, byKey?.get(k)?.name);
  const costs = RES_ORDER.filter((r) => b.cost[r] > 0);
  const missing = b.requires.filter((r) => !built.has(r));
  const infoOnly = !onBuilt || state === 'built';

  async function build() {
    setBusy(true);
    try {
      await api.build(town.id, b.key);
      onBuilt?.();
    } catch (e) { showMessage(errText(t, e, 'homm.ui.common.somethingWrong')); } finally { setBusy(false); }
  }

  const reqText = state === 'built' ? t('homm.ui.hall.alreadyBuilt').replace('{name}', bn(b.key))
    : state === 'today' ? t('homm.ui.hall.onlyOne')
    : missing.length ? t('homm.ui.hall.requires').replace('{list}', missing.map(bn).join(t('homm.ui.heroScreen.listSep')))
    : t('homm.ui.hall.allMet');

  return (
    <Modal w={395} h={521} onClose={onClose}>
      <ScreenBackdrop name="TPUBUILD" w={395} h={521} alt={bn(b.key)} />
      <Txt x={0} y={22} w={395} size={14} bold align="center" color={GILT}>{infoOnly ? bn(b.key) : t('homm.ui.hall.ready').replace('{name}', bn(b.key))}</Txt>
      <HallIcon faction={town.faction} building={b.key} x={125} y={50} />
      <Txt x={40} y={140} w={315} size={11} align="center" color={INK} style={{ lineHeight: 1.4 }}>{serverText(t, b.description)}</Txt>
      {!(state === 'built' && !onBuilt) && <Txt x={40} y={228} w={315} size={11} align="center" color={missing.length && state !== 'built' ? RED : INK}
        style={{ lineHeight: 1.4 }}>{reqText}</Txt>}
      {!infoOnly && (
        <div className="abs" style={{ left: 20, top: 300, width: 355, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px 22px' }}>
          {costs.map((r) => (
            <div key={r} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontSize: 12, fontWeight: 'bold',
              color: town.resources[r] >= b.cost[r] ? INK : RED }}>
              <ResIcon r={r} size={32} />{b.cost[r]}
            </div>
          ))}
          {costs.length === 0 && <span style={{ color: INK }}>{t('homm.ui.hall.free')}</span>}
        </div>
      )}
      {infoOnly ? (
        <DefButton def="IOKAY" x={165} y={446} h={30} label={t('homm.ui.common.ok')} onClick={onClose} />
      ) : (
        <>
          <DefButton def="IBUY30" x={45} y={446} h={30} label={t('homm.ui.hall.build')} disabled={busy || state !== 'ready'} onClick={build} />
          <DefButton def="ICANCEL" x={290} y={446} h={30} label={t('homm.ui.common.cancel')} onClick={onClose} />
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// Fort / Citadel / Castle: the creature overview (TPCASTL7.pcx). Clicking a cell opens recruiting.
// ---------------------------------------------------------------------------------------------

const FORT_CELLS: [number, number][] = [[10, 22], [404, 22], [10, 155], [404, 155], [10, 288], [404, 288], [206, 421]];

export function FortWindow(props: {
  town: TownDetail; creatures: Record<string, CreatureDef>; onRecruit: (tier: number) => void; onClose: () => void;
}) {
  const { town, creatures, onRecruit, onClose } = props;
  const { t } = useLanguage();
  const [status, setStatus] = useState<string | null>(null);
  const built = new Set(town.buildings);
  const fortKey = [...FORTS].reverse().find((f) => built.has(f));
  return (
    <Modal w={800} h={600} onClose={onClose}>
      <ScreenBackdrop name="TPCASTL7" w={800} h={600} alt={t('homm.building.fort')} />
      <div className="abs h3text" style={{ left: 0, top: 3, width: 800, textAlign: 'center', fontSize: 15, fontWeight: 'bold', color: GILT }}>
        {fortKey ? buildingName(t, fortKey, town.faction, fortKey[0].toUpperCase() + fortKey.slice(1)) : t('homm.ui.fort.creatures')}
      </div>
      {town.available.slice(0, 7).map((a, i) => {
        const [x, y] = FORT_CELLS[i];
        const key = a.upgradeBuilt && a.upgraded ? a.upgraded : a.creature;
        const c = key ? creatures[key] : null;
        const building = a.upgradeBuilt ? `upg${a.tier}` : `dwelling${a.tier}`;
        const stats: [string, string | number][] = c ? [
          [t('homm.primary.attack'), c.attack], [t('homm.primary.defense'), c.defense], [t('homm.ui.stat.damage'), `${c.damageMin}-${c.damageMax}`],
          [t('homm.ui.stat.health'), c.health], [t('homm.ui.stat.speed'), c.speed], [t('homm.ui.stat.growth'), a.growth]
        ] : [];
        const cName = c ? nm(t, 'creature', c.key, c.name) : '';
        const dName = buildingName(t, building, town.faction, a.dwellingName);
        return (
          <div key={a.tier} data-fort-tier={a.tier} className="abs h3hit"
            style={{ left: x, top: y, width: 386, height: 126, cursor: 'pointer' }}
            onMouseEnter={() => setStatus(a.dwellingBuilt ? t('homm.ui.fort.recruit').replace('{name}', cName) : t('homm.ui.fort.notBuiltName').replace('{name}', dName))}
            onMouseLeave={() => setStatus(null)}
            onClick={() => onRecruit(a.tier)}>
            <div className="abs h3text" style={{ left: 3, top: 3, width: 152, textAlign: 'center', fontSize: 12, fontWeight: 'bold' }}>{cName}</div>
            <HallIcon faction={town.faction} building={building} x={4} y={21} dim={!a.dwellingBuilt} />
            <div className="abs h3text" style={{ left: 3, top: 94, width: 152, textAlign: 'center', fontSize: 11 }}>{dName}</div>
            <div className="abs h3text" style={{ left: 3, top: 110, width: 152, textAlign: 'center', fontSize: 11 }}>
              {a.dwellingBuilt ? t('homm.ui.fort.available').replace('{n}', String(a.count)) : t('homm.ui.fort.notBuilt')}
            </div>
            {c && <DefImg name="TWCRPORT" frame={creaturePortraitFrame(c.key)} x={180} y={30} />}
            {stats.map(([label, v], j) => (
              <div key={label} className="abs h3text" style={{ left: 287, top: 3 + j * 20.5, width: 94, fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
                <span>{label}</span><span>{v}</span>
              </div>
            ))}
          </div>
        );
      })}
      <StatusAndResources text={status ?? `${serverText(t, town.name)} · ${t('homm.ui.fort.growth').replace('{n}', String(town.growthMultiplier))}`} />
      <DefButton def="TPMAGE1" x={748} y={556} w={48} h={40} label={t('homm.ui.town.exit')} onClick={onClose} />
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// Mage Guild (TPMAGE.pcx): scrolls on the shelves; a visiting hero learns spells / buys a spellbook.
// ---------------------------------------------------------------------------------------------

const SCROLL_POS: [number, number][][] = [
  [[222, 445], [312, 445], [402, 445], [520, 445], [610, 445]],
  [[48, 53], [48, 147], [48, 241], [48, 335]],
  [[570, 82], [672, 82], [745, 82]],
  [[183, 42], [183, 148]],
  [[491, 325]]
];
const GUILD_WINDOW: Record<string, string> = { castle: 'TPMAGECS', necropolis: 'TPMAGENC' };
/** SPELLSCR.def frame = HoMM3 spell id. */
const SPELLBOOK_COST = 500;

export function GuildWindow(props: { town: TownDetail; onChanged: () => void; onClose: () => void }) {
  const { town, onChanged, onClose } = props;
  const { t } = useLanguage();
  const showMessage = useContext(TownMessageContext);
  const [spells, setSpells] = useState<Record<string, SpellDef>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [info, setInfo] = useState<SpellDef | null>(null);
  const hero = town.heroInTown;
  const [askBook, setAskBook] = useState(!!hero && !hero.spellbook);
  const level = GUILD.reduce((acc, k, i) => (town.buildings.includes(k) ? i + 1 : acc), 0);

  useEffect(() => {
    api.getSpells().then((ss) => setSpells(Object.fromEntries(ss.map((s) => [s.key, s])))).catch(() => {});
  }, []);

  const spellName = (s: SpellDef) => nm(t, 'spell', s.key, s.name);
  const school = (s: SpellDef) => nm(t, 'school', s.school?.toLowerCase(), s.school);
  const heroName = hero ? serverText(t, hero.name) : '';
  const byLevel = SCROLL_POS.map((_, i) => town.mageGuild.filter((k) => spells[k]?.level === i + 1));

  async function buyBook() {
    try {
      await api.buySpellbook(town.id);
      setAskBook(false);
      onChanged();
    } catch (e) { showMessage(errText(t, e, 'homm.ui.common.somethingWrong')); }
  }

  return (
    <Modal w={800} h={600} onClose={onClose}>
      <ScreenBackdrop name="TPMAGE" w={800} h={600} alt={t('homm.ui.guild.title')} />
      {GUILD_WINDOW[town.faction] && <Pcx name={GUILD_WINDOW[town.faction]} x={332} y={76} />}
      {SCROLL_POS.map((row, lvl) => lvl < level && row.map(([x, y], i) => {
        const key = byLevel[lvl][i];
        const s = key ? spells[key] : null;
        const known = !!s && !!hero?.spells.includes(s.key);
        return (
          <div key={`${lvl}-${i}`} className="abs h3hit" data-spell={key ?? ''}
            style={{ left: x, top: y, width: 83, height: 61, cursor: s ? 'pointer' : 'default' }}
            onMouseEnter={() => setStatus(s ? t('homm.ui.guild.scroll').replace('{name}', spellName(s)).replace('{n}', String(s.level)).replace('{school}', school(s)) + (known ? t('homm.ui.guild.known') : '') : t('homm.ui.common.empty'))}
            onMouseLeave={() => setStatus(null)}
            onClick={() => s && setInfo(s)}>
            {s ? <DefImg name="SPELLSCR" frame={s.id} x={0} y={0} /> : <DefImg name="TPMAGES" frame={1} x={0} y={0} />}
          </div>
        );
      }))}
      <StatusAndResources text={status ?? (hero
        ? hero.spellbook ? t('homm.ui.guild.learned').replace('{name}', heroName).replace('{n}', String(hero.wisdom)) : t('homm.ui.guild.noBook').replace('{name}', heroName)
        : t('homm.ui.guild.visit'))} />
      <DefButton def="TPMAGE1" x={748} y={556} w={48} h={40} label={t('homm.ui.town.exit')} onClick={onClose} />

      {info && (
        <Modal w={320} h={200} onClose={() => setInfo(null)}>
          <DialogBox w={320} h={200} />
          <DefImg name="SPELLSCR" frame={info.id} x={118} y={14} />
          <Txt x={10} y={82} w={300} size={13} bold align="center" color={GILT}>{spellName(info)}</Txt>
          <Txt x={10} y={102} w={300} size={11} align="center" color={INK}>
            {t('homm.ui.guild.info').replace('{n}', String(info.level)).replace('{school}', school(info)).replace('{cost}', String(info.cost))}
          </Txt>
          <Txt x={14} y={120} w={292} size={11} align="center" color={INK}>{serverText(t, info.description)}</Txt>
          <DefButton def="IOKAY" x={128} y={160} h={30} label={t('homm.ui.common.ok')} onClick={() => setInfo(null)} />
        </Modal>
      )}
      {askBook && hero && (
        <Modal w={340} h={190} onClose={() => setAskBook(false)}>
          <DialogBox w={340} h={190} />
          <DefImg name="ARTIFACT" frame={0} x={148} y={12} />
          <Txt x={14} y={64} w={312} size={12} align="center" color={INK} style={{ lineHeight: 1.4 }}>
            {t('homm.ui.guild.askBook').replace('{name}', heroName).replace('{n}', String(SPELLBOOK_COST))}
          </Txt>
          <DefButton def="IOKAY" x={80} y={140} h={30} label={t('homm.ui.guild.buyBook')} disabled={town.resources.gold < SPELLBOOK_COST} onClick={buyBook} />
          <DefButton def="ICANCEL" x={196} y={140} h={30} label={t('homm.ui.common.cancel')} onClick={() => setAskBook(false)} />
        </Modal>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// Blacksmith (TPSMITH.pcx): sells the faction's war machine to the visiting hero.
// ---------------------------------------------------------------------------------------------

const MACHINE_ICON: Record<string, string> = { ballista: 'SMBAL', ammoCart: 'SMCART', firstAidTent: 'SMTENT' };
/** Artifact.def frames of the war machines (as shown on the hero screen). */
export const MACHINE_ART: Record<string, number> = { ballista: 4, ammoCart: 5, firstAidTent: 6, catapult: 3 };

export function BlacksmithWindow(props: { town: TownDetail; onChanged: () => void; onClose: () => void }) {
  const { town, onChanged, onClose } = props;
  const showMessage = useContext(TownMessageContext);
  const [busy, setBusy] = useState(false);
  const { t } = useLanguage();
  const m = town.blacksmith;
  const hero = town.heroInTown;
  const owned = !!hero?.warMachines.includes(m.machine);
  const machine = nm(t, 'machine', m.machine, m.name);
  const reason = !hero ? t('homm.ui.smith.needHero')
    : owned ? t('homm.ui.smith.owned').replace('{name}', serverText(t, hero.name)).replace('{machine}', machine)
    : town.resources.gold < m.gold ? t('homm.ui.smith.noGold') : null;

  async function buy() {
    setBusy(true);
    try { await api.buyWarMachine(town.id); onChanged(); onClose(); }
    catch (e) { showMessage(errText(t, e, 'homm.ui.common.somethingWrong')); } finally { setBusy(false); }
  }

  return (
    <Modal w={329} h={388} onClose={onClose}>
      <ScreenBackdrop name="TPSMITH" w={329} h={388} alt={t('homm.building.blacksmith')} />
      <Txt x={0} y={20} w={329} size={13} bold align="center" color={GILT}>{t('homm.building.blacksmith')}</Txt>
      {/* the machine's battle animation (450×400 frames), cropped to the window's picture box */}
      <div className="abs" style={{ left: 64, top: 50, width: 200, height: 150, background: '#000', overflow: 'hidden' }}>
        <DefImg name={MACHINE_ICON[m.machine] ?? 'SMBAL'} frame={0} x={-112} y={-150} />
      </div>
      <Txt x={64} y={211} w={200} size={12} bold align="center" color={INK}>{t('homm.ui.smith.buildNew').replace('{machine}', machine)}</Txt>
      <div className="abs" style={{ left: 129, top: 240, width: 70, display: 'flex', justifyContent: 'center' }}><ResIcon r="gold" size={30} /></div>
      <Txt x={129} y={286} w={70} size={12} bold align="center" color={town.resources.gold >= m.gold ? INK : RED}>{m.gold}</Txt>
      <Txt x={14} y={352} w={301} size={10} align="center" color={reason ? RED : INK}>{reason ?? t('homm.ui.smith.takeIt').replace('{name}', serverText(t, hero!.name))}</Txt>
      <DefButton def="IBY6432" x={42} y={312} label={t('homm.ui.smith.buy')} disabled={busy || !!reason} onClick={buy} />
      <DefButton def="ICN6432" x={224} y={312} label={t('homm.ui.common.cancel')} onClick={onClose} />
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// Creature info (CRSTKPU.pcx) for a selected stack, with HoMM3's Upgrade button.
// ---------------------------------------------------------------------------------------------

export function CreatureInfo(props: {
  town?: TownDetail; creatures: Record<string, CreatureDef>; army: 'hero' | 'garrison'; slot: number; stack: ArmySlot;
  onDismiss?: () => void;
  onChanged: () => void; onClose: () => void;
}) {
  const { town, creatures, army, slot, stack, onChanged, onClose } = props;
  const { t } = useLanguage();
  const showMessage = useContext(TownMessageContext);
  const c = stack.creature ? creatures[stack.creature] : null;
  const row = c ? town?.available.find((a) => a.creature === c.key) : undefined;
  const target = row?.upgradeBuilt && row.upgraded ? creatures[row.upgraded] : null;
  const unit = useMemo(() => {
    if (!c || !target) return null;
    const d = {} as Res;
    for (const r of RES_ORDER) d[r] = Math.max(0, (target.cost?.[r] ?? 0) - (c.cost?.[r] ?? 0));
    return d;
  }, [c, target]);
  const total = (r: keyof Res) => (unit ? unit[r] * stack.count : 0);
  const canPay = !!town && !!unit && RES_ORDER.every((r) => town.resources[r] >= total(r));
  const [confirm, setConfirm] = useState(false);
  if (!c) return null;

  async function upgrade() {
    if (!town || !target) return;
    try { await api.upgradeStack(town.id, army, slot); onChanged(); onClose(); }
    catch (e) { showMessage(errText(t, e, 'homm.ui.common.somethingWrong')); }
  }

  const stats: [string, string | number][] = [
    [t('homm.ui.stat.attackSkill'), c.attack], [t('homm.ui.stat.defenseSkill'), c.defense], [t('homm.ui.stat.shots'), c.shots || '—'],
    [t('homm.ui.stat.damage'), `${c.damageMin}-${c.damageMax}`], [t('homm.ui.stat.health'), c.health], [t('homm.ui.stat.count'), stack.count], [t('homm.ui.stat.speed'), c.speed]
  ];
  const cName = nm(t, 'creature', c.key, c.name);
  const tName = target ? nm(t, 'creature', target.key, target.name) : '';
  return (
    <Modal w={298} h={311} onClose={onClose}>
      <ScreenBackdrop name="CRSTKPU" w={298} h={311} alt={cName} />
      <Txt x={20} y={22} w={258} size={13} bold align="center" color={GILT}>{cName}</Txt>
      <div className="abs" style={{ left: 42, top: 80 }}><DefImg name="TWCRPORT" frame={creaturePortraitFrame(c.key)} x={0} y={0} /></div>
      <Txt x={20} y={156} w={102} size={11} align="center" color={INK}>{`×${stack.count}`}</Txt>
      {stats.map(([l, v], i) => (
        <div key={l} className="abs h3text" style={{ left: 152, top: 48 + i * 20, width: 122, fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
          <span>{l}</span><span>{v}</span>
        </div>
      ))}
      {c.abilities.length > 0 && (
        <Txt x={20} y={232} w={258} size={10} align="center" color={INK}>{c.abilities.map((a) => nm(t, 'ability', a)).join(' · ')}</Txt>
      )}
      {target && unit && (
        <DefButton def="IOKAY" x={22} y={190} h={30} label={t('homm.ui.creature.upgradeTo').replace('{name}', tName)} onClick={() => setConfirm(true)} />
      )}
      {props.onDismiss && <DefButton def="IViewCr2" x={132} y={190} h={30} label={t('homm.ui.creature.dismiss')} onClick={props.onDismiss} />}
      <DefButton def="IOKAY" x={214} y={190} h={30} label={t('homm.ui.common.ok')} onClick={onClose} />
      <div className="abs h3text" style={{ left: 8, top: 290, width: 282, textAlign: 'center', fontSize: 11 }}>
        {target ? t('homm.ui.creature.canUpgrade').replace('{name}', tName) : row ? (row.upgraded ? t('homm.ui.creature.buildUpg') : '') : ''}
      </div>
      {confirm && target && unit && (
        <Modal w={340} h={200} onClose={() => setConfirm(false)}>
          <DialogBox w={340} h={200} />
          <Txt x={14} y={16} w={312} size={12} align="center" color={INK}>
            {t('homm.ui.creature.confirm').replace('{n}', String(stack.count)).replace('{name}', cName).replace('{target}', tName)}
          </Txt>
          <div className="abs" style={{ left: 14, top: 46, width: 312, display: 'flex', justifyContent: 'center', gap: 20 }}>
            {RES_ORDER.filter((r) => total(r) > 0).map((r) => (
              <div key={r} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: 12, fontWeight: 'bold',
                color: town && town.resources[r] >= total(r) ? INK : RED }}>
                <ResIcon r={r} size={30} />{total(r)}
              </div>
            ))}
          </div>
          <DefButton def="IOKAY" x={90} y={150} h={30} label={t('homm.ui.creature.upgrade')} disabled={!canPay} onClick={upgrade} />
          <DefButton def="ICANCEL" x={186} y={150} h={30} label={t('homm.ui.common.cancel')} onClick={() => setConfirm(false)} />
        </Modal>
      )}
    </Modal>
  );
}

/** HoMM3 split dialog: choose how many creatures move to the target slot. */
export function SplitDialog(props: { name: string; total: number; target: number; onSplit: (n: number) => void; onClose: () => void }) {
  const { name, total, target, onSplit, onClose } = props;
  const { t } = useLanguage();
  // left = stays in the source stack, right = ends up in the target stack
  const [right, setRight] = useState(Math.max(1, Math.floor(total / 2)));
  return (
    <Modal w={340} h={200} onClose={onClose}>
      <DialogBox w={340} h={200} />
      <Txt x={0} y={14} w={340} size={13} bold align="center" color={GILT}>{t('homm.ui.split.title').replace('{name}', name)}</Txt>
      <Txt x={20} y={50} w={100} size={14} bold align="center" color={INK} data-split-left>{total - right}</Txt>
      <Txt x={220} y={50} w={100} size={14} bold align="center" color={INK} data-split-right>{target + right}</Txt>
      <input type="range" aria-label={t('homm.ui.split.count')} min={1} max={total} value={right}
        onChange={(e) => setRight(Number(e.target.value))}
        style={{ position: 'absolute', left: 40, top: 90, width: 260, accentColor: GILT }} />
      <DefButton def="IOKAY" x={90} y={150} h={30} label={t('homm.ui.split.split')} onClick={() => onSplit(right)} />
      <DefButton def="ICANCEL" x={186} y={150} h={30} label={t('homm.ui.common.cancel')} onClick={onClose} />
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// Marketplace (TPMRKRES.pcx): HoMM3 resource-for-resource exchange. Rates improve with every
// Marketplace the player owns (mirrors TownRules.MarketRate on the server).
// ---------------------------------------------------------------------------------------------

const MARKET_ORDER = ['wood', 'mercury', 'ore', 'sulfur', 'crystal', 'gems', 'gold'] as const;
type MarketRes = typeof MARKET_ORDER[number];
const MARKET_VALUE: Record<MarketRes, number> = { wood: 250, ore: 250, mercury: 500, sulfur: 500, crystal: 500, gems: 500, gold: 1 };
const MARKET_SLOTS: [number, number][] = [[0, 0], [83, 0], [166, 0], [0, 79], [83, 79], [166, 79], [83, 158]];

export function marketRate(from: MarketRes, to: MarketRes, markets: number): { give: number; get: number } {
  const eff = Math.min((markets + 1) / 20, 0.5);
  const r = MARKET_VALUE[from], g = MARKET_VALUE[to] / eff;
  return r > g ? { give: 1, get: Math.ceil(r / g) } : { give: Math.floor(g / r + 0.5), get: 1 };
}

export function MarketWindow(props: { town: TownDetail; onTraded: () => void; onClose: () => void }) {
  const showMessage = useContext(TownMessageContext);
  const { t } = useLanguage();
  const { town, onTraded, onClose } = props;
  const rl = (r: string) => resLabel(t, r);
  const res = town.resources;
  const markets = Math.max(1, town.marketCount ?? 1);
  const [from, setFrom] = useState<MarketRes | null>(null);
  const [to, setTo] = useState<MarketRes | null>(null);
  const [lots, setLots] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const rate = from && to && from !== to ? marketRate(from, to, markets) : null;
  const maxLots = rate && from ? Math.floor(res[from] / rate.give) : 0;

  async function deal() {
    if (!from || !to || !rate || lots < 1) return;
    setBusy(true);
    try {
      await api.trade(town.id, from, to, lots);
      setLots(0); onTraded();
    } catch (e) { showMessage(errText(t, e, 'homm.ui.common.somethingWrong')); } finally { setBusy(false); }
  }

  const cell = (side: 'from' | 'to', r: MarketRes, i: number) => {
    const [dx, dy] = MARKET_SLOTS[i];
    const x = (side === 'from' ? 39 : 327) + dx, y = 181 + dy;
    const on = side === 'from' ? from === r : to === r;
    const offer = side === 'to' && from && from !== r ? marketRate(from, r, markets) : null;
    const text = side === 'from' ? String(res[r]) : offer ? (offer.give === 1 ? String(offer.get) : `1/${offer.give}`) : from === r ? t('homm.ui.market.na') : '';
    return (
      <div key={side + r} className="abs h3hit" data-market={side} data-resource={r}
        style={{ left: x, top: y, width: 69, height: 66, cursor: 'pointer' }}
        onMouseEnter={() => setStatus((side === 'from' ? t('homm.ui.market.tradeRes') : t('homm.ui.market.acquire')).replace('{res}', rl(r)))} onMouseLeave={() => setStatus(null)}
        onClick={() => { side === 'from' ? setFrom(r) : setTo(r); setLots(0); }}>
        <DefImg name="RESOURCE" frame={i} x={18} y={8} />
        <Txt x={0} y={49} w={69} size={11} align="center" color={INK}>{text}</Txt>
        {on && <div className="abs" style={{ left: 0, top: 0, width: 69, height: 66, border: '2px solid #f8d870', pointerEvents: 'none' }} />}
      </div>
    );
  };

  return (
    <Modal w={601} h={593} onClose={onClose}>
      <ScreenBackdrop name="TPMRKRES" w={601} h={593} alt={t('homm.building.marketplace')} />
      <Txt x={0} y={16} w={601} size={14} bold align="center" color={GILT}>{t('homm.building.marketplace')}</Txt>
      <Txt x={27} y={142} w={262} size={12} bold align="center" color={INK}>{t('homm.ui.market.kingdom')}</Txt>
      <Txt x={313} y={142} w={262} size={12} bold align="center" color={INK}>{t('homm.ui.market.available')}</Txt>
      <Txt x={323} y={56} w={242} size={11} align="center" color={INK} style={{ lineHeight: 1.5 }}>
        {rate && from && to ? t('homm.ui.market.rate').replace('{give}', String(rate.give)).replace('{from}', rl(from)).replace('{get}', String(rate.get)).replace('{to}', rl(to)) : t('homm.ui.market.select')}
      </Txt>
      <Txt x={323} y={98} w={242} size={10} align="center" color={INK}>{t('homm.ui.market.owned').replace('{n}', String(markets))}</Txt>
      {MARKET_ORDER.map((r, i) => cell('from', r, i))}
      {MARKET_ORDER.map((r, i) => cell('to', r, i))}

      {/* the pending deal */}
      {rate && from && to && (
        <>
          <DefImg name="RESOURCE" frame={MARKET_ORDER.indexOf(from)} x={140} y={455} />
          <Txt x={122} y={496} w={69} size={11} align="center" color={INK} data-market-give>{lots * rate.give}</Txt>
          <DefImg name="RESOURCE" frame={MARKET_ORDER.indexOf(to)} x={428} y={455} />
          <Txt x={410} y={496} w={69} size={11} align="center" color={INK} data-market-get>{lots * rate.get}</Txt>
        </>
      )}
      <input type="range" aria-label={t('homm.ui.market.quantity')} min={0} max={maxLots} value={lots} disabled={!rate || maxLots === 0}
        onChange={(e) => setLots(Number(e.target.value))}
        style={{ position: 'absolute', left: 232, top: 489, width: 133, accentColor: GILT }} />
      <DefButton def="IRCBTNS" x={229} y={520} label={t('homm.ui.common.max')} disabled={!rate || maxLots === 0} onClick={() => setLots(maxLots)} />
      <DefButton def="TPMRKB" x={306} y={520} label={t('homm.ui.market.trade')} disabled={busy || !rate || lots < 1} onClick={deal} />
      <DefButton def="IOK6432" x={516} y={520} label={t('homm.ui.market.done')} onClick={onClose} />
      <Txt x={8} y={570} w={585} size={11} align="center" color={INK}>
        {status ?? (rate && lots && from && to ? t('homm.ui.market.deal').replace('{give}', String(lots * rate.give)).replace('{from}', rl(from)).replace('{get}', String(lots * rate.get)).replace('{to}', rl(to)) : '')}
      </Txt>
    </Modal>
  );
}

/** Necropolis Skeleton Transformer: turns a living stack of the visiting hero into Skeletons. */
export function TransformerWindow(props: {
  town: TownDetail; creatures: Record<string, CreatureDef>; onChanged: () => void; onClose: () => void;
}) {
  const { town, creatures, onChanged, onClose } = props;
  const showMessage = useContext(TownMessageContext);
  const { t } = useLanguage();
  const hero = town.heroInTown;
  async function transform(slot: number) {
    try {
      await api.transformStack(town.id, slot);
      onChanged();
    } catch (e) { showMessage(errText(t, e, 'homm.ui.common.somethingWrong')); }
  }
  return (
    <Modal w={485} h={240} onClose={onClose}>
      <DialogBox w={485} h={240} />
      <Txt x={0} y={14} w={485} size={14} bold align="center" color={GILT}>{t('homm.ui.transformer.title')}</Txt>
      <Txt x={10} y={36} w={465} size={11} align="center" color={INK}>
        {hero ? t('homm.ui.transformer.hint') : t('homm.ui.transformer.needHero')}
      </Txt>
      {(hero?.army ?? []).slice(0, 7).map((s, i) => {
        const c = s.creature ? creatures[s.creature] : null;
        const undead = !!c?.abilities.includes('undead');
        return (
          <button key={i} data-transform-slot={i} className="abs h3hit" disabled={!c || undead}
            title={c ? (undead ? t('homm.ui.transformer.undead').replace('{name}', nm(t, 'creature', c.key, c.name)) : t('homm.ui.transformer.transform').replace('{n}', String(s.count)).replace('{name}', nm(t, 'creature', c.key, c.name))) : t('homm.ui.common.empty')}
            style={{ left: 22 + i * 64, top: 70, width: 58, height: 64, padding: 0, border: '1px solid #6a5030', background: 'rgba(0,0,0,0.4)',
              opacity: c && !undead ? 1 : 0.45, cursor: c && !undead ? 'pointer' : 'default' }}
            onClick={() => transform(i)}>
            {c && <DefImg name="TWCRPORT" frame={creaturePortraitFrame(c.key)} x={0} y={0} />}
            {c && <div className="abs h3text" style={{ right: 3, bottom: 1, fontSize: 11 }}>{s.count}</div>}
          </button>
        );
      })}
      <DefButton def="IOKAY" x={210} y={190} h={30} label={t('homm.ui.common.ok')} onClick={onClose} />
    </Modal>
  );
}
