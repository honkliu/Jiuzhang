import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  LinearProgress,
  TextField,
  InputAdornment,
  Checkbox,
  Button,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  AutoAwesome as AutoAwesomeIcon,
  ShowChart as ShowChartIcon,
} from '@mui/icons-material';
import type { AppDispatch, RootState } from '@/store';
import { setActiveChat, fetchMessages } from '@/store/chatSlice';
import { chatService } from '@/services/chat.service';
import { signalRService } from '@/services/signalr.service';
import { WA_USER_ID } from '@/utils/chatParticipants';
import { AppHeader } from '@/components/Shared/AppHeader';
import { useLanguage } from '@/i18n/LanguageContext';
import {
  HARDWARE_STOCKS,
  CATEGORY_GROUP_ORDER,
  CATEGORY_GROUPS,
  groupOfCategory,
  formatCompanyName,
  shortCategoryLabel,
  type CategoryGroup,
  type HardwareStock,
} from '@/data/hardwareStocks';
import {
  fetchStockSnapshots,
  fetchQuotes,
  type StockSnapshot,
  type BuyIntention,
  type LiveQuote,
} from '@/services/stocks.service';
import { Sparkline } from './Sparkline';
import { StockChartDrawer } from './StockChartDrawer';
import { StockCompareDrawer } from './StockCompareDrawer';

const BoxAny = Box as any;

type RowState =
  | { kind: 'loading' }
  | { kind: 'ok'; snap: StockSnapshot }
  | { kind: 'error'; message: string };

type Row = HardwareStock & { state: RowState };

type SortKey =
  | 'symbol'
  | 'name'
  | 'category'
  | 'price'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'sixMonth'
  | 'oneYear'
  | 'twoYear'
  | 'score'
  | 'trend';

const COLUMNS: { key: SortKey; label: string; numeric: boolean; align?: 'left' | 'right'; width?: number }[] = [
  { key: 'symbol',   label: 'Symbol',   numeric: false, align: 'left' },
  { key: 'name',     label: 'Company',  numeric: false, align: 'left' },
  { key: 'category', label: 'Cat',      numeric: false, align: 'left', width: 72 },
  { key: 'price',    label: 'Price',    numeric: true,  align: 'right' },
  { key: 'daily',    label: '1D',       numeric: true,  align: 'right' },
  { key: 'weekly',   label: '1W',       numeric: true,  align: 'right' },
  { key: 'monthly',  label: '1M',       numeric: true,  align: 'right' },
  { key: 'sixMonth', label: '6M',       numeric: true,  align: 'right' },
  { key: 'oneYear',  label: '1Y',       numeric: true,  align: 'right' },
  { key: 'twoYear',  label: '2Y',       numeric: true,  align: 'right' },
  { key: 'score',    label: 'Intention',numeric: true,  align: 'left'  },
  { key: 'trend',    label: 'Trend',    numeric: false, align: 'left',  width: 120 },
];

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

function pctColor(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return 'text.secondary';
  if (n > 0.05) return '#0a7d27';
  if (n < -0.05) return '#c62828';
  return 'text.primary';
}

function intentionColor(i: BuyIntention): {
  bg: string; fg: string;
} {
  switch (i) {
    case 'Strong Buy':  return { bg: '#0a7d27', fg: '#fff' };
    case 'Buy':         return { bg: '#9fd6a8', fg: '#0a3b13' };
    case 'Hold':        return { bg: '#e0e0e0', fg: '#37474f' };
    case 'Sell':        return { bg: '#ffcdd2', fg: '#7f1d1d' };
    case 'Strong Sell': return { bg: '#c62828', fg: '#fff' };
  }
}

/**
 * Build the markdown payload we hand off to 洛.
 *
 * Strategy per user direction: send EVERYTHING — full table with every
 * column from the watchlist, full per-stock detail (SMAs, volatility,
 * algorithm score + rationale). 洛 is good at parsing wide markdown
 * tables and we shouldn't pre-digest the data for it.
 *
 * Markdown rules that matter:
 *  - Each table row on its own line (remark-gfm requirement).
 *  - Prose separator is middle-dot ' · ', not pipe — pipes outside a
 *    table can confuse the row-flatten heuristics downstream.
 */
