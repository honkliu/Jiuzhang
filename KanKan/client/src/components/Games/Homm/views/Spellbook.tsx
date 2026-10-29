import { useState } from 'react';
import type { HeroDetail, SpellDef } from '../types';
import { DefImg, Pcx, useH3 } from '../h3/assets';
import { useLanguage } from '@/i18n/LanguageContext';
import { nm, serverText } from '../text';

export function Spellbook(props: { hero: HeroDetail; spells: Record<string, SpellDef>; onCast: (key: string) => void; onClose: () => void }) {
  const { t } = useLanguage();
  const [school, setSchool] = useState('all');
  const [rollover, setRollover] = useState('');
  const h3 = useH3();
  const schools = ['air', 'earth', 'fire', 'water', 'all'];
  const frames: Record<string, number> = { air: 0, fire: 1, water: 2, earth: 3, all: 4 };
  const spells = [...new Set(props.hero.spells.map(key => key === 'fly5' ? 'fly' : key))]
    .map(key => props.spells[key]).filter((s): s is SpellDef => !!s && s.adventure && (school === 'all' || s.school === school || s.school === 'all'))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  function cost(spell: SpellDef) {
    const mastery = spell.school === 'all' ? Math.max(...schools.slice(0, 4).map(s => props.hero.skills[s] ?? 0)) : props.hero.skills[spell.school] ?? 0;
    return spell.manaCosts[Math.max(0, Math.min(3, mastery))];
  }
  return <div className="backdrop" style={{ zIndex: 1000 }}>
    <div className="modal" role="dialog" aria-label={t('homm.machine.spellbook')} style={{ position: 'relative', width: 620, height: 595, background: '#302015' }}>
      <Pcx name="SpelBack" x={0} y={0} />
      <DefImg name="SpelTab" frame={frames[school]} x={524} y={88} />
      {school !== 'all' && <DefImg name="Schools" frame={frames[school]} x={117} y={74} />}
      {spells.map((spell, index) => {
        const i = index + (school !== 'all' ? 2 : 0), half = Math.floor(i / 6), slot = i % 6;
        const x = (half ? 336 : 117) + (slot % 2) * 85, y = 90 + Math.floor(slot / 2) * 97;
        const mana = cost(spell), disabled = !props.hero.spellbook || props.hero.mana < mana
          || !!props.hero.pendingLevel || !!props.hero.pendingEncounter || !!props.hero.pendingTreasure
          || (spell.key === 'haste' && props.hero.hasteBonus > 0)
          || (spell.key === 'dimensionDoor' && (props.hero.movement <= 0 || props.hero.doorCasts >= (props.hero.skills.air ?? 0) + 1));
        const name = nm(t, 'spell', spell.key, spell.name), description = serverText(t, spell.description);
        return <button key={spell.key} className="abs h3hit" aria-label={t('homm.ui.spellbook.cast').replace('{spell}', name)} disabled={disabled}
          data-spell={spell.key} title={description} onMouseEnter={() => setRollover(description)}
          onMouseLeave={() => setRollover('')} onClick={() => props.onCast(spell.key)}
          style={{ left: x, top: y, width: 78, height: 97, opacity: disabled ? 0.6 : 1 }}>
          <DefImg name="Spells" frame={spell.id} x={0} y={0} />
          <span className="abs h3text" style={{ top: 65, left: -6, width: 90, textAlign: 'center', fontSize: 9, lineHeight: '10px', color: '#f8d870' }}>{name}</span>
          <span className="abs h3text" style={{ top: 77, left: -6, width: 90, textAlign: 'center', fontSize: 9, lineHeight: '10px', color: '#fff' }}>{t('homm.ui.spellbook.level').replace('{n}', String(spell.level))}</span>
          <span className="abs h3text" style={{ top: 89, left: -6, width: 90, textAlign: 'center', fontSize: 9, lineHeight: '10px', color: '#fff' }}>{t('homm.ui.spellbook.points').replace('{n}', String(mana))}</span>
        </button>;
      })}
      {schools.map((s, i) => <button key={s} className="abs h3hit" aria-label={t('homm.ui.spellbook.school').replace('{school}', t('homm.school.' + s))}
        aria-pressed={school === s} style={{ left: 549, top: 94 + [0, 57, 116, 176, 236][i], width: 45, height: 35 }}
        onClick={() => setSchool(s)}>{!h3 && t('homm.school.' + s)}</button>)}
      <button className="abs h3hit" aria-label={t('homm.ui.spellbook.combat')} disabled style={{ left: 221, top: 405, width: 36, height: 56 }} />
      <button className="abs h3hit" aria-label={t('homm.ui.spellbook.adventure')} style={{ left: 355, top: 405, width: 36, height: 56 }} />
      <button className="abs h3hit" aria-label={t('homm.ui.spellbook.close')} style={{ left: 479, top: 405, width: 36, height: 56 }} onClick={props.onClose}>{!h3 && t('homm.ui.common.close')}</button>
      <span className="abs h3text" style={{ left: 418, top: 418, width: 36, textAlign: 'center', color: '#f8d870' }}>{props.hero.mana}</span>
      <span className="abs h3text" style={{ left: 7, top: 569, width: 600, textAlign: 'center', fontSize: 11 }}>{rollover}</span>
    </div>
  </div>;
}
