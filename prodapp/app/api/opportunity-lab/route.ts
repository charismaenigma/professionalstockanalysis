import {NextRequest,NextResponse} from 'next/server';
import {controlAuthorized,unauthorized} from '@/lib/paper/security';
import {rankCandidates,auditCandidates,SCREENER_VERSION,type DailyBar,type ScreenerMode} from '@/lib/opportunity-lab';
import {comparePrices,reviewWindow,type ReviewHorizon} from '@/lib/benchmark-tracker';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
const dayMs=86400000;
function iso(d:Date){return d.toISOString().slice(0,10);}
function weekdayBefore(date:string){let d=new Date(date+'T12:00:00.000Z');do{d=new Date(d.getTime()-dayMs);}while([0,6].includes(d.getUTCDay()));return iso(d);}
function nyDate(){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const values=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 return values.year+'-'+values.month+'-'+values.day;
}
type ProviderResponse={status?:string;results?:Array<{T:string;o:number;h:number;l:number;c:number;v:number}>;resultsCount?:number};
async function grouped(date:string):Promise<DailyBar[]>{
 const url=new URL('https://api.massive.com/v2/aggs/grouped/locale/us/market/stocks/'+date);
 url.searchParams.set('adjusted','true');url.searchParams.set('apiKey',process.env.MASSIVE_API_KEY!);
 const r=await fetch(url,{next:{revalidate:86400},signal:AbortSignal.timeout(18000)});
 if(r.status===429)throw new ScreenerError('Massive returned HTTP 429. Grouped-day screening shares the provider rate limit with your other MarketClarity research. Please retry after at least one minute.',429);
 if(!r.ok)throw new ScreenerError('Massive daily market feed returned HTTP '+r.status+'. Check provider permissions or try a different date.',502);
 const data=await r.json() as ProviderResponse;
 return (data.results||[]).map(x=>({ticker:String(x.T||'').toUpperCase(),date,open:Number(x.o),high:Number(x.h),low:Number(x.l),close:Number(x.c),volume:Number(x.v)}))
 .filter(x=>x.ticker&&[x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite)&&x.open>0&&x.close>0&&x.volume>=0);
}
class ScreenerError extends Error{constructor(message:string,public status=400){super(message);}}
export async function GET(req:NextRequest){
 if(!controlAuthorized(req))return unauthorized();
 try{
 if(!process.env.MASSIVE_API_KEY)throw new ScreenerError('Massive market data is not configured for this deployment.',503);
 const qs=req.nextUrl.searchParams;
 const date=qs.get('date')||weekdayBefore(nyDate());
 const mode=(qs.get('mode')||'day') as ScreenerMode;
 const horizon=(qs.get('horizon')||'1d') as ReviewHorizon;
 if(!['1d','1w','1m'].includes(horizon))throw new ScreenerError('Choose 1 day, 1 week, or 1 month for performance review.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||iso(new Date(date+'T12:00:00.000Z'))!==date)
   throw new ScreenerError('Use a valid YYYY-MM-DD session date.');
 if(mode!=='day'&&mode!=='swing')throw new ScreenerError('Choose day or swing mode.');
 const today=nyDate();
 if(date>today)throw new ScreenerError('Future sessions cannot be replayed. Choose today or an earlier trading date.');
 if(date<iso(new Date(Date.now()-95*dayMs)))throw new ScreenerError('This prototype supports the last 95 calendar days only.');
 if([0,6].includes(new Date(date+'T12:00:00.000Z').getUTCDay()))throw new ScreenerError('Choose a weekday; weekends have no regular stock session.');
 const prev=weekdayBefore(date),older=weekdayBefore(prev);
 const [oldBars,prevBars]=await Promise.all([grouped(older),grouped(prev)]);
 if(!oldBars.length||!prevBars.length)throw new ScreenerError('At least one prerequisite session is missing or a market holiday. Choose a different weekday; this prototype does not yet skip holidays automatically.');
 const model=rankCandidates(oldBars,prevBars,mode);
 const top=model.all.slice(0,10);
 // NEVER access target session data when it is today. This separates selection-time inputs from outcomes.
 const audited=date<today;
 let audit=null,benchmarks=null;
 if(audited){
  const targetBars=await grouped(date);
  if(!targetBars.length)throw new ScreenerError('No completed market-session bars are available for this date; it may have been a holiday.');
  audit=auditCandidates(model.all,targetBars,model.discarded,10);
  const lastCompleted=weekdayBefore(today);
  const window=reviewWindow(date,horizon,lastCompleted);
  // One grouped result per end date, rather than individual calls for 12 ETFs and 10 stocks.
  // If horizon remains in the future, clearly mark the observed window as partial.
  if(window.end){
   const endBars=window.end===date?targetBars:await grouped(window.end);
   if(!endBars.length)throw new ScreenerError('No grouped market data exists for the review end date '+window.end+'. It may be a market holiday; try another window.');
   const missed=audit.missed.map(x=>({ticker:x.ticker}));
   benchmarks={...comparePrices([...top,...missed],targetBars,endBars,window.end),
     horizon,requestedEnd:window.requestedEnd,complete:window.complete,
     observedSessionStart:date,
     status:window.complete?'Complete historical window':'Partial historical window; future sessions have not occurred'};
  }
 }
 return NextResponse.json({
  modelVersion:SCREENER_VERSION,requestedSession:date,selectionAsOf:prev,baselineDate:older,
  mode,horizon,scanUniverse:model.eligibleCount,selected:top,audit,benchmarks,
  preSessionBasis:'Ranked using '+older+' and '+prev+' completed daily price/volume bars only.',
  limitations:['Candidate universe is not yet verified as common shares; ETFs and other symbols may be present.',
   'Only two prior sessions are available to this early-stage ranking model; this is not a full trend/relative-volume screener.',
   'No historical opportunity list is persisted or time-stamped before the session. This is deterministic replay, NOT verified forward prediction.',
   'Day and swing modes rank candidates for study; neither mode executes the named intraday or swing strategy.',
   'Benchmarks and stock tracking show open-to-close price change over matched periods, NOT actual trade fills, portfolio returns, or dividend-adjusted ETF total returns.',
   'VOO tracks the S&P 500, not the entire US equity universe. This prototype does not verify which specific sector each screened company belongs to.',
   'Audit open-to-close moves are not actual profit/loss or backtested strategy fills.','Screens and audit results do not auto-update model weights.']
 },{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){const status=e instanceof ScreenerError?e.status:502;
  return NextResponse.json({error:e instanceof Error?e.message:'Daily opportunity scan unavailable'},{status,headers:{'Cache-Control':'no-store',...(status===429?{'Retry-After':'65'}:{})}});
 }
}
