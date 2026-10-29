import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { hommPath } from './paths';

/**
 * In-game navigation. Panels are views of one game, not pages: opening the town or
 * the hero screen must not add a browser history entry, or Back would rewind the game.
 * Every in-game transition replaces the current entry instead of pushing a new one.
 * Paths are game-internal ('/game/:id/...', '/' for the lobby) and are mapped under /games/homm.
 */
export function useGameNavigate() {
  const navigate = useNavigate();
  return useCallback(
    (to: string) => navigate(hommPath(to), { replace: true }),
    [navigate]
  );
}