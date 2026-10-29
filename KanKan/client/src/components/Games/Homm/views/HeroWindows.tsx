import { useState } from 'react';
import { api } from '../api';
import type { CreatureDef, HeroDetail } from '../types';
import { DefImg, Pcx, pcxUrl, useDef } from '../h3/assets';
import { creaturePortraitFrame, heroPortrait } from '../h3/catalog';
import { DefButton, DialogBox, SplitDialog } from './TownWindows';
import { useLanguage } from '@/i18n/LanguageContext';
import { errText, nm, serverText, type T } from '../text';

export const ART_SLOTS: Record<string, [number, number]> = {
  head: [445, 23], shoulders: [504, 235], neck: [445, 73], rightHand: [319, 61], leftHand: [500, 176], torso: [445, 123],
  ring1: [367, 61], ring2: [546, 176], feet: [451, 288],
  misc1: [319, 136], misc2: [335, 187], misc3: [351, 238], misc4: [367, 289], misc5: [317, 289]
};

export const SKILL_ID: Record<string, number> = {
  pathfinding: 0, archery: 1, logistics: 2, scouting: 3, diplomacy: 4, navigation: 5, leadership: 6, wisdom: 7,
  mysticism: 8, luck: 9, ballistics: 10, eagleEye: 11, necromancy: 12, estates: 13, fire: 14, air: 15, water: 16,
  earth: 17, scholar: 18, tactics: 19, artillery: 20, learning: 21, offence: 22, armorer: 23, intelligence: 24,
  sorcery: 25, resistance: 26, firstAid: 27
};
export function skillName(t: T, key: string) {
  return nm(t, 'skill', key, key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()));
}

