import {intraday,PERIODS,STRATEGIES,type IntervalId,type StrategyId,type PeriodId} from './config';
import {type Candle,fetchHistoricalBars} from './history';

type Indicator={sma10:number|null;sma20:number|null;sma30:number|null;sma50:number|null;
  rsi:number|null;atr:number|null;averageVolume:number|null;std20:number|null;
  high20:number|null;vwap:number|null;openingHigh:number|null;minute:number};

export interface BacktestTrade {entry:string;exit:string;qty:number;entryPrice:number;exitPrice:number;pnl:number;returnPct:number;reason:string}
export interface BacktestStrategyResult {
  id:StrategyId;name:string;status:'tested'|'incompatible'|'insufficient-data';notice?:string;
  trades:number;wins:number;winRate:number|null;returnPct:number;realizedPnl:number;
  maxDrawdownPct:number;profitFactor:number|null;averageTradePct:number|null;
  curve:Array<{date:string;equity:number}>;recentTrades:BacktestTrade[];
}
export interface BacktestReport {
  symbol:string;period:PeriodId;interval:IntervalId;first:string;last:string;
  sampleBars:number;warmupBars:number;source:string;initialEquity:number;
  benchmarkReturnPct:number;slippagePct:number;allocationLimitPct:number;
  coverageWarning?:string;
  results:BacktestStrategyResult[];disclaimer:string;
}

function mean(values:number[]):number|null {return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;}
function average(bars:Candle[],end:number,size:number,key:'close'|'volume'){
  if(end-size+1<0)return null;
  return mean(bars.slice(end-size+1,end+1).map(b=>b[key]));
}
function deviation(bars:Candle[],end:number,size:number,avg:number|null){
  if(avg==null||end-size+1<0)return null;
  const v=bars.slice(end-size+1,end+1).reduce((a,b)=>a+(b.close-avg)**2,0)/size;
  return Math.sqrt(v);
}
function rsi(bars:Candle[],i:number){
  if(i<14)return null;
  let gains=0,losses=0;
  for(let k=i-13;k<=i;k++){
    const change=bars[k].close-bars[k-1].close;
    gains+=Math.max(change,0);losses+=Math.max(-change,0);
  }
  if(!losses)return gains?100:50;
  return 100-100/(1+gains/losses);
}
function trueRange(b:Candle,previous:Candle){
  return Math.max(b.high-b.low,Math.abs(b.high-previous.close),Math.abs(b.low-previous.close));
}
function atr(bars:Candle[],i:number){
  if(i<14)return null;
  let total=0;
  for(let k=i-13;k<=i;k++)total+=trueRange(bars[k],bars[k-1]);
  return total/14;
}
function minutesNY(timestamp:string){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(timestamp));
  const x=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return Number(x.hour)*60+Number(x.minute);
}
function indicators(bars:Candle[],interval:IntervalId):Indicator[]{
  let cumulativePV=0,cumulativeV=0,session='',openingHigh=0;
  return bars.map((b,i)=>{
    if(b.day!==session){session=b.day;cumulativePV=0;cumulativeV=0;openingHigh=0;}
    const minute=intraday(interval)?minutesNY(b.timestamp):0;
    if(intraday(interval)&&minute<600)openingHigh=Math.max(openingHigh,b.high);
    cumulativePV+=(b.vwap??(b.high+b.low+b.close)/3)*b.volume;
    cumulativeV+=b.volume;
    const sma20=average(bars,i,20,'close');
    return {sma10:average(bars,i,10,'close'),sma20,sma30:average(bars,i,30,'close'),sma50:average(bars,i,50,'close'),
      rsi:rsi(bars,i),atr:atr(bars,i),averageVolume:average(bars,i-1,20,'volume'),
      std20:deviation(bars,i,20,sma20),high20:i>=20?Math.max(...bars.slice(i-20,i).map(x=>x.high)):null,
      vwap:cumulativeV>0?cumulativePV/cumulativeV:null,
      openingHigh:openingHigh||null,minute};
  });
}
function pct(current:number,old:number){return old>0?(current/old-1)*100:0;}
function outperformance(bars:Candle[],index:number,benchmark:Map<string,number>){
  if(index<20)return null;
  const current=benchmark.get(bars[index].timestamp),past=benchmark.get(bars[index-20].timestamp);
  if(current==null||past==null||past<=0)return null;
  return pct(bars[index].close,bars[index-20].close)-pct(current,past);
}

