import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  Chip,
  Container,
  Grid,
  Paper,
  Stack,
  type SxProps,
  Tab,
  Tabs,
  type Theme,
  Typography,
} from '@mui/material';
import {
  Casino as CasinoIcon,
  Pause as PauseIcon,
  PlayArrow as PlayIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { AppHeader } from '@/components/Shared/AppHeader';

const BoxAny = Box as any;

const ancientPaperBackground = 'linear-gradient(180deg, rgba(140,100,60,0.05) 0%, rgba(140,100,60,0.1) 100%)';

type Cell = string | null;
type TetrominoName = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';
type Tetromino = { name: TetrominoName; matrix: number[][]; color: string; dust: string };
type ActivePiece = Tetromino & { x: number; y: number };
type Particle = { id: number; row: number; col: number; ox: number; oy: number; dx: number; dy: number; fall: number; rot: number; delay: number; size: number; color: string; duration: number; kind: 'chunk' | 'sand'; points: number };

type SudokuDifficulty = 'easy' | 'advanced' | 'expert';

type SudokuPuzzle = {
  id: string;
  puzzle: string;
};

type SudokuCheckResult = {
  severity: 'success' | 'warning' | 'error';
  message: string;
};

type SavedSudokuState = {
  version: 1;
  difficulty: SudokuDifficulty;
  puzzleIndex: number;
  puzzleId: string;
  grid: number[];
  notes: number[][];
  selected: number | null;
  hintMode: boolean;
  pencilMode: boolean;
  checkResult: SudokuCheckResult | null;
  updatedAt: string;
};

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const DROP_MS = 650;
const CRUSH_WAVE_MS = 58;
const GAMES_TAB_STORAGE_KEY = 'kankan.games.activeTab';
const SUDOKU_STATE_STORAGE_KEY = 'kankan.games.sudokuState.v1';

const TETROMINOES: Tetromino[] = [
  { name: 'I', matrix: [[1, 1, 1, 1]], color: '#d9a86c', dust: '#e7c28e' },
  { name: 'J', matrix: [[1, 0, 0], [1, 1, 1]], color: '#b87b4f', dust: '#d99a68' },
  { name: 'L', matrix: [[0, 0, 1], [1, 1, 1]], color: '#c28a58', dust: '#e3ae76' },
  { name: 'O', matrix: [[1, 1], [1, 1]], color: '#dbb66f', dust: '#f0cf8a' },
  { name: 'S', matrix: [[0, 1, 1], [1, 1, 0]], color: '#9b6545', dust: '#c88c62' },
  { name: 'T', matrix: [[0, 1, 0], [1, 1, 1]], color: '#a96f4a', dust: '#d49a70' },
  { name: 'Z', matrix: [[1, 1, 0], [0, 1, 1]], color: '#8f5a3f', dust: '#bd7f5c' },
];

const emptyBoard = (): Cell[][] => Array.from({ length: BOARD_HEIGHT }, () => Array<Cell>(BOARD_WIDTH).fill(null));

const rotateMatrix = (matrix: number[][]) => matrix[0].map((_, index) => matrix.map((row) => row[index]).reverse());

const randomPiece = (): ActivePiece => {
  const piece = TETROMINOES[Math.floor(Math.random() * TETROMINOES.length)];
  return { ...piece, matrix: piece.matrix.map((row) => [...row]), x: Math.floor(BOARD_WIDTH / 2) - 2, y: 0 };
};

const collides = (board: Cell[][], piece: ActivePiece, nextX = piece.x, nextY = piece.y, matrix = piece.matrix) => {
  for (let row = 0; row < matrix.length; row += 1) {
    for (let col = 0; col < matrix[row].length; col += 1) {
      if (!matrix[row][col]) continue;
      const x = nextX + col;
      const y = nextY + row;
      if (x < 0 || x >= BOARD_WIDTH || y >= BOARD_HEIGHT) return true;
      if (y >= 0 && board[y][x]) return true;
    }
  }
  return false;
};

const mergePiece = (board: Cell[][], piece: ActivePiece) => {
  const next = board.map((row) => [...row]);
  piece.matrix.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      if (value) {
        const y = piece.y + rowIndex;
        const x = piece.x + colIndex;
        if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH) next[y][x] = piece.color;
      }
    });
  });
  return next;
};

const DIRT_SHARD_COLORS = ['#2f1a12', '#5f3927', '#8b5b3d', '#b78355', '#d0a06b', '#6f4630'];

const makeParticles = (rows: number[], leftToRight = false) => {
  const topRow = Math.min(...rows);
  const rowSpan = Math.max(1, Math.max(...rows) - topRow + 1);
  return rows.flatMap((row) => (
    Array.from({ length: BOARD_WIDTH }, (_, col) => (
    Array.from({ length: 1140 }, (_, shard) => {
      const sand = shard >= 1;
      const visualRow = topRow + Math.random() * rowSpan;
      const fall = sand ? 1.08 + Math.random() * 0.82 : 260 + Math.random() * 260;
      const startOffsetX = 2 + Math.random() * 96;
      return {
        id: Date.now() + row * 10000 + col * 100 + shard,
        row: visualRow,
        col,
        ox: startOffsetX,
        oy: Math.random() * 100,
        dx: (Math.random() - 0.5) * (sand ? 10 : 24),
        dy: Math.random() * (sand ? 34 : 10),
        fall,
        rot: (Math.random() - 0.5) * (sand ? 90 : 640),
        delay: (leftToRight ? col * CRUSH_WAVE_MS : 0) + Math.random() * (sand ? 70 : 72),
        size: sand ? 1.74 + Math.random() * 3.75 : 1.8 + Math.random() * 2.4,
        color: DIRT_SHARD_COLORS[Math.floor(Math.random() * DIRT_SHARD_COLORS.length)],
        duration: sand ? 960 + Math.random() * 420 : 520 + Math.random() * 260,
        kind: sand ? 'sand' as const : 'chunk' as const,
        points: 4 + Math.floor(Math.random() * 4),
      };
    })
    )).flat()
  ));
};

const createSudokuPuzzle = (puzzle: string, index: number): SudokuPuzzle => {
  const givens = (puzzle.match(/[1-9]/g) || []).length;
  if (!/^[0-9]{81}$/.test(puzzle) || givens < 17) {
    throw new Error(`Invalid sudoku puzzle ${index}: expected 81 digits and at least 17 givens`);
  }

  return {
    id: `sudoku-${index}`,
    puzzle,
  };
};

