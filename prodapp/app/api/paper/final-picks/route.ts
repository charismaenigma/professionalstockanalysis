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
  // Diagnostic funnel: independent counts, not mutually exclusive failure buckets.
  // The universe covers all evaluated seeds; ranked covers only the final top 15.
  const diagnostics={
   candidateUniverse:report.candidateUniverse,
   rankedReturned:report.ranked.length,
   freshTradesInRanked:report.ranked.filter(row=>row.evidence==='fresh').length,
   missingTradesInRanked:report.ranked.filter(row=>row.evidence==='missing').length,
   staleTradesInRanked:report.ranked.filter(row=>row.evidence==='stale').length,
   freshQuotesInRanked:report.ranked.filter(row=>row.quoteAgeMinutes!=null&&row.quoteAgeMinutes>=-1&&row.quoteAgeMinutes<=10&&row.bid!=null&&row.ask!=null).length,
   acceptableSpreadsInRanked:report.ranked.filter(row=>row.spreadPct!=null&&row.spreadPct<=0.6).length,
   sufficientIexVolumeInRanked:report.ranked.filter(row=>row.premarketVolumeIex!=null&&row.premarketVolumeIex>=500).length,
   liquidityPassInRanked:report.ranked.filter(row=>row.liquidity==='pass').length,
   eligible:eligible.length,
   scope:'Counts are independent and based on the final-phase ranked top 15 unless named candidateUniverse. IEX-only.'
  };
  const current=(await readPaperWatchlist()).symbols;
  if(apply && process.env.PAPER_HANDOFF_ENABLED!=='true')
   return NextResponse.json({error:'Paper watchlist handoff is disabled.',eligible,current,applied:false},{status:409});
  if(apply && !eligible.length)
   return NextResponse.json({error:'No validated candidates. Existing watchlist preserved.',eligible,current,applied:false},{status:409});
  if(apply)await updatePaperWatchlist(eligible);
  return NextResponse.json({asOf:report.asOf,marketDate:report.marketDate,eligible,current,diagnostics,
   applied:apply,readOnly:!apply,warnings:report.warnings,
   note:'Eligibility is based on MarketClarity IEX-only evidence, not ChatGPT research picks. No orders placed.'},
   {headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Handoff unavailable'},{status:502});}
}
