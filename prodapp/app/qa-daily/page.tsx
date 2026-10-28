import {rankCandidates,auditCandidates,type DailyBar} from '@/lib/opportunity-lab';
export const dynamic='force-dynamic';
export default async function PreviewDiagnostic(){
 let status='Preview-only diagnostic', details='Not executed';
 if(process.env.VERCEL_ENV!=='preview')details='Disabled outside Preview.';
 else if(!process.env.MASSIVE_API_KEY)details='Massive API key unavailable';
 else{
  try{
   async function grouped(date:string):Promise<DailyBar[]>{
    const url=new URL('https://api.massive.com/v2/aggs/grouped/locale/us/market/stocks/'+date);
    url.searchParams.set('adjusted','true');url.searchParams.set('apiKey',process.env.MASSIVE_API_KEY!);
    const r=await fetch(url,{next:{revalidate:86400},signal:AbortSignal.timeout(16000)});
    if(!r.ok)throw new Error('Massive grouped data HTTP '+r.status);
    const j=await r.json() as {results?:Array<{T:string;o:number;h:number;l:number;c:number;v:number}>};
    return (j.results||[]).map(x=>({ticker:x.T,date,open:x.o,high:x.h,low:x.l,close:x.c,volume:x.v})).filter(x=>x.ticker&&x.close>0&&x.volume>=0);
   }
   const [old,prior,target]=await Promise.all([grouped('2026-10-22'),grouped('2026-10-23'),grouped('2026-10-26')]);
   if(!old.length||!prior.length||!target.length)throw new Error('Grouped session missing');
   const picks=rankCandidates(old,prior,'day');
   const audit=auditCandidates(picks.all,target,picks.discarded,10);
   status='Verified historical grouped scanner and hindsight audit';
   details='Sessions: Oct 22 → Oct 23 → Oct 26. Eligible pre-session universe: '+picks.eligibleCount+'. Ranked picks: '+Math.min(10,picks.all.length)+'. Observed next-day eligible leaders: '+audit.leaderCount+'. Captured: '+audit.capturedLeaders+'. No orders, no simulated fills, no private data exposed.';
  }catch(e){status='Diagnostic did not complete';details=e instanceof Error?e.message:'Unknown error'}
 }
 return <main className="shell"><section className="panel"><h1>{status}</h1><p>{details}</p><p className="muted">Temporary, public Preview-only diagnostic; results cannot establish trading profitability.</p></section></main>;
}
