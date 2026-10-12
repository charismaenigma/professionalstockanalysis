import { knownLeveraged } from './leveraged';
import type { AnalysisResult } from './types';
type RadarRatingSnapshot=Pick<AnalysisResult,'mode'|'instrumentType'|'marketClassification'|'symbol'|'quote'|'priceDataAgeDays'|'assessmentWarnings'|'scores'|'tradePlan'|'dataCompleteness'>;

export interface DailyBar {
  symbol:string;
  open:number; high:number; low:number; close:number; volume:number;
  vwap?:number; otc:boolean;
}
export type RadarCategory='momentum'|'rebound'|'unusual-volume'|'leveraged';
export interface RadarLead {
  symbol:string;
  category:RadarCategory;
  close:number;
  changePercent:number;
  previousClose:number;
  volume:number;
  volumeRatio:number;
  dollarVolume:number;
  dayRangePercent:number;
  closeLocationPercent:number;
  priority:number;
  verified?:{
    core:number|null;
    growth:number|null;
    asymmetric:number|null;
    swing:number|null;
    featuredScore:number;
    featuredModel:'Core Investment'|'Active Growth'|'Asymmetric Opportunity'|'Swing Trade';
    dataCompleteness:number;
    tradeStatus:'Qualified Trade'|'Watch'|'Pass';
    evidenceAsOf:string;
    verdict:'Elite (95+)'|'Strong (90+)'|'Research Watch (80+)';
    explanation:string;
  };
  reasons:string[];
  cautions:string[];
  leveraged?:{index:string;direction:string;multiple:number;opposite?:string};
  source:'Massive daily grouped bars';
  qualification:'PRELIMINARY – full MarketClarity analysis required';
}
export interface RadarReport {
  status:'ok';
  reportDate:string;
  comparisonDate:string;
  generatedAt:string;
  source:'Massive Stocks Basic: end-of-day grouped aggregates';
  scanned:number;
  eligible:number;
  rejected:number;
  verifiedElite:null;
  verifiedStrong:null;
  review?:{
    reviewed:number;
    proposed:number;
    queued:number;
    featured:number;
    below80:number;
    insufficientData:number;
    failures:number;
    limit:number;
    completeMarketReview:false;
    latestData:string;
    message:string;
  };
  categories:Record<RadarCategory,RadarLead[]>;
  limits:string[];
}
const round=(n:number,d=1)=>Number(n.toFixed(d));
const cap=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));

/** Screen candidates solely from two dated closing-session summaries.
 * No daily-bar metric is a verified RSI, 50/200-day trend, fundamental score,
 * intraday fill, or a 95+ opportunity. Explicitly avoid those claims. */
