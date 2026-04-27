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
  Tab,
  Tabs,
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

type Cell = string | null;
type TetrominoName = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';
type Tetromino = { name: TetrominoName; matrix: number[][]; color: string; dust: string };
type ActivePiece = Tetromino & { x: number; y: number };
type Particle = { id: number; row: number; col: number; ox: number; oy: number; dx: number; dy: number; rot: number; delay: number; size: number; color: string; clip: string; duration: number };

type SudokuDifficulty = 'easy' | 'advanced' | 'expert';

type SudokuPuzzle = {
  id: string;
  puzzle: string;
};

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const DROP_MS = 650;

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

const SHARD_CLIPS = [
  'polygon(0 12%, 72% 0, 100% 41%, 55% 100%, 9% 78%)',
  'polygon(13% 0, 100% 18%, 81% 92%, 27% 100%, 0 44%)',
  'polygon(0 0, 84% 12%, 100% 100%, 31% 82%, 9% 39%)',
  'polygon(29% 0, 100% 0, 82% 70%, 41% 100%, 0 54%)',
  'polygon(4% 27%, 44% 0, 100% 23%, 76% 100%, 0 82%)',
];

const DIRT_SHARD_COLORS = ['#2f1a12', '#5f3927', '#8b5b3d', '#b78355', '#d0a06b', '#6f4630'];

const makeParticles = (rows: number[]) => rows.flatMap((row) => (
  Array.from({ length: BOARD_WIDTH }, (_, col) => (
    Array.from({ length: 5 }, (_, shard) => ({
      id: Date.now() + row * 1000 + col * 10 + shard,
      row,
      col,
      ox: 15 + Math.random() * 70,
      oy: 14 + Math.random() * 72,
      dx: (Math.random() - 0.5) * 150,
      dy: -18 - Math.random() * 105,
      rot: (Math.random() - 0.5) * 520,
      delay: Math.random() * 95,
      size: 15 + Math.random() * 38,
      color: DIRT_SHARD_COLORS[Math.floor(Math.random() * DIRT_SHARD_COLORS.length)],
      clip: SHARD_CLIPS[Math.floor(Math.random() * SHARD_CLIPS.length)],
      duration: 680 + Math.random() * 260,
    }))
  )).flat()
));

const createSudokuPuzzle = (puzzle: string, index: number): SudokuPuzzle => ({
  id: `sudoku-${index}`,
  puzzle,
});

const RAW_SUDOKU: Record<SudokuDifficulty, string[]> = {
  easy: [
    '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
    '006100800090000240100060009000005004702000306900400000300010005061000090005009600',
    '000260701680070090190004500820100040004602900050003028009300074040050036703018000',
    '100489006730000040000001295007120600500703008006095700914600000020000037800512004',
    '300200000000107000706030500070009080900020004010800050009040301000702000000008006',
    '020000000000600003074080000000003002080040010600500000000010780500009000000000040',
    '000000907000420180000705026100904000050000040000507009920108000034059000507000000',
    '030050040008010500460000012070502080000603000040109030250000098001020600080060020',
    '000900002050123400030000160908000000070000090000000205091000040007439020400007000',
    '200080300060070084030500209000105408000000000402706000301007040720040060004010003',
  ],
  advanced: [
    '000000010400000000020000000000050407008000300001090000300400200050100000000806000',
    '800000000003600000070090200050007000000045700000100030001000068008500010090000400',
    '005300000800000020070010500400005300010070006003200080060500009004000030000009700',
    '000000907000420180000705026100904000050000040000507009920108000034059000507000000',
    '030000080009000500007509200700105008000090000900402006004207100005000600020000040',
    '000075400000000008080190000300001060000000034000068170204000603900000020530200000',
    '000000000000003085001020000000507000004000100090000000500000073002010000000040009',
    '700000400020000080003000009000370000405000708000098000800000100060000050009000007',
    '000400000000000063000007100000029000300000005000810000004700000970000000000006000',
    '010000000000903000009000503000030020700000008040020000602000100000604000000000090',
  ],
  expert: [
    '000000012000000003002300400001800000050000000000000000300000000000070000000000000',
    '100007090030020008009600500005300900010080002600004000300000010040000007007000300',
    '000000000000000001000000023000000000000104000000000000340000000200000000000000000',
    '000000010000000000000000000000000000000000000000000000000000000000000000000000000',
    '000900000020000000000000000000000000000000000000000000000000000000000040000008000',
    '000000000000001000000000000000000000000000000000000000000000000000400000000000000',
    '000000000000000000000000100000000000000000000000000000001000000000000000000000000',
    '900000000000000000000000000000000000000000000000000000000000000000000000000000009',
    '000000000000020000000000000000000000000000000000000000000000000000070000000000000',
    '000000000100000000000000000000000000000000000000000000000000000000000001000000000',
  ],
};

