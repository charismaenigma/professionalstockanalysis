import 'server-only';
import { unstable_cache } from 'next/cache';
import { screenDailyRadar, type DailyBar, type RadarReport } from './radar';

function etClock(now:Date){
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone:'America/New_York',year:'numeric',month:'2-digit',
    day:'2-digit',hour:'2-digit',hourCycle:'h23'
  }).formatToParts(now);
  const get=(type:string)=>parts.find(x=>x.type===type)?.value||'';
  return {date:`${get('year')}-${get('month')}-${get('day')}`,hour:Number(get('hour'))};
}
function previousWeekday(from:string,include:boolean){
  const start=new Date(`${from}T12:00:00Z`);
  if(!include)start.setUTCDate(start.getUTCDate()-1);
  for(let i=0;i<7;i++){
    if(start.getUTCDay()!==0&&start.getUTCDay()!==6)return start.toISOString().slice(0,10);
    start.setUTCDate(start.getUTCDate()-1);
  }
  throw new Error('No valid business day could be calculated.');
}
export function radarDates(now:Date){
  const e=etClock(now);
  const latest=previousWeekday(e.date,e.hour>=19);
  const prior=previousWeekday(latest,false);
  return {latest,prior};
}
async function grouped(date:string):Promise<DailyBar[]>{
  const key=process.env.MASSIVE_API_KEY;
  if(!key)throw new Error('Daily Radar requires MASSIVE_API_KEY; no simulated market-wide picks are provided.');
  const url=new URL(`https://api.massive.com/v2/aggs/grouped/locale/us/market/stocks/${date}`);
  url.searchParams.set('adjusted','true');
  url.searchParams.set('apiKey',key);
  const r=await fetch(url,{next:{revalidate:43200}});
  if(!r.ok){
    if(r.status===429)throw new Error('Market-data request limit reached. Please retry after a minute.');
    throw new Error(`Market-wide summary is temporarily unavailable (${r.status}).`);
  }
  const j:any=await r.json();
  if(j.status==='ERROR')throw new Error('The market-data provider returned an error for the requested session.');
  if(!Array.isArray(j.results))return [];
  return j.results.map((x:any)=>({
    symbol:String(x.T??'').toUpperCase(),
    open:Number(x.o),high:Number(x.h),low:Number(x.l),close:Number(x.c),
    volume:Number(x.v),vwap:x.vw==null?undefined:Number(x.vw),otc:Boolean(x.otc)
  })).filter((x:DailyBar)=>x.symbol&&Number.isFinite(x.open)&&Number.isFinite(x.close)&&Number.isFinite(x.volume));
}

async function buildRadar():Promise<RadarReport>{
  const {latest}=radarDates(new Date());
  // The most recent calendar business day might be a U.S. market holiday.
  // Do not confuse an empty holiday response with a valid market snapshot.
  let date=latest;
  let current:DailyBar[]=[];
  for(let i=0;i<3;i++){
    current=await grouped(date);
    if(current.length)break;
    date=previousWeekday(date,false);
  }
  if(!current.length)throw new Error('No completed U.S. market session was available in the checked dates.');
  let priorDate=previousWeekday(date,false);
  let prior:DailyBar[]=[];
  for(let i=0;i<3;i++){
    prior=await grouped(priorDate);
    if(prior.length)break;
    priorDate=previousWeekday(priorDate,false);
  }
  if(!prior.length)throw new Error('The comparison trading session was unavailable; rankings were not generated.');
  return screenDailyRadar(current,prior,date,priorDate);
}

// Cache the report at the application level. Source calls are independently cached.
// This is not a durable historical database; adding persistence is a separate step.
export const getRadar=unstable_cache(buildRadar,['marketclarity-daily-radar-v1'],{revalidate:43200});
