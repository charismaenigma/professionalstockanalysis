import {NextRequest, NextResponse} from 'next/server';
import {paperConfigured, liveResearchConfigured, paperOrdersEnabled, autoScanEnabled, paperGet, readPaperWatchlist, type PaperAccount} from '@/lib/paper/alpaca';
import {controlAuthorized, cronAuthorized, unauthorized} from '@/lib/paper/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Clock = {is_open: boolean; timestamp: string; next_open: string; next_close: string};
export async function GET(request: NextRequest) {
  if (!controlAuthorized(request) && !cronAuthorized(request)) return unauthorized();
  const checkedAt = new Date().toISOString();
  const checks: Array<{name:string; status:'pass'|'warning'|'block'; detail:string}> = [];
  const broker = paperConfigured();
  const research = liveResearchConfigured();
  checks.push({name:'paper_credentials',status:broker?'pass':'block',detail:broker?'Configured':'Missing'});
  checks.push({name:'research_feed',status:research?'pass':'block',detail:research?'Configured (not a live quote verification)':'Missing'});
  checks.push({name:'execution',status:'pass',detail:'Read-only preflight: no orders submitted; execution flags are not changed.'});
  let marketOpen: boolean | null = null;
  let clockAsOf: string | null = null;
  let watchlistSymbols: string[] = [];
  if (broker) {
    const [clockResult, accountResult, watchlistResult] = await Promise.allSettled([
      paperGet<Clock>('/v2/clock'), paperGet<PaperAccount>('/v2/account'), readPaperWatchlist(),
    ]);
    if (clockResult.status === 'fulfilled') {
      marketOpen = clockResult.value.is_open;
      clockAsOf = clockResult.value.timestamp;
      checks.push({name:'market_clock',status:marketOpen?'pass':'warning',detail:marketOpen?'Broker reports regular session open':'Broker reports regular session closed'});
    } else checks.push({name:'market_clock',status:'block',detail:'Broker clock unavailable'});
    if (accountResult.status === 'fulfilled') {
      const a = accountResult.value;
      checks.push({name:'paper_account',status:a.status==='ACTIVE'&&!a.trading_blocked?'pass':'block',detail:a.status==='ACTIVE'&&!a.trading_blocked?'Active and not trading blocked':'Account not active or trading blocked'});
    } else checks.push({name:'paper_account',status:'block',detail:'Broker account status unavailable'});
    if (watchlistResult.status === 'fulfilled') {
      watchlistSymbols = watchlistResult.value.symbols;
      checks.push({name:'watchlist',status:watchlistSymbols.length?'pass':'warning',detail:watchlistSymbols.length+' symbols; no changes made'});
    } else checks.push({name:'watchlist',status:'warning',detail:'Watchlist unavailable'});
  }
  checks.push({name:'live_liquidity',status:'warning',detail:'No same-time IEX quotes, bid/ask spreads or per-symbol liquidity were fetched by this preflight.'});
  return NextResponse.json({mode:'read-only',checkedAt,marketOpen,clockAsOf,watchlistSymbols,
    configuration:{paperConfigured:broker,researchConfigured:research,ordersEnabled:paperOrdersEnabled(),autoEnabled:autoScanEnabled()},
    checks,summary:{passes:checks.filter(c=>c.status==='pass').length,warnings:checks.filter(c=>c.status==='warning').length,blocks:checks.filter(c=>c.status==='block').length},submitted:0},
    {headers:{'Cache-Control':'no-store'}});
}
