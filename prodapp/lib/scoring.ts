import type { FundamentalSnapshot, TechnicalSnapshot, ModelScore, ScoreBand, ScoreComponent, TradePlan, CatalystItem, Quote } from './types';

// MarketClarity research score engine v2.0. Scores are transparent rule-based
// assessments, NOT calibrated probabilities of beating the market.
export const MODEL_VERSION='2.0.0-research';
export const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,n));
export const band=(s:number):ScoreBand=>s>=95?'Elite Opportunity':s>=90?'Strong Candidate':s>=85?'Watchlist':s>=70?'Research Only':'Pass';
const valid=(x:number|undefined):x is number=>x!=null&&Number.isFinite(x);
const lin=(x:number|undefined,bad:number,good:number)=>valid(x)?clamp((x-bad)/(good-bad)*100):undefined;
const inv=(x:number|undefined,good:number,bad:number)=>valid(x)?clamp((bad-x)/(bad-good)*100):undefined;
type Part={name:string;score:number|undefined;weight:number;help:string};

// Missing signals are omitted, never silently replaced by an average 50/100.
// Gaps reduce confidence / cap the grade below Strong or Elite.
function average(parts:Part[]):number|undefined{
  const have=parts.filter(p=>valid(p.score));
  const weight=have.reduce((s,p)=>s+p.weight,0);
  return weight>0?have.reduce((s,p)=>s+(p.score??0)*p.weight,0)/weight:undefined;
}
function component(p:Part):ScoreComponent{
  return {name:p.name,raw:clamp(p.score??0),weight:p.weight,contribution:(p.score??0)*p.weight,explanation:p.help};
}
function finalize(parts:Part[],vetoes:string[],confidence:'High'|'Moderate'|'Low',max?:number):ModelScore{
  const have=parts.filter(p=>valid(p.score));
  const sum=have.reduce((s,p)=>s+p.weight,0);
  const coverage=parts.reduce((s,p)=>s+p.weight,0);
  const missingInputs=parts.filter(p=>!valid(p.score)).map(p=>p.name);
  if(sum===0)return {score:null,band:'Not Rated',components:[],vetoes:[...vetoes,'Insufficient metric evidence.'],modelVersion:MODEL_VERSION,confidence:'Low',missingInputs};
  let score=have.reduce((s,p)=>s+(p.score??0)*p.weight,0)/sum;
  // A nearly-perfect score requires near-complete measurable evidence,
  // not just one exceptional available metric.
  if(sum/coverage<.8)score=Math.min(score,84.9);
  else if(sum/coverage<.98)score=Math.min(score,94.9);
  if(confidence==='Low')score=Math.min(score,79.9);
  if(confidence==='Moderate')score=Math.min(score,89.9);
  if(vetoes.some(v=>/going concern|material weakness|restatement|auditor|extreme recent share dilution|critical/i.test(v)))score=Math.min(score,79.9);
  if(max!=null)score=Math.min(score,max);
  score=Math.round(clamp(score)*10)/10;
  return {score,band:band(score),components:have.map(component),vetoes,modelVersion:MODEL_VERSION,confidence,missingInputs};
}
function financialHealth(f:FundamentalSnapshot){
  const liquidAssets=valid(f.cash)?f.cash+(f.marketableSecurities??0):undefined;
  const cashCover=liquidAssets!=null&&valid(f.debt)
    ?(f.debt===0?100:lin(liquidAssets/f.debt,.15,1.25)):undefined;
  return average([
    {name:'Current ratio',score:lin(f.currentRatio,.7,2),weight:.20,help:'Short-term assets compared with short-term obligations; below 1 is not automatically distress for a cash-generative business.'},
    {name:'Leverage',score:inv(f.debtToEquity,.15,1.9),weight:.15,help:'Debt relative to shareholder equity. Buybacks can reduce book equity without weakening operations.'},
    {name:'Cash generation',score:lin(f.freeCashFlowMargin,-5,22),weight:.35,help:'Cash left over after capital spending as a percentage of annual sales.'},
    {name:'Liquid resources',score:cashCover,weight:.30,help:'Cash and separately reported marketable securities relative to reported debt; not a full credit analysis.'}
  ]);
}
function quality(f:FundamentalSnapshot){
  return average([
    {name:'Return on equity',score:lin(f.returnOnEquity,0,28),weight:.20,help:'Profit relative to recorded shareholder equity; repurchases can affect this ratio.'},
    {name:'Return on invested capital',score:lin(f.returnOnInvestedCapital,0,22),weight:.35,help:'After-tax operating profit compared with financing employed in the business. SEC-derived estimate, not an audited issuer ROIC.'},
    {name:'Operating margin',score:lin(f.operatingMargin,0,28),weight:.30,help:'Operating profit as a share of annual sales.'},
    {name:'Gross margin',score:lin(f.grossMargin,10,60),weight:.15,help:'Sales after direct production/service costs; comparisons vary by industry.'}
  ]);
}
function growth(f:FundamentalSnapshot){
  return average([
    {name:'Revenue growth',score:lin(f.revenueGrowth,-5,30),weight:.42,help:'Quarterly revenue compared with the same quarter last year.'},
    {name:'Earnings growth',score:lin(f.epsGrowth,-10,35),weight:.40,help:'Quarterly diluted EPS compared with the same quarter last year; may be influenced by buybacks and one-off items.'},
    {name:'Profitability base',score:lin(f.operatingMargin,-8,25),weight:.18,help:'Profitable sales can better support growth, but a single period does not prove durability.'}
  ]);
}
function valuation(f:FundamentalSnapshot){
  const pe=f.forwardPE??f.priceToEarnings;
  return average([
    {name:'Earnings multiple',score:valid(pe)?(pe<=0?0:inv(pe,12,50)):undefined,weight:.35,help:'Share price relative to trailing earnings; a high number can require unusually strong growth.'},
    {name:'Sales multiple',score:inv(f.priceToSales,1.5,12),weight:.20,help:'Company market value compared with trailing annual sales; margin structure matters.'},
    {name:'Free cash flow multiple',score:valid(f.priceToFreeCashFlow)?(f.priceToFreeCashFlow<=0?0:inv(f.priceToFreeCashFlow,12,60)):undefined,weight:.30,help:'Market value relative to trailing free cash flow.'},
    {name:'Enterprise value to sales',score:inv(f.evToSales,1.5,12),weight:.15,help:'Operating business value relative to sales, including debt and excluding counted cash.'}
  ]);
}
function shareholder(f:FundamentalSnapshot){
  const dilution=inv(f.sharesGrowth,-5,20);
  const sbc=f.latestAnnual?.revenue&&f.latestAnnual.stockBasedCompensation!=null
    ?inv(f.latestAnnual.stockBasedCompensation/f.latestAnnual.revenue*100,1,18):undefined;
  return average([
    {name:'Share count change',score:dilution,weight:.75,help:'Growth in shares can dilute each investor; fewer shares can reflect repurchases.'},
    {name:'Stock-based compensation',score:sbc,weight:.25,help:'Stock paid to employees relative to sales, rather than ignoring its cost.'}
  ]);
}
function technical(t:TechnicalSnapshot){
  const trend=t.trend==='strong-up'?100:t.trend==='up'?82:t.trend==='sideways'?55:t.trend==='down'?30:t.trend==='strong-down'?10:undefined;
  const r=valid(t.rsi14)?(t.rsi14>=48&&t.rsi14<=65?100:t.rsi14>=40&&t.rsi14<=72?80:t.rsi14>=35&&t.rsi14<=78?60:25):undefined;
  const ext=valid(t.distanceSma50Atr)?(Math.abs(t.distanceSma50Atr)<=1.5?100:Math.abs(t.distanceSma50Atr)<=3?75:Math.abs(t.distanceSma50Atr)<=5?45:15):undefined;
  return average([
    {name:'Trend',score:trend,weight:.48,help:'Direction of price and its important moving averages.'},
    {name:'RSI regime',score:r,weight:.24,help:'Measures recent upward closes against downward closes over 14 sessions; not a standalone buy/sell signal.'},
    {name:'Extension',score:ext,weight:.20,help:'Distance between price and the 50-day average in units of recent typical daily moves.'},
    {name:'Trading volume',score:lin(t.relativeVolume,.55,1.8),weight:.08,help:'Current session volume compared with typical recent session volume.'}
  ]);
}
function risk(f:FundamentalSnapshot,q:Quote,c:CatalystItem[]){
  let score=100;
  if(valid(f.debtToEquity)&&f.debtToEquity>2)score-=20;
  if(valid(f.sharesGrowth)&&f.sharesGrowth>15)score-=15;
  if((q.avgVolume??q.volume??0)<200_000)score-=20;
  if(q.price<2)score-=20;
  if(c.some(x=>x.binary))score-=12;
  score-=Math.min(35,f.warnings.length*7);
  return clamp(score);
}
function verifiedCatalyst(c:CatalystItem[]){
  // Filing dates and filing counts are disclosures, NOT automatically positive events.
  const actual=c.filter(x=>x.date&&new Date(x.date)>=new Date() &&
    x.type!=='SEC Filing' && /earnings|FDA|approval|regulatory|merger|decision/i.test(x.type+' '+x.title));
  if(!actual.length)return 60; // Absence of a validated event is ordinary, not failure.
  return actual.some(x=>x.binary)?45:78;
}
function asymmetry(f:FundamentalSnapshot,t:TechnicalSnapshot,q:Quote){
  const size=valid(q.marketCap)?q.marketCap<300e6?38:q.marketCap<2e9?100:q.marketCap<10e9?85:q.marketCap<50e9?65:35:undefined;
  return average([
    {name:'Market capitalization',score:size,weight:.30,help:'A large company generally has less room for a multi-fold valuation re-rating than a smaller company.'},
    {name:'Growth',score:growth(f),weight:.27,help:'Growth may enable business expansion and a future higher valuation.'},
    {name:'Valuation',score:valuation(f),weight:.28,help:'Lower starting expectations can improve return asymmetry.'},
    {name:'Price trend',score:technical(t),weight:.15,help:'Avoid relying only on a low quoted share price.'}
  ]);
}
function psychology(t:TechnicalSnapshot,q:Quote){
  let s=100;
  if(valid(t.rsi14)&&t.rsi14>78)s-=20;
  if(Math.abs(t.distanceSma20Atr??0)>3)s-=15;
  if(q.yearHigh&&q.price/q.yearHigh>.98&&(t.rsi14??0)>70)s-=8;
  return clamp(s);
}
function p(name:string,score:number|undefined,weight:number,help:string):Part{return {name,score,weight,help};}
function evidenceConfidence(f:FundamentalSnapshot,complete:number):'High'|'Moderate'|'Low'{
  const key=[f.revenueGrowth,f.epsGrowth,f.operatingMargin,f.freeCashFlowMargin,f.debtToEquity,
    f.priceToEarnings,f.priceToSales,f.returnOnEquity,f.cash,f.returnOnInvestedCapital];
  const count=key.filter(valid).length;
  if(complete>=90&&count>=8&&f.latestAnnual?.date)return 'High';
  if(complete>=70&&count>=6)return 'Moderate';
  return 'Low';
}
export function buildScores(f:FundamentalSnapshot,t:TechnicalSnapshot,q:Quote,c:CatalystItem[],
  dataCompleteness:number,safeguards:{isOtc?:boolean;stalePrice?:boolean}={}){
  const fin=financialHealth(f),qual=quality(f),gro=growth(f),val=valuation(f),
    share=shareholder(f),tech=technical(t),rsk=risk(f,q,c),asym=asymmetry(f,t,q),
    psy=psychology(t,q),cat=verifiedCatalyst(c);
  const confidence=evidenceConfidence(f,dataCompleteness);
  const vetoes:string[]=[];
  if(f.warnings.some(w=>/going concern|material weakness|restatement|auditor/i.test(w)))
    vetoes.push('Accounting or financial-reporting concern requires independent verification.');
  if(valid(f.sharesGrowth)&&f.sharesGrowth>25)vetoes.push('Extreme recent share dilution.');
  const common=[
    p('Financial health',fin,.23,'Solvency, liquid assets, debt and actual cash generation.'),
    p('Business quality',qual,.32,'Operating margins, return on capital and profitability.'),
    p('Growth',gro,.22,'Year-over-year sales and earnings progress.'),
    p('Shareholder alignment',share,.13,'Repurchases, dilution and stock compensation.'),
    p('Risk control',rsk,.10,'Documented financial, liquidity and event risks.')
  ];
  const business=finalize(common,vetoes,confidence);
  const core=finalize([
    p('Financial health',fin,.15,'Liquid resources, indebtedness and available cash generation.'),
    p('Business quality',qual,.15,'Profitability and long-run operating strength.'),
    p('Growth',gro,.12,'Recent sales and profit changes.'),
    p('Valuation',val,.35,'What you pay for expected earnings, sales and cash generation.'),
    p('Shareholder alignment',share,.08,'Ownership dilution, repurchases and compensation.'),
    p('Risk control',rsk,.10,'Risks of loss and unreliable filings.'),
    p('Technical context',tech,.05,'Price trend and distance from recent average prices.')
  ],vetoes,confidence);
  const activeGrowth=finalize([
    p('Growth',gro,.28,'Measured revenue and earnings growth.'),
    p('Business quality',qual,.24,'Whether operating strength supports growth.'),
    p('Financial health',fin,.12,'Ability to fund continued expansion.'),
    p('Valuation',val,.17,'Price paid today for uncertain future growth.'),
    p('Technical context',tech,.12,'Price trend and investor participation.'),
    p('Shareholder alignment',share,.07,'Dilution can offset per-share growth.')
  ],vetoes,confidence);
  const asymmetric=finalize([
    p('Asymmetry',asym,.22,'Potential for outperformance relative to company size and current expectations.'),
    p('Growth',gro,.20,'Business expansion potential.'),
    p('Valuation',val,.15,'Margin of safety relative to financial performance.'),
    p('Financial health',fin,.14,'Financing and permanent-loss risk.'),
    p('Business quality',qual,.12,'Profits and returns on capital.'),
    p('Shareholder alignment',share,.07,'Potential share dilution and capital allocation.'),
    p('Technical context',tech,.05,'Market participation and trend.'),
    p('Risk control',rsk,.05,'Balance sheet, liquidity and binary-event risks.')
  ],vetoes,confidence);

  const trade=buildTradePlan(q,t,c,dataCompleteness);
  const turnover=(q.avgVolume??q.volume??0)*q.price;
  const liq=(q.avgVolume??q.volume??0)>=2_000_000&&turnover>=20_000_000?100:
    (q.avgVolume??q.volume??0)>=500_000&&turnover>=2_000_000?80:
    (q.avgVolume??q.volume??0)>=200_000&&turnover>=500_000?55:15;
  const swingVetoes=[...trade.reasoning.filter(x=>/^PASS:/i.test(x))];
  const structure=trade.status==='Qualified Trade'?100:trade.status==='Watch'?70:20;
  const reward=trade.status==='Qualified Trade'&&valid(trade.rewardRisk)
    ?lin(trade.rewardRisk,1.5,4):0;
  const swingConfidence=confidence==='Low'?'Low':confidence;
  let swing=finalize([
    p('Entry/invalidation structure',structure,.27,'One coherent entry condition, failure level and real price target.'),
    p('Technical quality',tech,.24,'Observed trend, momentum and extension.'),
    p('Reward/risk',reward,.18,'Reward to real resistance, not a made-up target.'),
    p('Liquidity/execution',liq,.13,'Share turnover and ability to exit. Actual spreads still need verification.'),
    p('Risk control',rsk,.10,'Dangerous dilution, reporting risk and discontinuous events.'),
    p('Psychology/crowding',psy,.05,'Signals of chasing an extended move.'),
    p('Catalyst evidence',cat,.03,'Confirmed events versus routine financial filings.')
  ],swingVetoes,swingConfidence);
  if(trade.status==='Pass'&&swing.score!=null&&swing.score>69.9)
    swing={...swing,score:69.9,band:band(69.9)};
  if(trade.status==='Watch'&&swing.score!=null&&swing.score>89.9)
    swing={...swing,score:89.9,band:band(89.9)};
  if(trade.status==='Qualified Trade'&&(swing.score??0)<90){
    trade.status='Watch';
    trade.reasoning.push('Price levels exist, but the evidence-based Swing Trade score is below 90. The trade is not approved.');
  }

  const fundamentalEvidence=[f.revenueGrowth,f.epsGrowth,f.operatingMargin,f.freeCashFlowMargin,
    f.debtToEquity,f.currentRatio,f.priceToEarnings,f.priceToSales,f.returnOnEquity,f.cash].filter(valid).length;
  const annualAge=f.latestAnnual?.date?(Date.now()-Date.parse(f.latestAnnual.date))/86400000:Infinity;
  const missingCore=dataCompleteness<55||fundamentalEvidence<4||annualAge>540;
  function unrated(s:ModelScore,why:string):ModelScore{
    return {...s,score:null,band:'Not Rated',confidence:'Low',vetoes:[...s.vetoes,why]};
  }
  const why='Recent reliable company financial reports are insufficient for a numerical investment evaluation.';
  const poorQuote=safeguards.stalePrice||q.price<.01||turnover<50_000||
    !valid(t.atr14)||!valid(t.sma50)||!valid(t.rsi14);
  if(poorQuote){
    swing=unrated(swing,'Stale or insufficient tradable price, liquidity, or technical history.');
    trade.status='Pass';
    trade.reasoning.push('No actionable plan while price history or execution data are inadequate.');
    delete trade.preferredEntryLow;delete trade.preferredEntryHigh;
    delete trade.confirmationAbove;delete trade.invalidationBelow;
    delete trade.target1;delete trade.target2;delete trade.stretchTarget;delete trade.rewardRisk;
  }
  return {
    business:missingCore?unrated(business,why):business,
    core:missingCore?unrated(core,why):core,
    growth:missingCore?unrated(activeGrowth,why):activeGrowth,
    asymmetric:missingCore?unrated(asymmetric,why):asymmetric,
    swing,tradePlan:trade
  };
}