export function HeroLevel(props: { hero: HeroDetail; onChanged: (hero: HeroDetail) => void }) {
  const { t } = useLanguage();
  const pending = props.hero.pendingLevel!;
  const heroName = serverText(t, props.hero.name);
  const [selected, setSelected] = useState<string | null>(pending.choices.length === 1 ? pending.choices[0].key : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skills = useDef('SECSKILL');
  async function choose() {
    if (busy) return;
    setBusy(true);
    try { props.onChanged(await api.chooseLevel(props.hero.id, selected)); }
    catch (e) { setError(errText(t, e, 'homm.ui.hero.skillFailed')); }
    finally { setBusy(false); }
  }
  return <div className="backdrop" style={{ zIndex: 1050 }}>
    <div className="modal" role="dialog" aria-label={t('homm.ui.hero.levelUp')} style={{ position: 'relative', width: 385, height: 470 }}>
      <Pcx name="LVLUPBKG" x={0} y={0} />
      <div className="abs h3text" style={{ left: 20, top: 24, width: 344, textAlign: 'center' }}>{t('homm.ui.hero.gainedLevel').replace('{name}', heroName)}</div>
      <img className="abs" src={pcxUrl(heroPortrait(props.hero.heroKey, props.hero.faction, 'large'))} alt={heroName}
        style={{ left: 163, top: 66, width: 58, height: 64 }} />
      <div className="abs h3text" style={{ left: 20, top: 151, width: 344, textAlign: 'center', fontSize: 13 }}>
        {t('homm.ui.hero.nowLevel').replace('{name}', heroName).replace('{n}', String(pending.level)).replace('{class}', serverText(t, props.hero.heroClass))}
      </div>
      <DefImg name="PSKIL42" frame={pending.primary} x={174} y={190} />
      <div className="abs h3text" style={{ left: 20, top: 244, width: 344, textAlign: 'center' }}>
        {t('homm.primary.' + ['attack', 'defense', 'power', 'knowledge'][pending.primary])} +1
      </div>
      {pending.choices.map((choice, i) => <button key={choice.key} className="abs h3hit" aria-label={`${t('homm.skillLevel.' + choice.level)} ${skillName(t, choice.key)}`}
        aria-pressed={selected === choice.key} disabled={busy} data-level-skill={choice.key}
        style={{ left: pending.choices.length === 1 ? 140 : 77 + i * 126, top: 300, width: 104, height: 92,
          outline: selected === choice.key ? '2px solid #f8d870' : undefined }}
        onClick={() => setSelected(choice.key)}>
        <DefImg name="SECSKILL" frame={skills?.groups['0']?.[3 + SKILL_ID[choice.key] * 3 + choice.level - 1] ?? 0} x={31} y={0} />
        <span className="abs h3text" style={{ left: 0, top: 48, width: 104, textAlign: 'center', fontSize: 11 }}>
          {t('homm.skillLevel.' + choice.level)}<br />{skillName(t, choice.key)}
        </span>
      </button>)}
      <DefButton def="IOKAY" x={296} y={413} label={t('homm.ui.hero.confirmSkill')}
        disabled={busy || (pending.choices.length > 0 && !selected)} onClick={() => void choose()} />
      {error && <NativeMessage text={error} onClose={() => setError(null)} />}
    </div>
  </div>;
}

export function NativeMessage(props: { text: string; onClose: () => void; onConfirm?: () => void; busy?: boolean }) {
  const { t } = useLanguage();
  return <div className="backdrop" style={{ zIndex: 1100 }}>
    <div className="modal" role="dialog" aria-label={props.onConfirm ? t('homm.ui.hero.confirmation') : t('homm.ui.hero.message')}
      style={{ position: 'relative', width: 400, height: 224 }}>
      <DialogBox w={400} h={224} />
      <div className="abs h3text" style={{ left: 32, top: 35, width: 336, height: 108, textAlign: 'center', display: 'flex',
        alignItems: 'center', justifyContent: 'center', whiteSpace: 'pre-wrap' }}>{props.text}</div>
      <DefButton def="IOKAY" x={props.onConfirm ? 98 : 168} y={166} label={props.onConfirm ? t('homm.ui.common.yes') : t('homm.ui.common.ok')}
        disabled={props.busy} onClick={props.onConfirm ?? props.onClose} />
      {props.onConfirm && <DefButton def="ICANCEL" x={238} y={166} label={t('homm.ui.common.no')} disabled={props.busy} onClick={props.onClose} />}
    </div>
  </div>;
}

export function HeroExchange(props: {
  first: HeroDetail; second: HeroDetail; creatures: Record<string, CreatureDef>;
  onChanged: (heroes: HeroDetail[]) => void; onClose: () => void;
}) {
  const { t } = useLanguage();
  const [heroes, setHeroes] = useState([props.first, props.second]);
  const [army, setArmy] = useState<{ side: number; slot: number } | null>(null);
  const [artifact, setArtifact] = useState<{ side: number; slot: string } | null>(null);
  const [split, setSplit] = useState<{ from: number; slot: number; to: number; target: number } | null>(null);
  const [offsets, setOffsets] = useState([0, 0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function changed(first: HeroDetail, second: HeroDetail) {
    const updated = heroes.map(h => h.id === first.id ? first : h.id === second.id ? second : h);
    setHeroes(updated); props.onChanged(updated);
  }
  async function moveArmy(from: number, slot: number, to: number, target: number, count = 0) {
    if (busy) return;
    setBusy(true);
    try {
      if (from === to) {
        await api.moveHeroArmy(heroes[from].id, slot, target, count);
        const updated = await api.getHero(heroes[from].id);
        changed(updated, heroes[1 - from]);
      } else {
        const result = await api.exchangeHeroes(heroes[from].id, heroes[to].id, slot, target, count);
        changed(result.hero, result.other);
      }
    } catch (e) { setError(errText(t, e, 'homm.ui.hero.exchangeFailed')); }
    finally { setBusy(false); }
  }
  function armyClick(side: number, slot: number, shift: boolean) {
    setArtifact(null);
    if (!army) { if (heroes[side].army[slot]?.creature) setArmy({ side, slot }); return; }
    const source = army; setArmy(null);
    if (source.side === side && source.slot === slot) return;
    if (shift) setSplit({ from: source.side, slot: source.slot, to: side, target: slot });
    else void moveArmy(source.side, source.slot, side, slot);
  }
  async function artifactClick(side: number, slot: string) {
    setArmy(null);
    const item = slot.startsWith('backpack:') ? heroes[side].backpack[Number(slot.slice(9))] : heroes[side].worn[slot];
    if (!artifact) { if (item) setArtifact({ side, slot }); return; }
    const source = artifact; setArtifact(null);
    if (busy || (source.side === side && source.slot === slot)) return;
    setBusy(true);
    try {
      const result = await api.moveArtifact(heroes[source.side].id, source.slot, slot, heroes[side].id);
      changed(result.hero, result.other ?? heroes[1 - source.side]);
    } catch (e) { setError(errText(t, e, 'homm.ui.hero.artifactFailed')); }
    finally { setBusy(false); }
  }
  return <div className="backdrop" style={{ zIndex: 1000 }}>
    <div className="modal" role="dialog" aria-label={t('homm.ui.hero.exchange')} style={{ position: 'relative', width: 800, height: 600, background: '#000' }}>
      <Pcx name="TRADE2" x={0} y={0} />
      {heroes.map((hero, side) => { const name = serverText(t, hero.name); return <div key={hero.id}>
        <div className="abs h3text" style={{ left: side ? 510 : 20, top: 18, width: 265, textAlign: 'center', fontSize: 13 }}>
          {t('homm.ui.hero.nameLevel').replace('{name}', name).replace('{n}', String(hero.level))}
        </div>
        <img className="abs" src={pcxUrl(heroPortrait(hero.heroKey, hero.faction, 'large'))} alt={name}
          style={{ left: 257 + side * 228, top: 13, width: 58, height: 64 }} />
        {[hero.attack, hero.defense, hero.power, hero.knowledge].map((value, i) => <div key={i}>
          {side === 0 && <DefImg name="PSKIL32" frame={i} x={385} y={19 + 36 * i} />}
          <div className="abs h3text" style={{ left: 339 + 93 * side, top: 27 + 36 * i, width: 26, textAlign: 'center' }}>{value}</div>
        </div>)}
        {Array.from({ length: 7 }, (_, slot) => {
          const stack = hero.army[slot];
          return <button key={slot} className="abs h3hit" data-exchange-army={`${side}:${slot}`} disabled={busy}
            aria-label={t('homm.ui.hero.armySlot').replace('{name}', name).replace('{n}', String(slot + 1))} title={stack?.creature ? `${stack.count} ${nm(t, 'creature', stack.creature, props.creatures[stack.creature]?.name)}` : t('homm.ui.common.empty')}
            style={{ left: 69 + side * 418 + slot * 36, top: 131, width: 32, height: 40 }}
            onClick={e => armyClick(side, slot, e.shiftKey)}>
            {stack?.creature && <><div className="abs" style={{ left: 0, top: 0, transform: 'scale(0.55)', transformOrigin: 'top left' }}>
              <DefImg name="TWCRPORT" frame={creaturePortraitFrame(stack.creature)} x={0} y={0} /></div>
              <span className="abs h3text" style={{ right: 1, bottom: 1, fontSize: 10 }}>{stack.count}</span></>}
            {army?.side === side && army.slot === slot && <span className="abs" style={{ inset: 0, border: '2px solid #f8d870' }} />}
          </button>;
        })}
        {Object.entries(ART_SLOTS).map(([slot, [x, y]]) => <button key={slot} className="abs h3hit" data-exchange-artifact={`${side}:${slot}`}
          aria-label={`${name} ${t('homm.ui.slot.' + slot)}`} title={hero.worn[slot] ? nm(t, 'artifact', hero.worn[slot].id, hero.worn[slot].name) : t('homm.ui.slot.' + slot)} disabled={busy}
          style={{ left: x - 270 + side * 432, top: y + 158, width: 44, height: 44,
            outline: artifact?.side === side && artifact.slot === slot ? '2px solid #f8d870' : undefined }}
          onClick={() => void artifactClick(side, slot)}>
          {hero.worn[slot] && <DefImg name="Artifact" frame={hero.worn[slot].id} x={0} y={0} />}
        </button>)}
        {Array.from({ length: 5 }, (_, i) => {
          const index = offsets[side] + i, a = hero.backpack[index];
          return <button key={index} className="abs h3hit" aria-label={t('homm.ui.hero.backpackSlot').replace('{name}', name).replace('{n}', String(index + 1))} disabled={busy}
            data-exchange-artifact={`${side}:backpack:${index}`} title={a ? nm(t, 'artifact', a.id, a.name) : t('homm.srv.backpack')}
            style={{ left: 69 + side * 432 + i * 46, top: 516, width: 44, height: 44,
              outline: artifact?.side === side && artifact.slot === `backpack:${index}` ? '2px solid #f8d870' : undefined }}
            onClick={() => void artifactClick(side, `backpack:${index}`)}>
            {a && <DefImg name="Artifact" frame={a.id} x={0} y={0} />}
          </button>;
        })}
        <DefButton def="hsbtns3" x={46 + side * 432} y={515} w={18} h={46} label={t('homm.ui.hero.backpackLeft').replace('{name}', name)}
          disabled={offsets[side] <= 0} onClick={() => setOffsets(v => v.map((n, i) => i === side ? Math.max(0, n - 1) : n))} />
        <DefButton def="hsbtns5" x={297 + side * 432} y={515} w={18} h={46} label={t('homm.ui.hero.backpackRight').replace('{name}', name)}
          disabled={offsets[side] >= Math.max(0, hero.backpack.length - 4)}
          onClick={() => setOffsets(v => v.map((n, i) => i === side ? n + 1 : n))} />
      </div>; })}
      <DefButton def="IOKAY" x={732} y={567} label={t('homm.ui.hero.closeExchange')} disabled={busy} onClick={props.onClose} />
      {split && <SplitDialog name={nm(t, 'creature', heroes[split.from].army[split.slot].creature!, props.creatures[heroes[split.from].army[split.slot].creature!]?.name)}
        total={heroes[split.from].army[split.slot].count} target={heroes[split.to].army[split.target]?.count ?? 0}
        onClose={() => setSplit(null)} onSplit={count => {
          const s = split; setSplit(null); void moveArmy(s.from, s.slot, s.to, s.target, count);
        }} />}
      {error && <NativeMessage text={error} onClose={() => setError(null)} />}
    </div>
  </div>;
}
