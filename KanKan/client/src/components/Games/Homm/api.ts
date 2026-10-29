// Typed REST client. All commands go through here; the server is authoritative.
// Requests carry the KanKan JWT; a 401 triggers one token refresh (as KanKan's axios client does).
import { authService } from '@/services/auth.service';
import { HOMM_API } from './paths';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let refreshing: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (!refreshing) {
    refreshing = authService.refreshToken().finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function send(method: string, path: string, body?: unknown, retried = false): Promise<Response> {
  const token = authService.getAccessToken();
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin'
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Please try again.');
  }
  if (res.status === 401 && !retried) {
    try {
      await refreshAccessToken();
    } catch {
      authService.clearAuth();
      window.location.href = '/login';
      throw new ApiError(401, 'Your session has expired. Please sign in again.');
    }
    return send(method, path, body, true);
  }
  return res;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try { json = JSON.parse(text); } catch { json = text; }
  }
  if (!res.ok) {
    const msg = (json && typeof json === 'object' && 'error' in json)
      ? String((json as { error: unknown }).error)
      : 'Request failed (' + res.status + ').';
    throw new ApiError(res.status, msg);
  }
  return json;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await send(method, path, body);
  if (res.status === 204) return undefined as T;
  return (await readJson(res)) as T;
}

