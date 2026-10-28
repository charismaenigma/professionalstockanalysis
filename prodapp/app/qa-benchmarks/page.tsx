import {BENCHMARKS,comparePrices} from '@/lib/benchmark-tracker';
import type {DailyBar} from '@/lib/opportunity-lab';
export const dynamic='force-dynamic';
export default async function Page(){
 let title='Integration check was not completed',detail='';
 if(process.env.VERCEL_ENV!=='preview')detail='Preview-only.';
 else if(!process.env.MASSIVE_API_KEY)detail='Provider configuration missing.';
 else{
  try{
   const dates=['2026-10-22','2026-10-26'];
   const bars=await Promise.all(dates.map(async date=>{
    const url=new URL('https://api.massive.com/v2/aggs/grouped/locale/us/market/stocks/'+date);
    url.searchParams.set('adjusted','true');url.searchParams.set('apiKey',process.env.MASSIVE_API_KEY!);
    const response=await fetch(url,{next:{revalidate:86400},signal:AbortSignal.timeout(17000)});
    if(!response.ok)throw new Error('Provider HTTP '+response.status);
    const data=await response.json() as {results?:{T:string;o:number;h:number;l:number;c:number;v:number}[]};
    return (data.results||[]).map(x=>({ticker:x.T,date,open:x.o,high:x.h,low:x.l,close:x.c,volume:x.v}));
   }));
   const output=comparePrices([{ticker:'AVGO'},{ticker:'SOFI'}],bars[0] as DailyBar[],bars[1] as DailyBar[],dates[1]);
   const count=output.benchmarks.filter(b=>b.returnPct!==null).length;
   title=count===BENCHMARKS.length?'All 12 ETF benchmarks verified':'Some ETF benchmark prices unavailable';
   detail=count+' of 12 benchmark ETFs contained valid paired daily bars, including VOO '+String(output.benchmarks[0].returnPct)+'% and XLK '+String(output.benchmarks[1].returnPct)+'%. Historical tracked stock examples: '+output.tracked.filter(x=>x.returnPct!==null).length+' of 2.';
  }catch(e){detail=e instanceof Error?e.message:'Unknown error'}
 }
 return <main className="shell"><section className="panel"><h1>{title}</h1><p>{detail}</p><p className="muted">Temporary preview-only read-only integration check. No orders or credentials exposed. This page will be removed.</p></section></main>;
}
