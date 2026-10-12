import type { BenchmarkResult, TechnicalSnapshot, Quote } from './types';

export type LeverageDirection='Bull'|'Bear';
export interface LeveragedFund {
  symbol:string;
  name:string;
  index:string;
  direction:LeverageDirection;
  dailyMultiple:number;
  sourceUrl:string;
  opposite?:string;
}
export interface LeveragedAlternative{
  symbol:string; name:string; exposure:string; reason:string;
  isVerifiedNow:false; sourceUrl:string;
}
const direxionSmall='https://www.direxion.com/product/daily-small-cap-bull-bear-3x-etfs';
const direxionSemi='https://www.direxion.com/product/daily-semiconductor-bull-bear-3x-etfs';
const LEVERAGED:Record<string,LeveragedFund>={
 TNA:{symbol:'TNA',name:'Direxion Daily Small Cap Bull 3X Shares',index:'Russell 2000',direction:'Bull',dailyMultiple:3,sourceUrl:direxionSmall,opposite:'TZA'},
 TZA:{symbol:'TZA',name:'Direxion Daily Small Cap Bear 3X Shares',index:'Russell 2000',direction:'Bear',dailyMultiple:-3,sourceUrl:direxionSmall,opposite:'TNA'},
 UPRO:{symbol:'UPRO',name:'ProShares UltraPro S&P500',index:'S&P 500',direction:'Bull',dailyMultiple:3,sourceUrl:'https://www.proshares.com/our-etfs/leveraged-and-inverse/upro',opposite:'SPXU'},
 SPXU:{symbol:'SPXU',name:'ProShares UltraPro Short S&P500',index:'S&P 500',direction:'Bear',dailyMultiple:-3,sourceUrl:'https://www.proshares.com/our-etfs/leveraged-and-inverse/spxu',opposite:'UPRO'},
 TQQQ:{symbol:'TQQQ',name:'ProShares UltraPro QQQ',index:'Nasdaq-100',direction:'Bull',dailyMultiple:3,sourceUrl:'https://www.proshares.com/our-etfs/leveraged-and-inverse/tqqq',opposite:'SQQQ'},
 SQQQ:{symbol:'SQQQ',name:'ProShares UltraPro Short QQQ',index:'Nasdaq-100',direction:'Bear',dailyMultiple:-3,sourceUrl:'https://www.proshares.com/our-etfs/leveraged-and-inverse/sqqq',opposite:'TQQQ'},
 SOXL:{symbol:'SOXL',name:'Direxion Daily Semiconductor Bull 3X Shares',index:'NYSE Semiconductor Index',direction:'Bull',dailyMultiple:3,sourceUrl:direxionSemi,opposite:'SOXS'},
 SOXS:{symbol:'SOXS',name:'Direxion Daily Semiconductor Bear 3X Shares',index:'NYSE Semiconductor Index',direction:'Bear',dailyMultiple:-3,sourceUrl:direxionSemi,opposite:'SOXL'}
};
export function knownLeveraged(symbol:string):LeveragedFund|undefined{return LEVERAGED[symbol.toUpperCase()];}

/** Candidate generation uses only the symbol's EOD trend and VOO's EOD timing.
 * It does not make claims about the alternatives' price charts or current
 * tradability, which require fresh data from the alternatives themselves. */
export function researchAlternatives(symbol:string,trend:TechnicalSnapshot['trend'],benchmarks:BenchmarkResult[]):LeveragedAlternative[]{
 const origin=knownLeveraged(symbol);
 if(!origin)return [];
 const result:LeveragedAlternative[]=[];
 const add=(ticker:string,reason:string)=>{
   const x=LEVERAGED[ticker];
   if(!x||ticker===symbol||result.some(y=>y.symbol===ticker))return;
   result.push({symbol:ticker,name:x.name,exposure:`${x.dailyMultiple>0?'+':''}${x.dailyMultiple}x DAILY ${x.index}`,reason,isVerifiedNow:false,sourceUrl:x.sourceUrl});
 };
 const weak=trend==='down'||trend==='strong-down';
 const strong=trend==='up'||trend==='strong-up';
 if(origin.opposite){
  add(origin.opposite,weak&&origin.direction==='Bull'
   ?'The current fund has a weak end-of-day trend. Its inverse counterpart is worth researching IF the underlying index is also falling. An inverse ETF is not automatically a valid buy.'
   :strong&&origin.direction==='Bear'
   ?'The inverse fund has recently strengthened; compare the bullish side too before assuming the move continues.'
   :'The opposite-direction fund is useful for comparison, but its own trend, volume, spreads and current setup have NOT been checked.');
 }
 const voo=benchmarks.find(x=>x.symbol==='VOO');
 if(origin.index!=='S&P 500'){
  if(voo?.timing!=null&&voo.timing>=75) add('UPRO',`VOO end-of-day timing is ${voo.timing.toFixed(1)}/100. This makes broad-market bullish exposure a candidate to examine, not a verified day trade. Check UPRO itself before acting.`);
  else if(voo?.timing!=null&&voo.timing<55) add('SPXU',`VOO end-of-day timing is ${voo.timing.toFixed(1)}/100. This makes bearish broad-market exposure a candidate to examine, not a verified day trade. Check SPXU itself before acting.`);
 }
 return result;
}
export function leveragedContext(f:LeveragedFund,technical:TechnicalSnapshot,quote:Quote){
 const weak=technical.trend==='down'||technical.trend==='strong-down';
 const strong=technical.trend==='up'||technical.trend==='strong-up';
 const supports= f.direction==='Bull'?strong:weak;
 const opposes=f.direction==='Bull'?weak:strong;
 return {
  headline:opposes?'Prior-day conditions conflict with the fund direction':supports?'Prior-day trend broadly aligns with the fund direction':'Prior-day trend provides no clear directional confirmation',
  summary:`${f.symbol} targets ${f.dailyMultiple>0?'+':''}${f.dailyMultiple}x the DAILY return of the ${f.index}, before fees and expenses. The price trend of this ETF is ${technical.trend.replace('-',' ')}. This is end-of-day context only: there is no verified intraday entry, stop or target. Price: ${quote.price.toFixed(2)} at the last available close.`,
  status:opposes?'Caution':supports?'Research Only':'No Clear Edge'
 };
}
