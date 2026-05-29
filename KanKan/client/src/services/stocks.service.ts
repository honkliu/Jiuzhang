/**
 * Stocks service - derives multi-timeframe performance metrics and a
 * transparent buy-intention rating from Yahoo Finance daily candles.
 *
 * All HTTP calls go through our own backend at /api/stocks/* so we avoid
 * browser CORS issues and corporate-network blocks on public CORS proxies.
 *
 * Three public functions:
 *   - fetchStockSnapshot / fetchStockSnapshots: full 2-year history + derived
 *     metrics. Heavy; call once at page load / manual refresh.
 *   - fetchQuotes: lightweight live prices for many symbols (one HTTP call).
 *     Cheap; poll every 30s.
 *   - fetchHistory: raw close series for arbitrary range/interval; used by
 *     the chart drawer when the user clicks a row.
 */

import apiClient from '@/utils/api';

const STOCKS_BASE = '/stocks';

export type BuyIntention =
  | 'Strong Buy'
  | 'Buy'
  | 'Hold'
  | 'Sell'
  | 'Strong Sell';

export interface StockSnapshot {
  symbol: string;
  /** Price in the instrument's native currency. */
  price: number;
  currency: string;
  /** Latest trading session date in ms since epoch (UTC). */
  asOf: number;
  /** Percent returns (e.g. 1.23 == +1.23%). null if not enough history. */
  daily: number | null;
  weekly: number | null;
  monthly: number | null;
  sixMonth: number | null;
  oneYear: number | null;
  twoYear: number | null;
  /** Simple moving averages, useful for context. */
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  /** Annualized volatility from last ~60 trading days (decimal, 0.30 == 30%). */
  volatility: number | null;
  /** -100..+100 score the rating is derived from (also useful as a debug column). */
  score: number;
  intention: BuyIntention;
  rationale: string;
  /** Full daily close series — kept around so sparklines need no extra fetch. */
  closes: number[];
  /** Trading-day timestamps (seconds since epoch, aligned with closes). */
  timestamps: number[];
}

/** Live quote returned by /api/stocks/quote. */
export interface LiveQuote {
  symbol: string;
  price: number;
  /** Previous close — used to compute the day-change for after-hours. */
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  marketState: 'PRE' | 'REGULAR' | 'POST' | 'POSTPOST' | 'CLOSED' | 'PREPRE' | string;
  asOf: number;
  currency: string;
  /** Market capitalization in the instrument's currency (raw integer). */
  marketCap: number | null;
}

/** A single candle from /api/stocks/chart, kept generic so the chart drawer can request any range/interval. */
export interface HistoryPoint {
  t: number; // ms since epoch
  close: number;
}

export class StocksServiceError extends Error {
  constructor(message: string, readonly symbol?: string) {
    super(message);
    this.name = 'StocksServiceError';
  }
}

interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: {
        currency: string;
        regularMarketPrice: number;
        regularMarketTime: number;
      };
      timestamp: number[];
      indicators: {
        quote: Array<{
          close: Array<number | null>;
        }>;
      };
    }> | null;
    error: { code: string; description: string } | null;
  };
}

interface YahooQuoteResponse {
  quoteResponse: {
    result: Array<{
      symbol: string;
      regularMarketPrice?: number;
      regularMarketPreviousClose?: number;
      regularMarketChange?: number;
      regularMarketChangePercent?: number;
      regularMarketTime?: number;
      postMarketPrice?: number;
      postMarketChange?: number;
      postMarketChangePercent?: number;
      postMarketTime?: number;
      preMarketPrice?: number;
      preMarketChange?: number;
      preMarketChangePercent?: number;
      preMarketTime?: number;
      marketState?: string;
      currency?: string;
      marketCap?: number;
    }>;
    error: { code: string; description: string } | null;
  };
}

/** Normalize axios/native errors into a stable message string. */
function readAxiosMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const aerr = err as { response?: { status?: number; data?: unknown }; message?: string };
    if (aerr.response?.status) {
      const data = aerr.response.data as { error?: string } | undefined;
      return data?.error ?? `HTTP ${aerr.response.status}`;
    }
    if (aerr.message) return aerr.message;
  }
  if (err instanceof Error) return err.message;
  return 'unknown error';
}

