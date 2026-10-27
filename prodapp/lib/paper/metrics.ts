import type {PaperFill, PaperHistory} from './alpaca';

export interface ClosedTrade {
  symbol: string;
  closedAt: string;
  qty: number;
  entry: number;
  exit: number;
  pnl: number;
}
const positive = (x: unknown) => Number.isFinite(Number(x)) && Number(x) > 0;

// Long-only FIFO matching of paper fills. Partial exits are separate completed trades.
export function reconstructTrades(fills: PaperFill[]): ClosedTrade[] {
  const lots = new Map<string, Array<{qty: number; price: number}>>();
  const closed: ClosedTrade[] = [];
  const sorted = [...fills].sort((a,b) => new Date(a.transaction_time).getTime() - new Date(b.transaction_time).getTime());
  for (const fill of sorted) {
    if (!positive(fill.qty) || !positive(fill.price)) continue;
    const qty = Number(fill.qty), price = Number(fill.price), list = lots.get(fill.symbol) || [];
    if (fill.side === 'buy') {
      list.push({qty, price});
      lots.set(fill.symbol, list);
      continue;
    }
    if (fill.side !== 'sell') continue;
    let remaining = qty;
    while (remaining > 0.000001 && list.length) {
      const lot = list[0];
      const matched = Math.min(remaining, lot.qty);
      closed.push({
        symbol: fill.symbol, closedAt: fill.transaction_time,
        qty: matched, entry: lot.price, exit: price,
        pnl: Math.round((price - lot.price) * matched * 100) / 100,
      });
      remaining -= matched;
      lot.qty -= matched;
      if (lot.qty < 0.000001) list.shift();
    }
    lots.set(fill.symbol, list);
  }
  return closed;
}
export function summarizeTrades(trades: ClosedTrade[]) {
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl < 0);
  const grossProfit = wins.reduce((n,t) => n + t.pnl, 0);
  const grossLoss = -losses.reduce((n,t) => n + t.pnl, 0);
  return {
    closedTrades: trades.length,
    winRate: trades.length ? wins.length / trades.length * 100 : null,
    realizedPnl: trades.reduce((n,t) => n + t.pnl, 0),
    averagePnl: trades.length ? trades.reduce((n,t) => n + t.pnl, 0) / trades.length : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    wins: wins.length,
    losses: losses.length,
  };
}
export function maxDrawdown(equity: number[]) {
  let peak = -Infinity, max = 0;
  for (const v of equity) {
    if (!Number.isFinite(v) || v <= 0) continue;
    peak = Math.max(peak, v);
    max = Math.max(max, (peak - v) / peak);
  }
  return max * 100;
}
export function equityCurve(history: PaperHistory) {
  return history.timestamp.map((t,i) => ({timestamp:t, equity:history.equity[i]}))
    .filter(p => Number.isFinite(p.timestamp) && Number.isFinite(p.equity) && p.equity > 0);
}
