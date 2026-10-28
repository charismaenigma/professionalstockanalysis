import {backtest,type Candle} from '@/lib/backtest';
export const dynamic='force-dynamic';
export const metadata={title:'Temporary v0.4 Preview Diagnostic'};
export default async function Page(){
 let message='Not tested',details='';
 if(process.env.VERCEL_ENV!=='preview')message='Preview-only diagnostics unavailable on this environment';
 else if(!process.env.MASSIVE_API_KEY)message='MASSIVE_API_KEY is not configured for this Preview branch';
 else {
  try {
   const today=new Date();
   const from=new Date(today.getTime()-210*86400000).toISOString().slice(0,10);
   const to=today.toISOString().slice(0,10);
   const uri=new URL('https://api.massive.com/v2/aggs/ticker/SOFI/range/1/day/'+from+'/'+to);
   uri.searchParams.set('adjusted','true');
   uri.searchParams.set('sort','asc');
   uri.searchParams.set('limit','5000');
   uri.searchParams.set('apiKey',process.env.MASSIVE_API_KEY);
   const res=await fetch(uri,{cache:'no-store',signal:AbortSignal.timeout(16000)});
   if(!res.ok){message='Provider rejected the request (HTTP '+res.status+')';}
   else {
    const data=await res.json();
    if(data.next_url)throw Error('Pagination required; diagnostic cannot safely complete');
    const candles:Candle[]=(data.results||[]).map((r:{t:number;o:number;h:number;l:number;c:number;v:number})=>({
     time:r.t,open:r.o,high:r.h,low:r.l,close:r.c,volume:r.v
    })).filter((c:Candle)=>[c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)&&c.close>0&&c.low>0&&c.high>=c.low).sort((a:Candle,b:Candle)=>a.time-b.time);
    if(candles.length<80)throw Error('Insufficient completed historical bars: '+candles.length);
    const test=backtest(candles,'Conservative Swing',.25,100000,Math.max(30,candles.length-62));
    message='Historical feed and backtest engine responded successfully';
    details='SOFI · daily candles · '+candles.length+' bars loaded · '+test.closedTrades+' closed simulated trades · strategy computations completed.';
   }
  }catch(e){message='Diagnostic failed';details=e instanceof Error?e.message:'Unknown provider error'}
 }
 return <main className="shell"><section className="panel"><span className="eyebrow">Temporary v0.4 integration check</span><h1>{message}</h1><p>{details}</p><p className="muted">Preview-only, historical simulation. No Alpaca broker request, order submission, or secret value is exposed here. This diagnostic will be removed after verification.</p></section></main>
}