function roundStockPrice(n:number):number{
  const digits=n>=1?2:n>=0.1?4:n>=0.001?6:8;
  return Number(n.toFixed(digits));
}

export function buildTradePlan(q:Quote,t:TechnicalSnapshot,c:CatalystItem[],dataCompleteness=100):TradePlan{
  const p=q.price, atrv=t.atr14;
  if(!Number.isFinite(p)||!Number.isFinite(atrv)||p<=0||atrv==null||atrv<=0
     ||t.support==null||t.resistance==null
     ||!Number.isFinite(t.support)||!Number.isFinite(t.resistance)){
    return {status:'Pass',reasoning:['PASS: No reliable price, support, resistance, or volatility level could be calculated.']};
  }

  // ONE scenario, not a mix of two incompatible trading plans:
  // wait for a pullback into a range, then a reclaim of its upper boundary.
  // Reward/risk uses the more conservative upper boundary as the entry.
  const rawSupport=Math.max(t.support,p-1.1*atrv);
  const rawPullback=p-.25*atrv;
  const entryLow=Math.min(rawSupport,rawPullback);
  const entryHigh=Math.max(rawSupport,rawPullback);
  const invalidation=Math.min(t.support-.55*atrv,entryLow-.50*atrv);
  const risk=entryHigh-invalidation;

  // A target must be an OBSERVED price level. Do not invent a 2R+ target
  // simply to make a rejected setup look attractive.
  const target=t.resistance;  // highest observed high in the last 20 sessions
  const rr=risk>0?(target-entryHigh)/risk:0;
  const volume=q.avgVolume??q.volume??0;
  const dollarTurnover=volume*p;
  const downtrend=t.trend==='down'||t.trend==='strong-down';
  const oversoldDowntrend=(t.rsi14??50)<35 &&
    ((t.sma50!=null&&p<t.sma50)||(t.sma200!=null&&p<t.sma200));
  const extended=(t.distanceSma20Atr??0)>3;
  const subTwo=p<2;
  const illiquid=volume>0&&volume<200000;
  const binarySoon=c.some(x=>x.binary&&x.date&&Math.abs(new Date(x.date).getTime()-Date.now())<14*86400000);
  const reasons:string[]=[];

  if(p<.01)reasons.push('PASS: Sub-penny prices can have very large spreads, gaps, and unreliable execution.');
  if(dollarTurnover<50000)reasons.push('PASS: Average daily dollar turnover is too low for a dependable trade entry and exit.');
  if(illiquid)reasons.push('PASS: Average share volume is too low for this swing-trading method.');
  if(!Number.isFinite(rr)||rr<2)reasons.push('PASS: The observed 20-session resistance does not offer 2:1 reward/risk from the conservative planned entry. No target was invented to force qualification.');
  if(dataCompleteness<45)reasons.push('Financial information is incomplete; the company risk cannot be verified to this method’s standard.');
  if(subTwo)reasons.push('Sub-$2 shares may experience wide spreads, gaps and difficult order execution.');
  if(downtrend)reasons.push('The price trend is downward; a lower price alone does not establish a reversal.');
  if(oversoldDowntrend)reasons.push('RSI is low while the price remains below important longer-term averages.');
  if(binarySoon)reasons.push('A nearby binary event could cause a gap through the planned exit level.');
  if(extended)reasons.push('Price is extended above its recent average; chasing the move adds risk.');

  let status:TradePlan['status']='Qualified Trade';
  if(!Number.isFinite(rr)||rr<2||illiquid||(subTwo&&downtrend)||oversoldDowntrend||p<.01||dollarTurnover<50000){
    status='Pass';
  }else if(dataCompleteness<45||subTwo||downtrend||binarySoon||extended){
    status='Watch';
  }

  if(status==='Qualified Trade'){
    reasons.push('Conditional pullback scenario only: price must first trade inside the entry area, then regain its upper boundary without hitting the invalidation level. This is not a market-order signal.');
    reasons.push('The first potential exit area is the actual high observed over the last 20 sessions. It is not a forecast or guarantee.');
    reasons.push('An exit order may fill below the planned stop if the stock gaps or liquidity disappears. Recheck the chart, spreads and news before using these end-of-day levels.');
  }else if(status==='Watch'){
    reasons.push('The measurable price levels do not yet qualify as an active trade plan. Wait for the identified risk conditions to improve.');
  }else{
    reasons.push('No active trade plan should be used while these disqualifying conditions remain.');
  }

  return {
    status,
    preferredEntryLow:roundStockPrice(entryLow),
    preferredEntryHigh:roundStockPrice(entryHigh),
    // Confirmation means price recovered the top of the pullback range
    // AFTER visiting the range, not a separate breakout entry.
    confirmationAbove:roundStockPrice(entryHigh),
    invalidationBelow:roundStockPrice(invalidation),
    target1:roundStockPrice(target),
    rewardRisk:Number.isFinite(rr)?+rr.toFixed(2):undefined,
    reasoning:reasons
  };
}
