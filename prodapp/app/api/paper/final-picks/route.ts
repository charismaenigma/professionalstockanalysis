import {NextRequest,NextResponse} from 'next/server';
import {controlAuthorized,unauthorized} from '@/lib/paper/security';
import {runPremarketResearch} from '@/lib/premarket';
import {readPaperWatchlist,updatePaperWatchlist} from '@/lib/paper/alpaca';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

// Only verified current-session candidates can enter the paper watchlist.
// This is NOT an order endpoint. It is disabled for mutation by default.
export async function POST(request:NextRequest){
 if(!controlAuthorized(request))return unauthorized();
 try{
  const body=await request.json().catch(()=>({}));
  const apply=body.apply===true;
  const report=await runPremarketResearch('final');
  const eligible=report.ranked.filter(row=>
   row.evidence==='fresh' && row.liquidity==='pass' &&
   row.score!=null && row.latestPrice!=null &&
   row.quoteAgeMinutes!=null && row.quoteAgeMinutes>=-1 && row.quoteAgeMinutes<=10 &&
   row.tradeAgeMinutes!=null && row.tradeAgeMinutes>=-1 && row.tradeAgeMinutes<=15 &&
   row.spreadPct!=null && row.spreadPct<=0.6 &&
   row.premarketVolumeIex!=null && row.premarketVolumeIex>=500
  ).slice(0,5).map(row=>row.ticker);
  const current=(await readPaperWatchlist()).symbols;
  if(apply && process.env.PAPER_HANDOFF_ENABLED!=='true')
   return NextResponse.json({error:'Paper watchlist handoff is disabled.',eligible,current,applied:false},{status:409});
  if(apply && !eligible.length)
   return NextResponse.json({error:'No validated candidates. Existing watchlist preserved.',eligible,current,applied:false},{status:409});
  if(apply)await updatePaperWatchlist(eligible);
  return NextResponse.json({asOf:report.asOf,marketDate:report.marketDate,eligible,current,
   applied:apply,readOnly:!apply,warnings:report.warnings,
   note:'Eligibility is based on MarketClarity IEX-only evidence, not ChatGPT research picks. No orders placed.'},
   {headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Handoff unavailable'},{status:502});}
}
