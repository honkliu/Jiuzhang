import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useGameNavigate } from '../useGameNavigate';
import { api, ApiError } from '../api';
import type { ProjectDto } from '../api';
import { Btn, Loading, Panel, Txt } from '../ui/Layout';
import { toast } from '../ui/Toast';
import { socket } from '../ws';
import { ResIcon } from '../ui/homm';
import { useLanguage } from '@/i18n/LanguageContext';
import { errText, nm, serverText } from '../text';

export function Projects() {
  const { t } = useLanguage();
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useGameNavigate();
  const [projects, setProjects] = useState<ProjectDto[] | null>(null);
  const [gold, setGold] = useState(100);
  const [wood, setWood] = useState(5);
  const [ore, setOre] = useState(5);

  const load = useCallback(async () => {
    if (!gameId) return;
    try { setProjects(await api.getProjects(gameId)); }
    catch (e) { if (e instanceof ApiError) toast(serverText(t, e.message)); }
  }, [gameId, t]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!gameId) return;
    socket.connect(gameId);
    return socket.on((e) => { if (e.type === 'project') load(); });
  }, [gameId, load]);

  if (!projects) return <Loading />;

  async function contribute(id: string) {
    try {
      await api.contribute(id, gold, wood, ore);
      toast(t('homm.ui.projects.contributed'));
      await load();
    } catch (e) { toast(errText(t, e, 'homm.ui.common.somethingWrong')); }
  }

  return (
    <>
      <Panel x={0} y={0} w={800} h={40} style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
        <Txt x={16} y={12} size={15} bold className="heading">{t('homm.ui.projects.title')}</Txt>
        <Btn x={700} y={6} w={90} h={28} label={t('homm.ui.common.back')} size={11} onClick={() => navigate(`/game/${gameId}`)} />
      </Panel>

      <Txt x={16} y={52} w={768} size={11} color="var(--text-dim)">
        {t('homm.ui.projects.hint')}
      </Txt>

      {projects.length === 0 && (
        <Txt x={0} y={200} w={800} size={12} align="center" color="var(--text-mute)">
          {t('homm.ui.projects.none')}
        </Txt>
      )}

      {projects.map((p, i) => {
        const pct = Math.min(100, Math.round(
          ((p.contributedGold / Math.max(1, p.requiredGold)) +
           (p.contributedWood / Math.max(1, p.requiredWood)) +
           (p.contributedOre / Math.max(1, p.requiredOre))) / 3 * 100));
        return (
          <Panel key={p.id} x={16} y={80 + i * 150} w={768} h={140}>
            <Txt x={14} y={10} size={14} bold>{serverText(t, p.name)}</Txt>
            <Txt x={14} y={32} w={740} size={10} color="var(--text-dim)">{serverText(t, p.description)}</Txt>
            <div style={{ position: 'absolute', left: 14, top: 50, display: 'flex', gap: 22, fontSize: 11, fontWeight: 'bold' }}>
              {([['gold', p.contributedGold, p.requiredGold], ['wood', p.contributedWood, p.requiredWood], ['ore', p.contributedOre, p.requiredOre]] as [string, number, number][])
                .map(([r, have, need]) => (
                  <div key={r} title={nm(t, 'res', r)} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <ResIcon r={r} size={18} /><span>{have}<span className="muted"> / {need}</span></span>
                  </div>
                ))}
            </div>
            <div style={{ position: 'absolute', left: 14, top: 76, width: 500, height: 8, background: '#0e0a06', border: '1px solid var(--gold-0)' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: p.completed ? 'var(--ok)' : 'var(--accent)' }} />
            </div>
            <Txt x={524} y={72} size={10} color={p.completed ? 'var(--ok)' : 'var(--text-dim)'}>
              {p.completed ? t('homm.ui.projects.complete') : pct + '%'}
            </Txt>
            {!p.completed && (
              <>
                <div style={{ position: 'absolute', left: 14, top: 103 }}><ResIcon r="gold" size={18} /></div>
                <input className="inp" type="number" aria-label={t('homm.res.gold')} title={t('homm.res.gold')} style={{ left: 36, top: 100, width: 70, height: 24 }}
                  value={gold} min={0} onChange={(e) => setGold(Number(e.target.value))} />
                <div style={{ position: 'absolute', left: 116, top: 103 }}><ResIcon r="wood" size={18} /></div>
                <input className="inp" type="number" aria-label={t('homm.res.wood')} title={t('homm.res.wood')} style={{ left: 138, top: 100, width: 56, height: 24 }}
                  value={wood} min={0} onChange={(e) => setWood(Number(e.target.value))} />
                <div style={{ position: 'absolute', left: 204, top: 103 }}><ResIcon r="ore" size={18} /></div>
                <input className="inp" type="number" aria-label={t('homm.res.ore')} title={t('homm.res.ore')} style={{ left: 226, top: 100, width: 56, height: 24 }}
                  value={ore} min={0} onChange={(e) => setOre(Number(e.target.value))} />
                <Btn x={294} y={100} w={110} h={24} label={t('homm.ui.projects.contribute')} size={10} onClick={() => contribute(p.id)} />
              </>
            )}
          </Panel>
        );
      })}
    </>
  );
}