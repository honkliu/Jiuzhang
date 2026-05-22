import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { DEFAULT_SKIN_ID, SKINS, SKIN_LIST, getSkin } from './index';
import type { Skin, SkinId } from './types';

const STORAGE_KEY = 'kankan.skin';

interface SkinContextValue {
  skin: Skin;
  skinId: SkinId;
  setSkinId: (id: SkinId) => void;
  available: Skin[];
}

const SkinContext = createContext<SkinContextValue | null>(null);

const readSavedSkinId = (): SkinId => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && (raw as SkinId) in SKINS) return raw as SkinId;
  } catch {
    // ignore — fall through to default
  }
  return DEFAULT_SKIN_ID;
};

export const SkinProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [skinId, setSkinIdState] = useState<SkinId>(() => readSavedSkinId());
  const skin = useMemo(() => getSkin(skinId), [skinId]);
  const theme = useMemo(() => createTheme(skin.theme), [skin]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, skinId);
    } catch {
      // ignore — non-fatal
    }

    // The body and html backgrounds need to flow with the skin too, since
    // index.css sets a hardcoded #f4f7fb and MuiCssBaseline alone doesn't
    // cover the html element behind the body.
    document.documentElement.style.background = skin.bodyBackground;
    document.body.style.background = skin.bodyBackground;
  }, [skinId, skin.bodyBackground]);

  const setSkinId = useCallback((id: SkinId) => setSkinIdState(id), []);

  const value = useMemo<SkinContextValue>(
    () => ({ skin, skinId, setSkinId, available: SKIN_LIST }),
    [skin, skinId, setSkinId]
  );

  return (
    <SkinContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </SkinContext.Provider>
  );
};

export const useSkin = (): SkinContextValue => {
  const ctx = useContext(SkinContext);
  if (!ctx) {
    throw new Error('useSkin must be used within a SkinProvider');
  }
  return ctx;
};
