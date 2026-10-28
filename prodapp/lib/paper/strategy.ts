import type {AnalysisResult} from '../types';
import type {PaperSnapshot} from './alpaca';

export interface DraftOrder {
  symbol: string;
  qty: number;
  limit: number;
  stop: number;
  target: number;
  score: number;
  riskDollars: number;
}
export type SignalDecision = {reason: string; order?: DraftOrder};
const round = (n: number) => Math.round(n * 100) / 100;

// Version 1 conservative swing setup. It is a hypothesis to test, not a proven edge.
export function assessSwing(
  analysis: AnalysisResult, snapshot: PaperSnapshot,
  equity: number, settledCash: number, now = Date.now(), allowedNotional = 0, slots: 2 | 3 = 3,
): SignalDecision {
  if (analysis.mode !== 'live') return {reason: 'Demo data is prohibited for trading.'};
  if (analysis.instrumentType !== 'Stock' || analysis.marketClassification !== 'Listed') {
    return {reason: 'Only verified exchange-listed individual stocks are eligible.'};
  }
  if (analysis.priceDataAgeDays == null || analysis.priceDataAgeDays > 4) {
    return {reason: 'Research price history is too old for a new trade.'};
  }
  const score = analysis.scores.swing;
  if (score.score == null || score.score < 90 || score.vetoes.length || analysis.tradePlan.status !== 'Qualified Trade') {
    return {reason: 'Swing score, hard veto, or trade-plan gate did not pass.'};
  }
  const t = analysis.technicals;
  if (!['up', 'strong-up'].includes(t.trend) || !t.sma20 || !t.sma50 ||
      !t.rsi14 || t.rsi14 < 45 || t.rsi14 > 70 ||
      (t.relativeVolume ?? 0) < 1.1 || !t.atr14 || t.atr14 <= 0) {
    return {reason: 'Trend, volume, RSI, or volatility confirmation is missing.'};
  }
  const quote = snapshot.latestQuote;
  const trade = snapshot.latestTrade;
  if (!quote || !trade || !quote.ap || !quote.bp || !trade.p) {
    return {reason: 'Fresh two-sided live quotes are unavailable.'};
  }
  const age = Math.max(now - Date.parse(quote.t), now - Date.parse(trade.t));
  if (!Number.isFinite(age) || age < -60000 || age > 5 * 60000) {
    return {reason: 'Market-data timestamp is stale.'};
  }
  const ask = quote.ap, bid = quote.bp;
  if (ask < 5 || (ask - bid) / ask > 0.004 || bid >= ask) {
    return {reason: 'Minimum price or maximum bid/ask spread rule failed.'};
  }
  if (Math.abs(analysis.quote.price - ask) / ask > 0.025) {
    return {reason: 'Research quote and execution quote disagree by over 2.5%.'};
  }
  if (ask <= t.sma20 || ask <= t.sma50 ||
      (ask - t.sma20) / t.atr14 > 1.25) {
    return {reason: 'The entry is below trend support or too extended above its 20-day average.'};
  }
  const limit = round(ask * 1.0015);
  const stop = round(ask - 1.5 * t.atr14);
  const target = round(ask + 3 * t.atr14);
  const perShareRisk = limit - stop;
  if (stop <= 0 || perShareRisk <= 0 || target <= limit) {
    return {reason: 'A safe bracket order cannot be constructed.'};
  }
  // The bot's risk budget belongs to the 5% trading sleeve, not the 95% core.
  // An explicit allowance from the account-wide sleeve ledger is mandatory.
  if(!Number.isFinite(allowedNotional)||allowedNotional<=0) return {reason:'No verified active-trading budget remains.'};
  const sleeve = equity*.05;
  const slotCapacity=sleeve/slots;
  const qty = Math.floor(Math.min(
    sleeve * .0025 / perShareRisk,
    slotCapacity / limit,
    allowedNotional / limit,
    Math.max(0, settledCash) * .7 / limit,
  ));
  if (qty < 1) return {reason: 'Risk budget or settled cash is insufficient for one share.'};
  return {reason: 'Conservative long-only swing criteria passed.', order: {
    symbol: analysis.symbol, qty, limit, stop, target,
    score: score.score, riskDollars: round(qty * perShareRisk),
  }};
}