export function signalAt(
  strategy:StrategyId,bars:Candle[],stats:Indicator[],i:number,
  interval:IntervalId,benchmark:Map<string,number>=new Map(),
):boolean{
  if(i<2)return false;
  const b=bars[i],p=bars[i-1],s=stats[i],last=stats[i-1];
  if(!b||!p||!s||!last||s.atr==null||s.atr<=0||s.sma20==null||s.averageVolume==null)return false;
  const up=s.sma50!=null&&s.sma20>s.sma50;
  switch(strategy){
    case 'conservative_swing':
      return up&&s.rsi!=null&&s.rsi>=45&&s.rsi<=65&&b.close>s.sma20&&b.volume>1.1*s.averageVolume&&
        last.sma20!=null&&last.sma50!=null&&last.sma20>last.sma50&&b.close>p.close;
    case 'momentum_breakout':return s.high20!=null&&b.close>s.high20&&b.volume>=1.2*s.averageVolume;
    case 'trend_following':return up&&last.sma20!=null&&p.close<=last.sma20&&b.close>s.sma20;
    case 'mean_reversion':return s.std20!=null&&s.rsi!=null&&s.rsi<35&&b.close<s.sma20-1.8*s.std20;
    case 'opening_range':return intraday(interval)&&interval!=='1Hour'&&s.openingHigh!=null&&
      s.minute>=600&&s.minute<930&&b.close>s.openingHigh&&p.close<=s.openingHigh;
    case 'vwap_pullback':return intraday(interval)&&s.vwap!=null&&last.vwap!=null&&
      s.minute>=600&&s.minute<930&&p.close<last.vwap&&b.close>s.vwap&&b.close>b.open;
    case 'trend_pullback':return up&&last.sma20!=null&&p.low<=last.sma20&&b.close>s.sma20&&b.close>b.open;
    case 'volatility_breakout':return b.close>s.sma20&&b.close>b.open&&
      trueRange(b,p)>1.5*s.atr&&b.close>=b.low+(b.high-b.low)*0.8;
    case 'ma_crossover':return s.sma10!=null&&s.sma30!=null&&last.sma10!=null&&last.sma30!=null&&
      s.sma10>s.sma30&&last.sma10<=last.sma30;
    case 'relative_strength':{
      if(!up||i<21)return false;
      const current=outperformance(bars,i,benchmark),previous=outperformance(bars,i-1,benchmark);
      return current!=null&&previous!=null&&current>=3&&previous<3;
    }
  }
}

function sampledCurve(curve:Array<{date:string;equity:number}>) {
  if(curve.length<=180)return curve;
  const out=[];
  for(let i=0;i<180;i++)out.push(curve[Math.round(i*(curve.length-1)/179)]);
  return out;
}
function drawdown(curve:Array<{date:string;equity:number}>){
  let peak=100000,max=0;
  for(const point of curve){peak=Math.max(peak,point.equity);if(peak>0)max=Math.max(max,(peak-point.equity)/peak*100);}
  return max;
}
const round=(value:number)=>Math.round(value*100)/100;

/** Deterministic long-only replay: signal on close, fill no earlier than NEXT open. */
export function simulate(
  strategy:StrategyId,bars:Candle[],startIndex:number,interval:IntervalId,
  benchmark:Map<string,number>=new Map(),
):BacktestStrategyResult {
  const meta=STRATEGIES.find(s=>s.id===strategy)!;
  const initialEquity=100000,slip=0.001;
  const empty=(status:BacktestStrategyResult['status'],notice:string):BacktestStrategyResult=>({
    id:strategy,name:meta.name,status,notice,trades:0,wins:0,winRate:null,returnPct:0,realizedPnl:0,
    maxDrawdownPct:0,profitFactor:null,averageTradePct:null,curve:[],recentTrades:[],
  });
  if(meta.intradayOnly&&!intraday(interval))return empty('incompatible','Intraday-only strategy; choose a minute/hourly interval.');
  if(strategy==='opening_range'&&interval==='1Hour')return empty('incompatible','An hourly bar is too coarse for a 30-minute opening range.');
  if(bars.length<meta.minBars||bars.length-startIndex<2)return empty('insufficient-data','Not enough completed bars to evaluate this period.');
  const stats=indicators(bars,interval);
  let cash=initialEquity;
  let position:{qty:number;entryPrice:number;entryDate:string;entryIndex:number;stop:number;target:number}|null=null;
  let pending:{index:number;atr:number}|null=null;
  const trades:BacktestTrade[]=[],curve:Array<{date:string;equity:number}>=[];
  const maxHold=strategy==='trend_following'||strategy==='ma_crossover'||strategy==='relative_strength'?60:20;
  for(let i=Math.max(0,startIndex-1);i<bars.length;i++){
    const bar=bars[i],isLast=i===bars.length-1;
    const intendedEntry=pending as {index:number;atr:number}|null;
    if(intendedEntry?.index===i){
      const buy=bar.open*(1+slip),risk=Math.max(intendedEntry.atr*1.5,buy*0.02);
      const qty=Math.floor(Math.min(cash*0.05/buy,cash*0.0025/risk));
      if(qty>=1&&buy>risk){cash-=qty*buy;position={qty,entryPrice:buy,entryDate:bar.timestamp,entryIndex:i,stop:buy-risk,target:buy+2*risk};}
      pending=null;
    }
    if(position){
      const pos=position;
      const intradayExit=meta.intradayOnly&&(!bars[i+1]||bars[i+1].day!==bar.day);
      let sell:number|null=null,reason='';
      // If both stop and target fall within one candle, assume the STOP was hit first.
      if(bar.open<=pos.stop){sell=bar.open*(1-slip);reason='Gap through stop';}
      else if(bar.low<=pos.stop){sell=pos.stop*(1-slip);reason='Stop loss';}
      else if(bar.high>=pos.target){sell=pos.target*(1-slip);reason='Take profit';}
      else if(intradayExit||i-pos.entryIndex>=maxHold||isLast){sell=bar.close*(1-slip);reason=intradayExit?'Session close':isLast?'Test ended':'Time exit';}
      if(sell!=null){
        cash+=pos.qty*sell;
        const pnl=(sell-pos.entryPrice)*pos.qty;
        trades.push({entry:pos.entryDate,exit:bar.timestamp,qty:pos.qty,entryPrice:round(pos.entryPrice),
          exitPrice:round(sell),pnl:round(pnl),returnPct:round(pct(sell,pos.entryPrice)),reason});
        position=null;
      }
    }
    if(i>=startIndex)curve.push({date:bar.timestamp,equity:cash+(position?position.qty*bar.close:0)});
    if(i>=startIndex-1&&!position&&!pending&&!isLast&&
      (!meta.intradayOnly||bars[i+1].day===bar.day)&&
      signalAt(strategy,bars,stats,i,interval,benchmark)){
      const nextAtr:number|null=stats[i].atr;
      if(nextAtr!=null)pending={index:i+1,atr:nextAtr};
    }
  }
  const wins=trades.filter(t=>t.pnl>0).length;
  const grossWin=trades.filter(t=>t.pnl>0).reduce((sum,t)=>sum+t.pnl,0);
  const grossLoss=trades.filter(t=>t.pnl<0).reduce((sum,t)=>sum-t.pnl,0);
  const end=cash+(position?position.qty*bars.at(-1)!.close:0);
  return {id:strategy,name:meta.name,status:'tested',trades:trades.length,wins,
    winRate:trades.length?round(wins/trades.length*100):null,
    returnPct:round(pct(end,initialEquity)),realizedPnl:round(end-initialEquity),
    maxDrawdownPct:round(drawdown(curve)),profitFactor:grossLoss>0?round(grossWin/grossLoss):null,
    averageTradePct:trades.length?round(trades.reduce((a,t)=>a+t.returnPct,0)/trades.length):null,
    curve:sampledCurve(curve).map(p=>({...p,equity:round(p.equity)})),recentTrades:trades.slice(-20).reverse(),
  };
}

