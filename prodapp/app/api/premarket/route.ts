import {NextRequest, NextResponse} from 'next/server';
import {paperConfigured, paperGet, readPaperWatchlist, dataGet, type PaperSnapshot} from '@/lib/paper/alpaca';
import {controlAuthorized, cronAuthorized, unauthorized} from '@/lib/paper/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Clock = {is_open:boolean; timestamp:string; next_open:string; next_close:string};
export async function GET(request:NextRequest) {
  if (!controlAuthorized(request) && !cronAuthorized(request)) return unauthorized();
  const phase = request.nextUrl.searchParams.get('phase') || 'final';
  if (!['final','open','early','primary'].includes(phase)) return NextResponse.json({error:'Invalid phase'}, {status:400});
  const checkedAt = new Date().toISOString();
  if (!paperConfigured()) return NextResponse.json({phase,checkedAt,status:'blocked',reason:'Paper data feed not configured',observations:[],submitted:0},{status:503});
  try {
    const [clock,watchlist] = await Promise.all([paperGet<Clock>('/v2/clock'),readPaperWatchlist()]);
    const symbols = watchlist.symbols.slice(0,5);
    const observations = [];
    for (const symbol of symbols) {
      try {
        const snap = await dataGet<PaperSnapshot>('/v2/stocks/'+encodeURIComponent(symbol)+'/snapshot?feed=iex');
        const quote = snap.latestQuote;
        const trade = snap.latestTrade;
        const bid = quote?.bp ?? null, ask = quote?.ap ?? null;
        const spreadPct = bid != null && ask != null && ask>bid && bid>0 ? Number(((ask-bid)/ask*100).toFixed(4)) : null;
        const quoteAgeSeconds = quote?.t ? Math.round((Date.parse(checkedAt)-Date.parse(quote.t))/1000) : null;
        const tradeAgeSeconds = trade?.t ? Math.round((Date.parse(checkedAt)-Date.parse(trade.t))/1000) : null;
        const fresh = quoteAgeSeconds != null && tradeAgeSeconds != null && quoteAgeSeconds>=0 && tradeAgeSeconds>=0 && quoteAgeSeconds<=300 && tradeAgeSeconds<=300;
        observations.push({symbol,source:'Alpaca IEX snapshot (single exchange)',checkedAt,quoteAsOf:quote?.t??null,tradeAsOf:trade?.t??null,bid,ask,lastTrade:trade?.p??null,spreadPct,quoteAgeSeconds,tradeAgeSeconds,minuteBarAsOf:snap.minuteBar?.t??null,
          status:fresh&&spreadPct!=null?'observed_fresh':'stale_or_incomplete',liquidityQualified:false,
          note:'Quote freshness alone does not qualify liquidity; volume, catalyst and full strategy gates not evaluated.'});
      } catch {observations.push({symbol,source:'Alpaca IEX snapshot',checkedAt,status:'unavailable',liquidityQualified:false,note:'Snapshot request failed; no inferred price or fill.'}); }
    }
    return NextResponse.json({phase,checkedAt,mode:'read-only',marketOpen:clock.is_open,clockAsOf:clock.timestamp,
      observations,counts:{requested:symbols.length,fresh:observations.filter(x=>x.status==='observed_fresh').length,unavailable:observations.filter(x=>x.status==='unavailable').length},
      warnings:['This is watchlist-only observation, not market-wide discovery.','No premarket volume, catalysts, sector ETFs or executable trade qualification calculated.','Never infer fills from snapshot quotes.'],submitted:0},
      {headers:{'Cache-Control':'no-store'}});
  } catch {return NextResponse.json({phase,checkedAt,status:'blocked',reason:'Broker clock or watchlist unavailable',observations:[],submitted:0},{status:502});}
}
