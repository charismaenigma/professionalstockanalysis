import type { AnalysisResult, BenchmarkResult, CatalystItem, FundamentalSnapshot, OptionContract } from './types';
import { fmpBars, fmpCatalysts, fmpFundamentals, fmpQuote } from './providers/fmp';
import { massiveOptions } from './providers/massive';
import { technicalSnapshot } from './indicators';
import { buildScores } from './scoring';
import { demoBars, demoCatalysts, demoFundamentals, demoQuote, demoSymbols } from './demo';

function completeness(f:FundamentalSnapshot,bars:number){
  const xs=[f.currentRatio,f.debtToEquity,f.returnOnEquity,f.returnOnInvestedCapital,f.operatingMargin,f.revenueGrowth,f.epsGrowth,f.priceToEarnings,f.priceToSales,f.priceToFreeCashFlow];
  const present=xs.filter(v=>v!=null&&Number.isFinite(v)).length;
  return Math.round((present/xs.length*70+Math.min(30,bars/250*30))*10)/10;
}

function timing(t:ReturnType<typeof technicalSnapshot>){
  let s=50;
  s+=t.trend==='strong-up'?22:t.trend==='up'?14:t.trend==='sideways'?2:t.trend==='down'?-12:-22;
  if(t.rsi14!=null)s+=t.rsi14>=45&&t.rsi14<=65?12:t.rsi14<=75?5:-5;
  if(t.distanceSma50Atr!=null)s+=Math.abs(t.distanceSma50Atr)<=2?10:Math.abs(t.distanceSma50Atr)<=4?3:-8;
  return Math.max(0,Math.min(100,Math.round(s*10)/10));
}

async function benchmark(symbol:'VTI'|'VOO',live:boolean):Promise<BenchmarkResult>{
  const [q,b]=live?await Promise.all([fmpQuote(symbol),fmpBars(symbol)]):[demoQuote(symbol),demoBars(symbol)];
  const t=technicalSnapshot(b);
  const score=timing(t);
  return {
    symbol,
    longTermQuality:symbol==='VTI'?96:95.5,
    timing:score,
    technical:t,
    price:q.price,
    explanation:score>=85?'Strong long-term diversification with favorable current technical conditions.':score>=70?'Strong long-term diversification with generally constructive current conditions.':'Strong long-term diversification, while current technical conditions are less favorable.'
  };
}

function optionShortlist(options:OptionContract[],price:number){
  return options.filter(o=>new Date(o.expiration)>=new Date(Date.now()+7*86400000))
    .sort((a,b)=>Math.abs(a.strike-price)-Math.abs(b.strike-price))
    .slice(0,24);
}

function language(company:string,f:FundamentalSnapshot,t:ReturnType<typeof technicalSnapshot>,scores:ReturnType<typeof buildScores>,benchmarks:BenchmarkResult[]){
  const vals=[scores.core.score,scores.growth.score,scores.asymmetric.score,scores.swing.score];
  const best=Math.max(...vals);
  const likes:string[]=[];
  const concerns:string[]=[];
  const improve:string[]=[];
  const psychology:string[]=[];
  if((f.revenueGrowth??0)>15)likes.push('Revenue growth is currently strong.');
  if((f.currentRatio??0)>1.5)likes.push('Short-term liquidity appears healthy.');
  if((f.debtToEquity??99)<0.7)likes.push('Leverage is relatively modest.');
  if((f.freeCashFlowMargin??-99)>5)likes.push('Free cash flow generation is positive relative to sales.');
  if(t.trend==='up'||t.trend==='strong-up')likes.push('The longer-term price trend is constructive.');
  if((f.sharesGrowth??0)>8)concerns.push('Share count has increased, which can reduce each existing share’s ownership percentage.');
  if((f.debtToEquity??0)>1.5)concerns.push('Leverage is elevated.');
  if((t.rsi14??0)>75)concerns.push('Recent upward momentum is unusually strong, so the current price may be extended.');
  concerns.push(...f.warnings.slice(0,2));
  if(scores.core.score<95)improve.push('A more attractive valuation could improve the long-term score.');
  if(scores.swing.score<95)improve.push('A clearer technical setup could improve the swing score.');
  if((f.revenueGrowth??0)<15)improve.push('Faster or more consistent growth could improve the growth score.');
  if((t.rsi14??50)>70)psychology.push('FOMO check: avoid making a decision only because the price has risen quickly.');
  if(best>=90)psychology.push('Confirmation-bias check: compare supportive and contradictory evidence before acting.');
  const base=[...benchmarks].sort((a,b)=>(b.longTermQuality*.7+b.timing*.3)-(a.longTermQuality*.7+a.timing*.3))[0];
  const simpleSummary=best>=95
    ?`${company} reaches the Elite range in at least one model. The score is a research classification, not a probability of profit. ${base.symbol} remains the diversified comparison point.`
    :best>=90
    ?`${company} reaches the Strong Candidate range in at least one model, while at least one important condition still falls short of the strictest standard. ${base.symbol} remains the diversified comparison point.`
    :`${company} has some positive features, but the current evidence does not reach the app’s highest-confidence score bands.`;
  return {simpleSummary,likes,concerns:[...new Set(concerns)],improve:[...new Set(improve)],psychology:[...new Set(psychology)]};
}

