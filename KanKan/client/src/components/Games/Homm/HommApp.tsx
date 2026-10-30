import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Toast } from './ui/Toast';
import { Loading } from './ui/Layout';
import { socket } from './ws';
import { stageView } from './stageView';
import './homm.css';

const Lobby = lazy(() => import('./views/Lobby').then(m => ({ default: m.Lobby })));
const AdventureMap = lazy(() => import('./views/AdventureMap').then(m => ({ default: m.AdventureMap })));
const TownScreen = lazy(() => import('./views/TownScreen').then(m => ({ default: m.TownScreen })));
const HeroScreen = lazy(() => import('./views/HeroScreen').then(m => ({ default: m.HeroScreen })));
const Social = lazy(() => import('./views/Social').then(m => ({ default: m.Social })));
const Projects = lazy(() => import('./views/Projects').then(m => ({ default: m.Projects })));
const Obelisk = lazy(() => import('./views/Obelisk').then(m => ({ default: m.Obelisk })));
const GameOver = lazy(() => import('./views/GameOver').then(m => ({ default: m.GameOver })));

const STAGE_W = 1920;
const STAGE_H = 1080;

const isHomeScreenApp = () =>
  window.matchMedia('(pointer: coarse)').matches &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);

/**
 * The fixed 1920×1080 logical stage. In the browser it is scaled to fit the Games tab panel width and
 * the viewport height left below it. Launched from a phone's home screen it covers the whole screen
 * and, held upright, is turned sideways so the landscape stage uses the full portrait display.
 */
function useStageFit(allowFull: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ full: false, rotated: false, scale: 1, x: 0, y: 0, strip: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      if (allowFull && isHomeScreenApp()) {
        const vw = el.clientWidth, vh = el.clientHeight;
        const rotated = vh > vw;
        const w = rotated ? vh : vw, h = rotated ? vw : vh;
        const scale = Math.min(w / STAGE_W, h / STAGE_H);
        const sw = STAGE_W * scale, sh = STAGE_H * scale;
        stageView.rotated = rotated;
        setFit({
          full: true, rotated, scale, strip: (w - sw) / 2,
          x: rotated ? (vw - sh) / 2 + sh : (vw - sw) / 2,
          y: rotated ? (vh - sw) / 2 : (vh - sh) / 2
        });
        return;
      }
      stageView.rotated = false;
      const rect = el.getBoundingClientRect();
      const availH = window.innerHeight - Math.max(0, rect.top) - 16;
      const scale = Math.max(0.2, Math.min(rect.width / STAGE_W, availH / STAGE_H));
      setFit({ full: false, rotated: false, scale, x: Math.max(0, (rect.width - STAGE_W * scale) / 2), y: 0, strip: 0 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      stageView.rotated = false;
    };
  }, [allowFull]);
  return { ref, ...fit };
}

function Screen({ children }: { children: ReactNode }) {
  return <div className="screen800">{children}</div>;
}

/** City of Towers (HoMM-style), embedded in the KanKan Games page under /games/homm/*. */
export default function HommApp() {
  // Fullscreen is opt-in via the ⛶ button; ✕ leaves it but stays on the Heroes tab.
  const [allowFull, setAllowFull] = useState(false);
  const { ref, full, rotated, scale, x, y, strip } = useStageFit(allowFull);
  // The exit button sits centred in the black strip left of the stage, shrinking to fit it.
  const exitSize = Math.max(18, Math.min(32, strip - 4));
  const exitPos = (strip - exitSize) / 2;
  const exitStyle = rotated
    ? { width: exitSize, height: exitSize, top: exitPos, left: 'auto', right: 6 }
    : { width: exitSize, height: exitSize, left: exitPos, top: 6 };

  // Leaving the game area drops the realtime connection.
  useEffect(() => () => socket.close(), []);

  return (
    <div className={'homm-root' + (full ? ' homm-full' : '')} ref={ref} style={full ? undefined : { height: STAGE_H * scale }}>
      {full && <button type="button" className="homm-exit" style={exitStyle} aria-label="Exit fullscreen" onClick={() => setAllowFull(false)}>✕</button>}
      {!full && isHomeScreenApp() && <button type="button" className="homm-exit" aria-label="Fullscreen" onClick={() => setAllowFull(true)}>⛶</button>}
      <div className="stage" style={{ transform: `translate(${x}px, ${y}px)${rotated ? ' rotate(90deg)' : ''} scale(${scale})` }}>
        <Suspense fallback={<Screen><Loading /></Screen>}>
          <Routes>
            <Route index element={<Screen><Lobby /></Screen>} />
            <Route path="game/:gameId" element={<AdventureMap />} />
            <Route path="game/:gameId/town/:townId" element={<Screen><TownScreen /></Screen>} />
            <Route path="game/:gameId/hero/:heroId" element={<Screen><HeroScreen /></Screen>} />
            <Route path="game/:gameId/social" element={<Screen><Social /></Screen>} />
            <Route path="game/:gameId/projects" element={<Screen><Projects /></Screen>} />
            <Route path="game/:gameId/obelisk" element={<Screen><Obelisk /></Screen>} />
            <Route path="game/:gameId/over" element={<Screen><GameOver /></Screen>} />
            <Route path="*" element={<Navigate to="/games/homm" replace />} />
          </Routes>
        </Suspense>
        <Toast />
      </div>
    </div>
  );
}
