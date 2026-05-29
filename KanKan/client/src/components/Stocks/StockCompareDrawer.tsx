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
import { fetchHistory, type HistoryPoint, type LiveQuote } from '@/services/stocks.service';
import type { HardwareStock } from '@/data/hardwareStocks';

const BoxAny = Box as any;
const ChartSvg = styled('svg')({ display: 'block' });

interface StockCompareDrawerProps {
  open: boolean;
  onClose: () => void;
  stocks: HardwareStock[];
  /** Latest live quotes (for price + market cap in the hover tooltip). */
  liveQuotes?: Map<string, LiveQuote>;
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

/**
 * Visually distinct categorical palette. Avoids the green/red semantics used
 * by the single-symbol chart (where green = up, red = down) since here every
 * line could be up OR down.
 */
const PALETTE = [
  '#1f77b4', // blue
  '#ff7f0e', // orange
  '#9467bd', // purple
  '#8c564b', // brown
  '#e377c2', // pink
  '#17becf', // cyan
  '#bcbd22', // olive
  '#7f7f7f', // gray
  '#2ca02c', // green
  '#d62728', // red
];

function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

function fmtPrice(n: number | null | undefined, currency = 'USD'): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const symbol = currency === 'USD' ? '$' : '';
  return symbol + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Format a market cap (raw integer USD) into a compact human-readable form:
 *   $3,420,000,000,000  ->  $3.42T
 *   $80,500,000,000     ->  $80.5B
 *   $9,200,000,000      ->  $9.20B
 *   $720,000,000        ->  $720M
 * Anything smaller is shown as $X.XM.
 */
function fmtMarketCap(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

interface Series {
  symbol: string;
  color: string;
  /** Raw history points (used for X mapping). */
  points: HistoryPoint[];
  /** Percent change from the first point of THIS series. */
  pct: number[];
}

interface ChartProps {
  series: Series[];
  width: number;
  height: number;
  intraday: boolean;
  /** Symbols the user has clicked to hide from the chart. */
  hiddenSymbols: Set<string>;
  /** Live quote map for tooltip enrichment (currency + market cap). */
  liveQuotes?: Map<string, LiveQuote>;
}

const CompareChart: React.FC<ChartProps> = ({ series, width, height, intraday, hiddenSymbols, liveQuotes }) => {
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);

  // Filter out empty AND user-hidden series. Both transparency mechanisms
  // collapse to "don't draw, don't size axes to, don't tooltip".
  const valid = series.filter((s) => s.points.length >= 2 && !hiddenSymbols.has(s.symbol));
  if (valid.length === 0) {
    return (
      <BoxAny sx={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {series.length === 0 ? 'No data' : 'All series hidden — click a chip below to show one'}
        </Typography>
      </BoxAny>
    );
  }

  const padL = 48;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  // -- X axis: CATEGORICAL ---------------------------------------------------
  // Build a sorted union of every visible series' timestamps. Plotting against
  // INDEX in this array (instead of raw time) collapses overnight and weekend
  // gaps so the lines stay continuous — without this, 1W shows a long straight
  // line across each 17h overnight gap (and weekends look like cliffs on 1M+).
  // Standard practice for serious stock charts.
  const allTimesSet = new Set<number>();
  for (const s of valid) {
    for (const p of s.points) allTimesSet.add(p.t);
  }
  const allTimes = Array.from(allTimesSet).sort((a, b) => a - b);
  const timeToIdx = new Map<number, number>();
  for (let i = 0; i < allTimes.length; i++) timeToIdx.set(allTimes[i], i);
  const xStep = allTimes.length > 1 ? innerW / (allTimes.length - 1) : 0;
  const x = (t: number) => padL + (timeToIdx.get(t) ?? 0) * xStep;
  // -------------------------------------------------------------------------

  // Y domain: global min/max of percent values, padded.
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const s of valid) {
    for (const v of s.pct) {
      if (v < yMin) yMin = v;
      if (v > yMax) yMax = v;
    }
  }
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  // Ensure 0% line is in the visible range so users can see baseline.
  if (yMin > 0) yMin = 0;
  if (yMax < 0) yMax = 0;
  const yPad = (yMax - yMin) * 0.08;
  yMin -= yPad;
  yMax += yPad;
  const yRange = yMax - yMin;

  const y = (v: number) => padT + innerH - ((v - yMin) / yRange) * innerH;

  // Y-axis ticks (5 evenly spaced + a forced 0% line if it's in the visible range).
  const yTicks: number[] = [];
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) yTicks.push(yMin + (yRange * i) / tickCount);