export const api = {
  me: () => request<import('./types').Me>('GET', `${HOMM_API}/me`),

  // games
  listGames: () => request<import('./types').GameSummary[]>('GET', `${HOMM_API}/games`),
  createGame: (name: string, capacity: number, turnSeconds: number, turnLimit: number, aiPlayers = 0) =>
    request<{ gameId: string }>('POST', `${HOMM_API}/games`, { name, capacity, turnSeconds, turnLimit, aiPlayers }),
  joinGame: (id: string) => request<{ playerId: string }>('POST', `${HOMM_API}/games/${id}/join`),
  getGame: (id: string) => request<import('./types').GameDetail>('GET', `${HOMM_API}/games/${id}`),
  getMap: (id: string) => request<import('./types').MapData>('GET', `${HOMM_API}/games/${id}/map`),
  getHeroes: (id: string) => request<import('./types').HeroDetail[]>('GET', `${HOMM_API}/games/${id}/heroes`),
  getHero: (id: string) => request<import('./types').HeroDetail>('GET', `${HOMM_API}/heroes/${id}`),
  moveHero: async (id: string, path: { x: number; y: number }[]) => {
    const res = await send('POST', `${HOMM_API}/heroes/${id}/move`, { path });
    const json = await readJson(res);
    const notices = JSON.parse(res.headers.get('X-Move-Events') ?? '[]') as import('./types').AdventureNotice[];
    return { hero: json as import('./types').HeroDetail, message: res.headers.get('X-Move-Message'), notices };
  },
  resolveEncounter: (id: string, action: string) =>
    request<{ message: string }>('POST', `${HOMM_API}/heroes/${id}/encounter`, { action }),
  resolveTreasure: (id: string, choice: 'gold' | 'experience' | 'leave') =>
    request<{ message: string; notices: import('./types').AdventureNotice[] }>('POST', `${HOMM_API}/heroes/${id}/treasure`, { choice }),
  castSpell: (id: string, spell: string, x?: number, y?: number, townId?: string) =>
    request<{ message: string; mana: number; x: number; y: number; view: import('./types').WorldView | null }>('POST', `${HOMM_API}/heroes/${id}/cast`, { spell, x, y, townId }),
  getVisions: (id: string) => request<import('./types').VisionTarget[]>('GET', `${HOMM_API}/heroes/${id}/visions`),
  endTurn: (id: string) =>
    request<{ day: number; week: number; month: number; turn: number }>('POST', `${HOMM_API}/games/${id}/endturn`),
  shareMine: (id: string, x: number, y: number, shared: boolean) =>
    request<void>('POST', `${HOMM_API}/games/${id}/mine-sharing`, { x, y, shared }),
  endAgreement: (id: string, agree: boolean) =>
    request<{ state: string; votes: string[] }>('POST', `${HOMM_API}/games/${id}/agreement`, { agree }),
  getTown: (id: string) => request<import('./types').TownDetail>('GET', `${HOMM_API}/towns/${id}`),
  recruit: (id: string, tier: number, count: number, creature?: string) =>
    request<{ recruited: number; creature: string }>('POST', `${HOMM_API}/towns/${id}/recruit`, { tier, count, creature }),
  moveArmy: (id: string, fromArmy: 'hero' | 'garrison', fromSlot: number, toArmy: 'hero' | 'garrison', toSlot: number, count = 0) =>
    request<{ hero: import('./types').ArmySlot[] | null; garrison: import('./types').ArmySlot[] }>(
      'POST', `${HOMM_API}/towns/${id}/army`, { fromArmy, fromSlot, toArmy, toSlot, count }),
  moveHeroArmy: (heroId: string, fromSlot: number, toSlot: number, count = 0) =>
    request<{ army: import('./types').ArmySlot[] }>('POST', `${HOMM_API}/heroes/${heroId}/army`, { fromSlot, toSlot, count }),
  exchangeHeroes: (heroId: string, otherHeroId: string, fromSlot?: number, toSlot?: number, count = 0) =>
    request<{ hero: import('./types').HeroDetail; other: import('./types').HeroDetail }>(
      'POST', `${HOMM_API}/heroes/${heroId}/exchange`, { otherHeroId, fromSlot, toSlot, count }),
  moveArtifact: (heroId: string, from: string, to: string, toHeroId?: string) =>
    request<{ hero: import('./types').HeroDetail; other: import('./types').HeroDetail | null }>(
      'POST', `${HOMM_API}/heroes/${heroId}/artifacts`, { from, to, toHeroId }),
  dismissStack: (heroId: string, slot: number) =>
    request<import('./types').HeroDetail>('POST', `${HOMM_API}/heroes/${heroId}/dismiss-stack`, { slot, confirmed: true }),
  dismissHero: (heroId: string) =>
    request<void>('POST', `${HOMM_API}/heroes/${heroId}/dismiss`, { confirmed: true }),
  chooseLevel: (heroId: string, skill: string | null) =>
    request<import('./types').HeroDetail>('POST', `${HOMM_API}/heroes/${heroId}/level-up`, { skill }),
  upgradeStack: (id: string, army: 'hero' | 'garrison', slot: number) =>
    request<{ creature: string }>('POST', `${HOMM_API}/towns/${id}/upgrade`, { army, slot }),
  buyWarMachine: (id: string) => request<{ machine: string }>('POST', `${HOMM_API}/towns/${id}/blacksmith`),
  buySpellbook: (id: string) => request<{ learned: string[] }>('POST', `${HOMM_API}/towns/${id}/spellbook`),
  transformStack: (id: string, slot: number) =>
    request<{ creature: string; count: number }>('POST', `${HOMM_API}/towns/${id}/transform`, { army: 'hero', slot }),
  trade: (id: string, from: string, to: string, amount: number) =>
    request<void>('POST', `${HOMM_API}/towns/${id}/trade`, { from, to, amount }),
  hire: (id: string, heroKey: string) =>
    request<{ heroId: string }>('POST', `${HOMM_API}/towns/${id}/hire`, { heroKey }),
  moveGarrison: (id: string, direction: 'toGarrison' | 'toHero', slot: number, count: number) =>
    request<{ moved: number; creature: string }>('POST', `${HOMM_API}/towns/${id}/garrison`, { direction, slot, count }),

  // city
  getCity: (playerId: string) => request<import('./types').CityView>('GET', `${HOMM_API}/cities/${playerId}`),
  build: (playerId: string, buildingKey: string) =>
    request<void>('POST', `${HOMM_API}/towns/${playerId}/build`, { buildingKey }),
  renameCity: (playerId: string, name: string) =>
    request<void>('PUT', `${HOMM_API}/cities/${playerId}/name`, { name }),

  // posts
  getPosts: (playerId: string) => request<import('./types').Post[]>('GET', `${HOMM_API}/towns/${playerId}/posts`),
  createPost: (playerId: string, title: string, body: string, imageUrl: string | null) =>
    request<{ postId: string }>('POST', `${HOMM_API}/towns/${playerId}/posts`, { title, body, imageUrl }),
  updatePost: (postId: string, title: string, body: string, imageUrl: string | null) =>
    request<void>('PUT', `${HOMM_API}/posts/${postId}`, { title, body, imageUrl }),
  deletePost: (postId: string) => request<void>('DELETE', `${HOMM_API}/posts/${postId}`),

  // comments
  getComments: (postId: string) => request<import('./types').Comment[]>('GET', `${HOMM_API}/posts/${postId}/comments`),
  addComment: (postId: string, body: string) =>
    request<{ commentId: string }>('POST', `${HOMM_API}/posts/${postId}/comments`, { body }),

  // wall
  getWall: (playerId: string) => request<import('./types').WallMessage[]>('GET', `${HOMM_API}/towns/${playerId}/wall`),
  addWallMessage: (playerId: string, body: string, parentId: string | null) =>
    request<{ messageId: string }>('POST', `${HOMM_API}/towns/${playerId}/wall`, { body, parentId }),
  deleteWallMessage: (messageId: string) => request<void>('DELETE', `${HOMM_API}/wall/${messageId}`),

  // tower guestbook
  getTowerMessages: (playerId: string) => request<import('./types').TowerMessage[]>('GET', `${HOMM_API}/towns/${playerId}/tower`),
  addTowerMessage: (playerId: string, body: string) =>
    request<{ messageId: string }>('POST', `${HOMM_API}/towns/${playerId}/tower`, { body }),

  // obelisk
  getObelisk: (gameId: string) => request<import('./types').ObeliskState>('GET', `${HOMM_API}/games/${gameId}/obelisk`),
  addObeliskMessage: (gameId: string, body: string) =>
    request<{ messageId: string }>('POST', `${HOMM_API}/games/${gameId}/obelisk/message`, { body }),

  // catalogue
  getBuildings: (faction: string) => request<import('./types').BuildingDef[]>('GET', `${HOMM_API}/buildings?faction=${encodeURIComponent(faction)}`),
  getCreatures: () => request<import('./types').CreatureDef[]>('GET', `${HOMM_API}/creatures`),
  getHeroCatalog: () => request<import('./types').HeroDef[]>('GET', `${HOMM_API}/heroes`),
  getSpells: () => request<import('./types').SpellDef[]>('GET', `${HOMM_API}/spells`),
  getAnnotations: (id: string) =>
    request<{ id: string; x: number; y: number; text: string; author: string; createdAt: string }[]>('GET', `${HOMM_API}/games/${id}/annotations`),
  addAnnotation: (id: string, x: number, y: number, text: string) =>
    request<void>('POST', `${HOMM_API}/games/${id}/annotations`, { x, y, text }),
  getMessages: (id: string) => request<HeroMessageDto[]>('GET', `${HOMM_API}/games/${id}/messages`),
  sendMessage: (id: string, toPlayerId: string, body: string) =>
    request<void>('POST', `${HOMM_API}/games/${id}/messages`, { toPlayerId, body }),
  getTrades: (id: string) => request<TradeDto[]>('GET', `${HOMM_API}/games/${id}/trades`),
  offerTrade: (id: string, toPlayerId: string, give: string, giveAmount: number, want: string, wantAmount: number) =>
    request<void>('POST', `${HOMM_API}/games/${id}/trades`, { toPlayerId, give, giveAmount, want, wantAmount }),
  respondTrade: (id: string, accept: boolean) => request<void>('POST', `${HOMM_API}/trades/${id}/respond`, { accept }),
  getProjects: (id: string) => request<ProjectDto[]>('GET', `${HOMM_API}/games/${id}/projects`),
  contribute: (id: string, gold: number, wood: number, ore: number) =>
    request<void>('POST', `${HOMM_API}/projects/${id}/contribute`, { gold, wood, ore })
};

export interface HeroMessageDto {
  id: string; from: string; to: string; body: string; createdAt: string; mine: boolean;
}

export interface TradeDto {
  id: string; from: string; to: string; give: string; giveAmount: number;
  want: string; wantAmount: number; status: string; incoming: boolean; createdAt: string;
}

export interface ProjectDto {
  id: string; name: string; description: string;
  requiredGold: number; requiredWood: number; requiredOre: number;
  contributedGold: number; contributedWood: number; contributedOre: number;
  completed: boolean; contributors: string[];
}