function serializeStocks(picks: Array<HardwareStock & { snap: StockSnapshot; live?: LiveQuote }>): string {
  const lines: string[] = [];
  const fmt = (n: number | null) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`);
  const fmtN = (n: number | null) => (n == null ? '—' : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  lines.push('请帮我分析以下硬件股票（数据来自 Yahoo Finance，最长两年日线）。');
  lines.push('我希望你给出：');
  lines.push('1. 每只股票的简短点评（基本面 / 当前估值 / 近期催化剂）；');
  lines.push('2. 横向对比，指出当前最值得关注的 1-3 只；');
  lines.push('3. 主要风险点；');
  lines.push('4. 短期（1-3 个月）与中期（6-12 个月）操作思路。');
  lines.push('');
  lines.push('## 选中标的（完整数据）');
  lines.push('');
  lines.push('| Symbol | 公司 | 分类 | 现价 | 1D | 1W | 1M | 6M | 1Y | 2Y | 倾向 | Score |');
  lines.push('| :--- | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- | ---: |');
  for (const p of picks) {
    const s = p.snap;
    const price = (p.live?.price ?? s.price).toFixed(2);
    const cn = p.nameZh && p.nameZh !== p.name ? `${p.nameZh} - ${p.name}` : p.name;
    // Escape `$` as `\$` so MessageBubble's math-mode preprocessor doesn't
    // treat the price as opening math and eat the row's pipes.
    lines.push(
      `| ${p.symbol} | ${cn} | ${p.category} | \\$${price} ` +
      `| ${fmt(s.daily)} | ${fmt(s.weekly)} | ${fmt(s.monthly)} | ${fmt(s.sixMonth)} | ${fmt(s.oneYear)} | ${fmt(s.twoYear)} ` +
      `| ${s.intention} | ${s.score} |`,
    );
  }
  lines.push('');
  lines.push('## 技术指标 & 算法理由');
  lines.push('');
  for (const p of picks) {
    const s = p.snap;
    const cn = p.nameZh && p.nameZh !== p.name ? `${p.nameZh}（${p.name}）` : p.name;
    lines.push(`### ${p.symbol} · ${cn}`);
    lines.push(`- 分类：${p.category} · 交易所：${p.exchange}` + (p.blurb ? ` · ${p.blurb}` : ''));
    lines.push(
      `- SMA20 ${fmtN(s.sma20)} · SMA50 ${fmtN(s.sma50)} · SMA200 ${fmtN(s.sma200)}` +
      (s.volatility != null ? ` · 年化波动率 ${(s.volatility * 100).toFixed(1)}%` : ''),
    );
    const rationale = s.rationale.replace(/\s*\|\s*/g, ' · ');
    lines.push(`- **${s.intention}**（score ${s.score}）：${rationale}`);
    lines.push('');
  }
  lines.push('注：买入倾向与 score 是基于均线/动量/波动率的简单算法评分，仅供参考，不构成投资建议。');
  return lines.join('\n');
}

function sortValue(row: Row, key: SortKey): number | string {
  if (key === 'symbol') return row.symbol;
  if (key === 'name') return formatCompanyName(row);
  if (key === 'category') return row.category;
  if (row.state.kind !== 'ok') return key === 'price' || key === 'score' ? -Infinity : -Infinity;
  const s = row.state.snap;
  switch (key) {
    case 'price':    return s.price;
    case 'daily':    return s.daily ?? -Infinity;
    case 'weekly':   return s.weekly ?? -Infinity;
    case 'monthly':  return s.monthly ?? -Infinity;
    case 'sixMonth': return s.sixMonth ?? -Infinity;
    case 'oneYear':  return s.oneYear ?? -Infinity;
    case 'twoYear':  return s.twoYear ?? -Infinity;
    case 'score':    return s.score;
    case 'trend':    return s.oneYear ?? -Infinity;
  }
}

