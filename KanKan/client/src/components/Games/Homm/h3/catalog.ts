// Mapping from City of Towers keys to original HoMM3 asset names / frame indices.
import objectGeometry from './object-geometry.json';

export const OBJECT_GEOMETRY: Record<string, { x: number; rows: string[] }> = objectGeometry.templates;
export const objectAnchorX = (sprite: string) => OBJECT_GEOMETRY[sprite]?.x ?? 0;

export const FACTIONS = ['castle', 'rampart', 'tower', 'inferno', 'necropolis', 'dungeon', 'stronghold', 'fortress', 'conflux'];

// Server creature keys are in the original creature-id order (0..111); conflux ids are sparse.
const CREATURE_ORDER = (
  'pikeman halberdier archer marksman griffin royalGriffin swordsman crusader monk zealot cavalier champion angel archangel ' +
  'centaur centaurCaptain dwarf battleDwarf woodElf grandElf pegasus silverPegasus dendroid dendroidSoldier unicorn warUnicorn greenDragon goldDragon ' +
  'gremlin masterGremlin stoneGargoyle obsidianGargoyle stoneGolem ironGolem mage archMage genie masterGenie naga nagaQueen giant titan ' +
  'imp familiar gog magog hellHound cerberus demon hornedDemon pitFiend pitLord efreet efreetSultan devil archDevil ' +
  'skeleton skeletonWarrior walkingDead zombie wight wraith vampire vampireLord lich powerLich blackKnight dreadKnight boneDragon ghostDragon ' +
  'troglodyte infernalTroglodyte harpy harpyHag beholder evilEye medusa medusaQueen minotaur minotaurKing manticore scorpicore redDragon blackDragon ' +
  'goblin hobgoblin wolfRider wolfRaider orc orcChieftain ogre ogreMage roc thunderbird cyclops cyclopsKing behemoth ancientBehemoth ' +
  'gnoll gnollMarauder lizardman lizardWarrior serpentFly dragonFly basilisk greaterBasilisk gorgon mightyGorgon wyvern wyvernMonarch hydra chaosHydra'
).split(' ');

const CONFLUX_ID: Record<string, number> = {
  airElemental: 112, earthElemental: 113, fireElemental: 114, waterElemental: 115, pixie: 118, sprite: 119,
  psychicElemental: 120, magicElemental: 121, iceElemental: 123, magmaElemental: 125, stormElemental: 127,
  energyElemental: 129, firebird: 130, phoenix: 131
};

export function creatureId(key: string): number {
  const i = CREATURE_ORDER.indexOf(key);
  return i >= 0 ? i : (CONFLUX_ID[key] ?? -1);
}

/** Frame in CPRSMALL (32x32) / TWCRPORT (58x64). */
export const creaturePortraitFrame = (key: string) => creatureId(key) + 2;

const AVW = (
  'AvWPike AVWpikx0 AvWLCrs AvWHcrs AvWGrif AVWgrix0 AVWswrd0 AVWswrx0 AvWMonk AVWmonx0 AVWcvlr0 AVWcvlx0 AvWAngl AvWArch ' +
  'AVWcent0 AVWcenx0 AVWdwrf0 AVWdwrx0 AVWelfw0 AVWelfx0 AVWpega0 AVWpegx0 AVWtree0 AVWtrex0 AVWunic0 AVWunix0 AVWdrag0 AVWdrax0 ' +
  'AVWgrem0 AVWgrex0 AVWgarg0 AVWgarx0 AVWgolm0 AVWgolx0 AVWmage0 AVWmagx0 AVWgeni0 AVWgenx0 AVWnaga0 AVWnagx0 AVWtitn0 AVWtitx0 ' +
  'AVWimp0 AVWimpx0 AVWgog0 AVWgogx0 AVWhoun0 AVWhoux0 AVWdemn0 AVWdemx0 AVWpitf0 AVWpitx0 AVWefre0 AVWefrx0 AVWdevl0 AVWdevx0 ' +
  'AVWskel0 AVWskex0 AVWzomb0 AVWzomx0 AvWWigh AVWwigx0 AVWvamp0 AVWvamx0 AVWlich0 AVWlicx0 AVWbkni0 AVWbknx0 AVWbone0 AVWbonx0 ' +
  'AVWtrog0 AvWInfr AVWharp0 AVWharx0 AVWbehl0 AVWbehx0 AvWMeds AVWmedx0 AvWMino AVWminx0 AVWmant0 AVWmanx0 AvWRDrg AVWddrx0 ' +
  'AVWgobl0 AVWgobx0 AVWwolf0 AVWwolx0 AVWorc0 AVWorcx0 AVWogre0 AVWogrx0 AVWroc0 AVWrocx0 AVWcycl0 AVWcycx0 AVWbhmt0 AVWbhmx0 ' +
  'AVWgnll0 AVWgnlx0 AvWLizr AVWlizx0 AvWDfly AvWDfly AvWBasl AvWGBas AvWGorg AVWgorx0 AvWWyvr AVWwyvx0 AvWHydr AVWhydx0'
).split(' ');

