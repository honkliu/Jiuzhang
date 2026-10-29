import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useGameNavigate } from '../useGameNavigate';
import { api, ApiError } from '../api';
import type { MapData, ObeliskState } from '../types';
import { useLanguage } from '@/i18n/LanguageContext';
import { errText, serverText } from '../text';
import { Box, Btn, Loading, Txt } from '../ui/Layout';
import { toast } from '../ui/Toast';
import { onAssetLoaded, Pcx, pcxUrl, useH3 } from '../h3/assets';
import { renderFallback, renderH3 } from './AdventureMap';
import { DefButton } from './TownWindows';
import puzzleMap from '../h3/puzzle-map.json';

type Piece = [x: number, y: number, uncoverAt: number];
const PIECES = puzzleMap as unknown as Record<string, { prefix: string; pieces: Piece[] }>;
const PIECE_COUNT = 48;
const VIEW = { x: 8, y: 8, w: 592, h: 544 };
const TILE = 32;

/** HoMM3 puzzle pieces: Rampart's are absent from some data sets, so fall back to Castle's. */
function pieceSet(faction: string) {
  return PIECES[faction] ?? PIECES.castle;
}

/**
 * The obelisk board, after the HoMM3 Puzzle Map window: the land around the Grail hidden under
 * 48 pieces that fall away as the player's heroes read obelisks, plus notes left on the stone.
 */
