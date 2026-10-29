// Original town-screen structure placements (def, x, y, z) per faction, from VCMI config/factions/*.json.
// Keys use this game's building keys (dwellingN / upgN); 'extra*' entries are decorative.
export type Structure = [def: string, x: number, y: number, z: number];

export const TOWN_STRUCTURES: Record<string, Record<string, Structure>> = {
  castle: {
    extraAnimation: ['TBCSEXT2', 46, 119, 0],
    mageGuild1: ['TBCSMAGE', 707, 166, 1],
    mageGuild2: ['TBCSMAG2', 706, 135, 1],
    mageGuild3: ['TBCSMAG3', 704, 107, 1],
    mageGuild4: ['TBCSMAG4', 704, 76, 1],
    tavern: ['TBCSTVRN', 0, 230, 0],
    fort: ['TBCSCSTL', 595, 66, -5],
    citadel: ['TBCSCAS2', 478, 66, -5],
    castle: ['TBCSCAS3', 478, 37, -5],
    villageHall: ['TBCSHALL', 0, 209, 1],
    townHall: ['TBCSHAL2', 0, 176, 1],
    cityHall: ['TBCSHAL3', 0, 164, 1],
    capitol: ['TBCSHAL4', 0, 154, 1],
    marketplace: ['TBCSMARK', 413, 264, 0],
    resourceSilo: ['TBCSSILO', 488, 228, 1],
    blacksmith: ['TBCSBLAK', 213, 251, 0],
    grail: ['TBCSHOLY', 456, 109, -6],
    dwelling1: ['TBCSDW_0', 304, 92, -1],
    dwelling2: ['TBCSDW_1', 360, 130, 0],
    dwelling3: ['TBCSDW_2', 76, 57, -1],
    dwelling4: ['TBCSDW_3', 176, 101, 0],
    dwelling5: ['TBCSDW_4', 563, 211, 1],
    dwelling6: ['TBCSDW_5', 174, 190, -1],
    dwelling7: ['TBCSDW_6', 303, 0, -2],
    upg1: ['TBCSUP_0', 304, 65, -1],
    upg2: ['TBCSUP_1', 360, 115, 0],
    upg3: ['TBCSUP_2', 76, 35, -1],
    upg4: ['TBCSUP_3', 176, 85, 0],
    upg5: ['TBCSUP_4', 563, 173, 1],
    upg6: ['TBCSUP_5', 160, 190, -1],
    upg7: ['TBCSUP_6', 303, 0, -2],
    special2: ['TBCSEXT0', 384, 193, -2],
    special3: ['TBCSEXT1', 0, 198, 2],
    horde1: ['TBCSHRD1', 76, 53, -1],
    horde1Upgr: ['TBCSHRD2', 76, 35, -1]
  },
  rampart: {
    extraAnimation: ['TBRMEXT2', 327, 236, 1],
    mageGuild1: ['TBRMMAGE', 454, 200, -1],
    mageGuild2: ['TBRMMAG2', 438, 178, -1],
    mageGuild3: ['TBRMMAG3', 418, 153, -1],
    mageGuild4: ['TBRMMAG4', 406, 129, -1],
    mageGuild5: ['TBRMMAG5', 384, 104, -1],
    tavern: ['TBRMTVRN', 181, 229, 1],
    fort: ['TBRMCSTL', 63, 25, -4],
    citadel: ['TBRMCAS2', 79, 18, -4],
    castle: ['TBRMCAS3', 79, 18, -4],
    villageHall: ['TBRMHALL', 565, 216, 0],
    townHall: ['TBRMHAL2', 538, 187, 0],
    cityHall: ['TBRMHAL3', 538, 187, 0],
    capitol: ['TBRMHAL4', 534, 187, 0],
    marketplace: ['TBRMMARK', 129, 301, 3],
    resourceSilo: ['TBRMSILO', 245, 324, 4],
    blacksmith: ['TBRMBLAK', 558, 105, -3],
    grail: ['TBRMHOLY', 0, 54, -3],
    extraTownHall: ['TBRMEXT3', 293, 235, 2],
    extraCityHall: ['TBRMEXT4', 295, 191, 0],
    extraCapitol: ['TBRMEXT5', 260, 171, 3],
    dwelling1: ['TBRMDW_0', 0, 236, 2],
    dwelling2: ['TBRMDW_1', 0, 154, -2],
    dwelling3: ['TBRMDW_2', 668, 101, -1],
    dwelling4: ['TBRMDW_3', 287, 73, -1],
    dwelling5: ['TBRMDW_4', 68, 146, -1],
    dwelling6: ['TBRMDW_5', 362, 90, -2],
    dwelling7: ['TBRMDW_6', 502, 27, -5],
    upg1: ['TBRMUP_0', 0, 236, 2],
    upg2: ['TBRMUP_1', 0, 143, -2],
    upg3: ['TBRMUP_2', 665, 101, -1],
    upg4: ['TBRMUP_3', 287, 28, -1],
    upg5: ['TBRMUP_4', 63, 146, -1],
    upg6: ['TBRMUP_5', 362, 90, -2],
    upg7: ['TBRMUP_6', 502, 5, -5],
    special1: ['TBRMSPEC', 555, 297, 2],
    special2: ['TBRMEXT0', 555, 297, 2],
    special3: ['TBRMEXT1', 0, 181, 1],
    horde1: ['TBRMHRD1', 0, 154, -2],
    horde1Upgr: ['TBRMHRD2', 0, 143, -2],
    horde2: ['TBRMHRD3', 47, 142, -1],
    horde2Upgr: ['TBRMHRD4', 47, 142, -1]
  },
  necropolis: {
    extraAnimation: ['TBNCEXT2', 25, 279, 9],
    mageGuild1: ['TBNCMAGE', 341, 116, -1],
    mageGuild2: ['TBNCMAG2', 341, 97, -1],
    mageGuild3: ['TBNCMAG3', 341, 78, -1],
    mageGuild4: ['TBNCMAG4', 340, 62, -1],
    mageGuild5: ['TBNCMAG5', 343, 35, -1],
    tavern: ['TBNCTVRN', 508, 189, 0],
    fort: ['TBNCCSTL', 138, 66, 0],
    citadel: ['TBNCCAS2', 139, 66, 0],
    castle: ['TBNCCAS3', 34, 18, 0],
    villageHall: ['TBNCHALL', 468, 76, -2],
    townHall: ['TBNCHAL2', 482, 56, -2],
    cityHall: ['TBNCHAL3', 478, 26, -2],
    capitol: ['TBNCHAL4', 481, 26, -2],
    marketplace: ['TBNCMARK', 347, 215, 2],
    resourceSilo: ['TBNCSILO', 276, 185, 1],
    blacksmith: ['TBNCBLAK', 382, 252, 7],
    grail: ['TBNCHOLY', 410, 88, 0],
    extraTownHall: ['TBNCEXT3', 0, 241, 6],
    extraCityHall: ['TBNCEXT4', 321, 255, 6],
    extraCapitol: ['TBNCEXT5', 475, 257, 6],
    dwelling1: ['TBNCDW_0', 80, 222, 5],
    dwelling2: ['TBNCDW_1', 502, 223, 1],
    dwelling3: ['TBNCDW_2', 0, 187, 8],
    dwelling4: ['TBNCDW_3', 607, 212, 2],
    dwelling5: ['TBNCDW_4', 206, 207, 3],
    dwelling6: ['TBNCDW_5', 0, 31, -2],
    dwelling7: ['TBNCDW_6', 663, 25, 0],
    upg1: ['TBNCUP_0', 64, 222, 5],
    upg2: ['TBNCUP_1', 498, 224, 1],
    upg3: ['TBNCUP_2', 0, 179, 8],
    upg4: ['TBNCUP_3', 615, 193, 2],
    upg5: ['TBNCUP_4', 222, 171, 3],
    upg6: ['TBNCUP_5', 0, 30, -2],
    upg7: ['TBNCUP_6', 662, 23, 0],
    special1: ['TBNCSPEC', 18, 0, -1],
    special2: ['TBNCEXT0', 307, 61, -2],
    special3: ['TBNCEXT1', 247, 275, 4],
    horde1: ['TBNCHRD1', 80, 222, 5],
    horde1Upgr: ['TBNCHRD2', 64, 222, 5]
  }
};