const AVW_CONFLUX: Record<string, string> = {
  pixie: 'AVWpixie', sprite: 'AVWsprit', airElemental: 'AVWelma0', stormElemental: 'AVWstorm', waterElemental: 'AVWelmw0',
  iceElemental: 'AVWicee', fireElemental: 'AVWelmf0', energyElemental: 'AVWnrg', earthElemental: 'AVWelme0',
  magmaElemental: 'AVWstone', psychicElemental: 'AVWpsye', magicElemental: 'AVWmagel', firebird: 'AVWfbird', phoenix: 'AVWphx'
};

/** Adventure-map sprite for a wandering creature stack. */
export function monsterDef(key: string): string {
  const i = CREATURE_ORDER.indexOf(key);
  if (i >= 0) return AVW[i];
  return AVW_CONFLUX[key] ?? 'AVWMON1';
}

// Hero id + class suffix of the original portraits (hpl###xx.pcx / hps###xx.pcx).
const HERO_PORTRAIT: Record<string, string> = {
  christian: '006kn', adela: '009cl', sorsha: '005kn', cuthbert: '010cl',
  ryland: '019rn', clancy: '022rn', mephala: '016rn', elle: '026dr',
  tyris: '007kn', solmyr: '045wz', piquedram: '032al', cyra: '046wz',
  rashka: '049hr', pyre: '054hr', marius: '050hr', xarfax: '063dm', ignatius: '051hr',
  vidomina: '078nc', thant: '076nc', straker: '064dk', sephinroth: '094wl',
  lorelei: '080ov', alamar: '088wl', ajit: '083ov', jeddite: '091wl',
  crag: '102br', gundula: '109bm', jabarkas: '098br', saurug: '111bm',
  tazar: '115bs', alagar: '030dr', bron: '112bs', mirlanda: '120wh'
};

const FACTION_PORTRAIT: Record<string, string> = {
  castle: '000kn', rampart: '016rn', tower: '040wz', inferno: '048hr', necropolis: '064dk',
  dungeon: '080ov', stronghold: '096br', fortress: '112bs', conflux: '000kn'
};

function heroKey(nameOrKey: string): string {
  return nameOrKey.toLowerCase().split(' ')[0];
}

export function heroPortrait(nameOrKey: string, faction: string, size: 'large' | 'small'): string {
  const stem = HERO_PORTRAIT[heroKey(nameOrKey)] ?? FACTION_PORTRAIT[faction] ?? '000kn';
  return (size === 'large' ? 'hpl' : 'hps') + stem;
}

const CLASS_SPRITE: Record<string, number> = { kn: 0, cl: 1, rn: 2, dr: 3, al: 4, wz: 5, hr: 6, dm: 7, dk: 8, nc: 9, ov: 10, wl: 11, br: 12, bm: 13, bs: 14, wh: 15 };

/** Mounted-hero adventure sprite (AH##_). */
export function heroMapDef(nameOrKey: string, faction: string): string {
  const stem = HERO_PORTRAIT[heroKey(nameOrKey)] ?? FACTION_PORTRAIT[faction] ?? '000kn';
  const cls = CLASS_SPRITE[stem.slice(3)] ?? 0;
  return 'AH' + String(cls).padStart(2, '0') + '_';
}

// Player colours: 0 red, 1 blue, 2 tan, 3 green, 4 orange, 5 purple, 6 teal, 7 pink.
export const FACTION_PLAYER_COLOR: Record<string, number> = {
  castle: 1, rampart: 3, tower: 2, inferno: 0, necropolis: 5, dungeon: 4, stronghold: 6, fortress: 7, conflux: 2
};

export const flagDef = (faction: string) => 'AF' + String(FACTION_PLAYER_COLOR[faction] ?? 1).padStart(2, '0');

export const TOWN_MAP_DEF: Record<string, string> = {
  castle: 'AVCcasx0', rampart: 'AVCramx0', tower: 'AVCtowx0', inferno: 'AvCinfx0', necropolis: 'AVCnecx0',
  dungeon: 'AVCdunx0', stronghold: 'AVCstrx0', fortress: 'Avcftrx0', conflux: 'AVCranx0'
};