const RAW_SUDOKU: Record<SudokuDifficulty, string[]> = {
  // Raw entries from Peter Norvig's public easy50 Sudoku set.
  easy: [
    '003020600900305001001806400008102900700000008006708200002609500800203009005010300',
    '200080300060070084030500209000105408000000000402706000301007040720040060004010003',
    '000000907000420180000705026100904000050000040000507009920108000034059000507000000',
    '030050040008010500460000012070502080000603000040109030250000098001020600080060020',
    '020810740700003100090002805009040087400208003160030200302700060005600008076051090',
    '100920000524010000000000070050008102000000000402700090060000000000030945000071006',
    '043080250600000000000001094900004070000608000010200003820500000000000005034090710',
    '480006902002008001900370060840010200003704100001060049020085007700900600609200018',
    '000900002050123400030000160908000000070000090000000205091000050007439020400007000',
    '001900003900700160030005007050000009004302600200000070600100030042007006500006800',
    '000125400008400000420800000030000095060902010510000060000003049000007200001298000',
    '062340750100005600570000040000094800400000006005830000030000091006400007059083260',
    '300000000005009000200504000020000700160000058704310600000890100000067080000005437',
    '630000000000500008005674000000020000003401020000000345000007004080300902947100080',
    '000020040008035000000070602031046970200000000000501203049000730000000010800004000',
    '361025900080960010400000057008000471000603000259000800740000005020018060005470329',
    '050807020600010090702540006070020301504000908103080070900076205060090003080103040',
    '080005000000003457000070809060400903007010500408007020901020000842300000000100080',
    '003502900000040000106000305900251008070408030800763001308000104000020000005104800',
    '000000000009805100051907420290401065000000000140508093026709580005103600000000000',
    '020030090000907000900208005004806500607000208003102900800605007000309000030020050',
    '005000006070009020000500107804150000000803000000092805907006000030400010200000600',
    '040000050001943600009000300600050002103000506800020007005000200002436700030000040',
    '004000000000030002390700080400009001209801307600200008010008053900040000000000800',
    '360020089000361000000000000803000602400603007607000108000000000000418000970030014',
    '500400060009000800640020000000001008208000501700500000000090084003000600060003002',
    '007256400400000005010030060000508000008060200000107000030070090200000004006312700',
    '000000000079050180800000007007306800450708096003502700700000005016030420000000000',
    '030000080009000500007509200700105008020090030900402001004207100002000800070000090',
    '200170603050000100000006079000040700000801000009050000310400000005000060906037002',
  ],
  // Raw entries from Peter Norvig's public top95 hard Sudoku set, later slice.
  advanced: [
    '380600000009000000020030510000005000030010060000400000017050080000000900000007032',
    '000500000000000506970000020004802000250100030080030000000004070013050090020003100',
    '020000000305062009068000300050000000000640802004700900003000001000006000170430000',
    '080040000300000010000000020005000406900100800200000000000309000060000500000200000',
    '008090100060500020000006000030107050000000009004000300050000200070003080200700004',
    '400000508030000000000700000020000060000050800000010000000603070500200000108000000',
    '100000308060400000000000000203010000000000095800000000050600070000080200040000000',
    '100006080064000000000040007000090600070400500500070100050000320300008000400000000',
    '249060003030000200800000005000006000000200000010040820090500700004000001070003000',
    '000800009087300040600700000008500970000000000043007500000003000030001450400002001',
    '000501000090000800060000000401000000000070090000000030800000105000200400000360000',
    '000000801600200000000705000000600020010000300080000000200000070030080000500040000',
    '047600050803000002000009000000805006000100000602400000078000510006000040090004007',
    '000007095000001000860020000020073008500000060003004900305000417240000000000000000',
    '040500000800090030076020000014600000000009007000003600001004050060000003007100200',
    '083400000000070050000000000040108000000000027000300000206050000500000800000000100',
    '009000003000009000700000506006500400000300000028000000300750600600000000000120308',
    '026039000000600001900000700000004009050000200008500000300200900400007620000000004',
    '203080000800700000000000100060507000400000030000100000000000082050000600010000000',
    '600302000010000050000000000702600000000000084300000000080150000000080200000000700',
    '100000900064001070070040000000300000308900500007000020000060709000004010000129030',
    '000000000900000084062300050000600045300010006000900070000100000405002000030800009',
    '020000593800500460940060008002030000060080730700200000000040380070000600000000005',
    '904005000250600100310000008070009000400260000001470000700000002000300806040000090',
    '000520000090003004000000700010000040080045300600010008702000000008000032040080010',
    '530020900024030050009000000000010827000700000000098100000000000006400009102050430',
    '100007860007008010800200009000000002400010000009005000608000000000050900000009304',
    '000050001100000070060000080000004000009010300000596020080062007007000000305070200',
    '047020000800001000030000902000005000600810050000040000070000304000900010400270800',
    '000000940000090005300005070080400100463000000000007080800700000700000028050260000',
  ],
  // Raw entries from Peter Norvig's public hardest and top95 Sudoku sets.
  expert: [
    '850002400720000009004000000000107002305000900040000000000080070017000000000036040',
    '005300000800000020070010500400005300010070006003200080060500009004000030000009700',
    '120040000005069010009000500000000070700052090030000002090600050400900801003000904',
    '000570030100000020700023400000080004007004000490000605042000300000700900001800000',
    '700152300000000920000300000100004708000000060000000000009000506040907000800006010',
    '100007090030020008009600500005300900010080002600004000300000010040000007007000300',
    '100034080000800500004060021018000000300102006000000810520070900006009000090640002',
    '000920000006803000190070006230040100001000700008030029700080091000507200000064000',
    '060504030100090008000000000900050006040602070700040005000000000400080001050203040',
    '700000400020070080003008079900500300060020090001097006000300900030040060009001035',
    '000070020800000006010205000905400008000000000300008501000302080400000009070060000',
    '400000805030000000000700000020000060000080400000010000000603070500200000104000000',
    '520006000000000701300000000000400800600000050000000000041800000000030020008700000',
    '600000803040700000000000000000504070300200000106000000020000050000080600000010000',
    '480300000000000071020000000705000060000200800000000000001076000300000400000050000',
    '000014000030000200070000000000900030601000000000000080200000104000050600000708000',
    '000000520080400000030009000501000600200700000000300000600010000000000704000000030',
    '602050000000003040000000000430008000010000200000000700500270000000000081000600000',
    '052400000000070100000000000000802000300000600090500000106030000000000089700000000',
    '602050000000004030000000000430008000010000200000000700500270000000000081000600000',
    '092300000000080100000000000107040000000000065800000000060502000400000700000900000',
    '600302000050000010000000000702600000000000054300000000080150000000040200000000700',
    '060501090100090053900007000040800070000000508081705030000050200000000000076008000',
    '005000987040050001007000000200048000090100000600200000300600200000009070000000500',
    '306070000000000051800000000010405000700000600000200000020000040000080300000500000',
    '100000308070400000000000000203010000000000095800000000050600070000080200040000000',
    '600302000040000010000000000702600000000000054300000000080150000000040200000000700',
    '000030090000200001050900000000000000102080406080500020075000000401006003000004060',
    '450000030000801000090000000000050090200700000800000000010040000000000702000600800',
    '023700006800060590900000700000040970307096002000000000500470000000002000080000000',
  ],
};