/**
 * Town backdrop PCX per faction. The 1999 demo ships only three backdrops
 * (Castle, Necropolis, Dungeon); Rampart has no `tbrback.pcx`, so it borrows
 * Castle's. `TOWN_BACK_FALLBACK` records which factions are borrowing.
 */
export const TOWN_BACK: Record<string, string> = { castle: 'tbcsback', rampart: 'tbcsback', necropolis: 'tbncback' };
export const TOWN_BACK_FALLBACK: Record<string, string> = { rampart: 'castle' };
export const HALL_DEF: Record<string, string> = { castle: 'HALLCSTL', rampart: 'HALLRAMP', necropolis: 'HALLNECR' };

/** Original HoMM3 building id (indexes HALL*.def group 0). */
export function h3BuildingId(key: string): number {
  const fixed: Record<string, number> = {
    tavern: 5, fort: 7, citadel: 8, castle: 9, villageHall: 10, townHall: 11, cityHall: 12, capitol: 13,
    marketplace: 14, resourceSilo: 15, blacksmith: 16, special1: 17, horde1: 18, special2: 21, special3: 22,
    horde2: 24, grail: 26
  };
  if (key in fixed) return fixed[key];
  let m = /^mageGuild(\d)$/.exec(key);
  if (m) return +m[1] - 1;
  m = /^dwelling(\d)$/.exec(key);
  if (m) return 29 + +m[1];
  m = /^upg(\d)$/.exec(key);
  if (m) return 36 + +m[1];
  return 10;
}

