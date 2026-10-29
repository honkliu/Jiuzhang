import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { api } from '../api';
import { hommPath } from '../paths';
import type { GameSummary, Me } from '../types';
import { Btn, Loading, Modal, Panel, Txt } from '../ui/Layout';
import { toast } from '../ui/Toast';
import { errText, serverText } from '../text';

export function Lobby() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [games, setGames] = useState<GameSummary[]>([]);
  const [player, setPlayer] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [list, me] = await Promise.all([api.listGames(), api.me()]);
      setGames(list);
      setPlayer(me);
    } catch (e) {
      toast(errText(t, e, 'homm.ui.lobby.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(refresh, 5000);
    return () => window.clearInterval(id);
  }, [refresh]);

  if (loading) return <Loading />;

  return (
    <>
      <Panel x={0} y={0} w={800} h={48}>
        <Txt x={20} y={14} size={18} bold className="heading">{t('homm.ui.lobby.title')}</Txt>
        <Txt x={560} y={16} w={220} size={13} align="right">{t('homm.ui.lobby.playingAs').replace('{name}', player?.name ?? '')}</Txt>
      </Panel>
      <Txt x={24} y={78} size={20} bold className="heading">{t('homm.ui.lobby.games')}</Txt>
      <Btn x={630} y={66} w={146} h={36} label={t('homm.ui.lobby.newGame')} onClick={() => setCreating(true)} />
      <Panel x={24} y={118} w={752} h={458}>
        <div className="scroll" style={{ position: 'absolute', inset: 6 }}>
          {games.length === 0 ? (
            <div className="muted" style={{ padding: 16 }}>{t('homm.ui.lobby.noGames')}</div>
          ) : (
            <table className="tbl">
              <thead><tr>
                <th>{t('homm.ui.lobby.colName')}</th><th>{t('homm.ui.lobby.colPlayers')}</th>
                <th>{t('homm.ui.lobby.colDay')}</th><th>{t('homm.ui.lobby.colStatus')}</th><th />
              </tr></thead>
              <tbody>
                {games.map(game => (
                  <tr key={game.id}>
                    <td>{serverText(t, game.name)}</td>
                    <td>{game.players}</td>
                    <td>{t('homm.ui.lobby.date').replace('{d}', String(game.day)).replace('{w}', String(game.week)).replace('{m}', String(game.month))}</td>
                    <td>{t('homm.ui.lobby.state.' + game.state)}</td>
                    <td style={{ width: 100 }}>
                      <button className="btn" style={{ position: 'relative', width: 84, height: 30 }}
                        onClick={async () => {
                          // joining is idempotent: the server keeps the existing seat if there is one
                          try {
                            await api.joinGame(game.id);
                          } catch (e) {
                            toast(errText(t, e, 'homm.ui.lobby.joinFailed'));
                            return;
                          }
                          navigate(hommPath(`/game/${game.id}`));
                        }}>{t('homm.ui.lobby.enter')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Panel>
      {creating && <CreateGameModal onClose={() => setCreating(false)}
        onCreated={id => navigate(hommPath(`/game/${id}`))} />}
    </>
  );
}

function CreateGameModal({ onClose, onCreated }: {
  onClose: () => void; onCreated: (id: string) => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(() => t('homm.srv.theThreeCities'));
  const [turnSeconds, setTurnSeconds] = useState(300);
  const [turnLimit, setTurnLimit] = useState(0);
  const [aiPlayers, setAiPlayers] = useState(0);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const result = await api.createGame(name.trim(), 3, turnSeconds, turnLimit, aiPlayers);
      onCreated(result.gameId);
    } catch (e) {
      toast(errText(t, e, 'homm.ui.lobby.createFailed'));
      setBusy(false);
    }
  }

  return (
    <Modal w={480} h={360} onClose={onClose}>
      <Txt x={0} y={20} w={480} size={20} bold align="center" className="heading">{t('homm.ui.lobby.newGameTitle')}</Txt>
      <Txt x={32} y={70}>{t('homm.ui.lobby.colName')}</Txt>
      <input className="inp" aria-label={t('homm.ui.lobby.colName')} style={{ left: 32, top: 94, width: 416, height: 36 }}
        value={name} maxLength={60} onChange={e => setName(e.target.value)} />
      <Txt x={32} y={150}>{t('homm.ui.lobby.turnLength')}</Txt>
      <select className="inp" aria-label={t('homm.ui.lobby.turnLength')} style={{ left: 32, top: 174, width: 194, height: 36 }}
        value={turnSeconds} onChange={e => setTurnSeconds(Number(e.target.value))}>
        <option value={30}>{t('homm.ui.lobby.sec30')}</option><option value={60}>{t('homm.ui.lobby.min1')}</option>
        <option value={300}>{t('homm.ui.lobby.min5')}</option><option value={86400}>{t('homm.ui.lobby.day1')}</option>
      </select>
      <Txt x={254} y={150}>{t('homm.ui.lobby.turnLimitHint')}</Txt>
      <input className="inp" type="number" aria-label={t('homm.ui.lobby.turnLimit')} min={0} max={500}
        style={{ left: 254, top: 174, width: 194, height: 36 }}
        value={turnLimit} onChange={e => setTurnLimit(Number(e.target.value))} />
      <Txt x={32} y={242}>{t('homm.ui.lobby.computers')}</Txt>
      <select className="inp" aria-label={t('homm.ui.lobby.computers')} style={{ left: 32, top: 266, width: 194, height: 36 }}
        value={aiPlayers} onChange={e => setAiPlayers(Number(e.target.value))}>
        <option value={0}>{t('homm.ui.lobby.ai0')}</option>
        <option value={1}>{t('homm.ui.lobby.ai1')}</option>
        <option value={2}>{t('homm.ui.lobby.ai2')}</option>
      </select>
      <Txt x={254} y={250} w={194} size={11} color="var(--text-dim)">
        {t('homm.ui.lobby.aiHint')}
      </Txt>
      <Btn x={176} y={330} w={128} h={38} label={busy ? t('homm.ui.lobby.creating') : t('homm.ui.lobby.create')}
        disabled={busy || !name.trim()} onClick={submit} />
      <Btn x={320} y={330} w={128} h={38} label={t('homm.ui.common.cancel')} onClick={onClose} />
    </Modal>
  );
}