const SUDOKU_BANK: Record<SudokuDifficulty, SudokuPuzzle[]> = {
  easy: RAW_SUDOKU.easy.map((item, index) => createSudokuPuzzle(item, index + 1)),
  advanced: RAW_SUDOKU.advanced.map((item, index) => createSudokuPuzzle(item, index + 1)),
  expert: RAW_SUDOKU.expert.map((item, index) => createSudokuPuzzle(item, index + 1)),
};

function getSudokuCandidates(grid: number[], index: number) {
  if (grid[index]) return [];
  const row = Math.floor(index / 9);
  const col = index % 9;
  const used = new Set<number>();
  for (let scanIndex = 0; scanIndex < 9; scanIndex += 1) {
    if (grid[row * 9 + scanIndex]) used.add(grid[row * 9 + scanIndex]);
    if (grid[scanIndex * 9 + col]) used.add(grid[scanIndex * 9 + col]);
  }
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let offsetY = 0; offsetY < 3; offsetY += 1) {
    for (let offsetX = 0; offsetX < 3; offsetX += 1) {
      const value = grid[(boxRow + offsetY) * 9 + boxCol + offsetX];
      if (value) used.add(value);
    }
  }
  return Array.from({ length: 9 }, (_, candidateIndex) => candidateIndex + 1).filter((candidate) => !used.has(candidate));
}

