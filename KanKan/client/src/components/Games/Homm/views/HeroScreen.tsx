import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useGameNavigate } from '../useGameNavigate';
import { api } from '../api';
import { CreatureInfo, SplitDialog } from './TownWindows';
import { ART_SLOTS, HeroLevel, NativeMessage, SKILL_ID } from './HeroWindows';
import type { ArtifactInfo, HeroDetail, CreatureDef } from '../types';
import { Btn, Loading, Panel, Txt } from '../ui/Layout';
import { HeroPortrait, heroClassText } from '../ui/homm';
import { useLanguage } from '@/i18n/LanguageContext';
import { errText, nm, serverText, type T } from '../text';
import { DefImg, Pcx, pcxUrl, useDef, useH3 } from '../h3/assets';
import { FACTION_PLAYER_COLOR, creaturePortraitFrame, heroPortrait } from '../h3/catalog';

// Original secondary-skill ids (SECSKILL.def index = 3 + id * 3 + level - 1).

// Paper-doll slot positions inside HeroScr4.pcx (VCMI CArtifactsOfHeroBase::slotPos minus the 64,7 window offset).
const BACKPACK_X = 339, BACKPACK_Y = 358, BACKPACK_SIZE = 5;

const PRIMARY = ['attack', 'defense', 'power', 'knowledge'];

function artifactTip(t: T, a: ArtifactInfo): string {
  const name = nm(t, 'artifact', a.id, a.name);
  const bonus = ([a.attack, a.defense, a.power, a.knowledge])
    .map((v, i) => [t('homm.primary.' + PRIMARY[i]), v] as [string, number])
    .filter(([, v]) => v).map(([n, v]) => `${v > 0 ? '+' : ''}${v} ${n}`).join(t('homm.ui.heroScreen.listSep'));
  return bonus ? `${name} (${bonus})` : name;
}

const MACHINE_SLOTS: { key: string; frame: number; x: number; y: number }[] = [
  { key: 'ballista', frame: 4, x: 500, y: 23 },
  { key: 'ammoCart', frame: 5, x: 546, y: 23 },
  { key: 'firstAidTent', frame: 6, x: 546, y: 69 },
  { key: 'catapult', frame: 3, x: 546, y: 115 }
];

