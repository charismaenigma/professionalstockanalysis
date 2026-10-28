/** Research-only, point-in-time daily universe scanner. Versioned and deterministic.
 * Inputs from the previous two completed trading sessions only. NOT an execution strategy.
 */
export const SCREENER_VERSION='daily-universe-v0.1.1';
export type ScreenerMode='day'|'swing';
export type DailyBar={ticker:string;date:string;open:number;high:number;low:number;close:number;volume:number};
export type Features={price:number;volume:number;dollarVolume:number;relativeVolume:number;previousReturnPct:number;previousRangePct:number};
export type Candidate={ticker:string;score:number;rank:number;features:Features;reasons:string[]};
export type Observed={ticker:string;open:number;close:number;high:number;low:number;openToClosePct:number;maxFavorableFromOpenPct:number;maxAdverseFromOpenPct:number};
export type Missed=Observed&{priorRank:number|null;reason:string};
const pct=(a:number,b:number)=>b>0?(a/b-1)*100:0;
const round=(v:number,d=2)=>Number(v.toFixed(d));
export function eligible(previous:DailyBar,earlier:DailyBar):{ok:boolean;reason:string}{
 const symbol=previous.ticker;
 if(!/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(symbol))return {ok:false,reason:'Symbol format excluded (could include warrants or other non-common securities)'};
 if(previous.close<5||previous.close>1000)return {ok:false,reason:'Prior close outside $5–$1,000 screen range'};
 if(previous.volume<500000||previous.close*previous.volume<10000000)return {ok:false,reason:'Prior trading liquidity below threshold'};
 if(earlier.volume<=0||earlier.close<=0)return {ok:false,reason:'Insufficient prior volume or price baseline'};
 return {ok:true,reason:'Eligible price and daily liquidity'};
}
export function rankCandidates(earlier:DailyBar[],previous:DailyBar[],mode:ScreenerMode){
 const map=new Map(earlier.map(b=>[b.ticker,b]));
 const ranked:{ticker:string;score:number;features:Features;reasons:string[]}[]=[];
 const discarded=new Map<string,string>();
 for(const b of previous){
  const old=map.get(b.ticker);
  if(!old){discarded.set(b.ticker,'No prior-session baseline');continue;}
  const check=eligible(b,old);
  if(!check.ok){discarded.set(b.ticker,check.reason);continue;}
  const rv=b.volume/old.volume,move=pct(b.close,old.close),range=(b.high-b.low)/b.close*100;
  const dollarVolume=b.volume*b.close;
  // Fixed research rubric—not calibrated win probability, and never based on audit-day data.
  const score=mode==='day'
    ?Math.max(0,Math.min(100,50+Math.max(-20,Math.min(20,move*2.5))+Math.max(-18,Math.min(24,Math.log2(rv)*14))+Math.max(-6,Math.min(12,range*1.5))))
    :Math.max(0,Math.min(100,50+Math.max(-30,Math.min(28,move*3.2))+Math.max(-15,Math.min(16,Math.log2(rv)*9))-Math.max(0,range-9)*2));
  const reasons=[
   move>0?'Prior close was '+round(move)+'% above the earlier close':'Prior session did not establish positive close-to-close momentum',
   'Prior volume was '+round(rv)+'× the earlier session',
   'Prior intraday range was '+round(range)+'%',
  ];
  ranked.push({ticker:b.ticker,score:round(score,1),features:{price:b.close,volume:b.volume,dollarVolume,relativeVolume:round(rv),previousReturnPct:round(move),previousRangePct:round(range)},reasons});
 }
 ranked.sort((a,b)=>b.score-a.score||a.ticker.localeCompare(b.ticker));
 const all=ranked.map((c,i)=>({...c,rank:i+1}));
 return {all,eligibleCount:all.length,discarded};
}
export function auditCandidates(
 ranked:Candidate[],actual:DailyBar[],discarded:Map<string,string>,topCount=10
){
 const outcome=new Map(actual.map(b=>[b.ticker,b]));
 const observations=new Map<string,Observed>();
 for(const a of actual){
  if(!(a.open>0&&a.close>0&&a.high>=a.low&&a.low>0))continue;
  observations.set(a.ticker,{ticker:a.ticker,open:a.open,close:a.close,high:a.high,low:a.low,
   openToClosePct:round(pct(a.close,a.open)),maxFavorableFromOpenPct:round(pct(a.high,a.open)),maxAdverseFromOpenPct:round(pct(a.low,a.open))});
 }
 const selected=ranked.slice(0,topCount);
 const observedPicks=selected.map(p=>({pick:p,observed:observations.get(p.ticker)||null}));
 const picked=new Set(selected.map(x=>x.ticker));
 const allRank=new Map(ranked.map(x=>[x.ticker,x.rank]));
 // Diagnostic-only post-session eligibility: cannot influence earlier screening decisions.
 // Include big liquid movers that were unranked, so the "missed" table can explain filtering failures.
 const auditedUniverse=[...observations.values()].filter(x=>{
  const b=outcome.get(x.ticker)!;
  return /^[A-Z]{1,5}(?:\.[A-Z])?$/.test(x.ticker)
   &&b.close>=5&&b.close<=1000&&b.volume>=500000&&b.close*b.volume>=10000000;
 }).sort((a,b)=>b.openToClosePct-a.openToClosePct||a.ticker.localeCompare(b.ticker));
 const leaders=auditedUniverse.slice(0,20);
 const captured=leaders.filter(x=>picked.has(x.ticker));
 const missed:Missed[]=auditedUniverse.filter(x=>!picked.has(x.ticker)&&x.openToClosePct>0).slice(0,10).map(x=>({
  ...x,priorRank:allRank.get(x.ticker)||null,
  reason:allRank.has(x.ticker)
   ?'Screened but ranked below the top '+topCount
   :discarded.get(x.ticker)||'No usable pre-session baseline or eligibility was unavailable'
 }));
 const missedTotal=auditedUniverse.filter(x=>!picked.has(x.ticker)&&x.openToClosePct>0).length;
 const observed=observedPicks.filter(x=>x.observed!=null).map(x=>x.observed!);
 const positives=observed.filter(x=>x.openToClosePct>0).length;
 const equalAverage=(xs:number[])=>xs.length?round(xs.reduce((a,b)=>a+b,0)/xs.length):null;
 return {observedPicks,missed,capturedLeaders:captured.length,leaderCount:leaders.length,
  observedPickCount:observed.length,positiveMoveCount:positives,observedPositiveRate:observed.length?round(positives/observed.length*100):null,
  averageOpenToClosePct:equalAverage(observed.map(x=>x.openToClosePct)),missedPositiveEligibleCount:missedTotal,
  auditUniverseCount:auditedUniverse.length,
  caveat:'All move statistics are hindsight open-to-close observations, NOT simulated fills or strategy returns. Highs and lows may not have been executable. Intraday timing, spread, slippage and short-sale rules are not modeled.'};
}