const TetrisGame: React.FC = () => {
  const [board, setBoard] = useState<Cell[][]>(() => emptyBoard());
  const [piece, setPiece] = useState<ActivePiece>(() => randomPiece());
  const [nextPiece, setNextPiece] = useState<ActivePiece>(() => randomPiece());
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(true);
  const [gameOver, setGameOver] = useState(false);
  const boardRef = useRef(board);
  const pieceRef = useRef(piece);
  const sandCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sandFrameRef = useRef<number | null>(null);

  useEffect(() => { boardRef.current = board; }, [board]);
  useEffect(() => { pieceRef.current = piece; }, [piece]);

  const clearSand = useCallback(() => {
    if (sandFrameRef.current != null) {
      window.cancelAnimationFrame(sandFrameRef.current);
      sandFrameRef.current = null;
    }
    const canvas = sandCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const playCrushSand = useCallback((rows: number[], leftToRight = false) => {
    const canvas = sandCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    if (sandFrameRef.current != null) window.cancelAnimationFrame(sandFrameRef.current);

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const grains = makeParticles(rows, leftToRight);
    const startedAt = performance.now();
    const cellW = rect.width / BOARD_WIDTH;
    const cellH = rect.height / BOARD_HEIGHT;
    const totalMs = grains.reduce((max, grain) => Math.max(max, grain.delay + grain.duration), 0) + 120;

    const draw = (now: number) => {
      const elapsed = now - startedAt;
      ctx.clearRect(0, 0, rect.width, rect.height);
      for (const grain of grains) {
        const local = elapsed - grain.delay;
        if (local <= 0 || local >= grain.duration) continue;
        const t = local / grain.duration;
        const x0 = (grain.col + grain.ox / 100) * cellW;
        const y0 = (grain.row + grain.oy / 100) * cellH;
        let x = x0;
        let y = y0;
        let rx = grain.size * (grain.kind === 'sand' ? 0.82 : 1.15);
        let ry = grain.size * (grain.kind === 'sand' ? 0.58 : 0.92);
        if (t < 0.1) {
          const crush = t / 0.1;
          x += grain.dx * 0.035 * crush;
          y += cellH * 0.22 * crush;
          rx = grain.size * (grain.kind === 'sand' ? 0.9 : 1.95);
          ry = Math.max(0.35, grain.size * (grain.kind === 'sand' ? 0.45 : 0.28));
        } else {
          const fallT = (t - 0.1) / 0.9;
          const motionT = fallT;
          const gravity = motionT * motionT * (4.2 + motionT * 2.1);
          if (grain.kind === 'sand') {
            const startY = y0 + cellH * 0.2;
            const bottomlessDistance = rect.height + cellH * 5 - startY;
            x = x0 + grain.dx * Math.min(1, motionT * 0.55);
            y = startY + bottomlessDistance * Math.min(1.55, gravity * grain.fall);
          } else {
            const crumble = fallT * 4;
            x += grain.dx * (0.08 + fallT * 0.42);
            y += grain.dy * fallT + crumble + cellH * 0.2 + grain.fall * gravity;
          }
          const shrink = Math.max(grain.kind === 'sand' ? 0.56 : 0.24, 1 - motionT * (grain.kind === 'sand' ? 0.24 : 0.68));
          rx = grain.size * shrink * (grain.kind === 'sand' ? 0.42 : 0.92);
          ry = grain.size * shrink * (grain.kind === 'sand' ? (motionT < 0.62 ? 2.7 : 0.72) : 0.72);
        }
        if (grain.kind === 'sand' && y - ry / 2 > rect.height) continue;
        ctx.globalAlpha = grain.kind === 'sand'
          ? 0.95
          : (t < 0.72 ? 0.94 : Math.max(0, (1 - t) / 0.28) * 0.86);
        ctx.fillStyle = grain.color;
        ctx.beginPath();
        if (grain.kind === 'chunk') {
          const angle = grain.rot * t * Math.PI / 180;
          for (let point = 0; point < grain.points; point += 1) {
            const theta = angle + (Math.PI * 2 * point) / grain.points;
            const radius = point % 2 === 0 ? rx : rx * 0.58;
            const px = x + Math.cos(theta) * radius;
            const py = y + Math.sin(theta) * ry * (point % 2 === 0 ? 1 : 0.7);
            if (point === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillRect(x - rx / 2, y - ry / 2, Math.max(0.65, rx), Math.max(0.65, ry));
        }
      }
      ctx.globalAlpha = 1;
      if (elapsed < totalMs) {
        sandFrameRef.current = window.requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, rect.width, rect.height);
        sandFrameRef.current = null;
      }
    };

    sandFrameRef.current = window.requestAnimationFrame(draw);
  }, []);

  useEffect(() => () => clearSand(), [clearSand]);

  const reset = useCallback(() => {
    setBoard(emptyBoard());
    setPiece(randomPiece());
    setNextPiece(randomPiece());
    setScore(0);
    setLines(0);
    setStarted(false);
    setPaused(true);
    setGameOver(false);
    clearSand();
  }, [clearSand]);

  const spawnNext = useCallback((currentBoard: Cell[][]) => {
    const spawn = { ...nextPiece, x: Math.floor(BOARD_WIDTH / 2) - 2, y: 0, matrix: nextPiece.matrix.map((row) => [...row]) };
    const upcoming = randomPiece();
    setNextPiece(upcoming);
    if (collides(currentBoard, spawn)) {
      setGameOver(true);
      setPaused(true);
      return;
    }
    setPiece(spawn);
  }, [nextPiece]);

  const lockPiece = useCallback((currentPiece: ActivePiece) => {
    const merged = mergePiece(boardRef.current, currentPiece);
    const clearRows = merged.map((row, index) => row.every(Boolean) ? index : -1).filter((index) => index >= 0);
    let nextBoard = merged;
    if (clearRows.length) {
      playCrushSand(clearRows, true);
      const remaining = merged.filter((_, index) => !clearRows.includes(index));
      nextBoard = [...Array.from({ length: clearRows.length }, () => Array<Cell>(BOARD_WIDTH).fill(null)), ...remaining];
      setScore((value) => value + [0, 100, 300, 500, 800][clearRows.length] + clearRows.length * 15);
      setLines((value) => value + clearRows.length);
    }
    setBoard(nextBoard);
    spawnNext(nextBoard);
  }, [playCrushSand, spawnNext]);

  const move = useCallback((dx: number, dy: number) => {
    if (!started || paused || gameOver) return;
    const current = pieceRef.current;
    if (!collides(boardRef.current, current, current.x + dx, current.y + dy)) {
      setPiece({ ...current, x: current.x + dx, y: current.y + dy });
    } else if (dy > 0) {
      lockPiece(current);
    }
  }, [gameOver, lockPiece, paused, started]);

  const rotate = useCallback(() => {
    if (!started || paused || gameOver) return;
    const current = pieceRef.current;
    const matrix = current.name === 'O' ? current.matrix : rotateMatrix(current.matrix);
    const kicks = [0, -1, 1, -2, 2];
    for (const kick of kicks) {
      if (!collides(boardRef.current, current, current.x + kick, current.y, matrix)) {
        setPiece({ ...current, x: current.x + kick, matrix });
        return;
      }
    }
  }, [gameOver, paused, started]);

  const hardDrop = useCallback(() => {
    if (!started || paused || gameOver) return;
    const current = pieceRef.current;
    let y = current.y;
    while (!collides(boardRef.current, current, current.x, y + 1)) y += 1;
    lockPiece({ ...current, y });
  }, [gameOver, lockPiece, paused, started]);

  const toggleRun = () => {
    if (gameOver) return;
    if (!started) {
      setStarted(true);
      setPaused(false);
      return;
    }
    setPaused((value) => !value);
  };

  useEffect(() => {
    const timer = window.setInterval(() => move(0, 1), DROP_MS);
    return () => window.clearInterval(timer);
  }, [move]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1, 0); }
      if (event.key === 'ArrowRight') { event.preventDefault(); move(1, 0); }
      if (event.key === 'ArrowDown') { event.preventDefault(); move(0, 1); }
      if (event.key === 'ArrowUp') { event.preventDefault(); rotate(); }
      if (event.code === 'Space') { event.preventDefault(); hardDrop(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hardDrop, move, rotate]);

  const display = useMemo(() => {
    const next = board.map((row) => [...row]);
    piece.matrix.forEach((row, rowIndex) => row.forEach((value, colIndex) => {
      if (value) {
        const y = piece.y + rowIndex;
        const x = piece.x + colIndex;
        if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH) next[y][x] = piece.color;
      }
    }));
    return next;
  }, [board, piece]);

  return (
    <Grid container spacing={2.2}>
      <Grid item xs={12} md={7} lg={6}>
        <Card sx={{ position: 'relative', p: { xs: 1, sm: 1.5 }, borderRadius: '10px', background: 'linear-gradient(145deg, #3a2116, #6b3d25)', border: '1px solid rgba(255,236,200,0.28)', boxShadow: '0 30px 90px rgba(62,35,19,0.38)' }}>
          <BoxAny sx={{ position: 'relative', mx: 'auto', width: { xs: 'calc((100% - 82px) * 0.8)', sm: 'min(100%, 360px)' }, aspectRatio: `${BOARD_WIDTH}/${BOARD_HEIGHT}`, p: 1, borderRadius: 0, background: 'linear-gradient(180deg, #2b1a13, #4c2b1c)', boxShadow: 'inset 0 8px 24px rgba(0,0,0,0.45), 0 16px 35px rgba(0,0,0,0.28)' }}>
            <BoxAny sx={{ display: 'grid', gridTemplateColumns: `repeat(${BOARD_WIDTH}, 1fr)`, gap: '3px', width: '100%', height: '100%' }}>
              {display.flatMap((row, rowIndex) => row.map((cell, colIndex) => (
                <BoxAny
                  key={`${rowIndex}-${colIndex}`}
                  sx={{
                    borderRadius: 0,
                    background: cell
                      ? `linear-gradient(145deg, rgba(255,232,188,0.26), transparent 22%), radial-gradient(circle at 28% 24%, rgba(61,31,17,0.24) 0 13%, transparent 14%), radial-gradient(circle at 68% 62%, rgba(35,18,10,0.22) 0 10%, transparent 11%), linear-gradient(145deg, ${cell}, #6d412f)`
                      : 'rgba(20,10,6,0.48)',
                    border: cell ? '1px solid rgba(255,236,196,0.24)' : '1px solid rgba(255,255,255,0.04)',
                    boxShadow: cell ? 'inset 2px 2px 0 rgba(255,235,190,0.18), inset -2px -3px 0 rgba(62,28,12,0.52), 0 2px 4px rgba(0,0,0,0.22)' : 'inset 0 1px 6px rgba(0,0,0,0.35)',
                    position: 'relative',
                    overflow: 'hidden',
                    '&:before': cell ? { content: '""', position: 'absolute', left: '18%', top: '10%', width: '64%', height: '82%', background: 'linear-gradient(116deg, transparent 0 42%, rgba(42,22,13,0.42) 43% 45%, transparent 46% 100%)', transform: 'skewX(-9deg)', opacity: 0.72 } : undefined,
                    '&:after': cell ? { content: '""', position: 'absolute', inset: '13% 18% 18% 11%', clipPath: 'polygon(7% 35%, 34% 26%, 42% 4%, 54% 30%, 88% 18%, 66% 47%, 93% 78%, 54% 60%, 36% 96%, 27% 58%)', background: 'rgba(80,45,25,0.20)', transform: 'rotate(8deg)' } : undefined,
                  }}
                />
              )))}
            </BoxAny>
            <BoxAny component="canvas" ref={sandCanvasRef} sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
            {((paused && started) || gameOver) && (
              <BoxAny sx={{ position: 'absolute', inset: 8, borderRadius: 0, display: 'grid', placeItems: 'center', background: 'rgba(20,10,6,0.68)', color: '#fff', textAlign: 'center', backdropFilter: 'blur(4px)' }}>
                <BoxAny>
                  <Typography variant="h5" fontWeight={900}>{gameOver ? '方块堆满了' : '已暂停'}</Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, color: 'rgba(255,255,255,0.78)' }}>{gameOver ? '重新开始一局' : '点击继续恢复游戏'}</Typography>
                </BoxAny>
              </BoxAny>
            )}
          </BoxAny>
          <BoxAny sx={{ position: 'absolute', left: { xs: 12, sm: 16 }, top: '50%', transform: 'translateY(-50%)', minWidth: 40, textAlign: 'center', color: 'rgba(255,236,204,0.9)', fontSize: { xs: 18, sm: 22 }, fontWeight: 900, fontVariantNumeric: 'tabular-nums', textShadow: '0 2px 10px rgba(0,0,0,0.45)' }}>
            {score}
          </BoxAny>
          <BoxAny sx={{ position: 'absolute', right: { xs: 18, sm: 22 }, bottom: { xs: 12, sm: 16 }, minWidth: 40, textAlign: 'center', color: 'rgba(255,236,204,0.9)', fontSize: { xs: 18, sm: 22 }, fontWeight: 900, fontVariantNumeric: 'tabular-nums', textShadow: '0 2px 10px rgba(0,0,0,0.45)' }}>
            {lines}
          </BoxAny>
          <BoxAny
            sx={{
              position: 'absolute',
              top: '50%',
              right: { xs: 10, sm: 14 },
              transform: 'translateY(-50%)',
              p: 0.65,
              borderRadius: 0,
              background: 'rgba(22,12,7,0.72)',
              border: '1px solid rgba(255,230,185,0.28)',
              boxShadow: '0 8px 20px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.08)',
              backdropFilter: 'blur(2px)',
              pointerEvents: 'none',
            }}
          >
            <BoxAny sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 13px)', gap: '2px' }}>
              {Array.from({ length: 16 }, (_, index) => {
                const y = Math.floor(index / 4);
                const x = index % 4;
                const filled = Boolean(nextPiece.matrix[y]?.[x]);
                return <BoxAny key={index} sx={{ width: 13, height: 13, borderRadius: 0, bgcolor: filled ? nextPiece.color : 'rgba(255,255,255,0.06)', boxShadow: filled ? 'inset 1px 1px 0 rgba(255,235,190,0.24), inset -1px -1px 0 rgba(62,28,12,0.48)' : 'none' }} />;
              })}
            </BoxAny>
          </BoxAny>
          <BoxAny sx={{ mt: { xs: 0.75, sm: 1 }, width: '100%' }}>
            <ButtonGroup
              variant="outlined"
              fullWidth
              sx={{
                '& .MuiButton-root': {
                  flex: 1,
                  minWidth: 0,
                  px: { xs: 0.75, sm: 1.25 },
                  color: '#d9a86c',
                  borderColor: 'rgba(217,168,108,0.62)',
                  background: 'rgba(74,42,26,0.22)',
                  fontWeight: 900,
                  '&:hover': {
                    borderColor: '#e7c28e',
                    background: 'rgba(139,91,61,0.34)',
                  },
                },
              }}
            >
              <Button onClick={() => move(-1, 0)}>左</Button>
              <Button onClick={rotate}>旋转</Button>
              <Button onClick={() => move(1, 0)}>右</Button>
            </ButtonGroup>
          </BoxAny>
        </Card>
      </Grid>
      <Grid item xs={12} md={5} lg={6}>
        <Stack spacing={2}>
          <Card><CardContent>
            <Stack direction="row" spacing={1}>
              <Button variant="contained" startIcon={!started || paused ? <PlayIcon /> : <PauseIcon />} onClick={toggleRun}>{!started ? '开始' : paused ? '继续' : '暂停'}</Button>
              <Button startIcon={<RefreshIcon />} onClick={reset}>重开</Button>
            </Stack>
          </CardContent></Card>
        </Stack>
      </Grid>
    </Grid>
  );
};

