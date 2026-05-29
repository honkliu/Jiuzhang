import React from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { Close as CloseIcon } from '@mui/icons-material';
import {
  fetchHistory,
  type HistoryPoint,
} from '@/services/stocks.service';
import type { HardwareStock } from '@/data/hardwareStocks';

const BoxAny = Box as any;

/** SVG element with block layout, so it doesn't leave baseline whitespace. */
const ChartSvg = styled('svg')({ display: 'block' });

interface StockChartDrawerProps {
  open: boolean;
  onClose: () => void;
  stock: HardwareStock | null;
  /** Latest live price; drives the header readout. */
  livePrice?: number | null;
  liveChangePct?: number | null;
  currency?: string;
  marketState?: string;
  /** Pre-fetched 2y daily series, so the default "2Y" tab renders instantly. */
  preloadedCloses?: number[];
  preloadedTimestamps?: number[];
}

const TIMEFRAMES = [
  { key: '1D', range: '1d',  interval: '5m'  },
  { key: '1W', range: '5d',  interval: '30m' },
  { key: '1M', range: '1mo', interval: '1d'  },
  { key: '6M', range: '6mo', interval: '1d'  },
  { key: '1Y', range: '1y',  interval: '1d'  },
  { key: '2Y', range: '2y',  interval: '1d'  },
] as const;

type TimeframeKey = typeof TIMEFRAMES[number]['key'];

function fmtPrice(n: number | null | undefined, currency = 'USD'): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const symbol = currency === 'USD' ? '$' : '';
  return symbol + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

interface ChartProps {
  data: HistoryPoint[];
  width: number;
  height: number;
  currency: string;
  intraday: boolean;
}