const CHAINS = [
  ['villageHall', 'townHall', 'cityHall', 'capitol'], ['fort', 'citadel', 'castle'],
  ['mageGuild1', 'mageGuild2', 'mageGuild3', 'mageGuild4', 'mageGuild5'],
  ['tavern'], ['blacksmith'], ['marketplace'], ['resourceSilo'], ['grail'],
  ['special1'], ['special2'], ['special3'], ['horde1'], ['horde2'],
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => [`dwelling${n}`, `upg${n}`])
];

/** Dwelling tier each horde building belongs to; its upgraded art shows once that dwelling is upgraded. */
export const HORDE_TIER: Record<string, Record<string, number>> = {
  castle: { horde1: 3 }, rampart: { horde1: 2, horde2: 5 }, necropolis: { horde1: 1 }
};

/** Structures to paint for a town: the highest built tier of every chain plus decorative extras, in z order. */
export function townStructures(faction: string, built: Set<string>): { key: string; s: Structure }[] {
  const table = TOWN_STRUCTURES[faction] ?? TOWN_STRUCTURES.castle;
  const out: { key: string; s: Structure }[] = [];
  for (const chain of CHAINS) {
    const k = [...chain].reverse().find((c) => built.has(c) && table[c]);
    if (!k) continue;
    // Rampart's Fountain of Fortune is drawn over the Mystic Pond it grows out of
    if (faction === 'rampart' && k === 'special1' && built.has('special2')) continue;
    const tier = HORDE_TIER[faction]?.[k];
    const upgr = tier && built.has(`upg${tier}`) ? table[`${k}Upgr`] : undefined;
    out.push({ key: k, s: upgr ?? table[k] });
  }
  const extras: [string, string][] = [['extraAnimation', ''], ['extraTownHall', 'townHall'], ['extraCityHall', 'cityHall'], ['extraCapitol', 'capitol']];
  const hallRank = ['villageHall', 'townHall', 'cityHall', 'capitol'];
  const level = Math.max(...hallRank.map((h, i) => (built.has(h) ? i : -1)));
  for (const [k, req] of extras) {
    if (table[k] && (!req || level >= hallRank.indexOf(req))) out.push({ key: k, s: table[k] });
  }
  return out.map((o, i) => ({ ...o, i })).sort((a, b) => a.s[3] - b.s[3] || a.i - b.i);
}