export function Obelisk() {
  const { t } = useLanguage();
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useGameNavigate();
  const h3 = useH3();
  const [state, setState] = useState<ObeliskState | null>(null);
  const [draft, setDraft] = useState('');
  const [shown, setShown] = useState<number | null>(null);
  const [castleFallback, setCastleFallback] = useState(false);
  const [assetGen, setAssetGen] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const refresh = useCallback(async () => {
    if (!gameId) return;
    try {
      setState(await api.getObelisk(gameId));
    } catch (e) {
      if (e instanceof ApiError) toast(serverText(t, e.message));
    }
  }, [gameId, t]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => onAssetLoaded(() => setAssetGen((n) => n + 1)), []);

  const ratio = state && state.total > 0 ? Math.min(1, state.visited / state.total) : 0;
  const key = state ? `obelisk-ratio:${gameId}:${state.faction}` : '';

  // newly uncovered pieces fade out, as in the original: start from the last ratio this player saw
  useEffect(() => {
    if (!state) return;
    const before = Number(localStorage.getItem(key) ?? '0');
    setShown(Math.min(before, ratio));
    localStorage.setItem(key, String(ratio));
    const id = window.setTimeout(() => setShown(ratio), 60);
    return () => window.clearTimeout(id);
  }, [state, key, ratio]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !state) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const p = state.puzzle;
    const map: MapData = { width: p.width, height: p.height, tiles: p.tiles, heroes: [], towns: [] };
    const cam = { x: p.grailX + 0.5 - VIEW.w / TILE / 2, y: p.grailY + 0.5 - VIEW.h / TILE / 2 };
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    if (h3) renderH3(ctx, map, cam, 0, new Map(), null);
    else renderFallback(ctx, map, cam);
    // the dig site
    const cx = (p.grailX - cam.x + 0.5) * TILE, cy = (p.grailY - cam.y + 0.5) * TILE;
    ctx.strokeStyle = '#d01010';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy - 9); ctx.lineTo(cx + 9, cy + 9);
    ctx.moveTo(cx + 9, cy - 9); ctx.lineTo(cx - 9, cy + 9);
    ctx.stroke();
  }, [state, h3, assetGen]);

  if (!state || shown == null) return <Loading />;

  const set = castleFallback ? PIECES.castle : pieceSet(state.faction);
  const covered = (uncoverAt: number) => uncoverAt > PIECE_COUNT * shown;
  const fresh = (uncoverAt: number) => uncoverAt <= PIECE_COUNT * ratio;

  async function postMessage() {
    if (!gameId || !draft.trim()) return;
    try {
      await api.addObeliskMessage(gameId, draft.trim());
      setDraft('');
      await refresh();
    } catch (e) {
      toast(errText(t, e, 'homm.ui.common.somethingWrong'));
    }
  }

  return (
    <div data-testid="obelisk-board">
      {h3 ? <Pcx name="PUZZLE" x={0} y={0} w={800} h={600} /> : <div className="panel abs" style={{ left: 0, top: 0, width: 800, height: 600, borderRadius: 0 }} />}
      <canvas ref={canvasRef} width={VIEW.w} height={VIEW.h} data-testid="puzzle-map"
        style={{ position: 'absolute', left: VIEW.x, top: VIEW.y }} />

      {h3 ? set.pieces.map(([x, y, at], i) => (
        <img key={`${set.prefix}${i}`} src={pcxUrl(`${set.prefix}${String(i).padStart(2, '0')}`)} alt="" draggable={false}
          data-testid="puzzle-piece" data-covered={covered(at) ? 'true' : 'false'}
          onError={() => { if (set !== PIECES.castle) setCastleFallback(true); }}
          style={{ position: 'absolute', left: x + 1, top: y, pointerEvents: 'none',
            opacity: covered(at) ? 1 : 0, transition: fresh(at) ? 'opacity 900ms ease-out' : 'none' }} />
      )) : Array.from({ length: PIECE_COUNT }).map((_, i) => {
        // without the original art: an 8×6 grid of stone tiles in the same uncover order
        const at = set.pieces[i]?.[2] ?? i + 1;
        const cw = VIEW.w / 8, ch = VIEW.h / 6;
        return (
          <div key={i} data-testid="puzzle-piece" data-covered={covered(at) ? 'true' : 'false'}
            style={{ position: 'absolute', left: VIEW.x + (i % 8) * cw, top: VIEW.y + Math.floor(i / 8) * ch, width: cw, height: ch,
              background: '#3a3226', border: '1px solid #1c1812', boxSizing: 'border-box', pointerEvents: 'none',
              opacity: covered(at) ? 1 : 0, transition: fresh(at) ? 'opacity 900ms ease-out' : 'none' }} />
        );
      })}

      {h3 && <Pcx name="PUZZLOGO" x={607} y={3} />}
      <Txt x={604} y={88} w={192} size={15} bold align="center" className="heading">{t('homm.ui.obelisk.title')}</Txt>
      <Txt x={604} y={110} w={192} size={11} align="center" color="var(--text-dim)">
        {state.complete ? t('homm.ui.obelisk.complete') : t('homm.ui.obelisk.seen').replace('{n}', String(state.visited)).replace('{total}', String(state.total))}
      </Txt>

      <Txt x={612} y={146} w={180} size={12} bold className="heading">{t('homm.ui.obelisk.messages')}</Txt>
      <Box x={612} y={166} w={180} h={262} className="scroll" data-testid="obelisk-messages">
        {state.messages.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>{t('homm.ui.obelisk.noMessages')}</div>
        )}
        {state.messages.map((m) => (
          <div key={m.id} style={{ fontSize: 11, marginBottom: 6, lineHeight: '14px' }}>
            <div style={{ color: m.mine ? 'var(--accent)' : '#e8d080' }}>{serverText(t, m.author)}</div>
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>
          </div>
        ))}
      </Box>
      <textarea className="inp" style={{ position: 'absolute', left: 612, top: 434, width: 180, height: 54, resize: 'none', fontSize: 11 }}
        placeholder={t('homm.ui.obelisk.leaveMessage')} value={draft} maxLength={2000}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postMessage(); } }} />
      <Btn x={652} y={494} w={100} h={26} label={t('homm.ui.obelisk.post')} size={11} disabled={!draft.trim()} onClick={postMessage} />

      {h3 ? <DefButton def="IOKAY" x={670} y={538} label={t('homm.ui.common.ok')} onClick={() => navigate(`/game/${gameId}`)} />
        : <Btn x={670} y={538} w={64} h={32} label={t('homm.ui.common.ok')} onClick={() => navigate(`/game/${gameId}`)} />}
    </div>
  );
}