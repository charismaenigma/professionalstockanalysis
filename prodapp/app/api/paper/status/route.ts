import {NextRequest, NextResponse} from 'next/server';
import {
  paperConfigured, liveResearchConfigured, paperOrdersEnabled, autoScanEnabled,
  paperGet, readPaperWatchlist,
  type PaperAccount, type PaperPosition, type PaperOrder, type PaperFill, type PaperHistory,
} from '@/lib/paper/alpaca';
import {controlAuthorized, unauthorized} from '@/lib/paper/security';
import {reconstructTrades, summarizeTrades, equityCurve, maxDrawdown} from '@/lib/paper/metrics';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!controlAuthorized(request)) return unauthorized();
  const configured = paperConfigured();
  const flags = {configured, liveResearch: liveResearchConfigured(),
    ordersEnabled: paperOrdersEnabled(), autoEnabled: autoScanEnabled(),
    dataFeed: 'IEX (single-exchange real-time)'};
  if (!configured) return NextResponse.json({flags, watchlist: [], history: [], positions: [], orders: [], metrics: null});
  try {
    const [account, positions, orders, fills, history, watchlist] = await Promise.all([
      paperGet<PaperAccount>('/v2/account'),
      paperGet<PaperPosition[]>('/v2/positions'),
      paperGet<PaperOrder[]>('/v2/orders?status=all&limit=100&direction=desc'),
      paperGet<PaperFill[]>('/v2/account/activities/FILL?direction=desc&page_size=100'),
      paperGet<PaperHistory>('/v2/account/portfolio/history?period=3M&timeframe=1D'),
      readPaperWatchlist(),
    ]);
    const curve = equityCurve(history);
    const closed = reconstructTrades(fills);
    const summary = summarizeTrades(closed);
    return NextResponse.json({
      flags, account: {status: account.status, equity: Number(account.equity),
        cash: Number(account.cash), lastEquity: Number(account.last_equity)},
      positions, orders: orders.slice(0,25), watchlist: watchlist.symbols,
      history: curve,
      metrics: {...summary, maxDrawdownPct: maxDrawdown(curve.map(p => p.equity)),
        sampleNotice: 'Closed-trade statistics use the latest 100 fill activities and may omit older trades. Account equity includes all paper-account activity.'},
    }, {headers: {'Cache-Control': 'no-store'}});
  } catch (e) {
    return NextResponse.json({error: e instanceof Error ? e.message : 'Paper account unavailable.'}, {status: 502});
  }
}