/** Hand-rolled SVG line chart with axes + hover crosshair. */
const Chart: React.FC<ChartProps> = ({ data, width, height, currency, intraday }) => {
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);

  if (data.length < 2) {
    return (
      <BoxAny sx={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">No data</Typography>
      </BoxAny>
    );
  }

  const padL = 56;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  let min = Infinity;
  let max = -Infinity;
  for (const p of data) {
    if (p.close < min) min = p.close;
    if (p.close > max) max = p.close;
  }
  const range = max - min || 1;
  const pad = range * 0.08;
  min -= pad;
  max += pad;
  const rangeP = max - min;

  const x = (i: number) => padL + (i * innerW) / (data.length - 1);
  const y = (v: number) => padT + innerH - ((v - min) / rangeP) * innerH;

  let d = '';
  for (let i = 0; i < data.length; i++) {
    d += (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ',' + y(data[i].close).toFixed(1);
  }
  const trendUp = data[data.length - 1].close >= data[0].close;
  const stroke = trendUp ? '#0a7d27' : '#c62828';

  // Y-axis: 5 evenly-spaced ticks.
  const yTicks = 5;
  const yTickValues: number[] = [];
  for (let i = 0; i <= yTicks; i++) yTickValues.push(min + (rangeP * i) / yTicks);

  // X-axis: 4-6 evenly spaced labels.
  const xTickCount = Math.min(6, data.length);
  const xTickIndexes: number[] = [];
  for (let i = 0; i < xTickCount; i++) {
    xTickIndexes.push(Math.round((i * (data.length - 1)) / (xTickCount - 1)));
  }

  const fmtX = (ms: number) => {
    const dt = new Date(ms);
    if (intraday) {
      return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    // Date label: "MM/dd" or "yyyy" for very long ranges.
    return dt.toLocaleDateString([], { month: '2-digit', day: '2-digit' });
  };

  const fmtCross = (ms: number) => {
    const dt = new Date(ms);
    return intraday
      ? dt.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : dt.toLocaleDateString([], { year: 'numeric', month: 'short', day: '2-digit' });
  };

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, (px - padL) / innerW));
    setHoverIdx(Math.round(ratio * (data.length - 1)));
  };

  const hoverPoint = hoverIdx != null ? data[hoverIdx] : null;

  return (
    <ChartSvg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Y grid + labels */}
      {yTickValues.map((v, i) => {
        const yy = y(v);
        return (
          <g key={`y${i}`}>
            <line x1={padL} y1={yy} x2={padL + innerW} y2={yy} stroke="#eef0f5" strokeWidth={1} />
            <text x={padL - 6} y={yy + 3} fontSize={10} textAnchor="end" fill="#666">
              {fmtPrice(v, currency)}
            </text>
          </g>
        );
      })}

      {/* X labels */}
      {xTickIndexes.map((idx, i) => {
        const xx = x(idx);
        return (
          <text
            key={`x${i}`}
            x={xx}
            y={padT + innerH + 16}
            fontSize={10}
            textAnchor="middle"
            fill="#666"
          >
            {fmtX(data[idx].t)}
          </text>
        );
      })}

      {/* Line only — no area fill, no transparency. */}
      <path d={d} stroke={stroke} strokeWidth={1.75} fill="none" strokeLinejoin="round" strokeLinecap="round" />

      {/* Hover crosshair + tooltip */}
      {hoverPoint && (
        <g>
          <line
            x1={x(hoverIdx!)}
            y1={padT}
            x2={x(hoverIdx!)}
            y2={padT + innerH}
            stroke="#90a4ae"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <circle cx={x(hoverIdx!)} cy={y(hoverPoint.close)} r={3} fill={stroke} />
          {(() => {
            const baseline = data[0].close;
            const pct = baseline > 0 ? ((hoverPoint.close - baseline) / baseline) * 100 : null;
            const tooltipW = 160;
            const tooltipH = 52;
            const tx = Math.min(x(hoverIdx!) + 8, width - tooltipW - 4);
            return (
              <g transform={`translate(${tx}, ${padT + 8})`}>
                <rect width={tooltipW} height={tooltipH} rx={4} fill="#0f172a" />
                <text x={8} y={14} fontSize={10} fill="#cfd8dc">{fmtCross(hoverPoint.t)}</text>
                <text x={8} y={30} fontSize={13} fontWeight={700} fill="#fff">
                  {fmtPrice(hoverPoint.close, currency)}
                </text>
                <text
                  x={tooltipW - 8}
                  y={30}
                  fontSize={12}
                  fontWeight={700}
                  fill={pct == null ? '#cfd8dc' : pct >= 0 ? '#9fd6a8' : '#ffb3b3'}
                  textAnchor="end"
                >
                  {fmtPct(pct)}
                </text>
                <text x={8} y={45} fontSize={9} fill="#90a4ae">
                  vs start of timeframe
                </text>
              </g>
            );
          })()}
        </g>
      )}

      {/* Mouse-tracking surface */}
      <rect
        x={padL}
        y={padT}
        width={innerW}
        height={innerH}
        fill="transparent"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
      />
    </ChartSvg>
  );
};