export function screenDailyRadar(current:DailyBar[],previous:DailyBar[],reportDate:string,comparisonDate:string):RadarReport {
  const old=new Map(previous.map(row=>[row.symbol,row]));
  const all:RadarLead[]=[];
  let eligible=0;
  for(const b of current){
    const prior=old.get(b.symbol);
    if(!prior||!Number.isFinite(b.close)||b.close<=0||prior.close<=0||b.volume<=0)continue;
    if(!/^[A-Z]{1,5}$/.test(b.symbol))continue;
    if(b.otc)continue; // OTC review uses a separate evidence-quality workflow
    if(!(b.high>=b.low && b.high>=b.close && b.low<=b.close))continue;
    const leveraged=knownLeveraged(b.symbol);
    const isLeveraged=Boolean(leveraged);
    const dollarVolume=b.close*b.volume;
    const minDollar=isLeveraged?2_000_000:1_000_000;
    if(b.close<(isLeveraged?2:2)||dollarVolume<minDollar||b.volume<200_000)continue;
    eligible++;
    const changePercent=(b.close/prior.close-1)*100;
    const volumeRatio=prior.volume>0?b.volume/prior.volume:1;
    const dayRangePercent=(b.high-b.low)/Math.max(b.close,.000001)*100;
    const closeLocationPercent=b.high>b.low?(b.close-b.low)/(b.high-b.low)*100:50;
    const nearHigh=closeLocationPercent>=65;
    const volumeBoost=volumeRatio>=1.3;
    const qualityTurnover=cap(Math.log10(Math.max(1,dollarVolume)/1_000_000),0,2.5);
    const baseline=cap(42+qualityTurnover*11+cap(volumeRatio-1,0,2)*9+closeLocationPercent*.12,0,87);
    const reasons:string[]=[];
    const cautions:string[]=[];
    if(volumeBoost)reasons.push(`Last session's share volume was ${round(volumeRatio,2)}× the previous session.`);
    if(nearHigh)reasons.push('The stock closed in the upper part of its daily trading range.');
    if(dollarVolume>=10_000_000)reasons.push('Daily dollar trading activity cleared $10 million.');
    if(dayRangePercent>12)cautions.push('Very large daily price range; price swings and gaps may be difficult to manage.');
    if(volumeRatio>5)cautions.push('Volume surged unusually; verify news, offering risk and the reason before trading.');
    if(b.close<5)cautions.push('Low share price can increase spread and execution risk.');
    cautions.push('One-day changes do not establish a multiweek uptrend, business strength or a trade entry.');

    let category:RadarCategory|undefined;
    let priority=baseline;
    if(isLeveraged) {
      category='leveraged';
      priority=cap(baseline+cap(Math.abs(changePercent),0,6)*2,0,89);
      reasons.unshift(`Leveraged ${leveraged!.direction.toLowerCase()} fund: targets ${leveraged!.dailyMultiple>0?'+':''}${leveraged!.dailyMultiple}× the index's DAILY move, before fees.`);
      cautions.unshift('Not an intraday signal. Daily reset and compounding can make multi-day returns differ from the stated daily leverage.');
    }else if(changePercent>=1.2 && nearHigh){
      category='momentum';
      priority=cap(baseline+cap(changePercent,0,8)*2,0,89);
      reasons.unshift(`Previous session closed up ${round(changePercent)}%.`);
    }else if(changePercent<=-0.7 && changePercent>=-6 && closeLocationPercent>=48){
      category='rebound';
      priority=cap(37+qualityTurnover*13+closeLocationPercent*.16+cap(volumeRatio,0,3)*6,0,87);
      reasons.unshift(`Down ${round(Math.abs(changePercent))}% for the session but finished above the lower half of the day's range.`);
      cautions.unshift('A potential rebound observation, NOT proof of a larger uptrend or a bottom.');
    }else if(volumeRatio>=1.4 && Math.abs(changePercent)>=.5){
      category='unusual-volume';
      priority=cap(baseline+Math.min(8,Math.abs(changePercent)),0,87);
      reasons.unshift('One-day unusual activity merits investigation, not an automatic buy signal.');
    }
    if(!category)continue;
    all.push({
      symbol:b.symbol,category,close:b.close,
      previousClose:prior.close,
      changePercent:round(changePercent,2),
      volume:b.volume,volumeRatio:round(volumeRatio,2),
      dollarVolume:round(dollarVolume,0),
      dayRangePercent:round(dayRangePercent,2),
      closeLocationPercent:round(closeLocationPercent),
      priority:round(priority),
      reasons:reasons.slice(0,4),
      cautions:cautions.slice(0,4),
      leveraged:leveraged?{index:leveraged.index,direction:leveraged.direction,multiple:leveraged.dailyMultiple,opposite:leveraged.opposite}:undefined,
      source:'Massive daily grouped bars',
      qualification:'PRELIMINARY – full MarketClarity analysis required'
    });
  }
  const categories:RadarReport['categories']={
    momentum:[],rebound:[],'unusual-volume':[],leveraged:[]
  };
  for(const type of Object.keys(categories) as RadarCategory[]){
    categories[type]=all.filter(x=>x.category===type)
      .sort((a,b)=>b.priority-a.priority||b.dollarVolume-a.dollarVolume||a.symbol.localeCompare(b.symbol))
      .slice(0,10);
  }
  return {
    status:'ok',reportDate,comparisonDate,generatedAt:new Date().toISOString(),
    source:'Massive Stocks Basic: end-of-day grouped aggregates',
    scanned:current.length,eligible,rejected:current.length-eligible,
    verifiedElite:null,verifiedStrong:null,
    categories,
    limits:[
      'Priority /100 ranks leads from two daily summaries. It is NOT the 95+ investment or Swing Trade score.',
      'No stock is labeled Elite or Strong until it passes complete, data-supported MarketClarity analysis.',
      'Security type for ordinary symbols is not fully verified in the bulk daily feed. Confirm it on the detailed analysis page.',
      'This is an end-of-day watchlist for the next session, not live premarket data, order-entry advice or a day-trade plan.',
      'ETFs, OTC securities and incomplete filings require dedicated due diligence. OTC securities are excluded from this radar.',
      'Only candidates with full, verified stock-analysis scores of at least 80 can appear in the featured Radar. Missing evidence does not count as an 80.',
      'The free plan has request limits. Public or commercial redistribution requires an appropriate market-data license.'
    ]
  };
}