/** Fetch raw chart JSON via our backend. */
async function fetchYahooChart(
  symbol: string,
  range = '2y',
  interval = '1d',
): Promise<YahooChartResponse> {
  try {
    const res = await apiClient.get<YahooChartResponse>(
      `${STOCKS_BASE}/chart/${encodeURIComponent(symbol)}`,
      { params: { range, interval } },
    );
    const json = res.data;
    if (json?.chart?.error) {
      throw new Error(json.chart.error.description || json.chart.error.code);
    }
    if (!json?.chart?.result?.length) {
      throw new Error('Empty chart payload');
    }
    return json;
  } catch (err: unknown) {
    throw new StocksServiceError(`Failed to fetch ${symbol}: ${readAxiosMessage(err)}`, symbol);
  }
}

/** Strip nulls from the close series and align with timestamps. */
function cleanSeries(timestamps: number[], rawCloses: Array<number | null>) {
  const ts: number[] = [];
  const close: number[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const c = rawCloses[i];
    if (c == null || !Number.isFinite(c)) continue;
    ts.push(timestamps[i]);
    close.push(c);
  }
  return { ts, close };
}

function pctChange(curr: number, prev: number | undefined | null): number | null {
  if (prev == null || !Number.isFinite(prev) || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function sma(values: number[], window: number): number | null {
  if (values.length < window) return null;
  let sum = 0;
  for (let i = values.length - window; i < values.length; i++) sum += values[i];
  return sum / window;
}

/** Annualized stdev of daily log returns over the trailing window. */
function annualizedVol(closes: number[], window = 60): number | null {
  if (closes.length < window + 1) return null;
  const start = closes.length - window - 1;
  const rets: number[] = [];
  for (let i = start + 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const curr = closes[i];
    if (prev > 0 && curr > 0) rets.push(Math.log(curr / prev));
  }
  if (rets.length < 2) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

/**
 * Buy intention is a transparent linear blend - not a recommendation, just a
 * compact signal anyone can audit. Components:
 *  +30  if price > SMA200      (long-term uptrend)
 *  +20  if price > SMA50       (mid-term uptrend)
 *  +15  if SMA50 > SMA200      (golden-cross-ish bias)
 *  + 1-month return (capped +/-25)
 *  - 0.5 * annualized vol %    (penalize choppiness)
 *  - 25 if 6-month return < -20% (avoid catching knives)
 */
function scoreToIntention(score: number): BuyIntention {
  if (score >= 55) return 'Strong Buy';
  if (score >= 25) return 'Buy';
  if (score >= -15) return 'Hold';
  if (score >= -40) return 'Sell';
  return 'Strong Sell';
}

function buildRationale(parts: string[]): string {
  return parts.length ? parts.join(' | ') : 'Neutral technical picture.';
}

export async function fetchStockSnapshot(symbol: string): Promise<StockSnapshot> {
  const json = await fetchYahooChart(symbol);
  const result = json.chart.result![0];
  const { timestamp, indicators, meta } = result;
  const { ts, close } = cleanSeries(timestamp, indicators.quote[0].close);

  if (close.length < 2) {
    throw new StocksServiceError(`Insufficient history for ${symbol}`, symbol);
  }

  const last = close.length - 1;
  const price = close[last];

  // Trading-day offsets - approximate calendar windows in market days.
  const at = (offset: number) => (last - offset >= 0 ? close[last - offset] : null);
  const daily = pctChange(price, at(1));
  const weekly = pctChange(price, at(5));
  const monthly = pctChange(price, at(21));
  const sixMonth = pctChange(price, at(126));
  const oneYear = pctChange(price, at(252));
  const twoYear = pctChange(price, close[0]);

  const sma20 = sma(close, 20);
  const sma50 = sma(close, 50);
  const sma200 = sma(close, 200);
  const volatility = annualizedVol(close);

  let score = 0;
  const parts: string[] = [];

  if (sma200 != null && price > sma200) {
    score += 30;
    parts.push('Above 200d SMA');
  } else if (sma200 != null && price < sma200) {
    score -= 15;
    parts.push('Below 200d SMA');
  }

  if (sma50 != null && price > sma50) {
    score += 20;
    parts.push('Above 50d SMA');
  } else if (sma50 != null && price < sma50) {
    score -= 10;
  }

  if (sma50 != null && sma200 != null) {
    if (sma50 > sma200) {
      score += 15;
      parts.push('50d > 200d');
    } else {
      score -= 10;
    }
  }

  if (monthly != null) {
    const capped = Math.max(-25, Math.min(25, monthly));
    score += capped;
    if (Math.abs(monthly) >= 5) {
      parts.push(`${monthly >= 0 ? '+' : ''}${monthly.toFixed(1)}% 1m`);
    }
  }

  if (volatility != null) {
    const volPct = volatility * 100;
    score -= 0.5 * volPct;
    if (volPct >= 50) parts.push(`high vol ${volPct.toFixed(0)}%`);
  }

  if (sixMonth != null && sixMonth < -20) {
    score -= 25;
    parts.push('6m drawdown');
  }

  score = Math.max(-100, Math.min(100, score));

  return {
    symbol,
    price,
    currency: meta.currency || 'USD',
    asOf: (meta.regularMarketTime ?? ts[ts.length - 1]) * 1000,
    daily,
    weekly,
    monthly,
    sixMonth,
    oneYear,
    twoYear,
    sma20,
    sma50,
    sma200,
    volatility,
    score: Math.round(score),
    intention: scoreToIntention(score),
    rationale: buildRationale(parts),
    closes: close,
    timestamps: ts,
  };
}

/**
 * Fetch many symbols in parallel with a small concurrency cap.
 * Failures are returned as `{ symbol, error }` per slot.
 */
export async function fetchStockSnapshots(
  symbols: string[],
  concurrency = 6,
): Promise<Array<StockSnapshot | { symbol: string; error: string }>> {
  const results: Array<StockSnapshot | { symbol: string; error: string }> = new Array(symbols.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= symbols.length) return;
      const sym = symbols[i];
      try {
        results[i] = await fetchStockSnapshot(sym);
      } catch (err) {
        results[i] = {
          symbol: sym,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, symbols.length) }, () => worker()),
  );
  return results;
}

/**
 * Fetch live quotes for many symbols in ONE backend call. Use this for
 * periodic polling - it's far cheaper than refetching full chart history.
 * Returns a map so callers can look up by symbol without scanning.
 */
export async function fetchQuotes(symbols: string[]): Promise<Map<string, LiveQuote>> {
  if (symbols.length === 0) return new Map();
  try {
    const res = await apiClient.get<YahooQuoteResponse>(`${STOCKS_BASE}/quote`, {
      params: { symbols: symbols.join(',') },
    });
    const out = new Map<string, LiveQuote>();
    const arr = res.data?.quoteResponse?.result ?? [];
    for (const q of arr) {
      // Prefer post-market price after hours, pre-market before the bell.
      let price = q.regularMarketPrice;
      let change = q.regularMarketChange ?? null;
      let changePct = q.regularMarketChangePercent ?? null;
      let asOfSec = q.regularMarketTime ?? 0;

      if (q.marketState === 'POST' || q.marketState === 'POSTPOST') {
        if (q.postMarketPrice != null) {
          price = q.postMarketPrice;
          // postMarket{Change,ChangePercent} are vs regularMarketPrice — keep regular-day change for table.
          if (q.postMarketTime) asOfSec = q.postMarketTime;
        }
      } else if (q.marketState === 'PRE' || q.marketState === 'PREPRE') {
        if (q.preMarketPrice != null) {
          price = q.preMarketPrice;
          if (q.preMarketTime) asOfSec = q.preMarketTime;
        }
      }

      if (price == null) continue;

      out.set(q.symbol.toUpperCase(), {
        symbol: q.symbol.toUpperCase(),
        price,
        previousClose: q.regularMarketPreviousClose ?? null,
        change,
        changePercent: changePct,
        marketState: q.marketState ?? 'CLOSED',
        asOf: (asOfSec || Math.floor(Date.now() / 1000)) * 1000,
        currency: q.currency ?? 'USD',
        marketCap: q.marketCap ?? null,
      });
    }
    return out;
  } catch (err) {
    throw new StocksServiceError(`Failed to fetch live quotes: ${readAxiosMessage(err)}`);
  }
}

/** Fetch a historical close series for the chart drawer. */
export async function fetchHistory(
  symbol: string,
  range: string,
  interval: string,
): Promise<HistoryPoint[]> {
  const json = await fetchYahooChart(symbol, range, interval);
  const r = json.chart.result![0];
  const { ts, close } = cleanSeries(r.timestamp, r.indicators.quote[0].close);
  const out: HistoryPoint[] = new Array(ts.length);
  for (let i = 0; i < ts.length; i++) out[i] = { t: ts[i] * 1000, close: close[i] };
  return out;
}