export const StockChartDrawer: React.FC<StockChartDrawerProps> = ({
  open,
  onClose,
  stock,
  livePrice,
  liveChangePct,
  currency = 'USD',
  marketState,
  preloadedCloses,
  preloadedTimestamps,
}) => {
  const [tf, setTf] = React.useState<TimeframeKey>('2Y');
  const [data, setData] = React.useState<HistoryPoint[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [chartWidth, setChartWidth] = React.useState(640);
  const [chartHeight, setChartHeight] = React.useState(360);

  // Seed 2Y instantly from preloaded series; other tabs trigger a fetch.
  const seededFromPreload = React.useMemo<HistoryPoint[] | null>(() => {
    if (!preloadedCloses || !preloadedTimestamps) return null;
    if (preloadedCloses.length !== preloadedTimestamps.length) return null;
    const out: HistoryPoint[] = new Array(preloadedCloses.length);
    for (let i = 0; i < preloadedCloses.length; i++) {
      out[i] = { t: preloadedTimestamps[i] * 1000, close: preloadedCloses[i] };
    }
    return out;
  }, [preloadedCloses, preloadedTimestamps]);

  // Reset when the symbol changes; default to 2Y from preload.
  React.useEffect(() => {
    if (!stock) return;
    setTf('2Y');
    setData(seededFromPreload);
    setError(null);
  }, [stock?.symbol, seededFromPreload]);

  // Fetch when timeframe changes (skip the initial 2Y if we already have preload).
  React.useEffect(() => {
    if (!open || !stock) return;
    if (tf === '2Y' && seededFromPreload && seededFromPreload.length > 0) {
      setData(seededFromPreload);
      return;
    }
    const cfg = TIMEFRAMES.find((t) => t.key === tf)!;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchHistory(stock.symbol, cfg.range, cfg.interval)
      .then((d) => {
        if (cancelled) return;
        setData(d);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load chart');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, stock?.symbol, tf, seededFromPreload]);

  const containerRef = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const update = () => {
      setChartWidth(node.clientWidth || 640);
      setChartHeight(Math.max(360, node.clientHeight || 360));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
  }, []);

  if (!stock) return null;

  const intraday = tf === '1D' || tf === '1W';
  // Period change: % from the start of the currently-loaded timeframe to its
  // last point. Recomputed every time `data` or `livePrice` changes, so the
  // header readout updates as the user flips between 1D / 1W / 1M / ...
  const dataLatestClose = data && data.length > 0 ? data[data.length - 1].close : null;
  const effectiveLatest = livePrice ?? dataLatestClose;
  const baseline = data && data.length > 0 ? data[0].close : null;
  const periodChangePct =
    baseline != null && baseline > 0 && effectiveLatest != null
      ? ((effectiveLatest - baseline) / baseline) * 100
      : liveChangePct ?? null;
  const periodPositive = periodChangePct != null && periodChangePct >= 0;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: '100%',
          backgroundColor: '#ffffff',
          backgroundImage: 'none',
        },
      }}
    >
      <BoxAny sx={{ p: 2 }}>
        <BoxAny sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <BoxAny sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              {stock.nameZh && stock.nameZh !== stock.name
                ? `${stock.nameZh} - ${stock.name}`
                : stock.name}
            </Typography>
            <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                {stock.symbol}
              </Typography>
              <Chip size="small" label={stock.exchange} variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
              <Chip size="small" label={stock.category} variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
              {marketState && (
                <Chip
                  size="small"
                  label={marketState}
                  sx={{
                    height: 18,
                    fontSize: '0.65rem',
                    bgcolor: marketState === 'REGULAR' ? '#e8f5e9' : '#eceff1',
                    color: marketState === 'REGULAR' ? '#1b5e20' : '#37474f',
                  }}
                />
              )}
            </BoxAny>
          </BoxAny>
          <IconButton onClick={onClose} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </BoxAny>

        {/* Live price + timeframe-period change readout */}
        <BoxAny sx={{ mt: 1.5, display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
          <Typography variant="h4" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmtPrice(effectiveLatest, currency)}
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: periodChangePct == null ? 'text.secondary' : (periodPositive ? '#0a7d27' : '#c62828'),
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 600,
            }}
          >
            {fmtPct(periodChangePct)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ({tf})
          </Typography>
        </BoxAny>

        <Tabs
          value={tf}
          onChange={(_, v) => setTf(v as TimeframeKey)}
          variant="fullWidth"
          sx={{ mt: 2, minHeight: 36 }}
        >
          {TIMEFRAMES.map((t) => (
            <Tab key={t.key} value={t.key} label={t.key} sx={{ minHeight: 36, py: 0.5 }} />
          ))}
        </Tabs>

        <BoxAny ref={containerRef} sx={{ mt: 1.5, minHeight: 'calc(100vh - 240px)' }}>
          {error ? (
            <Alert severity="warning">{error}</Alert>
          ) : loading && !data ? (
            <BoxAny sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={28} />
            </BoxAny>
          ) : data ? (
            <Chart
              data={data}
              width={chartWidth}
              height={chartHeight}
              currency={currency}
              intraday={intraday}
            />
          ) : null}
        </BoxAny>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          {stock.blurb}
        </Typography>
      </BoxAny>
    </Drawer>
  );
};

export default StockChartDrawer;
