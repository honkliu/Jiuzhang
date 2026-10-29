import { useId } from 'react';
import { buildingText, nm, serverText, type T } from '../text';

/** Shared HoMM3-style visual vocabulary: factions, resources, portraits, building names. */

export const FACTION_COLOR: Record<string, string> = {
  castle: '#3a6ad0', rampart: '#2a8a4a', necropolis: '#5a4a6a'
};

export const factionLabel = (t: T, faction: string) => nm(t, 'faction', faction);

const HERO_CLASS_KEY: Record<string, string> = {
  castle: 'knight', rampart: 'ranger', necropolis: 'deathknight'
};

/** A hero's class: the server's class name, else the faction's default class. */
export function heroClassText(t: T, heroClass: string | null | undefined, faction: string): string {
  if (heroClass) return serverText(t, heroClass);
  const k = HERO_CLASS_KEY[faction];
  return k ? t('homm.class.' + k) : t('homm.ui.hero.hero');
}

/** Seat index used by the server for mine ownership (Seeded.Players order). */
export const FACTION_SEAT: Record<string, number> = { castle: 0, rampart: 1, necropolis: 2 };

export const RES_ORDER = ['wood', 'ore', 'mercury', 'sulfur', 'crystal', 'gems', 'gold'] as const;
export type ResKey = typeof RES_ORDER[number];

export const resLabel = (t: T, r: string) => nm(t, 'res', r);

/** A town building's display name (HoMM3 dwelling names per faction). */
export function buildingName(t: T, key: string, faction: string, fallback?: string): string {
  return buildingText(t, faction, key, fallback);
}

/** Small painted resource glyph, one shape per resource as in HoMM3. */
export function ResIcon({ r, size = 16 }: { r: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      {r === 'wood' && (<>
        <rect x={3} y={12} width={18} height={6} rx={3} fill="#8a5a2b" stroke="#3a2210" />
        <rect x={5} y={6} width={16} height={6} rx={3} fill="#a07040" stroke="#3a2210" />
        <circle cx={6} cy={15} r={2} fill="#d8b080" /><circle cx={8} cy={9} r={2} fill="#d8b080" />
      </>)}
      {r === 'ore' && (<path d="M3 19 L6 9 L12 5 L19 8 L21 18 Z" fill="#8a8a92" stroke="#2a2a30" />)}
      {r === 'ore' && (<path d="M8 10 L12 7 L16 9" stroke="#c8c8d0" fill="none" />)}
      {r === 'mercury' && (<>
        <rect x={10} y={3} width={4} height={7} fill="#9aa0b0" stroke="#30343c" />
        <circle cx={12} cy={15} r={7} fill="#c8d0e0" stroke="#30343c" />
        <circle cx={10} cy={13} r={2} fill="#fff" />
      </>)}
      {r === 'sulfur' && (<path d="M2 20 Q6 8 12 6 Q18 8 22 20 Z" fill="#e0c840" stroke="#5a4a10" />)}
      {r === 'crystal' && (<>
        <path d="M6 20 L8 8 L11 4 L12 20 Z" fill="#e05050" stroke="#501010" />
        <path d="M12 20 L14 6 L17 10 L18 20 Z" fill="#f07878" stroke="#501010" />
      </>)}
      {r === 'gems' && (<>
        <path d="M4 10 L8 5 L12 10 L8 18 Z" fill="#4080e0" stroke="#102040" />
        <path d="M12 12 L16 7 L20 12 L16 20 Z" fill="#40c060" stroke="#103010" />
      </>)}
      {r === 'gold' && (<>
        <ellipse cx={12} cy={18} rx={8} ry={3} fill="#c09020" stroke="#4a3008" />
        <ellipse cx={12} cy={14} rx={8} ry={3} fill="#e0b030" stroke="#4a3008" />
        <ellipse cx={12} cy={10} rx={8} ry={3} fill="#ffd040" stroke="#4a3008" />
      </>)}
    </svg>
  );
}

/** Faction hero portrait: knight helm, ranger hood or death-knight cowl. */
export function HeroPortrait({ faction, size }: { faction: string; size: number }) {
  const id = useId().replace(/:/g, '');
  const color = FACTION_COLOR[faction] ?? '#3a6ad0';
  const skin = faction === 'necropolis' ? '#b8b8a8' : '#d8b090';
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true">
      <defs>
        <linearGradient id={'bg' + id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor="#120c06" />
        </linearGradient>
      </defs>
      <rect width={96} height={96} fill={`url(#bg${id})`} />
      {/* shoulders */}
      <path d="M8 96 Q14 70 48 68 Q82 70 88 96 Z" fill={faction === 'castle' ? '#8a8c94' : faction === 'rampart' ? '#3a5a2a' : '#2a2030'} stroke="#000" strokeOpacity={0.4} />
      <ellipse cx={48} cy={48} rx={17} ry={21} fill={skin} />
      {faction === 'castle' && (<>
        <path d="M28 46 Q28 20 48 18 Q68 20 68 46 L62 46 L62 36 L34 36 L34 46 Z" fill="#a8acb4" stroke="#40444c" />
        <path d="M48 18 Q56 6 70 10 Q60 12 52 20 Z" fill="#c03030" />
        <rect x={46} y={36} width={4} height={16} fill="#a8acb4" stroke="#40444c" />
      </>)}
      {faction === 'rampart' && (<>
        <path d="M24 60 Q22 22 48 16 Q74 22 72 60 L64 60 Q66 34 48 30 Q30 34 32 60 Z" fill="#2e6a30" stroke="#123012" />
        <path d="M38 62 Q48 70 58 62" stroke="#8a6a40" strokeWidth={3} fill="none" />
      </>)}
      {faction === 'necropolis' && (<>
        <path d="M22 66 Q20 18 48 12 Q76 18 74 66 L64 66 Q66 32 48 28 Q30 32 32 66 Z" fill="#1a1420" stroke="#000" />
      </>)}
      <circle cx={41} cy={48} r={2.6} fill={faction === 'necropolis' ? '#60ff90' : '#201810'} />
      <circle cx={55} cy={48} r={2.6} fill={faction === 'necropolis' ? '#60ff90' : '#201810'} />
      <path d="M43 59 Q48 62 53 59" stroke="#6a4030" strokeWidth={1.6} fill="none" />
      <rect x={0.5} y={0.5} width={95} height={95} fill="none" stroke="#c8a050" />
    </svg>
  );
}
