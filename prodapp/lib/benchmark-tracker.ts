import type {DailyBar,Candidate} from './opportunity-lab';

/** Reference funds used to assess the SAME historical price window as screened stocks.
 * VOO is S&P 500 exposure, NOT a total-US-stock-market fund.
 */
export const BENCHMARKS=[
 {ticker:'VOO',sector:'S&P 500 — primary market benchmark'},
 {ticker:'VTI',sector:'Total US stock market — broad-market benchmark'},
 {ticker:'XLK',sector:'Technology'},
 {ticker:'XLC',sector:'Communication Services'},
 {ticker:'XLE',sector:'Energy'},
 {ticker:'XLF',sector:'Financials'},
 {ticker:'XLV',sector:'Health Care'},
 {ticker:'XLI',sector:'Industrials'},
 {ticker:'XLU',sector:'Utilities'},
 {ticker:'XLY',sector:'Consumer Discretionary'},
 {ticker:'XLP',sector:'Consumer Staples'},
 {ticker:'XLB',sector:'Materials'},
 {ticker:'XLRE',sector:'Real Estate'},
] as const;
export type ReviewHorizon='1d'|'1w'|'1m';
export type PriceComparison={ticker:string;startOpen:number|null;endClose:number|null;returnPct:number|null;vsVooPctPoints:number|null};
export type BenchmarkComparison=PriceComparison&{sector:string};
const ms=86400000;
const iso=(d:Date)=>d.toISOString().slice(0,10);
function daysFrom(date:string,days:number){return new Date(Date.parse(date+'T12:00:00Z')+days*ms);}
function previousWeekday(date:string){let d=new Date(date+'T12:00:00Z');while([0,6].includes(d.getUTCDay()))d=new Date(d.getTime()-ms);return iso(d);}
const round=(x:number)=>Number(x.toFixed(2));
const ret=(entry:number,exit:number)=>entry>0&&exit>0?round((exit/entry-1)*100):null;
export function reviewWindow(start:string,horizon:ReviewHorizon,lastCompleted:string){
 const target=horizon==='1d'?start:previousWeekday(iso(daysFrom(start,horizon==='1w'?7:30)));
 const end=target<=lastCompleted?target:lastCompleted;
 return {requestedEnd:target,end:end>=start?end:null,complete:end>=target,sessionStart:start};
}
export function comparePrices(
 selected:Pick< Candidate,'ticker'>[],
 entry:DailyBar[],finish:DailyBar[],endDate:string
){
 const atOpen=new Map(entry.map(b=>[b.ticker,b]));
 const atClose=new Map(finish.map(b=>[b.ticker,b]));
 const start=(ticker:string)=>atOpen.get(ticker)?.open??null;
 const end=(ticker:string)=>atClose.get(ticker)?.close??null;
 const make=(ticker:string):PriceComparison=>{
  const a=start(ticker),b=end(ticker);
  return {ticker,startOpen:a,endClose:b,returnPct:a!==null&&b!==null?ret(a,b):null,vsVooPctPoints:null};
 };
 const voo=make('VOO');
 const withRelative=(x:PriceComparison)=>({
  ...x,vsVooPctPoints:x.returnPct!==null&&voo.returnPct!==null?round(x.returnPct-voo.returnPct):null
 });
 const benchmarks:BenchmarkComparison[]=BENCHMARKS.map(x=>({...withRelative(make(x.ticker)),sector:x.sector}));
 const tracked=selected.map(x=>withRelative(make(x.ticker)));
 return {endDate,benchmarks,tracked,method:'Same historical window: first selected-session open to the last available completed session close. Split-adjusted market prices; dividends, fees and trade execution not included.'};
}
