import 'server-only';
import { unstable_cache } from 'next/cache';

import { screenDailyRadar, qualifyRadarLead, type DailyBar, type RadarReport, type RadarLead, type RadarCategory } from './radar';
import { massiveStockBars, quoteFromBars } from './providers/massiveStocks';
import { secFundamentals } from './secFundamentals';
import { recentSecFilings } from './sec';
import { technicalSnapshot } from './indicators';
import { buildScores } from './scoring';
import { knownFund } from './funds';
import { knownLeveraged } from './leveraged';


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


/** Free-plan request budget: two grouped daily calls + at most three
 * per-symbol history calls on a cold cache. This is intentionally a LIMITED
 * deep-research sample; it is NOT a whole-market 80+ sweep. */
const MAX_DEEP_REVIEWS=3;

function researchQueue(report:RadarReport):RadarLead[]{
  const seen=new Set<string>();
  const queue:RadarLead[]=[];
  const add=(lead?:RadarLead)=>{
    if(!lead||seen.has(lead.symbol)||knownFund(lead.symbol)||knownLeveraged(lead.symbol))return;
    seen.add(lead.symbol);
    queue.push(lead);
  };
  // Review a mix of price-strength and unusual-activity names. A single
  // volatile sector should not monopolize the small free-tier research budget.
  add(report.categories.momentum[0]);
  add(report.categories['unusual-volume'][0]);
  add(report.categories.rebound[0]);
  for(const lead of [...report.categories.momentum,...report.categories['unusual-volume'],...report.categories.rebound])
    add(lead);
  return queue;
}
async function independentlyReview(lead:RadarLead,session:string){
  const bars=await massiveStockBars(lead.symbol);
  const quote=quoteFromBars(lead.symbol,bars,lead.symbol);
  // Reject mismatch before scoring. No old chart can support today's radar.
  if(quote.timestamp!==session)throw new Error('The security did not have a closing price for this screened session.');
  const sec=await secFundamentals(lead.symbol,quote.price);
  if(!sec.cik)throw new Error('This issuer does not have SEC company financial facts to validate the rating.');
  const f=sec.snapshot;
  const fs=[f.currentRatio,f.debtToEquity,f.returnOnEquity,f.returnOnInvestedCapital,
    f.operatingMargin,f.revenueGrowth,f.epsGrowth,f.priceToEarnings,f.priceToSales,f.priceToFreeCashFlow];
  const present=fs.filter(x=>x!=null&&Number.isFinite(x)).length;
  const completeness=Math.round((present/fs.length*70+Math.min(30,bars.length/250*30))*10)/10;
  const catalysts=await recentSecFilings(sec.cik).catch(()=>[]);
  const scores=buildScores(f,technicalSnapshot(bars),quote,catalysts,completeness,{stalePrice:false,isOtc:false});
  return qualifyRadarLead(lead,{
    mode:'live',instrumentType:'Stock',marketClassification:'Unknown',symbol:lead.symbol,
    quote,priceDataAgeDays:Math.max(0,Math.floor((Date.now()-Date.parse(quote.timestamp!))/86400000)),
    dataCompleteness:completeness,
    assessmentWarnings:[],scores:{core:scores.core,growth:scores.growth,asymmetric:scores.asymmetric,swing:scores.swing},
    tradePlan:scores.tradePlan
  });
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

  const report=screenDailyRadar(current,prior,date,priorDate);
  const queue=researchQueue(report);
  const chosen=queue.slice(0,MAX_DEEP_REVIEWS);
  const checked=await Promise.allSettled(chosen.map(x=>independentlyReview(x,date)));
  let reviewed=0,below80=0,insufficientData=0,failures=0;
  const qualified:RadarLead[]=[];
  for(let i=0;i<checked.length;i++){
    const result=checked[i];
    if(result.status==='rejected'){
      // Absent issuer filings / stale data are not a failing stock grade.
      // They count as missing evidence, and are excluded from featured picks.
      const msg=String(result.reason);
      if(/SEC|financial|closing price|facts|data/i.test(msg))insufficientData++;
      else failures++;
      continue;
    }
    reviewed++;
    if(result.value)qualified.push(result.value);
    else below80++;
  }
  const categories:Record<RadarCategory,RadarLead[]>={
    momentum:[],rebound:[],'unusual-volume':[],leveraged:[]
  };
  for(const lead of qualified)categories[lead.category].push(lead);
  for(const k of Object.keys(categories) as RadarCategory[])
    categories[k].sort((a,b)=>(b.verified?.featuredScore??0)-(a.verified?.featuredScore??0));
  report.categories=categories;
  report.review={
    reviewed,proposed:queue.length,queued:Math.max(0,queue.length-chosen.length),
    featured:qualified.length,below80,insufficientData,failures,
    limit:MAX_DEEP_REVIEWS,completeMarketReview:false,latestData:date,
    message:qualified.length
      ?`${qualified.length} independently scored candidates met the 80+ feature threshold among ${reviewed} successfully reviewed securities. Other market activity was not automatically promoted.`
      :reviewed
      ?`No 80+ investment or swing-trading candidate was VERIFIED among ${reviewed} successfully reviewed securities. That is not evidence that no opportunity exists elsewhere in the market.`
      :'The first-pass screen found activity, but no candidate could be fully graded in this limited review. This is a data-coverage limitation, not a conclusion about the whole market.'
  };
  report.limits=[
    'Featured stocks must score at least 80 in a complete stock model; no two-day Radar Priority scores are presented as qualified opportunities.',
    'A score of 80–89.9 means research watch, not an active trade plan. The swing-trade model must separately approve any entry and exit.',
    'An investment or growth score of 80+ does not imply that the stock is attractive for swing trading.',
    'The number of deep reviews is restricted by the individual-use data subscription and its request limit. This report does NOT validate every market symbol.',
    'Candidates missing reliable company financial reports or current price history are withheld, not assumed to have failed.',
    'Historical end-of-day observations cannot verify premarket prices, live fills, intraday breakout quality or current bid/ask spreads.',
    'The OTC and leveraged ETF markets require specialized methods and are not presented as approved day trades here.',
    'A public commercial app needs market-data redistribution rights and a scalable daily compute/persistence service.'
  ];
  return report;
}

// Cache the research report; refresh at most a few times a day instead of
// repeatedly consuming the free provider's market-data quota per visitor.
// A durable all-market daily verification process will need additional
// infrastructure and the proper data license.
export const getRadar=unstable_cache(buildRadar,['marketclarity-daily-radar-scoring-v2'],{revalidate:21600});