export const StocksPage: React.FC = () => {
  const { language, t } = useLanguage();
  const isZh = language === 'zh';
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const chats = useSelector((state: RootState) => state.chat.chats);

  const [rows, setRows] = React.useState<Row[]>(() =>
    HARDWARE_STOCKS.map((s) => ({ ...s, state: { kind: 'loading' as const } })),
  );
  const [refreshing, setRefreshing] = React.useState(true);
  const [lastUpdated, setLastUpdated] = React.useState<number | null>(null);
  const [lastLiveTick, setLastLiveTick] = React.useState<number | null>(null);
  const [globalError, setGlobalError] = React.useState<string | null>(null);
  const [sortKey, setSortKey] = React.useState<SortKey>('score');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');
  const [categoryFilter, setCategoryFilter] = React.useState<CategoryGroup | 'all'>('all');
  const [search, setSearch] = React.useState('');
  const [progress, setProgress] = React.useState({ done: 0, total: HARDWARE_STOCKS.length });
  const [drawerSymbol, setDrawerSymbol] = React.useState<string | null>(null);
  const [marketState, setMarketState] = React.useState<string | null>(null);
  /** Latest live quote per symbol — used to overlay real-time price on the row. */
  const [liveQuotes, setLiveQuotes] = React.useState<Map<string, LiveQuote>>(() => new Map());
  /** Symbols the user has ticked for Ask-洛. */
  const [checkedIds, setCheckedIds] = React.useState<Set<string>>(new Set());
  const [askingLuo, setAskingLuo] = React.useState(false);
  const [askLuoError, setAskLuoError] = React.useState<string | null>(null);
  const [compareOpen, setCompareOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setRefreshing(true);
    setGlobalError(null);
    setProgress({ done: 0, total: HARDWARE_STOCKS.length });
    setRows((prev) => prev.map((r) => ({ ...r, state: { kind: 'loading' } })));

    // We fetch in small concurrent batches so we can stream rows in.
    const batchSize = 6;
    const symbols = HARDWARE_STOCKS.map((s) => s.symbol);
    let cursor = 0;
    let anySuccess = false;

    const workers: Promise<void>[] = [];
    for (let w = 0; w < batchSize; w++) {
      workers.push((async () => {
        while (true) {
          const i = cursor++;
          if (i >= symbols.length) return;
          try {
            const [snap] = await fetchStockSnapshots([symbols[i]], 1);
            setRows((prev) => {
              const next = prev.slice();
              if ('error' in snap) {
                next[i] = { ...next[i], state: { kind: 'error', message: snap.error } };
              } else {
                next[i] = { ...next[i], state: { kind: 'ok', snap } };
                anySuccess = true;
              }
              return next;
            });
          } catch (err) {
            setRows((prev) => {
              const next = prev.slice();
              next[i] = {
                ...next[i],
                state: { kind: 'error', message: err instanceof Error ? err.message : 'failed' },
              };
              return next;
            });
          } finally {
            setProgress((p) => ({ ...p, done: p.done + 1 }));
          }
        }
      })());
    }

    await Promise.all(workers);
    setRefreshing(false);
    setLastUpdated(Date.now());
    if (!anySuccess) {
      setGlobalError(
        isZh
          ? '所有股票数据请求都失败了。请检查服务端是否能访问 Yahoo Finance，或稍后重试。'
          : 'All requests failed. Check whether the backend can reach Yahoo Finance, or try refreshing.',
      );
    }
  }, [isZh]);

  React.useEffect(() => {
    load();
  }, [load]);

  const toggleChecked = React.useCallback((symbol: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }, []);

  const handleAskLuo = React.useCallback(async () => {
    if (askingLuo) return;
    if (checkedIds.size === 0) return;
    setAskingLuo(true);
    setAskLuoError(null);
    try {
      const picks = rows
        .filter((r) => checkedIds.has(r.symbol) && r.state.kind === 'ok')
        .map((r) => ({
          ...r,
          snap: (r.state as Extract<RowState, { kind: 'ok' }>).snap,
          live: liveQuotes.get(r.symbol),
        }));
      if (picks.length === 0) {
        setAskLuoError(isZh ? '所选股票暂无可用数据' : 'No data for selected stocks');
        return;
      }
      const text = serializeStocks(picks);

      let waChat = chats.find((c) =>
        c.participants?.some((p) => p.userId === WA_USER_ID),
      );
      if (!waChat) {
        waChat = await chatService.createChat({
          participantIds: [WA_USER_ID],
          chatType: 'direct',
        });
      }

      dispatch(setActiveChat(waChat));
      dispatch(fetchMessages({ chatId: waChat.id }));
      navigate('/chats');

      // Give ChatWindow time to mount and join the SignalR group.
      await new Promise((resolve) => setTimeout(resolve, 2000));

      await signalRService.sendMessage({
        chatId: waChat.id,
        messageType: 'text',
        text,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to send to 洛';
      setAskLuoError(msg);
    } finally {
      setAskingLuo(false);
    }
  }, [askingLuo, checkedIds, rows, liveQuotes, chats, dispatch, navigate, isZh]);

  /**
   * Stable joined list of symbols that have successful snapshots — used as the
   * polling dep so the interval isn't recreated on every streaming row update.
   */
  const okSymbolsKey = React.useMemo(
    () =>
      rows
        .filter((r) => r.state.kind === 'ok')
        .map((r) => r.symbol)
        .sort()
        .join(','),
    [rows],
  );

  /**
   * Live-quote polling: every 30s pull a batched quote for every symbol that
   * loaded successfully and merge price/asOf back into the row. We don't
   * refetch full history — that stays cached from the initial heavy load.
   * Polling pauses when the page is hidden to save backend churn.
   */
  React.useEffect(() => {
    if (!okSymbolsKey) return;
    const okSymbols = okSymbolsKey.split(',');

    let cancelled = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const map = await fetchQuotes(okSymbols);
        if (cancelled) return;
        setLiveQuotes(map);
        setLastLiveTick(Date.now());
        for (const q of map.values()) {
          setMarketState(q.marketState);
          break;
        }
      } catch {
        // Soft fail — table still shows the last good snapshot.
      }
    };

    tick(); // immediate tick so the user sees live data right after initial load
    const id = window.setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [okSymbolsKey]);

  const filtered = React.useMemo(() => {
    const qUpper = search.trim().toUpperCase();
    const q = search.trim();
    return rows.filter((r) => {
      if (categoryFilter !== 'all' && groupOfCategory(r.category) !== categoryFilter) return false;
      if (q) {
        const matchesSymbol = r.symbol.includes(qUpper);
        const matchesName = r.name.toUpperCase().includes(qUpper);
        const matchesNameZh = r.nameZh.includes(q);
        if (!matchesSymbol && !matchesName && !matchesNameZh) return false;
      }
      return true;
    });
  }, [rows, categoryFilter, search]);

  const sorted = React.useMemo(() => {
    const arr = filtered.slice();
    arr.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (typeof va === 'string' && typeof vb === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      const na = typeof va === 'number' ? va : Number(va);
      const nb = typeof vb === 'number' ? vb : Number(vb);
      return sortDir === 'asc' ? na - nb : nb - na;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'symbol' || key === 'name' || key === 'category' ? 'asc' : 'desc');
    }
  };

  const okCount = rows.filter((r) => r.state.kind === 'ok').length;
  const errCount = rows.filter((r) => r.state.kind === 'error').length;

  return (
    <BoxAny sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppHeader />

      {/* Spacer for fixed AppBar */}
      <BoxAny sx={{ height: { xs: 53, sm: 61 } }} />

      <BoxAny sx={{ maxWidth: 1600, mx: 'auto', px: { xs: 1.25, sm: 2.5 }, py: 2 }}>
        {/* Title + meta */}
        <BoxAny sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 1.5, mb: 1 }}>
          <Typography variant="h5" fontWeight={700}>
            {isZh ? '硬件股票' : 'Hardware Stocks'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {isZh
              ? `${HARDWARE_STOCKS.length} 只精选硬件公司 · GPU / CPU / 存储 / 网络`
              : `${HARDWARE_STOCKS.length} curated hardware names · GPU / CPU / Storage / Network`}
          </Typography>
          <BoxAny sx={{ flexGrow: 1 }} />
          {marketState && (
            <Chip
              size="small"
              label={
                marketState === 'REGULAR' ? (isZh ? '盘中' : 'Market open') :
                marketState === 'PRE' || marketState === 'PREPRE' ? (isZh ? '盘前' : 'Pre-market') :
                marketState === 'POST' || marketState === 'POSTPOST' ? (isZh ? '盘后' : 'After-hours') :
                (isZh ? '休市' : 'Closed')
              }
              sx={{
                height: 22,
                fontSize: '0.72rem',
                fontWeight: 600,
                bgcolor: marketState === 'REGULAR' ? '#e8f5e9' : '#eceff1',
                color: marketState === 'REGULAR' ? '#1b5e20' : '#37474f',
              }}
            />
          )}
          <Typography variant="caption" color="text.secondary">
            {lastUpdated
              ? (isZh ? '更新于 ' : 'Updated ') + new Date(lastUpdated).toLocaleTimeString()
              : (isZh ? '加载中...' : 'Loading...')}
            {lastLiveTick && (
              <>
                {' · '}
                <Typography component="span" variant="caption" sx={{ color: '#0a7d27' }}>
                  ● {isZh ? '实时 ' : 'Live '}
                  {new Date(lastLiveTick).toLocaleTimeString()}
                </Typography>
              </>
            )}
            {' '}
            · {okCount} ok / {errCount} err
          </Typography>
          <Tooltip title={isZh ? '刷新' : 'Refresh'}>
            <span>
              <IconButton onClick={load} disabled={refreshing} size="small">
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </BoxAny>

        {/* Source disclosure */}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          {isZh
            ? '数据来源：Yahoo Finance 公开图表接口（经本应用服务端转发，无第三方代理）。最长两年日线，含本日。买入倾向为基于均线/动量/波动率的算法评分，非投资建议。'
            : 'Source: Yahoo Finance public chart endpoint, proxied through this app’s own backend (no third-party CORS proxies). Up to 2 years of daily candles. The buy intention is a transparent algorithmic blend of SMA position, 1-month momentum and volatility — informational only, not investment advice.'}
        </Typography>

        {/* Filters */}
        <BoxAny sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mb: 1.5 }}>
          <ToggleButtonGroup
            value={categoryFilter}
            exclusive
            size="small"
            onChange={(_, v) => v && setCategoryFilter(v)}
            sx={{ flexWrap: 'wrap' }}
          >
            <ToggleButton value="all">
              {isZh ? '全部' : 'All'} ({HARDWARE_STOCKS.length})
            </ToggleButton>
            {CATEGORY_GROUP_ORDER.map((g) => {
              const subs = CATEGORY_GROUPS[g];
              const count = HARDWARE_STOCKS.filter((s) => subs.includes(s.category)).length;
              return (
                <ToggleButton
                  key={g}
                  value={g}
                  title={subs.join(' + ')}
                >
                  {g} ({count})
                </ToggleButton>
              );
            })}
          </ToggleButtonGroup>

          <BoxAny sx={{ flexGrow: 1 }} />

          <Button
            variant="outlined"
            size="small"
            startIcon={<ShowChartIcon />}
            disabled={checkedIds.size < 1}
            onClick={() => setCompareOpen(true)}
            sx={{ textTransform: 'none', fontWeight: 600 }}
            title={isZh ? '按起点归一化为 0%，比较多只股票的涨跌幅' : 'Rebased to 0% at start, compare multiple stocks'}
          >
            {isZh ? '对比图表' : 'Compare chart'} ({checkedIds.size})
          </Button>

          <Button
            variant="contained"
            size="small"
            startIcon={<AutoAwesomeIcon />}
            disabled={askingLuo || checkedIds.size === 0}
            onClick={handleAskLuo}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {askingLuo
              ? (isZh ? '发送中…' : 'Sending…')
              : `${isZh ? '问' : 'Ask'} ${t('Wa')} (${checkedIds.size})`}
          </Button>

          <TextField
            size="small"
            placeholder={isZh ? '搜索代码或公司' : 'Search symbol or company'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 240 }}
          />
        </BoxAny>

        {/* Streaming progress */}
        {refreshing && (
          <BoxAny sx={{ mb: 1 }}>
            <LinearProgress
              variant="determinate"
              value={(progress.done / progress.total) * 100}
              sx={{ height: 4, borderRadius: 2 }}
            />
            <Typography variant="caption" color="text.secondary">
              {progress.done} / {progress.total}
            </Typography>
          </BoxAny>
        )}

        {globalError && (
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            {globalError}
          </Alert>
        )}
        {askLuoError && (
          <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setAskLuoError(null)}>
            {askLuoError}
          </Alert>
        )}

        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" sx={{ bgcolor: '#f5f7fb' }}>
                  {(() => {
                    const eligible = sorted.filter((r) => r.state.kind === 'ok');
                    const eligibleSymbols = eligible.map((r) => r.symbol);
                    const checkedHere = eligibleSymbols.filter((s) => checkedIds.has(s));
                    const allChecked = eligible.length > 0 && checkedHere.length === eligible.length;
                    const someChecked = checkedHere.length > 0 && !allChecked;
                    return (
                      <Checkbox
                        size="small"
                        disabled={eligible.length === 0}
                        checked={allChecked}
                        indeterminate={someChecked}
                        onChange={() => {
                          setCheckedIds((prev) => {
                            const next = new Set(prev);
                            if (allChecked) {
                              for (const s of eligibleSymbols) next.delete(s);
                            } else {
                              for (const s of eligibleSymbols) next.add(s);
                            }
                            return next;
                          });
                        }}
                      />
                    );
                  })()}
                </TableCell>
                {COLUMNS.map((col) => (
                  <TableCell
                    key={col.key}
                    align={col.align}
                    sx={{
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      bgcolor: '#f5f7fb',
                      ...(col.width ? { width: col.width, maxWidth: col.width } : {}),
                    }}
                  >
                    <TableSortLabel
                      active={sortKey === col.key}
                      direction={sortKey === col.key ? sortDir : 'asc'}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((row) => {
                const baseSnap = row.state.kind === 'ok' ? row.state.snap : null;
                const live = baseSnap ? liveQuotes.get(row.symbol) : undefined;
                // If we have a live quote, overlay it onto a display snapshot
                // without mutating the cached history-derived metrics.
                const s: StockSnapshot | null = baseSnap && live
                  ? {
                      ...baseSnap,
                      price: live.price,
                      asOf: live.asOf,
                      daily: live.previousClose
                        ? ((live.price - live.previousClose) / live.previousClose) * 100
                        : baseSnap.daily,
                      currency: live.currency || baseSnap.currency,
                    }
                  : baseSnap;
                return (
                  <TableRow
                    key={row.symbol}
                    hover
                    onClick={() => setDrawerSymbol(row.symbol)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell
                      padding="checkbox"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        size="small"
                        disabled={row.state.kind !== 'ok'}
                        checked={checkedIds.has(row.symbol)}
                        onChange={() => toggleChecked(row.symbol)}
                      />
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                      {row.symbol}
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
                        {row.exchange}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={row.blurb || ''} placement="top">
                        <span>{formatCompanyName(row)}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ width: 72, py: 0.5 }}>
                      <Tooltip title={row.category} placement="top">
                        <Chip
                          size="small"
                          label={shortCategoryLabel(row.category)}
                          variant="outlined"
                          sx={{
                            height: 20,
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            '& .MuiChip-label': { px: 0.75 },
                          }}
                        />
                      </Tooltip>
                    </TableCell>

                    {row.state.kind === 'loading' ? (
                      <TableCell colSpan={9} align="center">
                        <CircularProgress size={14} />
                      </TableCell>
                    ) : row.state.kind === 'error' ? (
                      <TableCell colSpan={9}>
                        <Typography variant="caption" color="error">
                          {row.state.message}
                        </Typography>
                      </TableCell>
                    ) : (
                      <>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                          {fmtPrice(s!.price, s!.currency)}
                        </TableCell>
                        <TableCell align="right" sx={{ color: pctColor(s!.daily), fontVariantNumeric: 'tabular-nums' }}>
                          {fmtPct(s!.daily)}
                        </TableCell>
                        <TableCell align="right" sx={{ color: pctColor(s!.weekly), fontVariantNumeric: 'tabular-nums' }}>
                          {fmtPct(s!.weekly)}
                        </TableCell>
                        <TableCell align="right" sx={{ color: pctColor(s!.monthly), fontVariantNumeric: 'tabular-nums' }}>
                          {fmtPct(s!.monthly)}
                        </TableCell>
                        <TableCell align="right" sx={{ color: pctColor(s!.sixMonth), fontVariantNumeric: 'tabular-nums' }}>
                          {fmtPct(s!.sixMonth)}
                        </TableCell>
                        <TableCell align="right" sx={{ color: pctColor(s!.oneYear), fontVariantNumeric: 'tabular-nums' }}>
                          {fmtPct(s!.oneYear)}
                        </TableCell>
                        <TableCell align="right" sx={{ color: pctColor(s!.twoYear), fontVariantNumeric: 'tabular-nums' }}>
                          {fmtPct(s!.twoYear)}
                        </TableCell>
                        <TableCell>
                          <Tooltip
                            title={
                              <BoxAny sx={{ maxWidth: 280 }}>
                                <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>
                                  Score: {s!.score}
                                </Typography>
                                <Typography variant="caption" sx={{ display: 'block' }}>
                                  {s!.rationale}
                                </Typography>
                                <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.7 }}>
                                  SMA20 {fmtPrice(s!.sma20)} · SMA50 {fmtPrice(s!.sma50)} · SMA200 {fmtPrice(s!.sma200)}
                                </Typography>
                                {s!.volatility != null && (
                                  <Typography variant="caption" sx={{ display: 'block', opacity: 0.7 }}>
                                    Ann. vol: {(s!.volatility * 100).toFixed(1)}%
                                  </Typography>
                                )}
                              </BoxAny>
                            }
                            placement="left"
                          >
                            <Chip
                              size="small"
                              label={s!.intention}
                              sx={{
                                fontWeight: 700,
                                bgcolor: intentionColor(s!.intention).bg,
                                color: intentionColor(s!.intention).fg,
                              }}
                            />
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ width: 120, py: 0.25 }}>
                          <Sparkline values={s!.closes} trailing={252} width={110} height={26} />
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                );
              })}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COLUMNS.length + 1} align="center">
                    <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                      {isZh ? '没有匹配的股票' : 'No matching stocks'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </BoxAny>

      {(() => {
        const drawerRow = drawerSymbol
          ? rows.find((r) => r.symbol === drawerSymbol) ?? null
          : null;
        const drawerSnap =
          drawerRow && drawerRow.state.kind === 'ok' ? drawerRow.state.snap : null;
        const drawerLive = drawerSymbol ? liveQuotes.get(drawerSymbol) : undefined;
        const livePrice = drawerLive?.price ?? drawerSnap?.price ?? null;
        const liveChangePct = drawerLive?.previousClose
          ? ((drawerLive.price - drawerLive.previousClose) / drawerLive.previousClose) * 100
          : drawerSnap?.daily ?? null;
        return (
          <StockChartDrawer
            open={!!drawerSymbol}
            onClose={() => setDrawerSymbol(null)}
            stock={drawerRow}
            livePrice={livePrice}
            liveChangePct={liveChangePct}
            currency={drawerLive?.currency ?? drawerSnap?.currency ?? 'USD'}
            marketState={drawerLive?.marketState ?? undefined}
            preloadedCloses={drawerSnap?.closes}
            preloadedTimestamps={drawerSnap?.timestamps}
          />
        );
      })()}

      <StockCompareDrawer
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        stocks={rows.filter((r) => checkedIds.has(r.symbol))}
        liveQuotes={liveQuotes}
      />
    </BoxAny>
  );
};

export default StocksPage;
