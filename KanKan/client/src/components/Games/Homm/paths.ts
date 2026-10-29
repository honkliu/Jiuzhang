// The game is mounted under /games/homm inside KanKan; every in-game route is relative to it.
export const HOMM_BASE = '/games/homm';

/** Map a game-internal absolute path ('/', '/game/1/town/2') to the mounted KanKan route. */
export function hommPath(path: string): string {
  if (!path || path === '/') return HOMM_BASE;
  return HOMM_BASE + (path.startsWith('/') ? path : '/' + path);
}

/** Base for all REST calls (and H3 asset URLs) served by the KanKan server. */
export const HOMM_API = '/api/homm';
