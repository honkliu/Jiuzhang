import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { useGameNavigate } from '../useGameNavigate';
import { api } from '../api';
import type { GameDetail } from '../types';
import { serverText } from '../text';
import { Btn, Loading, Panel, Txt } from '../ui/Layout';

export function GameOver() {
  const { t } = useLanguage();
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useGameNavigate();
  const [game, setGame] = useState<GameDetail | null>(null);

  useEffect(() => {
    if (!gameId) return;
    api.getGame(gameId).then(setGame).catch(() => {});
  }, [gameId]);

  if (!game) return <Loading />;

  const winner = game.players.find((p) => p.playerId === game.winnerUserId) ?? null;
  const solved = !!winner;
  const ranked = [...game.players].sort((a, b) => {
    if (a.precious !== b.precious) return a.precious ? -1 : 1;
    return b.obeliskVisits - a.obeliskVisits;
  });

  return (
    <>
      <Txt x={0} y={120} w={1280} size={34} bold align="center" className="heading">
        {solved ? t('homm.ui.over.solved') : t('homm.ui.over.ended')}
      </Txt>
      <Txt x={0} y={176} w={1280} size={16} align="center" color="var(--text-dim)">
        {solved ? t('homm.ui.over.winner').replace('{name}', serverText(t, winner!.name)) : t('homm.ui.over.noWinner')}
      </Txt>

      <Panel x={440} y={280} w={400} h={240}>
        <Txt x={0} y={14} w={400} size={14} bold align="center">{t('homm.ui.over.standings')}</Txt>
        <div style={{ position: 'absolute', left: 20, top: 44, right: 20 }}>
          {ranked.map((p, i) => (
            <div key={p.playerId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '6px 0', borderTop: i ? '1px solid rgba(200,160,80,0.15)' : 'none' }}>
              <span>{i + 1}. {serverText(t, p.name)}</span>
              <span className={p.precious ? 'ok' : 'muted'}>
                {p.precious ? t('homm.ui.over.precious') : t('homm.ui.over.fragments').replace('{n}', String(p.obeliskVisits))}
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <Btn x={560} y={560} w={160} h={40} label={t('homm.ui.over.return')} size={14} onClick={() => navigate('/')} />
    </>
  );
}