/** A Radar lead is NOT qualified by the Radar priority. Only evidence-backed
 * scores calculated by the very same stock model shown on the stock detail
 * page can earn a featured placement. Never coerce null/unknown into a pass. */
export function qualifyRadarLead(lead:RadarLead,result:RadarRatingSnapshot):RadarLead|null{
  if(result.mode!=='live'||result.instrumentType!=='Stock')return null;
  if(result.symbol!==lead.symbol)return null;
  if(result.marketClassification==='OTC')return null;
  if(result.quote.price<2||result.priceDataAgeDays==null||result.priceDataAgeDays>5)return null;
  // Must be based on the same trading session as the Radar data; stale
  // ratings would be even more misleading than an activity-only screen.
  if(result.quote.timestamp==null)return null;
  if(result.assessmentWarnings?.some(w=>/last available price|very low dollar trading volume/i.test(w)))return null;
  const scorePairs=[
    {name:'Core Investment' as const,score:result.scores.core.score},
    {name:'Active Growth' as const,score:result.scores.growth.score},
    {name:'Asymmetric Opportunity' as const,score:result.scores.asymmetric.score},
    {name:'Swing Trade' as const,score:result.scores.swing.score}
  ];
  const qualifying=scorePairs.filter(x=>x.score!=null&&x.score>=80 &&
    !(x.name==='Swing Trade'&&result.tradePlan.status==='Pass'));
  if(!qualifying.length)return null;
  const best=qualifying.sort((a,b)=>(b.score??0)-(a.score??0))[0];
  const score=best.score!;
  return {
    ...lead,
    verified:{
      core:result.scores.core.score,
      growth:result.scores.growth.score,
      asymmetric:result.scores.asymmetric.score,
      swing:result.scores.swing.score,
      featuredScore:score,
      featuredModel:best.name,
      dataCompleteness:result.dataCompleteness,
      tradeStatus:result.tradePlan.status,
      evidenceAsOf:result.quote.timestamp||'',
      verdict:score>=95?'Elite (95+)':score>=90?'Strong (90+)':'Research Watch (80+)',
      explanation:best.name==='Swing Trade'
        ? score>=90&&result.tradePlan.status==='Qualified Trade'
          ?'An eligible swing-trading setup is shown in the full analysis. Confirm its conditional entry levels with current quotes.'
          :'Technical conditions deserve observation, but no active trading plan is approved.'
        :'This passed the stock research threshold, not necessarily the swing-trade threshold. Check the separate Swing Trade score before attempting a trade.'
    }
  };
}
