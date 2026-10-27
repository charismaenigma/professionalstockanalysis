export const PERIODS = [
  {id:'1d', label:'Most recent market day', sessions:1, days:14, intervals:['5Min','15Min','30Min','1Hour'], defaultInterval:'5Min'},
  {id:'1w', label:'1 week', sessions:5, days:20, intervals:['5Min','15Min','30Min','1Hour'], defaultInterval:'15Min'},
  {id:'3w', label:'3 weeks', sessions:15, days:36, intervals:['5Min','15Min','30Min','1Hour'], defaultInterval:'30Min'},
  {id:'1m', label:'1 month', sessions:21, days:46, intervals:['15Min','30Min','1Hour','1Day'], defaultInterval:'1Hour'},
  {id:'3m', label:'3 months', sessions:63, days:112, intervals:['1Hour','1Day'], defaultInterval:'1Day'},
  {id:'6m', label:'6 months', sessions:126, days:210, intervals:['1Hour','1Day','1Week'], defaultInterval:'1Day'},
  {id:'1y', label:'1 year', sessions:252, days:394, intervals:['1Day','1Week'], defaultInterval:'1Day'},
  {id:'3y', label:'3 years', sessions:756, days:1140, intervals:['1Day','1Week'], defaultInterval:'1Day'},
  {id:'5y', label:'5 years', sessions:1260, days:1880, intervals:['1Day','1Week'], defaultInterval:'1Day'},
] as const;

export type PeriodId = typeof PERIODS[number]['id'];
export type IntervalId = '5Min'|'15Min'|'30Min'|'1Hour'|'1Day'|'1Week';
export type StrategyId = 'conservative_swing'|'momentum_breakout'|'trend_following'|'mean_reversion'|'opening_range'|'vwap_pullback'|'trend_pullback'|'volatility_breakout'|'ma_crossover'|'relative_strength';

export const STRATEGIES: Array<{id:StrategyId;name:string;horizon:string;intradayOnly?:boolean;minBars:number}> = [
  {id:'conservative_swing',name:'Conservative Swing (technical proxy)',horizon:'Swing',minBars:55},
  {id:'momentum_breakout',name:'Momentum Breakout',horizon:'Intraday / Swing',minBars:25},
  {id:'trend_following',name:'Trend Following',horizon:'Swing / Position',minBars:55},
  {id:'mean_reversion',name:'Mean Reversion',horizon:'Intraday / Swing',minBars:25},
  {id:'opening_range',name:'Opening Range Breakout',horizon:'Intraday',intradayOnly:true,minBars:5},
  {id:'vwap_pullback',name:'VWAP Pullback',horizon:'Intraday',intradayOnly:true,minBars:5},
  {id:'trend_pullback',name:'Trend Pullback',horizon:'Swing',minBars:55},
  {id:'volatility_breakout',name:'Volatility Breakout',horizon:'Intraday / Swing',minBars:25},
  {id:'ma_crossover',name:'Moving Average Crossover',horizon:'Swing / Position',minBars:55},
  {id:'relative_strength',name:'Relative Strength vs SPY',horizon:'Swing / Position',minBars:55},
];

export function validateSelection(period: string, interval: string) {
  const p = PERIODS.find(x=>x.id===period);
  if(!p || !(p.intervals as readonly string[]).includes(interval))throw new Error('Choose a supported testing period and candle interval.');
  return p;
}

export const intraday = (interval:string)=>!['1Day','1Week'].includes(interval);
