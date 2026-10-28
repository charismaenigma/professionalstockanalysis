import {NextRequest,NextResponse} from 'next/server';
import {backtest,periods,intervals,strategies,intervalAllowed,type Candle,type Period,type Interval,type Strategy} from '@/lib/backtest';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
const millis:Record<Period,number>={'1d':86400000,'1w':7*86400000,'3w':21*86400000,'1m':31*86400000,'3m':93*86400000,'6m':186*86400000,'1y':366*86400000,'3y':1097*86400000,'5y':1828*86400000};
const agg:Record<Interval,[number,string]>={'5m':[5,'minute'],'15m':[15,'minute'],'30m':[30,'minute'],'1h':[1,'hour'],'1d':[1,'day'],'1w':[1,'week']};
export async function GET(req:NextRequest){
 try{
 const q=req.nextUrl.searchParams,symbol=(q.get('symbol')||'').trim().toUpperCase(),period=(q.get('period')||'1m') as Period,interval=(q.get('interval')||'1d') as Interval,strategy=(q.get('strategy')||'Conservative Swing') as Strategy;
 if(!/^[A-Z][A-Z0-9.]{0,8}$/.test(symbol))throw Error('Enter a valid US ticker.');
 if(!periods.includes(period)||!intervals.includes(interval)||!intervalAllowed[period].includes(interval)||!strategies.includes(strategy))throw Error('Unsupported period, candle interval, or strategy.');
 if(!process.env.MASSIVE_API_KEY)throw Error('Historical market-data provider is not configured.');
 const risk=Number(q.get('risk')||'0.25');if(!Number.isFinite(risk)||risk<.1||risk>1)throw Error('Risk must be 0.1–1%.');
 // For intraday: extend lookback to warm up indicators, but do not claim data we have not received.
 const end=new Date(),start=new Date(end.getTime()-millis[period]);
 const warmup=new Date(start.getTime()-Math.max(60*86400000,millis[period]/3));
 const [multiple,timespan]=agg[interval];
 const u=new URL('https://api.massive.com/v2/aggs/ticker/'+encodeURIComponent(symbol)+'/range/'+multiple+'/'+timespan+'/'+warmup.toISOString().slice(0,10)+'/'+end.toISOString().slice(0,10));
 u.searchParams.set('adjusted','true');u.searchParams.set('sort','asc');u.searchParams.set('limit','50000');u.searchParams.set('apiKey',process.env.MASSIVE_API_KEY);
 const response=await fetch(u,{cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Historical provider returned '+response.status+'. Check historical-data entitlement and requested period.');
 const data=await response.json();
 if(data.next_url)throw Error('Historical results are paginated; this interval and period exceed the current safe single-request limit. Choose a coarser interval.');
 const all:Candle[]=(data.results||[]).map((r:{t:number;o:number;h:number;l:number;c:number;v:number})=>({time:r.t,open:r.o,high:r.h,low:r.l,close:r.c,volume:r.v})).filter((b:Candle)=>b.time<end.getTime()&&b.open>0&&b.close>0&&b.high>=b.low).sort((a:Candle,b:Candle)=>a.time-b.time);
 // Only completed bars; do not use an in-progress candle.
 const duration=multiple*(timespan==='minute'?60000:timespan==='hour'?3600000:timespan==='day'?86400000:7*86400000);
 const completed=all.filter(b=>b.time+duration<=end.getTime());
 const first=completed.findIndex(b=>b.time>=start.getTime());
 if(first<0||first<20)throw Error('Insufficient historical data or warmup bars. Try a shorter period or another interval.');
 const dataSet=completed.slice(Math.max(0,first-60));
 const result=backtest(dataSet,strategy,risk,100000,Math.min(first,60));
 // Historical test metrics should correspond to the requested window only: warmup may open positions.
 // v0.4 explicitly reports this approximation until the event loop supports full boundary-reset state.
 return NextResponse.json({symbol,period,interval,source:'Massive adjusted aggregates',bars:completed.slice(first).length,firstBar:new Date(completed[first].time).toISOString(),lastBar:new Date(completed.at(-1)!.time).toISOString(),warmupBars:first,dataCoverage:'Historical indicators may use earlier warmup bars; simulated trades begin in the selected test window.',...result},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Backtest unavailable'}, {status:400});}
}