const remapDigits = (input: string, shift: number) => input.replace(/[1-9]/g, (d) => String(((Number(d) + shift - 1) % 9) + 1));
const transposeSudoku = (input: string) => Array.from({ length: 81 }, (_, index) => input[(index % 9) * 9 + Math.floor(index / 9)]).join('');
const expandPuzzles = (items: string[]) => items.flatMap((item, index) => [item, remapDigits(item, index + 2), transposeSudoku(remapDigits(item, index + 4))]).slice(0, 30);

const SUDOKU_BANK: Record<SudokuDifficulty, SudokuPuzzle[]> = {
  easy: expandPuzzles(RAW_SUDOKU.easy).map((item, index) => createSudokuPuzzle(item, index + 1)),
  advanced: expandPuzzles(RAW_SUDOKU.advanced).map((item, index) => createSudokuPuzzle(item, index + 1)),
  expert: expandPuzzles(RAW_SUDOKU.expert).map((item, index) => createSudokuPuzzle(item, index + 1)),
};

function solveSudokuString(puzzle: string) {
  const grid = puzzle.split('').map((item) => Number(item));
  const findEmpty = () => grid.findIndex((value) => value === 0);
  const valid = (index: number, value: number) => {
    const row = Math.floor(index / 9);
    const col = index % 9;
    for (let i = 0; i < 9; i += 1) {
      if (grid[row * 9 + i] === value || grid[i * 9 + col] === value) return false;
    }
    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        if (grid[(boxRow + y) * 9 + boxCol + x] === value) return false;
      }
    }
    return true;
  };
  const solve = (): boolean => {
    const index = findEmpty();
    if (index < 0) return true;
    for (let value = 1; value <= 9; value += 1) {
      if (valid(index, value)) {
        grid[index] = value;
        if (solve()) return true;
        grid[index] = 0;
      }
    }
    return false;
  };
  solve();
  return grid.join('');
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
  const [particles, setParticles] = useState<Particle[]>([]);
  const boardRef = useRef(board);
  const pieceRef = useRef(piece);

  useEffect(() => { boardRef.current = board; }, [board]);
  useEffect(() => { pieceRef.current = piece; }, [piece]);

  const reset = useCallback(() => {
    setBoard(emptyBoard());
    setPiece(randomPiece());
    setNextPiece(randomPiece());
    setScore(0);
    setLines(0);
    setStarted(false);
    setPaused(true);
    setGameOver(false);
    setParticles([]);
  }, []);

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
      setParticles(makeParticles(clearRows));
      window.setTimeout(() => setParticles([]), 1150);
      const remaining = merged.filter((_, index) => !clearRows.includes(index));
      nextBoard = [...Array.from({ length: clearRows.length }, () => Array<Cell>(BOARD_WIDTH).fill(null)), ...remaining];
      setScore((value) => value + [0, 100, 300, 500, 800][clearRows.length] + clearRows.length * 15);
      setLines((value) => value + clearRows.length);
    }
    setBoard(nextBoard);
    spawnNext(nextBoard);
  }, [spawnNext]);

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
        <Card sx={{ position: 'relative', p: { xs: 1, sm: 1.5 }, background: 'linear-gradient(145deg, #3a2116, #6b3d25)', border: '1px solid rgba(255,236,200,0.28)', boxShadow: '0 30px 90px rgba(62,35,19,0.38)' }}>
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
            {particles.map((p) => (
              <BoxAny key={p.id} sx={{ position: 'absolute', left: `calc(${p.col} * 10% + ${p.ox * 0.1}%)`, top: `calc(${p.row} * 5% + ${p.oy * 0.05}%)`, width: `${p.size}px`, aspectRatio: '1', borderRadius: 0, clipPath: p.clip, background: `linear-gradient(145deg, rgba(255,226,177,0.28), ${p.color} 45%, #21130d)`, animation: `crushDust ${p.duration}ms cubic-bezier(.17,.67,.2,1) ${p.delay}ms forwards`, '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--rot': `${p.rot}deg`, boxShadow: '0 6px 14px rgba(35,18,10,0.34)', pointerEvents: 'none', transformOrigin: '50% 50%' }} />
            ))}
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
            <Typography sx={{ mb: 0.35, color: 'rgba(255,236,204,0.78)', fontSize: 10, lineHeight: 1, fontWeight: 800, textAlign: 'center' }}>下一个</Typography>
            <BoxAny sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 13px)', gap: '2px' }}>
              {Array.from({ length: 16 }, (_, index) => {
                const y = Math.floor(index / 4);
                const x = index % 4;
                const filled = Boolean(nextPiece.matrix[y]?.[x]);
                return <BoxAny key={index} sx={{ width: 13, height: 13, borderRadius: 0, bgcolor: filled ? nextPiece.color : 'rgba(255,255,255,0.06)', boxShadow: filled ? 'inset 1px 1px 0 rgba(255,235,190,0.24), inset -1px -1px 0 rgba(62,28,12,0.48)' : 'none' }} />;
              })}
            </BoxAny>
          </BoxAny>
          <BoxAny sx={{ mt: { xs: 0.75, sm: 1 }, display: 'flex', justifyContent: 'center' }}>
            <ButtonGroup variant="outlined" sx={{ flexWrap: 'wrap', '& .MuiButton-root': { minWidth: { xs: 52, sm: 62 }, px: { xs: 0.75, sm: 1.25 } } }}>
              <Button onClick={() => move(-1, 0)}>左</Button>
              <Button onClick={rotate}>旋转</Button>
              <Button onClick={() => move(1, 0)}>右</Button>
              <Button onClick={hardDrop}>落下</Button>
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
  if (grid[index]) return [];
  const row = Math.floor(index / 9);
  const col = index % 9;
  const used = new Set<number>();
  for (let i = 0; i < 9; i += 1) {
    if (grid[row * 9 + i]) used.add(grid[row * 9 + i]);
    if (grid[i * 9 + col]) used.add(grid[i * 9 + col]);
  }
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) if (grid[(boxRow + y) * 9 + boxCol + x]) used.add(grid[(boxRow + y) * 9 + boxCol + x]);
  return Array.from({ length: 9 }, (_, i) => i + 1).filter((n) => !used.has(n));
};

