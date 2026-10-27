import {NextRequest,NextResponse} from 'next/server';
import {controlAuthorized,unauthorized} from '@/lib/paper/security';
import {paperConfigured,readPaperWatchlist} from '@/lib/paper/alpaca';
import {validateSelection,type PeriodId,type IntervalId} from '@/lib/backtest/config';
import {latestResearch,runBacktest} from '@/lib/backtest/engine';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;

// Historical research never accesses the broker's order-submission functions.
export async function POST(request:NextRequest){
  if(!controlAuthorized(request))return unauthorized();
  if(!paperConfigured())return NextResponse.json({error:'Configure Alpaca paper credentials to use historical research.'},{status:503});
  let body:unknown;
  try{body=await request.json();}catch{return NextResponse.json({error:'Invalid JSON request.'},{status:400});}
  if(!body||typeof body!=='object'||Array.isArray(body))return NextResponse.json({error:'Invalid request.'},{status:400});
  const input=body as Record<string,unknown>;
  try{
    if(input.mode==='scan'){
      const watchlist=await readPaperWatchlist();
      if(!watchlist.symbols.length)return NextResponse.json({error:'Add at least one symbol to your paper watchlist.'},{status:400});
      const results=await latestResearch(watchlist.symbols);
      return NextResponse.json({mode:'historical-close',asOf:new Date().toISOString(),results},{headers:{'Cache-Control':'no-store'}});
    }
    if(input.mode!=='backtest')return NextResponse.json({error:'Unknown research mode.'},{status:400});
    if(typeof input.symbol!=='string'||typeof input.period!=='string'||typeof input.interval!=='string')
      return NextResponse.json({error:'Provide a ticker, period and interval.'},{status:400});
    const symbol=input.symbol.toUpperCase().trim();
    if(!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol))return NextResponse.json({error:'Enter a valid US stock ticker.'},{status:400});
    validateSelection(input.period,input.interval);
    const report=await runBacktest(symbol,input.period as PeriodId,input.interval as IntervalId);
    return NextResponse.json(report,{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Historical research unavailable.'},{status:502});
  }
}