/** HoMM3 hero window: HeroScr4.pcx (672×586) centred on the 800×600 screen, everything at the original offsets. */
function HeroH3(props: { hero: HeroDetail; creatures: Record<string, CreatureDef>; onBack: () => void; onChanged: (h: HeroDetail) => void }) {
  const { hero, creatures, onBack, onChanged } = props;
  const { t } = useLanguage();
  const heroName = serverText(t, hero.name);
  const creatureName = (key: string) => nm(t, 'creature', key, creatures[key]?.name);
  const [sel, setSel] = useState<number | null>(null);
  const [split, setSplit] = useState<{ from: number; to: number } | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(null);
  const [confirmDismiss, setConfirmDismiss] = useState<number | 'hero' | null>(null);
  const [creatureInfo, setCreatureInfo] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // every HoMM3 hero carries a catapult; the others are bought at the Blacksmith
  const machines = new Set([...(hero.warMachines ?? []), 'catapult']);

  async function moveStack(from: number, to: number, count = 0) {
    try {
      const r = await api.moveHeroArmy(hero.id, from, to, count);
      onChanged({ ...hero, army: r.army });
    } catch (e) { setError(errText(t, e, 'homm.ui.common.somethingWrong')); }
  }
  async function artifactClick(slot: string) {
    const item = slot.startsWith('backpack:') ? hero.backpack[Number(slot.slice(9))] : hero.worn[slot];
    if (!selectedArtifact) { if (item) setSelectedArtifact(slot); return; }
    const from = selectedArtifact; setSelectedArtifact(null);
    if (from === slot || busy) return;
    setBusy(true);
    try { onChanged((await api.moveArtifact(hero.id, from, slot)).hero); }
    catch (e) { setError(errText(t, e, 'homm.ui.hero.artifactFailed')); }
    finally { setBusy(false); }
  }
  async function dismiss() {
    if (confirmDismiss === null || busy) return;
    setBusy(true);
    try {
      if (confirmDismiss === 'hero') { await api.dismissHero(hero.id); onBack(); }
      else onChanged(await api.dismissStack(hero.id, confirmDismiss));
      setConfirmDismiss(null);
    } catch (e) { setConfirmDismiss(null); setError(errText(t, e, 'homm.ui.heroScreen.dismissFailed')); }
    finally { setBusy(false); }
  }
  function clickSlot(i: number, shift: boolean) {
    const here = hero.army[i]?.creature ? hero.army[i] : null;
    if (sel === null) { if (here) setSel(i); return; }
    if (sel === i) { setSel(null); return; }
    const src = hero.army[sel];
    setSel(null);
    if (!src?.creature) return;
    if (shift) {
      if (here && here.creature !== src.creature) { setError(t('homm.ui.heroScreen.splitHint')); return; }
      setSplit({ from: sel, to: i });
      return;
    }
    moveStack(sel, i);
  }
  const [rollover, setRollover] = useState<string | null>(null);
  const [bpOffset, setBpOffset] = useState(0);
  const secsk = useDef('SECSKILL');
  const ox = 64, oy = 7;
  const tip = (text: string) => ({ onMouseEnter: () => setRollover(text), onMouseLeave: () => setRollover(null), title: text });
  const heroId = Number(/hpl(\d{3})/.exec(heroPortrait(hero.heroKey || hero.name, hero.faction, 'large'))?.[1] ?? 0);
  const primary: [string, number][] = [hero.attack, hero.defense, hero.power, hero.knowledge].map((v, i) => [t('homm.primary.' + PRIMARY[i]), v]);
  const skills = Object.entries(hero.skills).slice(0, 8);
  const army = Array.from({ length: 7 }, (_, i) => hero.army[i]);
  const cls = heroClassText(t, hero.heroClass, hero.faction);

  return (
    <div className="abs" style={{ left: 0, top: 0, width: 800, height: 600, background: '#000' }}>
      <div className="abs" style={{ left: ox, top: oy, width: 672, height: 586 }}>
        <Pcx name="HeroScr4" x={0} y={0} />
        <DefImg name="CREST58" frame={FACTION_PLAYER_COLOR[hero.faction] ?? 1} x={606} y={8} />
        <img className="abs" src={pcxUrl(heroPortrait(hero.heroKey || hero.name, hero.faction, 'large'))} alt={heroName}
          style={{ left: 19, top: 19, width: 58, height: 64 }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
        <div className="abs h3text" style={{ left: 80, top: 28, width: 220, textAlign: 'center', fontSize: 18, color: '#f8e060' }}>{heroName}</div>
        <div className="abs h3text" style={{ left: 80, top: 57, width: 220, textAlign: 'center', fontSize: 13 }}>{t('homm.ui.heroScreen.levelClass').replace('{n}', String(hero.level)).replace('{class}', cls)}</div>

        {primary.map(([label, v], i) => (
          <div key={label} {...tip(`${label}: ${v}`)}>
            <div className="abs h3text" style={{ left: 22 + 70 * i, top: 92, width: 62, textAlign: 'center', fontSize: 11, color: '#f8e060' }}>{label}</div>
            <DefImg name="PSKIL42" frame={i} x={32 + 70 * i} y={111} />
            <div className="abs h3text" style={{ left: 23 + 70 * i, top: 158, width: 60, textAlign: 'center', fontSize: 12 }}>{v}</div>
          </div>
        ))}

        {/* specialty, morale, luck */}
        <DefImg name="UN44" frame={heroId} x={18} y={180} />
        <div className="abs h3text" style={{ left: 69, top: 183, fontSize: 11, color: '#f8e060' }}>{t('homm.ui.heroScreen.specialty')}</div>
        <div className="abs h3text" style={{ left: 69, top: 200, fontSize: 11 }}>{cls}</div>
        <div {...tip(t('homm.ui.heroScreen.morale'))}><DefImg name="IMRL42" frame={3} x={181} y={183} /></div>
        <div {...tip(t('homm.ui.heroScreen.luck'))}><DefImg name="ILCK42" frame={0} x={239} y={183} /></div>

        {/* experience + spell points */}
        <div {...tip(t('homm.ui.heroScreen.xpTip').replace('{n}', String(hero.experience)).replace('{next}', String(hero.nextLevel)))}>
          <DefImg name="PSKIL42" frame={4} x={20} y={230} />
          <div className="abs h3text" style={{ left: 69, top: 232, fontSize: 11, color: '#f8e060' }}>{t('homm.ui.heroScreen.experience')}</div>
          <div className="abs h3text" style={{ left: 69, top: 248, fontSize: 12 }}>{hero.experience}</div>
        </div>
        <div {...tip(t('homm.ui.heroScreen.manaTip').replace('{n}', String(hero.mana)).replace('{max}', String(hero.maxMana)))}>
          <DefImg name="PSKIL42" frame={5} x={162} y={230} />
          <div className="abs h3text" style={{ left: 213, top: 232, fontSize: 11, color: '#f8e060' }}>{t('homm.ui.heroScreen.spellPoints')}</div>
          <div className="abs h3text" style={{ left: 213, top: 248, fontSize: 12 }}>{hero.mana}/{hero.maxMana}</div>
        </div>

        {/* secondary skills */}
        {skills.map(([k, lvl], i) => {
          const x = i % 2 ? 162 : 18, y = 276 + 48 * Math.floor(i / 2);
          const idx = 3 + (SKILL_ID[k] ?? 0) * 3 + Math.max(0, Math.min(2, lvl - 1));
          const name = nm(t, 'skill', k);
          const level = nm(t, 'skillLevel', lvl);
          return (
            <div key={k} {...tip(`${level} ${name}`)}>
              <DefImg name="SECSKILL" frame={secsk ? (secsk.groups['0']?.[idx] ?? 0) : 0} x={x} y={y} />
              <div className="abs h3text" style={{ left: x + 50, top: y + 4, fontSize: 11 }}>{level}</div>
              <div className="abs h3text" style={{ left: x + 50, top: y + 23, fontSize: 11 }}>{name}</div>
            </div>
          );
        })}

        {/* artifacts on the paper doll, each in its own body slot */}
        {Object.entries(ART_SLOTS).map(([slot, [x, y]]) => {
          const a = hero.worn[slot];
          return <button key={slot} className="abs h3hit" data-art-slot={slot} data-art-id={a?.id}
            aria-label={t('homm.ui.heroScreen.artifactSlot').replace('{slot}', t('homm.ui.slot.' + slot))} disabled={busy} {...tip(a ? artifactTip(t, a) : t('homm.ui.slot.' + slot))}
            onClick={() => void artifactClick(slot)}
            style={{ left: x, top: y, width: 44, height: 44, outline: selectedArtifact === slot ? '2px solid #f8d870' : undefined }}>
            {a && <DefImg name="Artifact" frame={a.id} x={0} y={0} />}
          </button>;
        })}

        {/* backpack: five visible places with scroll arrows */}
        {Array.from({ length: BACKPACK_SIZE }, (_, i) => {
          const index = bpOffset + i, a = hero.backpack[index];
          return <button key={index} className="abs h3hit" data-backpack={index} data-art-id={a?.id}
            aria-label={t('homm.ui.heroScreen.backpackN').replace('{n}', String(index + 1))} disabled={busy} {...tip(a ? artifactTip(t, a) : t('homm.srv.backpack'))}
            onClick={() => void artifactClick(`backpack:${index}`)}
            style={{ left: BACKPACK_X + 46 * i, top: BACKPACK_Y, width: 44, height: 44,
              outline: selectedArtifact === `backpack:${index}` ? '2px solid #f8d870' : undefined }}>
            {a && <DefImg name="Artifact" frame={a.id} x={0} y={0} />}
          </button>;
        })}
        {(hero.backpack?.length ?? 0) >= BACKPACK_SIZE && <>
          <button className="abs h3hit" aria-label={t('homm.ui.heroScreen.backpackLeft')} style={{ left: BACKPACK_X - 24, top: BACKPACK_Y - 1, width: 18, height: 46 }}
            onClick={() => setBpOffset((o) => Math.max(0, o - 1))}><DefImg name="hsbtns3" frame={0} x={0} y={0} /></button>
          <button className="abs h3hit" aria-label={t('homm.ui.heroScreen.backpackRight')} style={{ left: BACKPACK_X + 46 * BACKPACK_SIZE - 2, top: BACKPACK_Y - 1, width: 18, height: 46 }}
            onClick={() => setBpOffset((o) => Math.min(hero.backpack.length - BACKPACK_SIZE + 1, o + 1))}><DefImg name="hsbtns5" frame={0} x={0} y={0} /></button>
        </>}

        {/* war machines and the spellbook */}
        {MACHINE_SLOTS.filter((m) => machines.has(m.key)).map((m) => (
          <div key={m.key} className="abs" data-machine={m.key} {...tip(t('homm.machine.' + m.key))} style={{ left: m.x, top: m.y, width: 44, height: 44 }}>
            <DefImg name="Artifact" frame={m.frame} x={0} y={0} />
          </div>
        ))}
        {hero.spellbook && (
          <div className="abs" data-spellbook {...tip(t('homm.machine.spellbook'))} style={{ left: 546, top: 303, width: 44, height: 44 }}><DefImg name="Artifact" frame={0} x={0} y={0} /></div>
        )}

        {/* army: click a stack, then another slot to move / merge / swap; shift-click to split */}
        {army.map((slot, i) => (
          <div key={i} className="abs h3hit" data-hero-army-slot={i}
            style={{ left: 15 + 66 * i, top: 485, width: 58, height: 64, cursor: 'pointer' }}
            onClick={(e) => clickSlot(i, e.shiftKey)}
            onDoubleClick={() => { setSel(null); if (slot?.creature) setCreatureInfo(i); }}
            {...tip(slot?.creature ? `${slot.count} ${creatureName(slot.creature)}` : t('homm.ui.common.empty'))}>
            {slot?.creature && <DefImg name="TWCRPORT" frame={creaturePortraitFrame(slot.creature)} x={0} y={0} />}
            {slot?.creature && <div className="abs h3text" style={{ right: 3, bottom: 1, fontSize: 11 }}>{slot.count}</div>}
            {sel === i && <div className="abs" style={{ left: 0, top: 0, right: 0, bottom: 0, border: '2px solid #f8d870', pointerEvents: 'none' }} />}
          </div>
        ))}
        {split && hero.army[split.from]?.creature && (
          <SplitDialog name={creatureName(hero.army[split.from].creature!)}
            total={hero.army[split.from].count} target={hero.army[split.to]?.count ?? 0}
            onClose={() => setSplit(null)}
            onSplit={(n) => { const s = split; setSplit(null); moveStack(s.from, s.to, n); }} />
        )}

        {/* hero list + quit */}
        <button className="abs h3hit" aria-label={t('homm.ui.heroScreen.dismissHero')} style={{ left: 454, top: 429, width: 52, height: 36 }}
          onClick={() => setConfirmDismiss('hero')}><DefImg name="hsbtns2" frame={0} x={0} y={0} /></button>
        <img className="abs" src={pcxUrl(heroPortrait(hero.heroKey || hero.name, hero.faction, 'small'))} alt=""
          style={{ left: 612, top: 87, width: 48, height: 32 }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
        <button className="abs h3hit" aria-label={t('homm.ui.common.back')} style={{ left: 609, top: 516, width: 52, height: 36 }} onClick={onBack} {...tip(t('homm.ui.heroScreen.returnToMap'))}>
          <DefImg name="hsbtns" frame={0} x={0} y={0} />
        </button>
        <div className="abs h3text" style={{ left: 7, top: 559, width: 660, height: 19, textAlign: 'center', fontSize: 12, lineHeight: '19px' }}>
          {rollover ?? t('homm.ui.heroScreen.status').replace('{name}', heroName).replace('{m}', String(hero.movement)).replace('{max}', String(hero.maxMovement))}
        </div>
        {creatureInfo !== null && <CreatureInfo creatures={creatures} army="hero" slot={creatureInfo} stack={hero.army[creatureInfo]}
          onChanged={() => {}} onClose={() => setCreatureInfo(null)}
          onDismiss={() => { setConfirmDismiss(creatureInfo); setCreatureInfo(null); }} />}
        {confirmDismiss !== null && <NativeMessage text={confirmDismiss === 'hero' ? t('homm.ui.heroScreen.dismissConfirm').replace('{name}', heroName) :
          t('homm.ui.heroScreen.dismissAll').replace('{name}', creatureName(hero.army[confirmDismiss].creature!))}
          busy={busy} onClose={() => setConfirmDismiss(null)} onConfirm={() => void dismiss()} />}
        {error && <NativeMessage text={error} onClose={() => setError(null)} />}
        {hero.pendingLevel && <HeroLevel key={`${hero.id}-${hero.pendingLevel.level}`} hero={hero} onChanged={onChanged} />}
      </div>
    </div>
  );
}

/** Paper-doll slots of the fallback (non-H3) screen, positioned around the silhouette. */
const DOLL: { id: string; label: string; x: number; y: number }[] = [
  { id: 'head', label: 'helm', x: 160, y: 30 },
  { id: 'neck', label: 'neck', x: 160, y: 82 },
  { id: 'shoulders', label: 'cape', x: 96, y: 70 },
  { id: 'torso', label: 'armor', x: 160, y: 134 },
  { id: 'rightHand', label: 'weapon', x: 70, y: 150 },
  { id: 'leftHand', label: 'shield', x: 250, y: 150 },
  { id: 'ring1', label: 'ring', x: 84, y: 220 },
  { id: 'ring2', label: 'ring', x: 236, y: 220 },
  { id: 'feet', label: 'boots', x: 160, y: 300 },
  { id: 'misc1', label: 'misc', x: 10, y: 300 },
  { id: 'misc2', label: 'misc', x: 60, y: 300 },
  { id: 'misc3', label: 'misc', x: 110, y: 300 },
  { id: 'misc4', label: 'misc', x: 250, y: 300 },
  { id: 'misc5', label: 'misc', x: 300, y: 300 }
];
function StatIcon({ kind }: { kind: string }) {
  const bg = '#2a1e10';
  return (
    <svg width={44} height={44} viewBox="0 0 44 44">
      <rect width={44} height={44} fill={bg} stroke="#6a5030" />
      {kind === 'Attack' && <><path d="M10 34 L30 8 L34 10 L14 36Z" fill="#d0d0d8" /><path d="M8 30 L16 38" stroke="#a07a30" strokeWidth={4} /></>}
      {kind === 'Defense' && <path d="M22 6 L36 11 Q36 30 22 38 Q8 30 8 11Z" fill="#3a6ad0" stroke="#e8c040" strokeWidth={2} />}
      {kind === 'Power' && <><path d="M22 38 L22 14" stroke="#8a5a2b" strokeWidth={3} /><circle cx={22} cy={11} r={6} fill="#c060e0" /><circle cx={22} cy={11} r={9} fill="none" stroke="#e0a0ff" strokeWidth={1} /></>}
      {kind === 'Knowledge' && <><rect x={9} y={11} width={26} height={22} fill="#6a1a1a" stroke="#e8c040" /><path d="M22 11 V33" stroke="#e8c040" /></>}
    </svg>
  );
}

export function HeroScreen() {
  const { t } = useLanguage();
  const { gameId, heroId } = useParams<{ gameId: string; heroId: string }>();
  const navigate = useGameNavigate();
  const [search] = useSearchParams();
  const back = () => navigate(`/game/${gameId}${/^town\/[\w-]+$/.test(search.get('from') ?? '') ? `/${search.get('from')}` : ''}`);
  const [hero, setHero] = useState<HeroDetail | null>(null);
  const [creatures, setCreatures] = useState<Record<string, CreatureDef>>({});
  const h3 = useH3();

  useEffect(() => {
    if (!heroId) return;
    api.getHero(heroId).then(setHero).catch(() => {});
    api.getCreatures().then((cs) => {
      const m: Record<string, CreatureDef> = {};
      for (const c of cs) m[c.key] = c;
      setCreatures(m);
    }).catch(() => {});
  }, [heroId]);

  if (!hero) return <Loading />;
  if (h3) return <HeroH3 hero={hero} creatures={creatures} onBack={back} onChanged={setHero} />;

  const xpPct = hero.nextLevel > 0 ? Math.min(100, (hero.experience / hero.nextLevel) * 100) : 0;
  const skills = Object.entries(hero.skills);
  const placed = hero.worn ?? {};
  const backpack = hero.backpack ?? [];
  const army = Array.from({ length: 7 }, (_, i) => hero.army[i]);
  const heroName = serverText(t, hero.name);
  const creatureName = (key: string) => nm(t, 'creature', key, creatures[key]?.name);

  return (
    <>
      <Panel x={0} y={0} w={800} h={40} style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
        <Txt x={0} y={10} w={800} size={16} bold align="center" className="heading">{heroName.toUpperCase()}</Txt>
        <Btn x={704} y={6} w={84} h={28} label={t('homm.ui.common.back')} size={12} onClick={back} />
      </Panel>

      {/* left: portrait, primary stats, xp/mana, secondary skills */}
      <Panel x={8} y={48} w={404} h={444}>
        <div className="well" style={{ position: 'absolute', left: 10, top: 10, width: 72, height: 72 }}>
          <div style={{ position: 'absolute', left: 2, top: 2 }}><HeroPortrait faction={hero.faction} size={68} /></div>
        </div>
        <Txt x={94} y={14} w={300} size={20} bold className="heading">{heroName}</Txt>
        <Txt x={94} y={44} w={300} size={13} color="var(--text-dim)">{t('homm.ui.heroScreen.levelClass').replace('{n}', String(hero.level)).replace('{class}', heroClassText(t, hero.heroClass, hero.faction))}</Txt>
        <Txt x={94} y={64} w={300} size={11} color="var(--text-mute)">{t('homm.ui.heroScreen.move').replace('{m}', String(hero.movement)).replace('{max}', String(hero.maxMovement))}</Txt>

        {([['Attack', hero.attack], ['Defense', hero.defense], ['Power', hero.power], ['Knowledge', hero.knowledge]] as [string, number][])
          .map(([label, val], i) => (
            <div key={label} style={{ position: 'absolute', left: 10 + i * 98, top: 94, width: 92, height: 90, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 'bold' }}>{t('homm.primary.' + PRIMARY[i])}</div>
              <div style={{ marginTop: 3 }}><StatIcon kind={label} /></div>
              <div style={{ fontSize: 15, fontWeight: 'bold' }}>{val}</div>
            </div>
          ))}

        <div className="slot" style={{ left: 10, top: 192, width: 188, height: 44 }} title={`${hero.experience} / ${hero.nextLevel}`}>
          <Txt x={8} y={4} size={10} color="var(--text-dim)">{t('homm.ui.heroScreen.experience')}</Txt>
          <Txt x={8} y={18} size={13} bold>{hero.experience}</Txt>
          <div style={{ position: 'absolute', left: 80, top: 24, width: 98, height: 6, background: '#000', border: '1px solid var(--border-dim)' }}>
            <div style={{ width: `${xpPct}%`, height: '100%', background: 'var(--accent)' }} />
          </div>
        </div>
        <div className="slot" style={{ left: 206, top: 192, width: 188, height: 44 }}>
          <Txt x={8} y={4} size={10} color="var(--text-dim)">{t('homm.ui.heroScreen.spellPoints')}</Txt>
          <Txt x={8} y={18} size={13} bold color="#80a0ff">{hero.mana} / {hero.maxMana}</Txt>
        </div>

        <Txt x={10} y={246} size={12} bold className="heading">{t('homm.ui.heroScreen.skills')}</Txt>
        {Array.from({ length: 8 }, (_, i) => {
          const s = skills[i];
          return (
            <div key={i} className="slot" style={{ left: 10 + (i % 2) * 196, top: 264 + Math.floor(i / 2) * 44, width: 188, height: 40 }}>
              {s && (<>
                <div style={{ position: 'absolute', left: 3, top: 3, width: 34, height: 34, background: '#2a1e10', border: '1px solid #6a5030',
                  color: 'var(--accent)', fontSize: 15, fontWeight: 'bold', textAlign: 'center', lineHeight: '34px' }}>
                  {nm(t, 'skill', s[0]).slice(0, 2)}
                </div>
                <Txt x={44} y={4} w={140} size={10} color="var(--text-dim)">{nm(t, 'skillLevel', s[1])}</Txt>
                <Txt x={44} y={19} w={140} size={12} bold>{nm(t, 'skill', s[0])}</Txt>
              </>)}
            </div>
          );
        })}
      </Panel>

      {/* right: artifact paper-doll */}
      <Panel x={420} y={48} w={372} h={444}>
        <Txt x={0} y={8} w={372} size={12} bold align="center" className="heading">{t('homm.ui.heroScreen.artifacts')}</Txt>
        <svg width={200} height={340} viewBox="0 0 200 340" style={{ position: 'absolute', left: 86, top: 40, opacity: 0.35 }}>
          <circle cx={100} cy={40} r={26} fill="#8a7a5a" />
          <path d="M60 80 Q100 66 140 80 L160 190 L130 190 L126 330 L106 330 L100 220 L94 330 L74 330 L70 190 L40 190Z" fill="#8a7a5a" />
        </svg>
        {DOLL.map((s) => {
          const a = placed[s.id];
          return (
            <div key={s.id} className="slot" data-art-slot={s.id} title={a ? artifactTip(t, a) : t('homm.ui.doll.' + s.label)}
              style={{ left: s.x, top: s.y + 20, width: 46, height: 46, textAlign: 'center' }}>
              {a
                ? <div style={{ fontSize: 9, color: 'var(--gold-3)', padding: 2, lineHeight: '10px', overflow: 'hidden', height: 42 }}>{nm(t, 'artifact', a.id, a.name)}</div>
                : <div style={{ fontSize: 9, color: 'var(--text-mute)', lineHeight: '46px' }}>{t('homm.ui.doll.' + s.label)}</div>}
            </div>
          );
        })}
        {hero.artifacts.length === 0 && (
          <Txt x={0} y={414} w={372} size={10} align="center" color="var(--text-mute)">{t('homm.ui.heroScreen.noArtifacts')}</Txt>
        )}
        {backpack.length > 0 && (
          <Txt x={10} y={414} w={352} size={10} color="var(--text-dim)">{t('homm.ui.heroScreen.backpackList').replace('{list}', backpack.map((a) => nm(t, 'artifact', a.id, a.name)).join(t('homm.ui.heroScreen.listSep')))}</Txt>
        )}
      </Panel>

      {/* bottom: army, 7 slots */}
      <Panel x={8} y={500} w={784} h={92}>
        <Txt x={10} y={6} size={12} bold className="heading">{t('homm.ui.heroScreen.army')}</Txt>
        {army.map((slot, i) => {
          const def = slot?.creature ? creatures[slot.creature] : undefined;
          return (
            <div key={i} className="slot" style={{ left: 10 + i * 109, top: 22, width: 104, height: 64 }}
              title={slot?.creature ? `${slot.count} ${creatureName(slot.creature)}` : t('homm.ui.common.empty')}>
              {slot?.creature && (<>
                <svg width={40} height={40} viewBox="0 0 40 40" style={{ position: 'absolute', left: 4, top: 4 }}>
                  <circle cx={20} cy={20} r={15} fill={`hsl(${((def?.tier ?? 1) * 40) % 360},45%,45%)`} />
                  <circle cx={14} cy={17} r={3} fill="#ffd040" />
                  <circle cx={26} cy={17} r={3} fill="#ffd040" />
                </svg>
                <Txt x={48} y={8} w={54} size={10}>{creatureName(slot.creature)}</Txt>
                <div style={{ position: 'absolute', right: 4, bottom: 3, fontSize: 13, fontWeight: 'bold', color: 'var(--accent)' }}>{slot.count}</div>
              </>)}
            </div>
          );
        })}
      </Panel>
    </>
  );
}