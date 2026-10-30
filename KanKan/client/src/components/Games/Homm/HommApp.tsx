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
// Column at the screen's left (in the user's view) holding the exit button; the game sits right after it and spare width is on the right.
const EXIT_COL = 40;

const isHomeScreenApp = () =>
  window.matchMedia('(pointer: coarse)').matches &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);

/**
 * The fixed 1920×1080 logical stage. In the browser it is scaled to fit the Games tab panel width and
 * the viewport height left below it. Launched from a phone's home screen it covers the whole screen
 * and, held upright, is turned sideways so the landscape stage uses the full portrait display.
 */
function useStageFit(allowFull: boolean, turned: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ full: false, rotated: false, scale: 1, x: 0, y: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      if (allowFull && isHomeScreenApp()) {
        const vw = el.clientWidth, vh = el.clientHeight;
        const rotated = vh > vw;
        const w = rotated ? vh : vw, h = rotated ? vw : vh;
        const scale = Math.min((w - EXIT_COL) / STAGE_W, h / STAGE_H);
        stageView.rotated = rotated;
        setFit({ full: true, rotated, scale, x: 0, y: 0, h: 0 });
        return;
      }
      const rect = el.getBoundingClientRect();
      // In the browser the menu stays upright; the game fills the panel below it, turned sideways, and the user tilts the phone.
      if (turned && window.innerHeight > window.innerWidth) {
        const h = Math.max(300, window.innerHeight - Math.max(0, rect.top) - 8);
        const scale = Math.max(0.2, Math.min((h - EXIT_COL) / STAGE_W, rect.width / STAGE_H));
        stageView.rotated = true;
        setFit({ full: false, rotated: true, scale, x: 0, y: 0, h });
        return;
      }
      stageView.rotated = false;
      const availH = window.innerHeight - Math.max(0, rect.top) - 16;
      const scale = Math.max(0.2, Math.min(rect.width / STAGE_W, availH / STAGE_H));
      setFit({ full: false, rotated: false, scale, x: Math.max(0, (rect.width - STAGE_W * scale) / 2), y: 0, h: 0 });
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
  }, [allowFull, turned]);
  return { ref, ...fit };
}

function Screen({ children }: { children: ReactNode }) {
  return <div className="screen800">{children}</div>;
}

/** City of Towers (HoMM-style), embedded in the KanKan Games page under /games/homm/*. */
export default function HommApp() {
  // Fullscreen is opt-in via the ⛶ button; ✕ leaves it but stays on the Heroes tab.
  const [allowFull, setAllowFull] = useState(false);
  const [turned, setTurned] = useState(false);
  const { ref, full, rotated, scale, x, y, h } = useStageFit(allowFull, turned);
  const canTurn = !isHomeScreenApp() && window.matchMedia('(pointer: coarse)').matches;
  // The exit button is centred in the left column.
  const exitSize = 32;
  const exitEdge = (EXIT_COL - exitSize) / 2;
  const exitStyle = rotated
    ? { width: exitSize, height: exitSize, top: exitEdge, left: 'auto', right: 8 }
    : { width: exitSize, height: exitSize, left: exitEdge, top: 8 };

  // Leaving the game area drops the realtime connection.
  useEffect(() => () => socket.close(), []);

  return (
    <div className={'homm-root' + (full ? ' homm-full' : '')} ref={ref}     style={full ? undefined : { height: rotated ? h : STAGE_H * scale }}>
          {(full || rotated) && <button type="button" className="homm-exit" style={exitStyle} aria-label="Exit fullscreen" onClick={() => { setAllowFull(false); setTurned(false); }}>✕</button>}
          {!full && !rotated && isHomeScreenApp() && <button type="button" className="homm-exit" aria-label="Fullscreen" onClick={() => setAllowFull(true)}>⛶</button>}
          {!full && !rotated && canTurn && <button type="button" className="homm-exit" aria-label="Landscape layout" onClick={() => setTurned(true)}>⟳</button>}
          <div className="stage" style={rotated
            // Turned sideways: starts after the exit column at the panel's top (the user's left).
            ? { left: '50%', top: 0, transformOrigin: 'center', transform: `translate(-${STAGE_W / 2}px, ${EXIT_COL + (STAGE_W * scale) / 2 - STAGE_H / 2}px) rotate(90deg) scale(${scale})` }
            : full
              ? { left: EXIT_COL, top: '50%', transformOrigin: 'left center', transform: `translateY(-50%) scale(${scale})` }
              : { transform: `translate(${x}px, ${y}px) scale(${scale})` }}>
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
