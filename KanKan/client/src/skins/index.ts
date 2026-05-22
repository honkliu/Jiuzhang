import { glass } from './glass';
import { ink } from './ink';
import { bamboo } from './bamboo';
import { mono } from './mono';
import { sunset } from './sunset';
import { midnight } from './midnight';
import type { Skin, SkinId } from './types';

export const SKINS: Record<SkinId, Skin> = {
  glass,
  ink,
  bamboo,
  mono,
  sunset,
  midnight,
};

export const SKIN_LIST: Skin[] = [glass, ink, bamboo, mono, sunset, midnight];

export const DEFAULT_SKIN_ID: SkinId = 'glass';

export const getSkin = (id?: string | null): Skin =>
  id && (id as SkinId) in SKINS ? SKINS[id as SkinId] : SKINS[DEFAULT_SKIN_ID];

export type { Skin, SkinId } from './types';
