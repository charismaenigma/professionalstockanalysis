import type { Bar, Quote } from '../types';

const BASE='https://api.massive.com';
const key=()=>{const k=process.env.MASSIVE_API_KEY;if(!k)throw new Error('MASSIVE_API_KEY is not configured');return k;};

export async function massiveStockBars(symbol:string,days=420):Promise<Bar[]>{
  const to=new Date().toISOString().slice(0,10);
  const from=new Date(Date.now()-days*86400000).toISOString().slice(0,10);
  const url=new URL(`${BASE}/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${from}/${to}`);
  url.searchParams.set('adjusted','true');
  url.searchParams.set('sort','asc');
  url.searchParams.set('limit','5000');
  url.searchParams.set('apiKey',key());
  const r=await fetch(url,{next:{revalidate:3600}});
  if(!r.ok)throw new Error(`Massive stock history failed (${r.status})`);
  const j:any=await r.json();
  const rows=(j.results??[]).map((x:any)=>({
    date:new Date(Number(x.t)).toISOString().slice(0,10),
    open:Number(x.o),high:Number(x.h),low:Number(x.l),close:Number(x.c),
    volume:Number(x.v??0),vwap:x.vw==null?undefined:Number(x.vw)
  })).filter((x:Bar)=>Number.isFinite(x.close)&&x.close>0);
  if(!rows.length)throw new Error('No stock price history returned for this ticker.');
  return rows;
}

export function quoteFromBars(symbol:string,bars:Bar[],name?:string):Quote{
  const last=bars.at(-1); const prev=bars.at(-2);
  if(!last)throw new Error('No market price is available for this ticker.');
  const change=prev?last.close-prev.close:undefined;
  const changePercent=prev&&prev.close?((last.close/prev.close)-1)*100:undefined;
  const vols=bars.slice(-20).map(b=>b.volume).filter(Number.isFinite);
  const avgVolume=vols.length?vols.reduce((a,b)=>a+b,0)/vols.length:undefined;
  const year=bars.slice(-252);
  return {
    symbol,name,price:last.close,change,changePercent,volume:last.volume,avgVolume,
    yearHigh:year.length?Math.max(...year.map(b=>b.high)):undefined,
    yearLow:year.length?Math.min(...year.map(b=>b.low)):undefined,
    timestamp:last.date
  };
}