export async function analyzeSymbol(input:string):Promise<AnalysisResult>{
  const symbol=input.trim().toUpperCase().replace(/[^A-Z0-9.^-]/g,'').slice(0,12);
  if(!symbol)throw new Error('Enter a valid ticker symbol.');
  const live=Boolean(process.env.FMP_API_KEY);

  let quote;
  let bars;
  let fundamentals;
  let companyName=symbol;
  let catalysts:CatalystItem[]=[];

  if(live){
    const [q,b,fu,ca]=await Promise.all([fmpQuote(symbol),fmpBars(symbol),fmpFundamentals(symbol),fmpCatalysts(symbol)]);
    quote=q; bars=b; fundamentals=fu.snapshot; companyName=fu.companyName||q.name||symbol; catalysts=ca;
  }else{
    const use=demoSymbols.includes(symbol)?symbol:'RSKD';
    quote=demoQuote(use); bars=demoBars(use); fundamentals=demoFundamentals(use); catalysts=demoCatalysts(use); companyName=quote.name||use; quote={...quote,symbol:use};
  }

  const technicals=technicalSnapshot(bars);
  const dataCompleteness=completeness(fundamentals,bars.length);
  const built=buildScores(fundamentals,technicals,quote,catalysts,dataCompleteness);
  const benchmarks=await Promise.all([benchmark('VTI',live),benchmark('VOO',live)]);
  let options:OptionContract[]=[];
  if(live&&process.env.MASSIVE_API_KEY)options=optionShortlist(await massiveOptions(symbol).catch(()=>[]),quote.price);

  const copy=language(companyName,fundamentals,technicals,built,benchmarks);
  const warnings:string[]=[];
  if(!live)warnings.push('Demo mode uses illustrative data. Add FMP_API_KEY to enable current market and fundamental data.');
  if(live&&!process.env.MASSIVE_API_KEY)warnings.push('Options data is disabled until MASSIVE_API_KEY is configured.');
  if(!process.env.OPENAI_API_KEY)warnings.push('Optional AI research summaries are disabled until OPENAI_API_KEY is configured.');

  return {
    symbol:quote.symbol,
    companyName,
    mode:live?'live':'demo',
    dataProvider:live?'Financial Modeling Prep + optional Massive':'Illustrative demo data',
    asOf:new Date().toISOString(),
    quote,
    fundamentals,
    technicals,
    catalysts,
    options,
    scores:{core:built.core,growth:built.growth,asymmetric:built.asymmetric,swing:built.swing},
    tradePlan:built.tradePlan,
    benchmarks,
    simpleSummary:copy.simpleSummary,
    whatWeLike:copy.likes.slice(0,5),
    concerns:copy.concerns.slice(0,5),
    scoreImprovers:copy.improve.slice(0,4),
    psychology:copy.psychology.slice(0,4),
    dataCompleteness,
    warnings
  };
}
