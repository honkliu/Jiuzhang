import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Toast } from './ui/Toast';
import { Loading } from './ui/Layout';
import { socket } from './ws';
import './homm.css';

const Lobby = lazy(() => import('./views/Lobby').then(m => ({ default: m.Lobby })));
const AdventureMap = lazy(() => import('./views/AdventureMap').then(m => ({ default: m.AdventureMap })));
const TownScreen = lazy(() => import('./views/TownScreen').then(m => ({ default: m.TownScreen })));
const HeroScreen = lazy(() => import('./views/HeroScreen').then(m => ({ default: m.HeroScreen })));
const Social = lazy(() => import('./views/Social').then(m => ({ default: m.Social })));
const Projects = lazy(() => import('./views/Projects').then(m => ({ default: m.Projects })));
const Obelisk = lazy(() => import('./views/Obelisk').then(m => ({ default: m.Obelisk })));
const GameOver = lazy(() => import('./views/GameOver').then(m => ({ default: m.GameOver })));

const STAGE_W = 800;
const STAGE_H = 600;

/**
 * The fixed 800×600 logical stage, scaled to the width of the Games tab panel and
 * to the viewport height left below it, so the whole board stays visible.
 */
function useStageFit() {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, offset: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const availH = window.innerHeight - Math.max(0, rect.top) - 16;
      const scale = Math.max(0.4, Math.min(rect.width / STAGE_W, availH / STAGE_H));
      setFit({ scale, offset: Math.max(0, (rect.width - STAGE_W * scale) / 2) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  return { ref, ...fit };
}

/** City of Towers (HoMM-style), embedded in the KanKan Games page under /games/homm/*. */
export default function HommApp() {
  const { ref, scale, offset } = useStageFit();

  // Leaving the game area drops the realtime connection.
  useEffect(() => () => socket.close(), []);

  return (
    <div className="homm-root" ref={ref} style={{ height: STAGE_H * scale }}>
      <div className="stage" style={{ transform: `translateX(${offset}px) scale(${scale})` }}>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route index element={<Lobby />} />
            <Route path="game/:gameId" element={<AdventureMap />} />
            <Route path="game/:gameId/town/:townId" element={<TownScreen />} />
            <Route path="game/:gameId/hero/:heroId" element={<HeroScreen />} />
            <Route path="game/:gameId/social" element={<Social />} />
            <Route path="game/:gameId/projects" element={<Projects />} />
            <Route path="game/:gameId/obelisk" element={<Obelisk />} />
            <Route path="game/:gameId/over" element={<GameOver />} />
            <Route path="*" element={<Navigate to="/games/homm" replace />} />
          </Routes>
        </Suspense>
        <Toast />
      </div>
    </div>
  );
}