  // X-axis ticks: 6 evenly spaced indexes into allTimes — the labels are the
  // actual timestamps at those points, so users see real dates/times even
  // though the spacing is categorical.
  const xTickIdxs: number[] = [];
  const xTickCount = 6;
  if (allTimes.length > 0) {
    for (let i = 0; i < xTickCount; i++) {
      xTickIdxs.push(Math.round((i * (allTimes.length - 1)) / (xTickCount - 1)));
    }
  }

  const fmtX = (ms: number) => {
    const dt = new Date(ms);
    return intraday
      ? dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : dt.toLocaleDateString([], { month: '2-digit', day: '2-digit' });
  };

  const fmtCross = (ms: number) => {
    const dt = new Date(ms);
    return intraday
      ? dt.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : dt.toLocaleDateString([], { year: 'numeric', month: 'short', day: '2-digit' });
  };

  // Hover: convert pixel → unified-time-axis index → timestamp.
  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, (px - padL) / innerW));
    if (allTimes.length === 0) return;
    setHoverIdx(Math.round(ratio * (allTimes.length - 1)));
  };

  // For each series, find the point closest to the hovered timestamp.
  const hoverT = hoverIdx != null && hoverIdx >= 0 && hoverIdx < allTimes.length
    ? allTimes[hoverIdx]
    : null;
  const hoverPerSeries:
    | Array<{
        symbol: string;
        color: string;
        pct: number;
        price: number;
        t: number;
        currency: string;
        marketCap: number | null;
      } | null>
    | null = hoverT == null
    ? null
    : valid.map((s) => {
        let bestI = 0;
        let bestDelta = Math.abs(s.points[0].t - hoverT);
        for (let i = 1; i < s.points.length; i++) {
          const d = Math.abs(s.points[i].t - hoverT);
          if (d < bestDelta) {
            bestDelta = d;
            bestI = i;
          }
        }
        // Enrich with live data at render time so polling updates don't trigger a refetch.
        const live = liveQuotes?.get(s.symbol);
        return {
          symbol: s.symbol,
          color: s.color,
          pct: s.pct[bestI],
          price: s.points[bestI].close,
          t: s.points[bestI].t,
          currency: live?.currency ?? 'USD',
          marketCap: live?.marketCap ?? null,
        };
      });

  return (
    <ChartSvg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Y grid + labels */}
      {yTicks.map((v, i) => {
        const yy = y(v);
        const isZeroLine = Math.abs(v) < 1e-6;
        return (
          <g key={`y${i}`}>
            <line
              x1={padL}
              y1={yy}
              x2={padL + innerW}
              y2={yy}
              stroke={isZeroLine ? '#90a4ae' : '#eef0f5'}
              strokeWidth={isZeroLine ? 1 : 1}
              strokeDasharray={isZeroLine ? '4 4' : undefined}
            />
            <text x={padL - 6} y={yy + 3} fontSize={10} textAnchor="end" fill="#666">
              {fmtPct(v, 0)}
            </text>
          </g>
        );
      })}

      {/* X labels */}
      {xTickIdxs.map((idx, i) => (
        <text
          key={`x${i}`}
          x={x(allTimes[idx])}
          y={padT + innerH + 16}
          fontSize={10}
          textAnchor="middle"
          fill="#666"
        >
          {fmtX(allTimes[idx])}
        </text>
      ))}

      {/* One path per series. Solid line, no fill, no transparency. */}
      {valid.map((s) => {
        let d = '';
        for (let i = 0; i < s.points.length; i++) {
          d += (i === 0 ? 'M' : 'L') + x(s.points[i].t).toFixed(1) + ',' + y(s.pct[i]).toFixed(1);
        }
        return (
          <path
            key={s.symbol}
            d={d}
            stroke={s.color}
            strokeWidth={1.6}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      })}

      {/* Hover crosshair + per-series readouts */}
      {hoverT != null && hoverPerSeries && (
        <g>
          <line
            x1={x(hoverT)}
            y1={padT}
            x2={x(hoverT)}
            y2={padT + innerH}
            stroke="#90a4ae"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          {hoverPerSeries.map((p) =>
            p ? <circle key={p.symbol} cx={x(p.t)} cy={y(p.pct)} r={3} fill={p.color} /> : null
          )}
          {(() => {
            // Each series uses two lines: ticker + pct, then price + cap.
            const tooltipW = 220;
            const rowH = 26;
            const headerH = 18;
            const tooltipH = headerH + hoverPerSeries.length * rowH + 4;
            const cursorX = x(hoverT);
            // Flip to the left of the cursor if there isn't enough room on the right.
            const tx = cursorX + tooltipW + 12 > width
              ? Math.max(4, cursorX - tooltipW - 8)
              : cursorX + 8;
            const firstPt = hoverPerSeries.find((p) => p);
            return (
              <g transform={`translate(${tx}, ${padT + 8})`}>
                <rect width={tooltipW} height={tooltipH} rx={4} fill="#0f172a" />
                <text x={8} y={13} fontSize={10} fill="#cfd8dc">
                  {firstPt ? fmtCross(firstPt.t) : ''}
                </text>
                {hoverPerSeries.map((p, i) => {
                  if (!p) return null;
                  const yBase = headerH + i * rowH;
                  return (
                    <g key={p.symbol} transform={`translate(0, ${yBase})`}>
                      <rect x={8} y={4} width={8} height={8} fill={p.color} />
                      <text x={20} y={12} fontSize={11} fill="#fff" fontWeight={700}>
                        {p.symbol}
                      </text>
                      <text
                        x={tooltipW - 8}
                        y={12}
                        fontSize={11}
                        fill={p.pct >= 0 ? '#9fd6a8' : '#ffb3b3'}
                        textAnchor="end"
                        fontWeight={700}
                      >
                        {fmtPct(p.pct)}
                      </text>
                      <text x={20} y={23} fontSize={10} fill="#cfd8dc">
                        {fmtPrice(p.price, p.currency)}
                      </text>
                      <text
                        x={tooltipW - 8}
                        y={23}
                        fontSize={10}
                        fill="#cfd8dc"
                        textAnchor="end"
                      >
                        cap {fmtMarketCap(p.marketCap)}
                      </text>
                    </g>
                  );
                })}
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

export const StockCompareDrawer: React.FC<StockCompareDrawerProps> = ({
  open,
  onClose,
  stocks,
  liveQuotes,
}) => {
  const [tf, setTf] = React.useState<TimeframeKey>('1Y');
  const [series, setSeries] = React.useState<Series[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [chartWidth, setChartWidth] = React.useState(640);
  const [chartHeight, setChartHeight] = React.useState(380);
  /** Symbols the user clicked off in the legend; chart hides them and rescales. */
  const [hiddenSymbols, setHiddenSymbols] = React.useState<Set<string>>(() => new Set());

  // Reset hide-state when the user opens the drawer with a different selection.
  // Don't reset on timeframe change — hide preferences should persist across tabs.
  const stocksKey = stocks.map((s) => s.symbol).sort().join(',');
  React.useEffect(() => {
    setHiddenSymbols(new Set());
  }, [stocksKey]);

  const toggleHidden = React.useCallback((symbol: string) => {
    setHiddenSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }, []);

  // Fetch deliberately does NOT depend on liveQuotes — the 30s polling tick
  // would otherwise trigger a full history refetch for every selected symbol.
  // Live data (market cap, currency) is read at render time from the prop.
  React.useEffect(() => {
    if (!open || stocks.length === 0) return;
    const cfg = TIMEFRAMES.find((t) => t.key === tf)!;
    let cancelled = false;
    setLoading(true);
    setErrors([]);

    const tasks = stocks.map((stock, idx) =>
      fetchHistory(stock.symbol, cfg.range, cfg.interval)
        .then((pts) => {
          if (pts.length < 2) {
            return { kind: 'err' as const, symbol: stock.symbol, message: 'No data' };
          }
          const base = pts[0].close;
          const pct = pts.map((p) => ((p.close - base) / base) * 100);
          return {
            kind: 'ok' as const,
            series: {
              symbol: stock.symbol,
              color: PALETTE[idx % PALETTE.length],
              points: pts,
              pct,
            } satisfies Series,
          };
        })
        .catch((err) => ({
          kind: 'err' as const,
          symbol: stock.symbol,
          message: err instanceof Error ? err.message : 'Failed',
        })),
    );

    Promise.all(tasks).then((results) => {
      if (cancelled) return;
      const okSeries: Series[] = [];
      const errs: string[] = [];
      for (const r of results) {
        if (r.kind === 'ok') okSeries.push(r.series);
        else errs.push(`${r.symbol}: ${r.message}`);
      }
      setSeries(okSeries);
      setErrors(errs);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tf, stocksKey]);

  const containerRef = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const update = () => {
      setChartWidth(node.clientWidth || 640);
      setChartHeight(Math.max(380, node.clientHeight || 380));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
  }, []);

  if (stocks.length === 0) return null;

  const intraday = tf === '1D' || tf === '1W';

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
              对比 {stocks.length} 只股票（按起点归一化为 0%）
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Compare {stocks.length} stocks — each rebased to 0% at the start of the selected timeframe.
            </Typography>
          </BoxAny>
          <IconButton onClick={onClose} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
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

        <BoxAny ref={containerRef} sx={{ mt: 1.5, minHeight: 'calc(100vh - 220px)' }}>
          {loading && series.length === 0 ? (
            <BoxAny sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={28} />
            </BoxAny>
          ) : (
            <CompareChart
              series={series}
              width={chartWidth}
              height={chartHeight}
              intraday={intraday}
              hiddenSymbols={hiddenSymbols}
              liveQuotes={liveQuotes}
            />
          )}
        </BoxAny>

        {/* Legend — click any chip to hide/show its curve. Hidden = dimmed + strike-through. */}
        <BoxAny sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.5 }}>
          {series.map((s) => {
            const hidden = hiddenSymbols.has(s.symbol);
            const last = s.pct[s.pct.length - 1];
            const stock = stocks.find((x) => x.symbol === s.symbol);
            const cn = stock?.nameZh && stock.nameZh !== stock.name ? stock.nameZh : stock?.name ?? '';
            return (
              <Chip
                key={s.symbol}
                size="small"
                clickable
                onClick={() => toggleHidden(s.symbol)}
                label={
                  <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <BoxAny
                      sx={{
                        width: 10,
                        height: 10,
                        bgcolor: s.color,
                        borderRadius: '2px',
                        opacity: hidden ? 0.3 : 1,
                      }}
                    />
                    <Typography
                      component="span"
                      variant="caption"
                      fontWeight={700}
                      sx={{ textDecoration: hidden ? 'line-through' : 'none' }}
                    >
                      {s.symbol}
                    </Typography>
                    <Typography
                      component="span"
                      variant="caption"
                      color="text.secondary"
                      sx={{ textDecoration: hidden ? 'line-through' : 'none' }}
                    >
                      {cn}
                    </Typography>
                    <Typography
                      component="span"
                      variant="caption"
                      sx={{
                        ml: 0.5,
                        fontWeight: 700,
                        color: hidden ? 'text.disabled' : last >= 0 ? '#0a7d27' : '#c62828',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtPct(last)}
                    </Typography>
                  </BoxAny>
                }
                variant="outlined"
                sx={{
                  height: 26,
                  cursor: 'pointer',
                  opacity: hidden ? 0.55 : 1,
                  borderStyle: hidden ? 'dashed' : 'solid',
                  '& .MuiChip-label': { px: 1 },
                  '&:hover': {
                    bgcolor: hidden ? 'rgba(0,0,0,0.04)' : 'rgba(15,23,42,0.06)',
                  },
                }}
                title={hidden ? '点击显示曲线 / Click to show' : '点击隐藏曲线 / Click to hide'}
              />
            );
          })}
        </BoxAny>

        {errors.length > 0 && (
          <Alert severity="warning" sx={{ mt: 1.5 }}>
            <Typography variant="caption">
              {errors.join(' · ')}
            </Typography>
          </Alert>
        )}
      </BoxAny>
    </Drawer>
  );
};

export default StockCompareDrawer;
