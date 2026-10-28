// Paper-only broker adapter. There is intentionally no configurable live-trading URL.
export const PAPER_URL = 'https://paper-api.alpaca.markets';
const DATA_URL = 'https://data.alpaca.markets';

export interface PaperAccount {
  id: string;
  status: string;
  equity: string;
  last_equity: string;
  cash: string;
  buying_power: string;
  trading_blocked: boolean;
}
export interface PaperPosition {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
}
export interface PaperOrder {
  id: string;
  client_order_id: string;
  symbol: string;
  qty: string;
  side: 'buy' | 'sell';
  type: string;
  status: string;
  limit_price?: string | null;
  created_at: string;
  filled_avg_price?: string | null;
  filled_qty?: string;
}
export interface PaperWatchlist {
  id: string;
  name: string;
  assets?: Array<{symbol: string}>;
}
export interface PaperFill {
  id: string;
  order_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: string;
  price: string;
  transaction_time: string;
}
export interface PaperHistory {
  timestamp: number[];
  equity: number[];
  profit_loss: number[];
  profit_loss_pct: number[];
  base_value?: number;
}
export interface PaperSnapshot {
  latestTrade?: { p: number; t: string };
  latestQuote?: { bp: number; ap: number; t: string };
  minuteBar?: { c: number; t: string };
}

export function paperConfigured() {
  return Boolean(process.env.ALPACA_PAPER_KEY && process.env.ALPACA_PAPER_SECRET);
}
export function liveResearchConfigured() {
  // Current MarketClarity uses Massive + SEC as its primary research feed.
  return Boolean(process.env.MASSIVE_API_KEY);
}
export function paperOrdersEnabled() {
  return process.env.PAPER_TRADE_ENABLED === 'true';
}
export function autoScanEnabled() {
  return process.env.PAPER_AUTO_ENABLED === 'true';
}

async function request<T>(host: string, path: string, init: RequestInit = {}): Promise<T> {
  if (!paperConfigured()) throw new Error('Alpaca paper credentials are not configured.');
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid API path.');
  const headers = new Headers(init.headers);
  headers.set('APCA-API-KEY-ID', process.env.ALPACA_PAPER_KEY!);
  headers.set('APCA-API-SECRET-KEY', process.env.ALPACA_PAPER_SECRET!);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(host + path, {
    ...init, headers, cache: 'no-store', signal: AbortSignal.timeout(16000),
  });
  const raw = await response.text();
  let parsed: unknown;
  try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = { message: raw.slice(0, 200) }; }
  if (!response.ok) {
    const message = (parsed as {message?: string}).message || response.statusText;
    throw new Error('Paper broker (' + response.status + '): ' + String(message).slice(0, 180));
  }
  return parsed as T;
}
export const paperGet = <T>(path: string) => request<T>(PAPER_URL, path);
export const paperPost = <T>(path: string, body: unknown) =>
  request<T>(PAPER_URL, path, {method: 'POST', body: JSON.stringify(body)});
export const paperPut = <T>(path: string, body: unknown) =>
  request<T>(PAPER_URL, path, {method: 'PUT', body: JSON.stringify(body)});
export const dataGet = <T>(path: string) => request<T>(DATA_URL, path);

const WATCHLIST_NAME = 'MarketClarity Paper Bot';
export async function readPaperWatchlist(): Promise<{id?: string; symbols: string[]}> {
  const watchlists = await paperGet<PaperWatchlist[]>('/v2/watchlists');
  const match = watchlists.find(x => x.name === WATCHLIST_NAME);
  if (!match) return {symbols: []};
  const detailed = await paperGet<PaperWatchlist>('/v2/watchlists/' + encodeURIComponent(match.id));
  return {id: match.id, symbols: (detailed.assets || []).map(x => x.symbol)};
}
export async function updatePaperWatchlist(symbols: string[]) {
  const cleaned = [...new Set(symbols.map(x => x.trim().toUpperCase()))];
  if (cleaned.length > 5 || cleaned.some(x => !/^[A-Z][A-Z0-9.\-]{0,9}$/.test(x))) {
    throw new Error('Use up to five valid US stock symbols.');
  }
  const current = await readPaperWatchlist();
  if (current.id) {
    return paperPut<PaperWatchlist>('/v2/watchlists/' + encodeURIComponent(current.id), {
      name: WATCHLIST_NAME, symbols: cleaned,
    });
  }
  return paperPost<PaperWatchlist>('/v2/watchlists', {name: WATCHLIST_NAME, symbols: cleaned});
}