export async function runBacktest(symbol:string,period:PeriodId,interval:IntervalId):Promise<BacktestReport>{
  const [history,spy]=await Promise.all([
    fetchHistoricalBars(symbol,period,interval),fetchHistoricalBars('SPY',period,interval),
  ]);
  const benchmark=new Map(spy.bars.map(b=>[b.timestamp,b.close]));
  const first=history.bars[history.startIndex],last=history.bars.at(-1)!;
  const matchedAllocationReturn=first&&first.open>0
    ?round(pct(last.close*0.999,first.open*1.001)*0.05):0;
  const availableSessions=new Set(history.bars.slice(history.startIndex).map(b=>b.day)).size;
  const requestedSessions=PERIODS.find(p=>p.id===period)!.sessions;
  const effectiveSessions=interval==='1Week'?availableSessions*5:availableSessions;
  const coverageWarning=effectiveSessions<requestedSessions*0.8
    ?`Only ${availableSessions} historical ${interval==='1Week'?'weeks':'market days'} with IEX candles were available for this requested period. Comparisons may cover less time than selected.`:undefined;
  return {symbol,period,interval,first:first?.day??'',last:last.day,
    sampleBars:history.bars.length-history.startIndex,warmupBars:history.startIndex,
    source:history.source,initialEquity:100000,
    benchmarkReturnPct:matchedAllocationReturn,slippagePct:0.1,allocationLimitPct:5,coverageWarning,
    results:STRATEGIES.map(s=>simulate(s.id,history.bars,history.startIndex,interval,benchmark)),
    disclaimer:'Historical simulation, not actual Alpaca paper fills. Signals use completed bars; entries use the next bar open. ' +
      'A 0.1% adverse price adjustment is applied on both sides. Assumes at most one open long position, 5% equity allocation, ' +
      '0.25% nominal equity risk, hypothetical stop/target fills and no fees or dividends. IEX is one exchange; results may omit ' +
      'other market activity. The Conservative Swing model is a technical proxy, not a historical replay of current SEC/AI scores.',
  };
}

export async function latestResearch(symbols:string[]) {
  return Promise.all(symbols.slice(0,5).map(async symbol=>{
    try{
      const h=await fetchHistoricalBars(symbol,'3m','1Day');
      const lastIndex=h.bars.length-1,stats=indicators(h.bars,'1Day');
      const triggers=STRATEGIES.filter(s=>s.id!=='relative_strength'&&!s.intradayOnly&&
        signalAt(s.id,h.bars,stats,lastIndex,'1Day')).map(s=>s.name);
      return {symbol,asOf:h.bars[lastIndex].day,close:h.bars[lastIndex].close,
        triggers,details:'Completed daily bar only. All live quote, spread, order and risk checks remain pending.'};
    }catch(error){return {symbol,error:error instanceof Error?error.message:'History unavailable'};}
  }));
}