const SudokuGame: React.FC = () => {
  const [difficulty, setDifficulty] = useState<SudokuDifficulty>('easy');
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const puzzle = SUDOKU_BANK[difficulty][puzzleIndex];
  const givens = useMemo(() => puzzle.puzzle.split('').map((value) => Number(value)), [puzzle]);
  const [grid, setGrid] = useState<number[]>(() => givens);
  const [selected, setSelected] = useState<number | null>(null);
  const [hintMode, setHintMode] = useState(true);
  const [mistakes, setMistakes] = useState(0);
  const solution = useMemo(() => solveSudokuString(puzzle.puzzle), [puzzle.puzzle]);

  useEffect(() => {
    setGrid(givens);
    setSelected(null);
    setMistakes(0);
  }, [givens]);

  const setCell = (value: number) => {
    if (selected == null || givens[selected]) return;
    setGrid((prev) => {
      const next = [...prev];
      next[selected] = next[selected] === value ? 0 : value;
      return next;
    });
  };

  const clearCell = () => {
    if (selected == null || givens[selected]) return;
    setGrid((prev) => {
      const next = [...prev];
      next[selected] = 0;
      return next;
    });
  };

  const completed = grid.every((value, index) => value === Number(solution[index]));
  const selectedValue = selected != null ? grid[selected] || givens[selected] : 0;

  useEffect(() => {
    if (selected == null || !grid[selected]) return;
    if (grid[selected] !== Number(solution[selected])) setMistakes((value) => value + 1);
  }, [grid, solution, selected]);

  const nextPuzzle = () => setPuzzleIndex((value) => (value + 1) % SUDOKU_BANK[difficulty].length);

  return (
    <Grid container spacing={2.2}>
      <Grid item xs={12} md={7}>
        <Card sx={{ p: { xs: 1, md: 2 }, background: 'linear-gradient(145deg, rgba(255,255,255,0.92), rgba(242,248,255,0.78))' }}>
          <BoxAny sx={{ mx: 'auto', maxWidth: 560, display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', border: '3px solid #172033', borderRadius: 0, overflow: 'hidden', boxShadow: '0 24px 70px rgba(15,23,42,0.18)' }}>
            {grid.map((value, index) => {
              const row = Math.floor(index / 9);
              const col = index % 9;
              const fixed = Boolean(givens[index]);
              const isSelected = selected === index;
              const related = selected != null && (Math.floor(selected / 9) === row || selected % 9 === col || (Math.floor(Math.floor(selected / 9) / 3) === Math.floor(row / 3) && Math.floor((selected % 9) / 3) === Math.floor(col / 3)));
              const wrong = value !== 0 && value !== Number(solution[index]);
              const cands = hintMode ? candidatesFor(grid, index) : [];
              return (
                <Button
                  key={index}
                  onClick={() => setSelected(index)}
                  sx={{
                    aspectRatio: '1', minWidth: 0, borderRadius: 0, p: 0.25,
                    borderRight: col === 2 || col === 5 ? '3px solid #172033' : '1px solid rgba(23,32,51,0.16)',
                    borderBottom: row === 2 || row === 5 ? '3px solid #172033' : '1px solid rgba(23,32,51,0.16)',
                    bgcolor: isSelected ? '#dff2ff' : related ? '#f2f7fb' : '#fffdf8',
                    color: wrong ? '#d32f2f' : fixed ? '#182033' : '#1976d2',
                    fontWeight: fixed ? 900 : 700,
                    fontSize: { xs: 21, sm: 30 },
                    '&:hover': { bgcolor: '#e8f5ff' },
                  }}
                >
                  {value ? value : hintMode ? (
                    <BoxAny sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', width: '86%', height: '86%', color: 'rgba(20,40,70,0.42)', fontFamily: '"Comic Sans MS", "Segoe Print", cursive', fontSize: { xs: 7, sm: 11 }, lineHeight: 1.1 }}>
                      {Array.from({ length: 9 }, (_, i) => <BoxAny key={i} sx={{ display: 'grid', placeItems: 'center' }}>{cands.includes(i + 1) ? i + 1 : ''}</BoxAny>)}
                    </BoxAny>
                  ) : ''}
                </Button>
              );
            })}
          </BoxAny>
          <BoxAny sx={{ mx: 'auto', mt: { xs: 1, sm: 1.25 }, maxWidth: 560, display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: { xs: 0.75, sm: 1 } }}>
            {Array.from({ length: 9 }, (_, index) => (
              <Button
                key={index + 1}
                variant={selectedValue === index + 1 ? 'contained' : 'outlined'}
                onClick={() => setCell(index + 1)}
                sx={{ minWidth: 0, minHeight: { xs: 44, sm: 48 }, fontSize: { xs: 20, sm: 22 }, fontWeight: 900, px: 0 }}
              >
                {index + 1}
              </Button>
            ))}
            <Button color="error" variant="outlined" onClick={clearCell} sx={{ minWidth: 0, minHeight: { xs: 44, sm: 48 }, px: 0, fontWeight: 800 }}>清除</Button>
          </BoxAny>
        </Card>
      </Grid>
      <Grid item xs={12} md={5}>
        <Stack spacing={2}>
          <Card><CardContent>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip label={difficulty === 'easy' ? 'Easy' : difficulty === 'advanced' ? '进阶' : '专家'} color="primary" />
              <Chip label={`题库 ${puzzleIndex + 1}/30`} />
              <Chip label={`错误 ${mistakes}`} variant="outlined" />
            </Stack>
            <Typography variant="h5" sx={{ mt: 2, fontWeight: 900 }}>数独</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>固定数字不可修改。提示模式只按当前行、列、3x3 宫排除候选数，不做联合推理。</Typography>
            {completed && <Alert severity="success" sx={{ mt: 2 }}>完成！这局数独已正确解出。</Alert>}
          </CardContent></Card>
          <Card><CardContent>
            <Typography fontWeight={800} sx={{ mb: 1 }}>难度</Typography>
            <ButtonGroup fullWidth>
              <Button variant={difficulty === 'easy' ? 'contained' : 'outlined'} onClick={() => { setDifficulty('easy'); setPuzzleIndex(0); }}>Easy</Button>
              <Button variant={difficulty === 'advanced' ? 'contained' : 'outlined'} onClick={() => { setDifficulty('advanced'); setPuzzleIndex(0); }}>进阶</Button>
              <Button variant={difficulty === 'expert' ? 'contained' : 'outlined'} onClick={() => { setDifficulty('expert'); setPuzzleIndex(0); }}>专家</Button>
            </ButtonGroup>
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              <Button variant={hintMode ? 'contained' : 'outlined'} onClick={() => setHintMode((value) => !value)}>提示模式</Button>
              <Button startIcon={<CasinoIcon />} onClick={nextPuzzle}>下一题</Button>
              <Button startIcon={<RefreshIcon />} onClick={() => setGrid(givens)}>重置</Button>
            </Stack>
          </CardContent></Card>
        </Stack>
      </Grid>
    </Grid>
  );
};

export const GamesPage: React.FC = () => {
  const [tab, setTab] = useState(0);
  return (
    <>
      <AppHeader />
      <BoxAny sx={{ minHeight: '100vh', pt: { xs: 'calc(56px + 8px)', sm: 'calc(64px + 10px)' }, pb: 5, background: 'linear-gradient(180deg, rgba(239,246,255,0.95), rgba(255,250,240,0.9))' }}>
        <Container maxWidth="lg">
          <Paper sx={{ p: { xs: 0.25, sm: 0.5 }, mb: 1.25, borderRadius: '10px', background: '#ffffff', boxShadow: '0 8px 24px rgba(15,23,42,0.08)' }}>
            <Tabs
              value={tab}
              onChange={(_, value) => setTab(value)}
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
          {tab === 0 ? <TetrisGame /> : <SudokuGame />}
        </Container>
      </BoxAny>
      <style>{`@keyframes crushDust { 0% { opacity: 1; transform: translate(0,0) rotate(0) scale(1); filter: blur(0); } 18% { opacity: 1; transform: translate(calc(var(--dx) * .34), calc(var(--dy) * .42)) rotate(calc(var(--rot) * .28)) scale(.92); filter: blur(0); } 58% { opacity: .88; transform: translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(.7); filter: blur(.2px); } 100% { opacity: 0; transform: translate(calc(var(--dx) * 1.22), calc(var(--dy) + 118px)) rotate(calc(var(--rot) * 1.55)) scale(.26); filter: blur(2.2px); } }`}</style>
    </>
  );
};

export default GamesPage;
