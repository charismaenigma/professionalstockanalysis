import type { AnalysisResult, BenchmarkResult, CatalystItem, FundamentalSnapshot, OptionContract, Bar } from './types';
import { fmpCatalysts } from './providers/fmp';
import { massiveOptions } from './providers/massive';
import { massiveStockBars, quoteFromBars, massiveMarketClassification } from './providers/massiveStocks';
import { secFundamentals } from './secFundamentals';
import { recentSecFilings } from './sec';
import { technicalSnapshot } from './indicators';
import { buildScores } from './scoring';
import { knownFund, notApplicableScore, scoreFundCore, fundTimingSummary } from './funds';
import { knownLeveraged, researchAlternatives, leveragedContext } from './leveraged';
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

async function benchmark(symbol:'VTI'|'VOO',marketMode:boolean,existingBars?:Bar[]):Promise<BenchmarkResult>{
  const bars=existingBars??(marketMode?await massiveStockBars(symbol):demoBars(symbol));
  const q=marketMode?quoteFromBars(symbol,bars,symbol):demoQuote(symbol);
  const t=technicalSnapshot(bars);
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

function language(company:string,f:FundamentalSnapshot,t:ReturnType<typeof technicalSnapshot>,scores:ReturnType<typeof buildScores>,benchmarks:BenchmarkResult[],dataCompleteness:number){
  const vals=[scores.core.score,scores.growth.score,scores.asymmetric.score,scores.swing.score];
  const numbers=vals.filter((v):v is number=>v!=null);
  const best=numbers.length?Math.max(...numbers):0;
  const likes:string[]=[];
  const concerns:string[]=[];
  const improve:string[]=[];
  const psychology:string[]=[];
  if((f.revenueGrowth??0)>10)likes.push(`Revenue grew about ${f.revenueGrowth!.toFixed(1)}% against the comparable quarter one year earlier.`);
  if((f.currentRatio??0)>1.5)likes.push('Short-term liquidity appears healthy.');
  if((f.debtToEquity??99)<0.7)likes.push('Leverage is relatively modest.');
  if((f.freeCashFlowMargin??-99)>5)likes.push('Free cash flow generation is positive relative to sales in the latest annual report.');
  if((f.operatingMargin??0)>20)likes.push('Operating profitability is strong in the latest annual statements.');
  if((f.epsGrowth??0)>15)likes.push(`Diluted earnings per share increased about ${f.epsGrowth!.toFixed(1)}% versus the comparable quarter last year.`);
  if(t.trend==='up'||t.trend==='strong-up')likes.push('The longer-term price trend is constructive.');
  if(f.priceToEarnings!=null&&f.priceToEarnings>30)
    concerns.push(`Valuation is demanding: the share price is about ${f.priceToEarnings.toFixed(1)} times estimated earnings over the past twelve months. This can magnify losses if growth disappoints.`);
  if(f.priceToSales!=null&&f.priceToSales>8)
    concerns.push(`Shares cost approximately ${f.priceToSales.toFixed(1)} times trailing company revenue, a substantial sales multiple.`);
  if((f.sharesGrowth??0)>8)concerns.push('Share count has increased, which can reduce each existing share’s ownership percentage.');
  if((f.debtToEquity??0)>1.5)concerns.push('Leverage is elevated.');
  if((t.rsi14??0)>75)concerns.push('Recent upward momentum is unusually strong, so the current price may be extended.');
  if(dataCompleteness<45)concerns.push('Fundamental data is incomplete, so long-term conclusions have low confidence.');
  concerns.push(...f.warnings.slice(0,2));
  if((scores.core.score??0)<95 && !(f.priceToEarnings!=null&&f.priceToEarnings>30))improve.push('A more attractive valuation could improve the long-term score.');
  if((scores.swing.score??0)<95)improve.push('A clearer technical setup could improve the swing score.');
  if((f.revenueGrowth??0)<15)improve.push('Faster or more consistent growth could improve the growth score.');
  if(f.priceToEarnings!=null&&f.priceToEarnings>30)
    improve.unshift('A lower price relative to the company’s earnings, or sustained profit growth, could improve the valuation score.');
  if((t.rsi14??50)>70)psychology.push('FOMO check: avoid making a decision only because the price has risen quickly.');
  if(best>=90)psychology.push('Confirmation-bias check: compare supportive and contradictory evidence before acting.');
  const base=[...benchmarks].sort((a,b)=>(b.longTermQuality*.7+b.timing*.3)-(a.longTermQuality*.7+a.timing*.3))[0];
  const simpleSummary=numbers.length===0
    ?`${company} cannot be rated reliably with the available financial disclosures and/or trade data. An absence of verified evidence is not evidence that the stock is attractive.`
    :dataCompleteness<45
    ?`${company} does not have enough complete fundamental data for a high-confidence investment conclusion. Technical information can still be useful, but the app will not treat missing data as neutral evidence.`
    :best>=95
    ?`${company} reaches the Elite range in at least one model. The score is a research classification, not a probability of profit. ${base.symbol} remains the diversified comparison point.`
    :best>=90
    ?`${company} reaches the Strong Candidate range in at least one model, while at least one important condition still falls short of the strictest standard. ${base.symbol} remains the diversified comparison point.`
    :f.priceToEarnings!=null&&f.priceToEarnings>30&&(f.operatingMargin??0)>20
    ?`${company} reports substantial operating profitability, but its stock carries a demanding valuation. MarketClarity’s current price-sensitive research model does not identify a qualifying new entry. This is not a judgment that the business is poor, and the model has not yet been historically calibrated.`
    :`${company} has some positive features, but the current evidence does not reach the app’s highest-confidence score bands. The score is an uncalibrated research rubric, not a probability of future returns.`;
  return {simpleSummary,likes,concerns:[...new Set(concerns)],improve:[...new Set(improve)],psychology:[...new Set(psychology)]};
}

export async function analyzeSymbol(input:string):Promise<AnalysisResult>{
  const symbol=input.trim().toUpperCase().replace(/[^A-Z0-9.^-]/g,'').slice(0,12);
  if(!symbol)throw new Error('Enter a valid ticker symbol.');

  const hasMassive=Boolean(process.env.MASSIVE_API_KEY);

  let quote;
  let bars;
  let fundamentals;
  let companyName=symbol;
  let catalysts:CatalystItem[]=[];
  let cik:string|undefined;
  let marketClassification:'OTC'|'Listed'|'Unknown'='Unknown';
  const leverage=knownLeveraged(symbol);
  let instrumentType:'Stock'|'ETF'=(knownFund(symbol)||leverage)?'ETF':'Stock';

  if(hasMassive){
    bars=await massiveStockBars(symbol);
    quote=quoteFromBars(symbol,bars,symbol);
    const reference=await massiveMarketClassification(symbol).catch(()=>({market:'Unknown' as const,name:undefined as string|undefined,isEtf:false}));
    marketClassification=reference.market;
    instrumentType=(knownFund(symbol)||leverage||reference.isEtf)?'ETF':'Stock';
    quote.name=knownFund(symbol)?.name||reference.name||symbol;
    if(instrumentType==='ETF'){
      // An ETF owns a basket of securities. It does not have one company's
      // P/E, debt/equity, 10-K earnings, or single-company catalyst schedule.
      fundamentals={warnings:[]};
      companyName=quote.name;
    }else{
      const sec=await secFundamentals(symbol,quote.price);
      fundamentals=sec.snapshot;
      companyName=reference.name||sec.companyName||symbol;
      cik=sec.cik;
      const [filings,fmpEvents]=await Promise.all([
        recentSecFilings(cik).catch(()=>[]),
        process.env.FMP_API_KEY ? fmpCatalysts(symbol).catch(()=>[]) : Promise.resolve([])
      ]);
      catalysts=[...filings,...fmpEvents].slice(0,16);
    }
  }else{
    const use=demoSymbols.includes(symbol)?symbol:'RSKD';
    quote=demoQuote(use);
    bars=demoBars(use);
    fundamentals=demoFundamentals(use);
    catalysts=demoCatalysts(use);
    companyName=quote.name||use;
    quote={...quote,symbol:use};
    instrumentType=(knownFund(use)||knownLeveraged(use))?'ETF':'Stock';
    if(instrumentType==='ETF'){
      fundamentals={warnings:[]};
      companyName=knownFund(use)?.name||quote.name||use;
      catalysts=[];
    }
  }

  const technicals=technicalSnapshot(bars);
  const dataCompleteness=instrumentType==='ETF'?0:completeness(fundamentals,bars.length);
  const priceDataAgeDays=quote.timestamp
    ?Math.max(0,Math.floor((Date.now()-Date.parse(quote.timestamp))/86400000))
    :undefined;
  const priceIsStale=priceDataAgeDays==null||priceDataAgeDays>7;
  const benchmarks=await Promise.all([
    benchmark('VTI',hasMassive,instrumentType==='ETF'&&symbol==='VTI'?bars:undefined),
    benchmark('VOO',hasMassive,instrumentType==='ETF'&&symbol==='VOO'?bars:undefined)
  ]);
  const profile=instrumentType==='ETF'?knownFund(symbol):undefined;
  const ownBenchmark=instrumentType==='ETF'?benchmarks.find(b=>b.symbol===symbol):undefined;
  const fundTiming=instrumentType==='ETF'&&!priceIsStale?(ownBenchmark?.timing??timing(technicals)):undefined;

  const built=instrumentType==='ETF'
    ?{
      business:notApplicableScore('An ETF owns many companies and does not have a single-company business-strength rating.'),
      core:leverage
        ?notApplicableScore('A daily 3x leveraged or inverse fund must not be scored as a long-term diversified core holding. Assess daily index exposure, leverage, volatility, and real-time execution instead.')
        :scoreFundCore(symbol),
      growth:notApplicableScore('Company-specific growth model is not applicable to an ETF.'),
      asymmetric:notApplicableScore('Single-company multi-bagger / turnaround model is not applicable to a diversified ETF.'),
      swing:notApplicableScore(leverage
        ?'Day-trading readiness not rated: end-of-day OHLCV cannot verify current intraday quotes, spreads, liquidity, or an entry/stop strategy.'
        :'A standalone ETF swing-trading strategy has not yet been validated. See the separate market-timing assessment instead.'),
      tradePlan:{status:'Pass' as const,reasoning:[leverage
        ?'No actionable day trade: the current provider plan supplies end-of-day data, not current intraday order-book/quote data. Check live underlying-index direction, ETF bid/ask spreads, trading halts, liquidity, and intraday confirmation before considering a plan.'
        :'No active ETF swing-trading plan is generated. Market timing is informational, not an entry/exit strategy.']}
    }
    :buildScores(fundamentals,technicals,quote,catalysts,dataCompleteness,{
      isOtc:marketClassification==='OTC',
      stalePrice:priceIsStale
    });

  let options:OptionContract[]=[];
  if(hasMassive&&instrumentType!=='ETF')options=optionShortlist(await massiveOptions(symbol).catch(()=>[]),quote.price);

  const copy=leverage
    ?{
      simpleSummary:`${leverage.symbol} targets ${leverage.dailyMultiple>0?'+':''}${leverage.dailyMultiple}x the ${leverage.index}'s DAILY move. It is designed for short-term directional exposure, not to compound at the target multiple over weeks or years. The current data are end-of-day, so MarketClarity cannot verify a real-time trade or recommend an entry.`,
      likes:['This fund provides a clearly defined daily bullish or bearish exposure to its index. This is a product characteristic, not evidence of a profitable trade.'],
      concerns:['Daily leverage magnifies losses as well as gains. A severe unfavorable index move can produce substantial losses.','Daily reset and compounding can make longer holding-period returns differ substantially from 3x or -3x the index return.','The available market feed has no current bid/ask spreads, live 1- and 5-minute chart, or verified intraday order flow.','A trend score from yesterday cannot determine whether this instrument is safe to trade right now.'],
      improve:['Use a validated intraday setup with current 1- and 5-minute data and volume.','Check the underlying index, current ETF bid/ask spread, volatility, order execution and the strategy’s stop and position size.','Compare the inverse fund or another index family before selecting a direction.'],
      psychology:['A 3x product can move dramatically. Do not chase a large price change without a pre-defined loss limit.']
    }
    :instrumentType==='ETF'
    ?{
      simpleSummary:profile
        ?`${profile.name} is a diversified investment fund, not an individual business. Its high structural-quality rating reflects low costs, broad exposure and clear index design; the score does not guarantee returns. ${fundTiming==null?'Current timing data are too old to assess.':fundTimingSummary(technicals,fundTiming)}`
        :`${companyName} is an exchange-traded fund. A reliable fund-quality score requires holdings, fees and index-methodology information; company earnings ratios do not apply. The fund is not yet rated.`,
      likes:profile?[
        profile.portfolioDescription,
        'The reported annual fund expense ratio is 0.03% (Vanguard, April 28, 2026).',
        'Buying the fund spreads investments across many companies rather than relying on just one.'
      ]:[],
      concerns:[
        'The entire U.S. stock market can decline substantially, including diversified stock funds.',
        profile?.concentrationNote||'We have not verified this fund’s holdings and operating costs.',
        ...(priceIsStale?['The last reported price is too old for a current market-timing assessment.']:[])
      ],
      improve:['Decide whether the fund fits your investing time horizon and risk tolerance.','Check the issuer’s current expenses, holdings and concentration before investing.'],
      psychology:['A high long-term fund-quality rating does not mean today is a risk-free entry point.']
    }
    :language(companyName,fundamentals,technicals,built,benchmarks,dataCompleteness);
  const warnings:string[]=[];
  if(!hasMassive)warnings.push('Demo mode is active. Add MASSIVE_API_KEY to enable end-of-day market data and SEC-based fundamentals.');
  if(hasMassive)warnings.push('Market prices are end-of-day on the free Massive Stocks plan, not real-time quotes.');
  if(hasMassive&&instrumentType!=='ETF'&&dataCompleteness<60)warnings.push('Some fundamental fields were not available from SEC XBRL facts, so the model reduced confidence rather than inventing values.');
  if(instrumentType==='ETF'&&!leverage)warnings.push('Fund-quality scores are structural policy assessments based on fund characteristics, not live holdings audits or predicted returns. ETFs are analyzed differently from individual companies.');
  if(leverage)warnings.push('Leveraged ETF: daily exposure resets each day. Longer holding periods can deviate significantly from the headline daily multiple; substantial losses are possible. No live day-trade setup is available on this market-data plan.');
  if(!process.env.OPENAI_API_KEY)warnings.push('Optional AI research summaries are disabled until OPENAI_API_KEY is configured.');
  const assessmentWarnings:string[]=[];
  if(hasMassive&&priceIsStale)assessmentWarnings.push(`The last available price is ${priceDataAgeDays??'an unknown number of'} calendar days old. It is not a current executable quote.`);
  if(hasMassive&&quote.price<0.01)assessmentWarnings.push('Sub-penny share prices can fluctuate by large percentages and may be difficult to buy or sell at the displayed price.');
  if(hasMassive&&marketClassification==='OTC')assessmentWarnings.push('OTC security: verify its current OTC Markets disclosure tier, trading eligibility, regulatory warnings, and bid/ask spread. This app does not currently have licensed OTC disclosure-status data.');
  if(hasMassive&&((quote.avgVolume??quote.volume??0)*quote.price)<50000)assessmentWarnings.push('Very low dollar trading volume can make historical price-based technical signals and modeled stop-losses unreliable.');
  if(hasMassive&&built.core.score===null)assessmentWarnings.push(instrumentType==='ETF'
    ?(leverage?'This is a daily-leveraged ETF. It is intentionally not assigned a diversified long-term fund-quality score.':'This fund is not yet covered by the specialized ETF-quality model.')
    :'Financial reports are insufficient or too old for a defensible investment rating.');

  return {
    leveragedFund:leverage?{
      symbol:leverage.symbol,name:leverage.name,index:leverage.index,
      direction:leverage.direction,dailyMultiple:leverage.dailyMultiple,sourceUrl:leverage.sourceUrl
    }:undefined,
    leveragedContext:leverage?leveragedContext(leverage,technicals,quote):undefined,
    leveragedAlternatives:leverage?researchAlternatives(symbol,technicals.trend,benchmarks):undefined,
    instrumentType,
    fundProfile:profile?{
      tracks:profile.tracks,portfolioDescription:profile.portfolioDescription,
      expenseRatioPct:profile.expenseRatioPct,expenseAsOf:profile.expenseAsOf,
      approximateHoldings:profile.approximateHoldings,holdingsAsOf:profile.holdingsAsOf,
      sourceUrl:profile.sourceUrl,concentrationNote:profile.concentrationNote
    }:undefined,
    fundTiming,
    fundTimingExplanation:instrumentType==='ETF'?(fundTiming==null?'Not available: price history is stale.':fundTimingSummary(technicals,fundTiming)):undefined,
    marketClassification,
    priceDataAgeDays,
    assessmentWarnings,
    symbol:quote.symbol,
    companyName,
    mode:hasMassive?'live':'demo',
    dataProvider:hasMassive?'Massive end-of-day market data + SEC company facts':'Illustrative demo data',
    asOf:new Date().toISOString(),
    quote,
    fundamentals,
    technicals,
    catalysts,
    options,
    scores:{business:built.business,core:built.core,growth:built.growth,asymmetric:built.asymmetric,swing:built.swing},
    scoringModelVersion:instrumentType==='ETF'?'ETF structural rules v1':'MarketClarity research v2.0',
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