/** ITPA (town list) frame: fort icon for faction. */
export const townListFrame = (faction: string) => 2 + 2 * Math.max(0, FACTIONS.indexOf(faction));

// Resource icon frame order in RESOURCE / SMALRES / RESOUR82.
export const RES_FRAME: Record<string, number> = { wood: 0, mercury: 1, ore: 2, sulfur: 3, crystal: 4, gems: 5, gold: 6 };

export const MINE_DEF: Record<string, string> = {
  wood: 'AVMsawg0', ore: 'AVMore0', gold: 'AVMgold0', gems: 'AVMgems0', crystal: 'AVMcrys0', sulfur: 'AVMsulf0', mercury: 'AVMalch0'
};

export const RESOURCE_DEF: Record<string, string> = {
  wood: 'AVTwood0', ore: 'AVTORE0', gold: 'AVTgold0', gems: 'AVTgems0', crystal: 'AVTCRYS0', sulfur: 'AVTsulf0', mercury: 'AVTmerc0'
};

// Terrain DEFs and their plain interior frames.
export const TERRAIN_DEF: Record<string, { def: string; frames: [number, number] }> = {
  grass: { def: 'GRASTL', frames: [49, 72] },
  dirt: { def: 'DIRTTL', frames: [21, 44] },
  sand: { def: 'sandtl', frames: [0, 23] },
  snow: { def: 'Snowtl', frames: [49, 72] },
  swamp: { def: 'Swmptl', frames: [49, 72] },
  rough: { def: 'ROUGTL', frames: [49, 72] },
  subterranean: { def: 'Subbtl', frames: [49, 72] },
  lava: { def: 'Lavatl', frames: [49, 72] },
  water: { def: 'Watrtl', frames: [21, 32] },
  rock: { def: 'rocktl', frames: [0, 7] }
};

// Edge-transition frame ranges (from VCMI terrainViewPatterns.json): [dirt-border, sand-border].
type R = [number, number];
const NORMAL_EDGES = { left: [[4, 7], [24, 27]], top: [[8, 11], [28, 31]], inner: [[12, 15], [32, 35]], outer: [[16, 17], [36, 37]], fallback: [[0, 3], [20, 23]] } as Record<string, [R, R]>;
const BORDERED_EDGES = { left: [[4, 7], [4, 7]], top: [[8, 11], [8, 11]], inner: [[12, 15], [12, 15]], outer: [[16, 17], [16, 17]], fallback: [[0, 3], [0, 3]] } as Record<string, [R, R]>;
const NORMAL_RANK = ['grass', 'snow', 'swamp', 'rough', 'lava', 'subterranean'];

/** Border kind a neighbour imposes on a tile: null = native, 'D' = dirt edge, 'S' = sand/coast edge. */
export function borderKind(self: string, other: string | null | undefined): 'D' | 'S' | null {
  if (!other || other === self) return null;
  if (self === 'sand' || self === 'rock') return null;
  if (self === 'water') return 'S';
  if (self === 'dirt') return other === 'sand' || other === 'water' ? 'S' : null;
  if (other === 'sand' || other === 'water') return 'S';
  if (other === 'dirt' || other === 'rock') return 'D';
  // two different normal terrains: only the lower-ranked (greener) one draws the dirt fringe
  return NORMAL_RANK.indexOf(self) < NORMAL_RANK.indexOf(other) ? 'D' : null;
}

export function edgeFrames(terrain: string): Record<string, [R, R]> | null {
  if (terrain === 'sand' || terrain === 'rock') return null;
  return terrain === 'dirt' || terrain === 'water' ? BORDERED_EDGES : NORMAL_EDGES;
}

export const TREE_DEFS: Record<string, string[]> = {
  default: objectGeometry.groups.tree,
  dirt: objectGeometry.groups['tree.dirt'],
  snow: objectGeometry.groups['tree.snow']
};

export const ROCK_DEFS = objectGeometry.groups.rock;
export const MOUNTAIN_DEFS = objectGeometry.groups.mountain;

export const OBJECT_DEF: Record<string, string> = {
  treasure: 'AVTchst0', shrine: 'AVXl1sh0', grail: 'AvXOblY', obelisk: 'AvXOblY'
};

/** Artifacts in the original Artifact.def / AVA####.def numbering. */
export const artifactDef = (seed: number) => 'AVA' + String(7 + (seed % 60)).padStart(4, '0');
/** Stable seed for an artifact key such as 'artifact3'; the same seed picks its map sprite and its Artifact.def icon. */
export function artifactSeed(key: string | null | undefined): number {
  const m = /(\d+)$/.exec(key ?? '');
  if (m) return +m[1] * 7;
  let h = 0;
  for (const c of key ?? '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
