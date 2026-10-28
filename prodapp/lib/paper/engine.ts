import {analyzeSymbol} from '../analysis';
import {
  dataGet, paperGet, paperPost, readPaperWatchlist,
  paperOrdersEnabled, liveResearchConfigured,
  type PaperAccount, type PaperOrder, type PaperPosition, type PaperSnapshot,
} from './alpaca';
import {assessSwing} from './strategy';
import {calculatePaperBudget,positionSlots,type PaperRiskBudget} from './risk';

export interface ScanEvent {
  symbol: string;
  outcome: 'skipped' | 'candidate' | 'submitted' | 'error';
  message: string;
  score?: number;
  qty?: number;
}
export interface ScanResult {
  asOf: string;
  mode: 'preview' | 'paper-orders';
  events: ScanEvent[];
  submitted: number;
  marketOpen: boolean;
  budget?: PaperRiskBudget;
}
function dateKey() {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',
    year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const named=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return named.year+named.month+named.day;
}

export async function runPaperScan(execute: boolean): Promise<ScanResult> {
  if (!liveResearchConfigured()) throw new Error('MASSIVE_API_KEY is required: demo data cannot place orders.');
  if (execute && !paperOrdersEnabled()) {
    throw new Error('Paper orders are disabled. Set PAPER_TRADE_ENABLED=true after dry-run review.');
  }
  const [account, clock, positions, openOrders, recentOrders, watchlist] = await Promise.all([
    paperGet<PaperAccount>('/v2/account'),
    paperGet<{is_open: boolean}>('/v2/clock'),
    paperGet<PaperPosition[]>('/v2/positions'),
    paperGet<PaperOrder[]>('/v2/orders?status=open&limit=500'),
    paperGet<PaperOrder[]>('/v2/orders?status=all&limit=500&direction=desc'),
    readPaperWatchlist(),
  ]);
  const result: ScanResult = {
    asOf: new Date().toISOString(), mode: execute ? 'paper-orders' : 'preview',
    events: [], submitted: 0, marketOpen: clock.is_open,
  };
  const budget=calculatePaperBudget(account,positions,openOrders,positionSlots());
  result.budget=budget;
  if (!watchlist.symbols.length) {
    result.events.push({symbol: '—', outcome: 'skipped', message: 'Choose up to five tickers for the paper watchlist.'});
    return result;
  }
  if (!clock.is_open || account.status !== 'ACTIVE' || account.trading_blocked) {
    result.events.push({symbol: '—', outcome: 'skipped', message: 'Market closed or paper account is restricted.'});
    return result;
  }
  const equity = Number(account.equity), cash = Number(account.cash);
  const lastEquity = Number(account.last_equity);
  if (!Number.isFinite(equity) || equity <= 0 || !Number.isFinite(cash) || cash <= 0) {
    result.events.push({symbol: '—', outcome: 'skipped', message: 'Paper account equity/cash is unavailable.'});
    return result;
  }
  if (lastEquity > 0 && equity < lastEquity * 0.99) {
    result.events.push({symbol: '—', outcome: 'skipped', message: '1% daily equity-loss circuit breaker is active.'});
    return result;
  }
  // Existing positions (except VOO core) and pending buy orders consume the
  // shared 5% trading sleeve. Reject entries when their values are unverifiable.
  const active=new Set(budget.activeSymbols);
  const attempted = new Set(recentOrders.map(o => o.client_order_id));
  let remainingCash = cash;
  let remainingSleeve=budget.remainingSleeveValue;
  for (const symbol of watchlist.symbols.slice(0, 5)) {
    if (active.has(symbol)) {
      result.events.push({symbol, outcome: 'skipped', message: 'Existing position or open buy order.'});
      continue;
    }
    const clientId = ('mc_swing_' + symbol + '_' + dateKey()).slice(0, 48);
    if (attempted.has(clientId)) {
      result.events.push({symbol, outcome: 'skipped', message: 'Already attempted a paper order for this ticker today.'});
      continue;
    }
    if (active.size >= budget.slotCount) {
      result.events.push({symbol, outcome: 'skipped', message: 'Maximum of '+budget.slotCount+' concurrent active trading positions/orders reached.'});
      continue;
    }
    if (remainingSleeve <= 0) {
      result.events.push({symbol,outcome:'skipped',message:'The 5% active-trading sleeve has no uncommitted capital.'});
      continue;
    }
    try {
      const [analysis, snapshot] = await Promise.all([
        analyzeSymbol(symbol),
        dataGet<PaperSnapshot>('/v2/stocks/' + encodeURIComponent(symbol) + '/snapshot?feed=iex'),
      ]);
      const decision = assessSwing(analysis, snapshot, equity, remainingCash, Date.now(), remainingSleeve, budget.slotCount);
      if (!decision.order) {
        result.events.push({symbol, outcome: 'skipped', message: decision.reason, score: analysis.scores.swing.score ?? undefined});
        continue;
      }
      const draft = decision.order;
      if (!execute) {
        result.events.push({symbol,outcome:'candidate',
          message:'Preview only. Entry '+draft.limit.toFixed(2)+
          ', stop '+draft.stop.toFixed(2)+', target '+draft.target.toFixed(2)+
          '. No order sent.',score:draft.score,qty:draft.qty});
        continue;
      }
      // The endpoint is hard-coded to Alpaca PAPER. No live broker endpoint exists.
      await paperPost<PaperOrder>('/v2/orders', {
        symbol, qty: String(draft.qty), side: 'buy', type: 'limit',
        limit_price: String(draft.limit), time_in_force: 'day',
        order_class: 'bracket',
        take_profit: {limit_price: String(draft.target)},
        stop_loss: {stop_price: String(draft.stop)},
        client_order_id: clientId,
      });
      active.add(symbol);
      attempted.add(clientId);
      remainingCash -= draft.qty * draft.limit;
      remainingSleeve = Math.max(0, remainingSleeve-draft.qty*draft.limit);
      result.submitted += 1;
      result.events.push({symbol, outcome: 'submitted', message: 'Paper-only bracket order submitted; fills are not guaranteed.', score: draft.score, qty: draft.qty});
    } catch (e) {
      result.events.push({symbol, outcome: 'error', message: e instanceof Error ? e.message : 'Unknown provider error.'});
    }
  }
  return result;
}
