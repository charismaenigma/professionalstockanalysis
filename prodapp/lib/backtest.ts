export type Candle={time:number;open:number;high:number;low:number;close:number;volume:number};
export const periods=['1d','1w','3w','1m','3m','6m','1y','3y','5y'] as const;
export const intervals=['5m','15m','30m','1h','1d','1w'] as const;
export const strategies=['Conservative Swing','Momentum Breakout','Trend Following','Mean Reversion','Opening Range Breakout','VWAP Pullback','Trend Pullback','Volatility Breakout','Moving Average Crossover','Relative Strength Rotation'] as const;
export type Period=typeof periods[number]; export type Interval=typeof intervals[number]; export type Strategy=typeof strategies[number];
export const intervalAllowed:Record<Period,Interval[]>={
 '1d':['5m','15m','30m','1h'],'1w':['5m','15m','30m','1h'],'3w':['5m','15m','30m','1h'],
 '1m':['15m','30m','1h','1d'],'3m':['1h','1d'],'6m':['1h','1d','1w'],
 '1y':['1d','1w'],'3y':['1d','1w'],'5y':['1d','1w']};
export const recommended:Record<Period,Interval>={'1d':'5m','1w':'15m','3w':'30m','1m':'1h','3m':'1d','6m':'1d','1y':'1d','3y':'1d','5y':'1d'};
const avg=(a:number[])=>a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN;
export const sma=(a:Candle[],n:number,i:number)=>i+1>=n?avg(a.slice(i+1-n,i+1).map(x=>x.close)):NaN;
function atr(a:Candle[],i:number,n=14){if(i<n)return NaN;return avg(a.slice(i-n+1,i+1).map((x,j)=>{const prev=a[i-n+j]?.close??x.open;return Math.max(x.high-x.low,Math.abs(x.high-prev),Math.abs(x.low-prev));}));}
function rsi(a:Candle[],i:number,n=14){if(i<n)return NaN;let up=0,down=0;for(let k=i-n+1;k<=i;k++){const delta=a[k].close-a[k-1].close;up+=Math.max(0,delta);down+=Math.max(0,-delta);}return down===0?100:100-100/(1+up/down);}
export type Signal={enter:boolean;exit:boolean};
export function signal(a:Candle[],i:number,s:Strategy):Signal {
 if(i<2)return {enter:false,exit:false};
 const c=a[i],p=a[i-1],m20=sma(a,20,i),m50=sma(a,50,i),old20=sma(a,20,i-1),old50=sma(a,50,i-1),v=avg(a.slice(Math.max(0,i-20),i).map(x=>x.volume));
 const range=a.slice(Math.max(0,i-20),i),high=Math.max(...range.map(x=>x.high)),low=Math.min(...range.map(x=>x.low)),r=rsi(a,i),vol=atr(a,i);
 const trend=Number.isFinite(m20)&&Number.isFinite(m50)&&m20>m50;
 const breakout=c.close>high&&c.volume>v*1.2;
 switch(s){
 case 'Conservative Swing':return {enter:trend&&r>=48&&r<=68&&c.close>m20&&c.close<p.close*1.03,exit:c.close<m20||r>78};
 case 'Momentum Breakout':return {enter:breakout,exit:c.close<m20};
 case 'Trend Following':return {enter:trend&&c.close>m20&&p.close<=old20,exit:c.close<m20};
 case 'Mean Reversion':return {enter:Number.isFinite(m20)&&Number.isFinite(vol)&&c.close<m20-vol*1.5&&r<35,exit:c.close>=m20};
 case 'Opening Range Breakout': {const d=new Date(c.time).toISOString().slice(0,10);const today=a.slice(0,i+1).filter(x=>new Date(x.time).toISOString().slice(0,10)===d);return {enter:today.length>=4&&today.length<=15&&c.close>Math.max(...today.slice(0,3).map(x=>x.high)),exit:today.length>35};}
 case 'VWAP Pullback':{const w=range.reduce((acc,x)=>acc+x.volume,0);const vw=w?range.reduce((acc,x)=>acc+x.close*x.volume,0)/w:NaN;return {enter:c.close>vw&&p.close<=vw&&trend,exit:c.close<vw};}
 case 'Trend Pullback':return {enter:trend&&p.close<m20&&c.close>m20,exit:c.close<m50};
 case 'Volatility Breakout':return {enter:Number.isFinite(vol)&&c.close>p.high&&c.high-c.low>vol*1.4,exit:c.close<m20};
 case 'Moving Average Crossover':return {enter:trend&&old20<=old50,exit:m20<m50};
 case 'Relative Strength Rotation':return {enter:false,exit:false}; // requires historical comparison universe; not silently approximated
 }
}
export type Fill={entered:string;exited:string;entry:number;exit:number;profit:number;reason:string;shares:number;entryCost:number;exitProceeds:number;returnPct:number;stop:number;target:number};
export function backtest(candles:Candle[],strategy:Strategy,riskPct=.25,initial=5000,startAt=20,slots:2|3=3){
 if(strategy==='Relative Strength Rotation')throw new Error('Relative Strength Rotation requires synchronized multi-asset history and is not yet implemented.');
 if(candles.length<25||startAt>=candles.length)throw new Error('Insufficient bars: at least 25 completed candles are required.');
 if(!Number.isFinite(initial)||initial<=0)throw new Error('Invalid simulation trading sleeve');
 if(![2,3].includes(slots))throw new Error('Choose two or three trading slots');
 if(!Number.isFinite(riskPct)||riskPct<.1||riskPct>1)throw new Error('Invalid risk percentage');
 const cash0=initial;let cash=initial,shares=0,entry=0,entryTime='',stop=0,target=0,cost=0,peak=initial,maxDD=0,exposure=0;
 const trades:Fill[]=[];const curve:{time:number;equity:number}[]=[]; const feeBps=10;
 // signal on prior completed bar; orders fill no earlier than NEXT bar open; exit stop-first on ambiguous candles
 for(let i=Math.max(20,startAt);i<candles.length;i++){
  const b=candles[i],prev=candles[i-1],sig=signal(candles,i-1,strategy);
  let closedThisBar=false;
  if(shares){
   let out=0,why='';
   if(b.open<=stop){out=b.open;why='gap stop';}else if(b.open>=target){out=b.open;why='gap target';}
   else if(b.low<=stop){out=stop;why='stop';}else if(b.high>=target){out=target;why='target';}
   else if(sig.exit){out=b.open;why='signal';}
   if(out>0){const proceeds=shares*out*(1-feeBps/10000);cash+=proceeds;const profit=proceeds-cost;
    trades.push({entered:entryTime,exited:new Date(b.time).toISOString(),entry,exit:out,profit:Math.round(profit*100)/100,reason:why,shares,entryCost:Math.round(cost*100)/100,exitProceeds:Math.round(proceeds*100)/100,returnPct:profit/cost*100,stop,target});
    shares=0;cost=0;closedThisBar=true;}
  }
  // Never retroactively buy at this candle's open after an intrabar exit.
  if(!shares&&!closedThisBar&&sig.enter&&i<candles.length-1){
   const volatility=atr(candles,i-1);
   const dist=Number.isFinite(volatility)&&volatility>0?volatility*1.5:prev.close*.025;
   const ask=b.open*(1+feeBps/10000);
   // Risk is a percentage of the *trading sleeve*, not the reserved 95% core.
   // Each ticker is capped at one of 2/3 concurrent-position slots (this single-symbol engine does not model other symbols).
   const currentSleeveEquity=cash+shares*b.open;
   const qty=Math.floor(Math.min(currentSleeveEquity*riskPct/100/dist,currentSleeveEquity/slots/ask,cash*.70/ask));
   if(qty>0&&ask>dist){shares=qty;entry=ask;entryTime=new Date(b.time).toISOString();stop=Math.max(.01,Math.round((ask-dist)*100)/100);target=Math.round((ask+2*dist)*100)/100;cost=qty*ask;cash-=cost;}
  }
  const equity=cash+shares*b.close;peak=Math.max(peak,equity);maxDD=Math.max(maxDD,(peak-equity)/peak*100);
  if(shares)exposure++;curve.push({time:b.time,equity:Math.round(equity*100)/100});
 }
 const last=candles[candles.length-1];const equity=cash+shares*last.close;
 const wins=trades.filter(t=>t.profit>0),losses=trades.filter(t=>t.profit<0);
 const gp=wins.reduce((a,t)=>a+t.profit,0),gl=-losses.reduce((a,t)=>a+t.profit,0);
 const tradeReturns=trades.map(t=>t.returnPct);
 const avgTradeReturnPct=tradeReturns.length?avg(tradeReturns):null;
 const bestTradeReturnPct=tradeReturns.length?Math.max(...tradeReturns):null;
 const worstTradeReturnPct=tradeReturns.length?Math.min(...tradeReturns):null;
 const realizedPnl=trades.reduce((sum,t)=>sum+t.profit,0);
 return {strategy,initial,equity,slots,tradingSleeveInitial:initial,tradingSleeveReturnPct:(equity/cash0-1)*100,
  averageTradeReturnPct:avgTradeReturnPct,bestTradeReturnPct,worstTradeReturnPct,realizedPnl:Math.round(realizedPnl*100)/100,
  returnPct:(equity/cash0-1)*100,holdPct:(last.close/candles[Math.max(20,startAt)].open-1)*100,
  closedTrades:trades.length,winRate:trades.length?wins.length/trades.length*100:null,profitFactor:gl>0?gp/gl:null,
  maxDrawdownPct:maxDD,timeInMarketPct:exposure/Math.max(1,curve.length)*100,openPosition:shares>0,
  openTrade:shares>0?{
    entered:entryTime,entry,stop,target,shares,lastPrice:last.close,
    unrealizedPnl:Math.round((shares*last.close-cost)*100)/100,
    unrealizedReturnPct:(shares*last.close-cost)/cost*100,
  }:null,
  trades:trades.reverse(),curve,
  assumptions:'Historical single-ticker simulation only: entries at next bar open, 10 bps price friction on entry and exit; risk budget is based on the trading sleeve, with a per-position cap of one of '+slots+' slots. Intrabar stop-loss takes precedence over target; overnight gaps may exceed stops. No simultaneous multi-ticker backtest, VOO price series, tax modeling, shorting, or live brokerage orders.'};
}