const candidatesFor = (grid: number[], index: number) => {
  return getSudokuCandidates(grid, index);
};

const getSudokuGivens = (difficulty: SudokuDifficulty, puzzleIndex: number) => SUDOKU_BANK[difficulty][puzzleIndex].puzzle.split('').map((value) => Number(value));

const createEmptySudokuNotes = () => Array.from({ length: 81 }, () => [] as number[]);

const isSudokuDifficulty = (value: unknown): value is SudokuDifficulty => value === 'easy' || value === 'advanced' || value === 'expert';

const isSudokuGrid = (value: unknown): value is number[] => (
  Array.isArray(value)
  && value.length === 81
  && value.every((item) => Number.isInteger(item) && item >= 0 && item <= 9)
);

const isSudokuNotes = (value: unknown): value is number[][] => (
  Array.isArray(value)
  && value.length === 81
  && value.every((items) => (
    Array.isArray(items)
    && items.every((item) => Number.isInteger(item) && item >= 1 && item <= 9)
  ))
);

const readSudokuState = (): SavedSudokuState | null => {
  try {
    const raw = window.localStorage.getItem(SUDOKU_STATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedSudokuState>;
    if (parsed.version !== 1 || !isSudokuDifficulty(parsed.difficulty)) return null;
    const bank = SUDOKU_BANK[parsed.difficulty];
    const puzzleIndex = parsed.puzzleIndex;
    const selected = parsed.selected ?? null;
    if (typeof puzzleIndex !== 'number' || !Number.isInteger(puzzleIndex) || puzzleIndex < 0 || puzzleIndex >= bank.length) return null;
    const puzzle = bank[puzzleIndex];
    if (parsed.puzzleId !== puzzle.id || !isSudokuGrid(parsed.grid) || !isSudokuNotes(parsed.notes)) return null;
    if (selected !== null && (!Number.isInteger(selected) || selected < 0 || selected > 80)) return null;
    return {
      version: 1,
      difficulty: parsed.difficulty,
      puzzleIndex,
      puzzleId: puzzle.id,
      grid: parsed.grid,
      notes: parsed.notes.map((items) => [...new Set(items)].sort((left, right) => left - right)),
      selected,
      hintMode: Boolean(parsed.hintMode),
      pencilMode: Boolean(parsed.pencilMode),
      checkResult: parsed.checkResult?.severity && parsed.checkResult.message ? parsed.checkResult : null,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

const writeSudokuState = (state: SavedSudokuState) => {
  try {
    window.localStorage.setItem(SUDOKU_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {}
};

const readGamesTab = () => {
  try {
    const value = Number(window.localStorage.getItem(GAMES_TAB_STORAGE_KEY));
    return value === 1 ? 1 : 0;
  } catch {
    return 0;
  }
};

const writeGamesTab = (tab: number) => {
  try {
    window.localStorage.setItem(GAMES_TAB_STORAGE_KEY, String(tab));
  } catch {}
};

const checkSudokuGrid = (grid: number[]): SudokuCheckResult => {
  const units: Array<{ label: string; values: number[] }> = [];

  for (let row = 0; row < 9; row += 1) {
    units.push({ label: `第 ${row + 1} 行`, values: Array.from({ length: 9 }, (_, col) => grid[row * 9 + col]) });
  }
  for (let col = 0; col < 9; col += 1) {
    units.push({ label: `第 ${col + 1} 列`, values: Array.from({ length: 9 }, (_, row) => grid[row * 9 + col]) });
  }
  for (let boxRow = 0; boxRow < 3; boxRow += 1) {
    for (let boxCol = 0; boxCol < 3; boxCol += 1) {
      units.push({
        label: `第 ${boxRow * 3 + boxCol + 1} 宫`,
        values: Array.from({ length: 9 }, (_, index) => {
          const row = boxRow * 3 + Math.floor(index / 3);
          const col = boxCol * 3 + (index % 3);
          return grid[row * 9 + col];
        }),
      });
    }
  }

  for (const unit of units) {
    const filledValues = unit.values.filter(Boolean);
    if (new Set(filledValues).size !== filledValues.length) {
      return { severity: 'error', message: `${unit.label} 有重复数字。` };
    }
  }

  if (grid.some((value) => value === 0)) {
    return { severity: 'warning', message: '还没填完；目前行、列和 3x3 宫没有重复冲突。' };
  }

  return { severity: 'success', message: '检查通过：每行、每列和每个 3x3 宫都满足 1-9。' };
};

const SudokuGame: React.FC = () => {
  const restoredState = useMemo(() => readSudokuState(), []);
  const currentSudokuStateRef = useRef<SavedSudokuState | null>(restoredState);
  const [difficulty, setDifficulty] = useState<SudokuDifficulty>(() => restoredState?.difficulty ?? 'easy');
  const [puzzleIndex, setPuzzleIndex] = useState(() => restoredState?.puzzleIndex ?? 0);
  const puzzle = SUDOKU_BANK[difficulty][puzzleIndex];
  const givens = useMemo(() => getSudokuGivens(difficulty, puzzleIndex), [difficulty, puzzleIndex]);
  const [grid, setGrid] = useState<number[]>(() => restoredState?.grid ?? givens);
  const [notes, setNotes] = useState<number[][]>(() => restoredState?.notes ?? createEmptySudokuNotes());
  const [selected, setSelected] = useState<number | null>(() => restoredState?.selected ?? null);
  const [hintMode, setHintMode] = useState(() => restoredState?.hintMode ?? false);
  const [pencilMode, setPencilMode] = useState(() => restoredState?.pencilMode ?? false);
  const [checkResult, setCheckResult] = useState<SudokuCheckResult | null>(() => restoredState?.checkResult ?? null);

  const buildSudokuState = useCallback((overrides: Partial<SavedSudokuState> = {}) => ({
    version: 1,
    difficulty,
    puzzleIndex,
    puzzleId: puzzle.id,
    grid,
    notes,
    selected,
    hintMode,
    pencilMode,
    checkResult,
    updatedAt: new Date().toISOString(),
    ...overrides,
  } satisfies SavedSudokuState), [difficulty, puzzleIndex, puzzle.id, grid, notes, selected, hintMode, pencilMode, checkResult]);

  const rememberSudokuState = useCallback((overrides: Partial<SavedSudokuState> = {}) => {
    currentSudokuStateRef.current = buildSudokuState(overrides);
  }, [buildSudokuState]);

  useEffect(() => {
    rememberSudokuState();
  }, [rememberSudokuState]);

  useEffect(() => () => {
    if (currentSudokuStateRef.current) writeSudokuState(currentSudokuStateRef.current);
  }, []);

  const setCell = (value: number) => {
    if (selected == null || givens[selected]) return;
    if (pencilMode) {
      if (grid[selected]) return;
      const nextNotes = notes.map((item) => [...item]);
      nextNotes[selected] = nextNotes[selected].includes(value)
        ? nextNotes[selected].filter((item) => item !== value)
        : [...nextNotes[selected], value].sort((left, right) => left - right);
      rememberSudokuState({ notes: nextNotes });
      setNotes(nextNotes);
      return;
    }

    const nextGrid = [...grid];
    nextGrid[selected] = nextGrid[selected] === value ? 0 : value;
    const nextNotes = notes.map((item) => [...item]);
    nextNotes[selected] = [];
    rememberSudokuState({ grid: nextGrid, notes: nextNotes, checkResult: null });
    setGrid(nextGrid);
    setCheckResult(null);
    setNotes(nextNotes);
  };

  const resetPuzzle = () => {
    const nextNotes = createEmptySudokuNotes();
    rememberSudokuState({ grid: givens, notes: nextNotes, checkResult: null });
    setGrid(givens);
    setNotes(nextNotes);
    setCheckResult(null);
  };

  const checkPuzzle = () => {
    const nextCheckResult = checkSudokuGrid(grid);
    rememberSudokuState({ checkResult: nextCheckResult });
    setCheckResult(nextCheckResult);
  };

  const selectedValue = selected != null ? grid[selected] || givens[selected] : 0;
  const selectedNotes = selected != null ? notes[selected] ?? [] : [];

  const switchPuzzle = (nextDifficulty: SudokuDifficulty, nextPuzzleIndex: number) => {
    const nextGrid = getSudokuGivens(nextDifficulty, nextPuzzleIndex);
    const nextNotes = createEmptySudokuNotes();
    rememberSudokuState({
      difficulty: nextDifficulty,
      puzzleIndex: nextPuzzleIndex,
      puzzleId: SUDOKU_BANK[nextDifficulty][nextPuzzleIndex].id,
      grid: nextGrid,
      notes: nextNotes,
      selected: null,
      checkResult: null,
    });
    setDifficulty(nextDifficulty);
    setPuzzleIndex(nextPuzzleIndex);
    setGrid(nextGrid);
    setNotes(nextNotes);
    setSelected(null);
    setCheckResult(null);
  };
  const previousPuzzle = () => switchPuzzle(difficulty, (puzzleIndex - 1 + SUDOKU_BANK[difficulty].length) % SUDOKU_BANK[difficulty].length);
  const nextPuzzle = () => switchPuzzle(difficulty, (puzzleIndex + 1) % SUDOKU_BANK[difficulty].length);
  const changeDifficulty = (nextDifficulty: SudokuDifficulty) => switchPuzzle(nextDifficulty, 0);
  const selectCell = (index: number) => {
    rememberSudokuState({ selected: index });
    setSelected(index);
  };
  const togglePencilMode = () => {
    const nextPencilMode = !pencilMode;
    rememberSudokuState({ pencilMode: nextPencilMode });
    setPencilMode(nextPencilMode);
  };
  const toggleHintMode = () => {
    const nextHintMode = !hintMode;
    rememberSudokuState({ hintMode: nextHintMode });
    setHintMode(nextHintMode);
  };
  const keypadButtonSx: SxProps<Theme> = {
    minWidth: 0,
    height: { xs: 46, sm: 50 },
    minHeight: { xs: 46, sm: 50 },
    maxHeight: { xs: 46, sm: 50 },
    px: 0,
    py: 0,
    borderWidth: '1px',
    borderStyle: 'solid',
    boxSizing: 'border-box',
    boxShadow: 'none',
    lineHeight: 1,
    '&:hover': { boxShadow: 'none' },
    '&:active': { boxShadow: 'none', transform: 'none' },
  };

  return (
    <Grid container spacing={2.2}>
      <Grid item xs={12} md={7}>
        <Card sx={{ p: { xs: 1, md: 2 }, borderRadius: '10px', backgroundColor: '#f2ead8', backgroundImage: ancientPaperBackground }}>
          <BoxAny sx={{ mx: 'auto', maxWidth: 560, aspectRatio: '1', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridTemplateRows: 'repeat(3, minmax(0, 1fr))', border: '3px solid #172033', borderRadius: 0, overflow: 'hidden', boxShadow: '0 24px 70px rgba(15,23,42,0.18)', bgcolor: '#172033' }}>
            {Array.from({ length: 9 }, (_, boxIndex) => {
              const boxRow = Math.floor(boxIndex / 3);
              const boxCol = boxIndex % 3;
              return (
                <BoxAny
                  key={boxIndex}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
                    gap: '1px',
                    bgcolor: 'rgba(23,32,51,0.18)',
                    borderRight: boxCol < 2 ? '3px solid #172033' : 0,
                    borderBottom: boxRow < 2 ? '3px solid #172033' : 0,
                    boxSizing: 'border-box',
                  }}
                >
                  {Array.from({ length: 9 }, (_, cellInBox) => {
                    const row = boxRow * 3 + Math.floor(cellInBox / 3);
                    const col = boxCol * 3 + (cellInBox % 3);
                    const index = row * 9 + col;
                    const value = grid[index];
                    const fixed = Boolean(givens[index]);
                    const isSelected = selected === index;
                    const related = selected != null && (Math.floor(selected / 9) === row || selected % 9 === col || (Math.floor(Math.floor(selected / 9) / 3) === Math.floor(row / 3) && Math.floor((selected % 9) / 3) === Math.floor(col / 3)));
                    const noteValues = notes[index] ?? [];
                    const cands = noteValues.length > 0 ? noteValues : hintMode ? candidatesFor(grid, index) : [];
                    const showingPencilNotes = noteValues.length > 0;
                    return (
                      <Button
                        key={index}
                        onClick={() => selectCell(index)}
                        sx={{
                          minWidth: 0,
                          minHeight: 0,
                          borderRadius: 0,
                          border: 0,
                          p: 0.25,
                          boxSizing: 'border-box',
                          backgroundColor: isSelected ? '#e7cfa2' : related ? '#f0dfbd' : '#f2ead8',
                          backgroundImage: ancientPaperBackground,
                          color: fixed ? '#3f2b17' : '#7c3f1d',
                          fontWeight: fixed ? 900 : 700,
                          fontSize: { xs: 21, sm: 30 },
                          '&:hover': { backgroundColor: isSelected ? '#dfc391' : '#ead6ad' },
                        }}
                      >
                        {value ? value : cands.length > 0 ? (
                          <BoxAny sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', width: '86%', height: '86%', color: showingPencilNotes ? '#1565c0' : 'rgba(20,40,70,0.38)', fontFamily: '"Comic Sans MS", "Segoe Print", cursive', fontSize: { xs: 8.5, sm: 12.5 }, fontWeight: showingPencilNotes ? 900 : 700, lineHeight: 1.1 }}>
                            {Array.from({ length: 9 }, (_, i) => <BoxAny key={i} sx={{ display: 'grid', placeItems: 'center' }}>{cands.includes(i + 1) ? i + 1 : ''}</BoxAny>)}
                          </BoxAny>
                        ) : ''}
                      </Button>
                    );
                  })}
                </BoxAny>
              );
            })}
          </BoxAny>
          <BoxAny sx={{ mx: 'auto', mt: { xs: 1, sm: 1.25 }, maxWidth: 560, display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: { xs: 0.75, sm: 1 } }}>
            {Array.from({ length: 9 }, (_, index) => (
              <Button
                key={index + 1}
                variant={(pencilMode ? selectedNotes.includes(index + 1) : selectedValue === index + 1) ? 'contained' : 'outlined'}
                onClick={() => setCell(index + 1)}
                sx={{ ...keypadButtonSx, fontSize: { xs: 20, sm: 22 }, fontWeight: 900 }}
              >
                {index + 1}
              </Button>
            ))}
            <Button color="success" variant="outlined" onClick={checkPuzzle} sx={{ ...keypadButtonSx, fontWeight: 800 }}>检查</Button>
            <Button variant={pencilMode ? 'contained' : 'outlined'} onClick={togglePencilMode} sx={{ ...keypadButtonSx, fontWeight: 800, color: pencilMode ? '#fff' : '#1565c0', borderColor: '#1565c0', bgcolor: pencilMode ? '#1565c0' : undefined, '&:hover': { boxShadow: 'none', borderColor: '#0d47a1', bgcolor: pencilMode ? '#0d47a1' : 'rgba(21,101,192,0.08)' } }}>铅笔</Button>
            <Button variant={hintMode ? 'contained' : 'outlined'} onClick={toggleHintMode} sx={{ ...keypadButtonSx, fontWeight: 800, color: hintMode ? '#fff' : '#6d6d6d', borderColor: '#8a8a8a', bgcolor: hintMode ? '#757575' : undefined, '&:hover': { boxShadow: 'none', borderColor: '#616161', bgcolor: hintMode ? '#616161' : 'rgba(97,97,97,0.08)' } }}>提示</Button>
          </BoxAny>
        </Card>
      </Grid>
      <Grid item xs={12} md={5}>
        <Stack spacing={2}>
          <Card><CardContent>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip label={difficulty === 'easy' ? 'Easy' : difficulty === 'advanced' ? '进阶' : '专家'} color="primary" />
              <Chip label={`题库 ${puzzleIndex + 1}/30`} />
            </Stack>
            <Typography variant="h5" sx={{ mt: 2, fontWeight: 900 }}>数独</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>固定数字不可修改。提示模式只按当前行、列、3x3 宫排除候选数，不做联合推理。</Typography>
            {checkResult && <Alert severity={checkResult.severity} sx={{ mt: 2 }}>{checkResult.message}</Alert>}
          </CardContent></Card>
          <Card><CardContent>
            <Typography fontWeight={800} sx={{ mb: 1 }}>难度</Typography>
            <ButtonGroup fullWidth>
              <Button variant={difficulty === 'easy' ? 'contained' : 'outlined'} onClick={() => changeDifficulty('easy')}>Easy</Button>
              <Button variant={difficulty === 'advanced' ? 'contained' : 'outlined'} onClick={() => changeDifficulty('advanced')}>进阶</Button>
              <Button variant={difficulty === 'expert' ? 'contained' : 'outlined'} onClick={() => changeDifficulty('expert')}>专家</Button>
            </ButtonGroup>
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              <Button startIcon={<CasinoIcon />} onClick={previousPuzzle}>上一题</Button>
              <Button startIcon={<CasinoIcon />} onClick={nextPuzzle}>下一题</Button>
              <Button startIcon={<RefreshIcon />} onClick={resetPuzzle}>重置</Button>
            </Stack>
          </CardContent></Card>
        </Stack>
      </Grid>
    </Grid>
  );
};

export const GamesPage: React.FC = () => {
  const [tab, setTab] = useState(() => readGamesTab());
  const handleTabChange = (_: React.SyntheticEvent, value: number) => {
    setTab(value);
    writeGamesTab(value);
  };
  return (
    <>
      <AppHeader />
      <BoxAny sx={{ minHeight: '100vh', pt: { xs: 'calc(56px + 8px)', sm: 'calc(64px + 10px)' }, pb: 5, background: 'linear-gradient(180deg, rgba(239,246,255,0.95), rgba(255,250,240,0.9))' }}>
        <Container maxWidth="lg">
          <Paper sx={{ p: { xs: 0.25, sm: 0.5 }, mb: 1.25, borderRadius: '10px', background: '#ffffff', boxShadow: '0 8px 24px rgba(15,23,42,0.08)' }}>
            <Tabs
              value={tab}
              onChange={handleTabChange}
              variant="fullWidth"
              sx={{
                minHeight: 36,
                borderBottom: 1,
                borderColor: 'divider',
                '& .MuiTabs-flexContainer': { minHeight: 36 },
              }}
            >
              <Tab label="俄罗斯方块" sx={{ minHeight: 36, py: 0, px: 1, textTransform: 'none' }} />
              <Tab label="数独" sx={{ minHeight: 36, py: 0, px: 1, textTransform: 'none' }} />
            </Tabs>
          </Paper>
          {tab === 0 ? <TetrisGame /> : null}
          <BoxAny sx={{ display: tab === 1 ? 'block' : 'none' }}>
            <SudokuGame />
          </BoxAny>
        </Container>
      </BoxAny>
    </>
  );
};

export default GamesPage;
