import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useGameNavigate } from '../useGameNavigate';
import { api, ApiError } from '../api';
import type { GameDetail } from '../types';
import { Btn, Loading, Panel, Txt } from '../ui/Layout';
import { toast } from '../ui/Toast';
import { socket } from '../ws';
import { FACTION_COLOR, HeroPortrait, ResIcon, factionLabel } from '../ui/homm';
import { useLanguage } from '@/i18n/LanguageContext';
import { errText, nm, serverText } from '../text';
import { NativeMessage } from './HeroWindows';

const RES = ['wood', 'ore', 'mercury', 'sulfur', 'crystal', 'gems', 'gold'] as const;

export function Social() {
  const { t } = useLanguage();
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useGameNavigate();
  const [search] = useSearchParams();
  const [game, setGame] = useState<GameDetail | null>(null);
  const [messages, setMessages] = useState<{ id: string; from: string; to: string; body: string; mine: boolean }[]>([]);
  const [trades, setTrades] = useState<{ id: string; from: string; to: string; give: string; giveAmount: number; want: string; wantAmount: number; status: string; incoming: boolean }[]>([]);
  const [draft, setDraft] = useState('');
  const [toPlayer, setToPlayer] = useState(search.get('to') ?? '');
  const [give, setGive] = useState('wood');
  const [giveAmt, setGiveAmt] = useState(5);
  const [want, setWant] = useState('ore');
  const [wantAmt, setWantAmt] = useState(5);
  const [agreementConfirm, setAgreementConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!gameId) return;
    try {
      const [g, m, tr] = await Promise.all([api.getGame(gameId), api.getMessages(gameId), api.getTrades(gameId)]);
      setGame(g);
      if (g.state === 'Finished') navigate(`/game/${gameId}/over`);
      setMessages(m);
      setTrades(tr);
      if (!toPlayer && g.players.length) {
        // default to another human player, not a computer seat
        const others = g.players.filter((p) => !p.isMe);
        const pick = others.find((p) => !p.isAi) ?? others[0];
        if (pick) setToPlayer(pick.playerId);
      }
    } catch (e) {
      if (e instanceof ApiError) toast(serverText(t, e.message));
    }
  }, [gameId, toPlayer, navigate, t]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!gameId) return;
    socket.connect(gameId);
    return socket.on((e) => { if (e.type === 'message' || e.type === 'trade' || e.type === 'agreement') load(); });
  }, [gameId, load]);

  if (!game) return <Loading />;

  const others = game.players.filter((p) => !p.isMe);
  const myself = game.players.find(p => p.isMe);
  const agreed = !!myself && game.endAgreement.includes(myself.playerId);

  async function send() {
    if (!draft.trim() || !toPlayer) return;
    try {
      await api.sendMessage(gameId!, toPlayer, draft.trim());
      setDraft('');
      await load();
    } catch (e) { toast(errText(t, e, 'homm.ui.common.somethingWrong')); }
  }

  async function offer() {
    if (!toPlayer) return;
    try {
      await api.offerTrade(gameId!, toPlayer, give, giveAmt, want, wantAmt);
      toast(t('homm.ui.social.tradeOffered'));
      await load();
    } catch (e) { toast(errText(t, e, 'homm.ui.common.somethingWrong')); }
  }

  async function respond(id: string, accept: boolean) {
    try {
      await api.respondTrade(id, accept);
      toast(accept ? t('homm.ui.social.tradeAccepted') : t('homm.ui.social.tradeDeclined'));
      await load();
    } catch (e) { toast(errText(t, e, 'homm.ui.common.somethingWrong')); }
  }

  return (
    <>
      <Panel x={0} y={0} w={800} h={40} style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
        <Txt x={16} y={12} size={15} bold className="heading">{t('homm.ui.social.title')}</Txt>
        <Btn x={440} y={6} w={245} h={28} label={agreed ? t('homm.ui.social.withdrawAgreement') : t('homm.ui.social.agreeEnd')} size={11}
          disabled={game.state !== 'InProgress'} onClick={() => setAgreementConfirm(true)} />
        <Btn x={700} y={6} w={90} h={28} label={t('homm.ui.common.back')} size={11} onClick={() => navigate(`/game/${gameId}`)} />
      </Panel>
      {agreementConfirm && <NativeMessage text={agreed ? t('homm.ui.social.withdrawConfirm') :
        t('homm.ui.social.endConfirm').replace('{n}', String(game.endAgreement.length)).replace('{total}', String(game.players.filter(p => !p.isAi).length))}
        onClose={() => setAgreementConfirm(false)} onConfirm={() => {
          setAgreementConfirm(false);
          api.endAgreement(gameId!, !agreed).then(result => result.state === 'Finished'
            ? navigate(`/game/${gameId}/over`) : load()).catch(e => setError(errText(t, e, 'homm.ui.social.agreementFailed')));
        }} />}
      {error && <NativeMessage text={error} onClose={() => setError(null)} />}

      {/* messages */}
      <Panel x={16} y={52} w={380} h={250}>
        <Txt x={12} y={8} size={12} bold className="heading">{t('homm.ui.social.messages')}</Txt>
        <div className="scroll" style={{ position: 'absolute', left: 8, top: 30, width: 364, height: 150 }}>
          {messages.length === 0 && (
            <Txt x={4} y={4} w={356} size={10} color="var(--text-mute)">{t('homm.ui.obelisk.noMessages')}</Txt>
          )}
          {messages.map((m) => (
            <div key={m.id} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: m.mine ? 'var(--accent)' : 'var(--ok)' }}>
                {serverText(t, m.from)} → {serverText(t, m.to)}
              </div>
              <div style={{ fontSize: 11, lineHeight: 1.4 }}>{m.body}</div>
            </div>
          ))}
        </div>
        <select className="inp" aria-label={t('homm.ui.social.recipient')} style={{ left: 8, top: 188, width: 110, height: 26 }}
          value={toPlayer} onChange={(e) => setToPlayer(e.target.value)}>
          {others.map((p) => <option key={p.playerId} value={p.playerId}>{serverText(t, p.name)}</option>)}
        </select>
        <input className="inp" style={{ left: 124, top: 188, width: 180, height: 26 }}
          placeholder={t('homm.ui.social.messagePlaceholder')} value={draft} maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
        <Btn x={310} y={188} w={62} h={26} label={t('homm.ui.social.send')} size={10} onClick={send} />
      </Panel>

      {/* trades */}
      <Panel x={404} y={52} w={380} h={250}>
        <Txt x={12} y={8} size={12} bold className="heading">{t('homm.ui.social.trades')}</Txt>
        <div className="scroll" style={{ position: 'absolute', left: 8, top: 30, width: 364, height: 120 }}>
          {trades.length === 0 && (
            <Txt x={4} y={4} w={356} size={10} color="var(--text-mute)">{t('homm.ui.social.noTrades')}</Txt>
          )}
          {trades.map((tr) => (
            <div key={tr.id} style={{ marginBottom: 6, fontSize: 10 }}>
              <span style={{ color: 'var(--accent)' }}>{serverText(t, tr.from)}</span>{' '}
              {t('homm.ui.social.tradeLine').replace('{give}', String(tr.giveAmount) + ' ' + nm(t, 'res', tr.give))
                .replace('{want}', String(tr.wantAmount) + ' ' + nm(t, 'res', tr.want))}
              <span className="mute"> · {nm(t, 'ui.social.status', tr.status)}</span>
              {tr.incoming && tr.status === 'pending' && (
                <>
                  <span className="link" style={{ marginLeft: 6 }} onClick={() => respond(tr.id, true)}>{t('homm.ui.social.accept')}</span>
                  <span className="link" style={{ marginLeft: 6 }} onClick={() => respond(tr.id, false)}>{t('homm.ui.social.decline')}</span>
                </>
              )}
            </div>
          ))}
        </div>
        <select className="inp" aria-label={t('homm.ui.social.giveRes')} style={{ left: 8, top: 156, width: 70, height: 24 }}
          value={give} onChange={(e) => setGive(e.target.value)}>
          {RES.map((r) => <option key={r} value={r}>{nm(t, 'res', r)}</option>)}
        </select>
        <input className="inp" type="number" aria-label={t('homm.ui.social.giveAmount')} style={{ left: 82, top: 156, width: 44, height: 24 }}
          value={giveAmt} min={1} onChange={(e) => setGiveAmt(Number(e.target.value))} />
        <Txt x={130} y={160} size={10} color="var(--text-dim)">{t('homm.ui.social.for')}</Txt>
        <select className="inp" aria-label={t('homm.ui.social.wantRes')} style={{ left: 156, top: 156, width: 70, height: 24 }}
          value={want} onChange={(e) => setWant(e.target.value)}>
          {RES.map((r) => <option key={r} value={r}>{nm(t, 'res', r)}</option>)}
        </select>
        <input className="inp" type="number" aria-label={t('homm.ui.social.wantAmount')} style={{ left: 230, top: 156, width: 44, height: 24 }}
          value={wantAmt} min={1} onChange={(e) => setWantAmt(Number(e.target.value))} />
        <Btn x={282} y={156} w={90} h={24} label={t('homm.ui.social.offer')} size={10} onClick={offer} />
        <Txt x={8} y={190} w={364} size={9} color="var(--text-mute)">
          {t('homm.ui.social.tradeHint')}
        </Txt>
      </Panel>

      {/* players */}
      <Panel x={16} y={314} w={768} h={270}>
        <Txt x={12} y={8} size={12} bold className="heading">{t('homm.ui.social.players')}</Txt>
        {game.players.map((p, i) => (
          <Panel key={p.playerId} x={12 + i * 250} y={32} w={236} h={220}>
            <div style={{ position: 'absolute', left: 0, top: 0, width: 236, height: 4, background: FACTION_COLOR[p.faction] ?? '#888' }} />
            <div className="well" style={{ position: 'absolute', left: 10, top: 12, width: 52, height: 52 }}>
              <div style={{ position: 'absolute', left: 2, top: 2 }}><HeroPortrait faction={p.faction} size={48} /></div>
            </div>
            <Txt x={72} y={12} w={156} size={13} bold>{serverText(t, p.name)}</Txt>
            <Txt x={72} y={30} w={156} size={10} color={FACTION_COLOR[p.faction] ? 'var(--text)' : 'var(--text-dim)'}>{factionLabel(t, p.faction)}</Txt>
            <Txt x={72} y={46} w={156} size={10} color="var(--text-dim)">{serverText(t, p.cityName)}</Txt>
            <Txt x={12} y={74} size={10} color="var(--text-dim)">
              {t('homm.ui.social.obelisksRead').replace('{n}', String(p.obeliskVisits))}
            </Txt>
            {p.precious && <Txt x={12} y={92} size={10} color="var(--accent)">{t('homm.ui.social.holdsGrail')}</Txt>}
            {RES.map((r, j) => (
              <div key={r} title={nm(t, 'res', r)} style={{ position: 'absolute', left: 12 + (j % 2) * 110, top: 116 + Math.floor(j / 2) * 24,
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 'bold' }}>
                <ResIcon r={r} size={18} />{p.resources[r]}
              </div>
            ))}
          </Panel>
        ))}
      </Panel>
    </>
  );
}