import type { Bar, Quote } from '../types';

const BASE='https://api.massive.com';
const key=()=>{const k=process.env.MASSIVE_API_KEY;if(!k)throw new Error('MASSIVE_API_KEY is not configured');return k;};

// In-flight deduplication within one server instance. Next's persistent fetch cache
// handles reuse across invocations; do not cache errors.
const pending = new Map<string,Promise<Bar[]>>();
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
let nextRequestAt=0;
let queue=Promise.resolve();
const MIN_GAP_MS=12500; // conservative five-per-minute allowance, per instance
async function pacedFetch(url:URL, revalidate:number):Promise<Response>{
  const task=queue.then(async()=>{
    const delay=Math.max(0,nextRequestAt-Date.now());
    if(delay)await sleep(delay);
    nextRequestAt=Date.now()+MIN_GAP_MS;
    return fetch(url,{next:{revalidate}});
  });
  queue=task.then(()=>undefined,()=>undefined);
  return task;
}
async function getWithRetry(url:URL,revalidate:number):Promise<Response>{
  let response=await pacedFetch(url,revalidate);
  if(response.status!==429)return response;
  // A single bounded retry; never retry indefinitely within a serverless invocation.
  const retryAfter=Number(response.headers.get('retry-after'));
  const delay=Number.isFinite(retryAfter)&&retryAfter>0?Math.min(15000,retryAfter*1000):12500;
  await sleep(delay);
  response=await pacedFetch(url,revalidate);
  return response;
}
export async function massiveStockBars(symbol:string,days=420):Promise<Bar[]>{
  const to=new Date().toISOString().slice(0,10);
  const from=new Date(Date.now()-days*86400000).toISOString().slice(0,10);
  const cacheKey=`${symbol}:${from}:${to}`;
  const existing=pending.get(cacheKey);
  if(existing)return existing;
  const task=(async()=>{
    const url=new URL(`${BASE}/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${from}/${to}`);
    url.searchParams.set('adjusted','true');
    url.searchParams.set('sort','asc');
    url.searchParams.set('limit','5000');
    url.searchParams.set('apiKey',key());
    const r=await getWithRetry(url,3600);
    if(r.status===429)throw new Error('MASSIVE_RATE_LIMIT: Stock history unavailable after bounded retry');
    if(!r.ok)throw new Error(`Massive stock history failed (${r.status})`);
    const j:any=await r.json();
    const rows=(j.results??[]).map((x:any)=>({
      date:new Date(Number(x.t)).toISOString().slice(0,10),
      open:Number(x.o),high:Number(x.h),low:Number(x.l),close:Number(x.c),
      volume:Number(x.v??0),vwap:x.vw==null?undefined:Number(x.vw)
    })).filter((x:Bar)=>Number.isFinite(x.close)&&x.close>0);
    if(!rows.length)throw new Error('No stock price history returned for this ticker.');
    return rows as Bar[];
  })();
  pending.set(cacheKey,task);
  try{return await task;}finally{pending.delete(cacheKey);}
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

export async function massiveMarketClassification(symbol:string):Promise<{market:'OTC'|'Listed'|'Unknown';name?:string;isEtf?:boolean}>{
  const url=new URL(`${BASE}/v3/reference/tickers`);
  url.searchParams.set('ticker',symbol);
  url.searchParams.set('limit','10');
  url.searchParams.set('apiKey',key());
  const response=await getWithRetry(url,21600);
  if(response.status===429)throw new Error('MASSIVE_RATE_LIMIT: Reference data unavailable');
  if(!response.ok)return {market:'Unknown'};
  const json:any=await response.json();
  const item=(json.results??[]).find((r:any)=>String(r.ticker||'').toUpperCase()===symbol.toUpperCase());
  if(!item)return {market:'Unknown'};
  const code=String(item.market??'').toLowerCase();
  const market=code==='otc'?'OTC':code==='stocks'?'Listed':'Unknown';
  return {market,name:item.name?String(item.name):undefined,isEtf:String(item.type??'').toUpperCase()==='ETF'};
}
