import type { ModelScore, ScoreComponent, TechnicalSnapshot } from './types';

export interface FundProfile {
  symbol:'VOO'|'VTI';
  name:string;
  tracks:string;
  portfolioDescription:string;
  expenseRatioPct:number;
  expenseAsOf:string;
  approximateHoldings:number;
  holdingsAsOf:string;
  sourceUrl:string;
  concentrationNote:string;
}
export const FUNDS:Record<'VOO'|'VTI',FundProfile>={
  VOO:{
    symbol:'VOO',name:'Vanguard S&P 500 ETF',
    tracks:'S&P 500 Index',
    portfolioDescription:'Owns shares in roughly 500 of the largest publicly traded U.S. companies through one fund.',
    expenseRatioPct:0.03,expenseAsOf:'2026-04-28',
    approximateHoldings:505,holdingsAsOf:'2026-07-31',
    sourceUrl:'https://advisors.vanguard.com/investments/products/voo/vanguard-sp-500-etf',
    concentrationNote:'Concentrated in U.S. large-cap companies; not the same as investing in the entire world or in bonds.'
  },
  VTI:{
    symbol:'VTI',name:'Vanguard Total Stock Market ETF',
    tracks:'Broad U.S. stock market',
    portfolioDescription:'Owns shares in thousands of U.S. companies, including large, mid-sized, and smaller businesses.',
    expenseRatioPct:0.03,expenseAsOf:'2026-04-28',
    approximateHoldings:3507,holdingsAsOf:'2026-08-31',
    sourceUrl:'https://advisors.vanguard.com/investments/products/vti/vanguard-total-stock-market-etf',
    concentrationNote:'Diversified across the U.S. market, but it still carries stock-market risk and does not add international stocks or bonds.'
  }
};
export const knownFund=(symbol:string):FundProfile|undefined => symbol==='VOO'||symbol==='VTI'?FUNDS[symbol]:undefined;
const band=(score:number):ModelScore['band']=>score>=95?'Elite Opportunity':score>=90?'Strong Candidate':score>=85?'Watchlist':score>=70?'Research Only':'Pass';
function component(name:string,raw:number,weight:number,explanation:string):ScoreComponent{
  return {name,raw,weight,contribution:raw*weight,explanation};
}
/** Transparent, policy-based fund-quality assessments. NOT predicted returns or a
 * statistical probability of profitability. Confirm facts with issuer before use. */
export function scoreFundCore(symbol:string):ModelScore {
  const f=knownFund(symbol);
  if(!f)return {
    score:null,band:'Not Rated',components:[],
    vetoes:['This ETF has not yet been evaluated under the fund-specific methodology. Company earnings ratios cannot substitute for fund holdings, fees, liquidity, and tracking data.']
  };
  const comps=[
    component('Low operating costs',98,.30,'The published expense ratio is 0.03% as of April 28, 2026. Fees can change; verify with Vanguard.'),
    component('Diversification',symbol==='VTI'?97:95,.35, f.portfolioDescription),
    component('Market liquidity',symbol==='VTI'?94:96,.20,'Large established U.S. index ETF, but trade execution still depends on current bid/ask spreads. This factor is qualitative, not a real-time spread measurement.'),
    component('Clear index approach',symbol==='VTI'?92:91,.15,'Transparent, rules-based broad-market fund exposure; U.S. equities still carry market and concentration risk.')
  ];
  const score=Math.round((comps.reduce((a,c)=>a+c.contribution,0)+1e-9)*10)/10;
  return {score,band:band(score),components:comps,vetoes:[
    'This is a transparent structural fund-quality baseline, not a promise of returns or a recommendation to buy immediately.',
    'Components such as liquidity and diversification are qualitative assumptions, not a freshly verified holdings/spread audit.'
  ]};
}
export function notApplicableScore(reason:string):ModelScore {
  return {score:null,band:'Not Rated',components:[],vetoes:[reason]};
}
export function fundTimingSummary(t:TechnicalSnapshot,score:number):string {
  const trend=t.trend==='strong-up'||t.trend==='up'?'upward':t.trend==='strong-down'||t.trend==='down'?'downward':'unclear or sideways';
  const assessment=score>=85?'favorable':score>=70?'mixed but generally constructive':'cautious';
  return `The latest end-of-day prices show an ${trend} trend. The timing assessment is ${assessment} (${score.toFixed(1)}/100). This measures market conditions, not the probability of future gains or a personalized instruction to buy.`;
}
