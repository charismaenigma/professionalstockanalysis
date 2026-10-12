import type { FundamentalSnapshot, TechnicalSnapshot, ModelScore, ScoreBand, ScoreComponent, TradePlan, CatalystItem, Quote } from './types';

export const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,n));
export const band=(s:number):ScoreBand=>s>=95?'Elite Opportunity':s>=90?'Strong Candidate':s>=85?'Watchlist':s>=70?'Research Only':'Pass';
const lin=(x:number|undefined,bad:number,good:number)=>x==null?50:clamp((x-bad)/(good-bad)*100);
const inv=(x:number|undefined,good:number,bad:number)=>x==null?50:clamp((bad-x)/(bad-good)*100);
const finite=(x:number|undefined,fallback=50)=>Number.isFinite(x)?x!:fallback;

function comp(name:string,raw:number,weight:number,explanation:string):ScoreComponent{
  return {name,raw:clamp(raw),weight,contribution:clamp(raw)*weight,explanation};
}
function finalize(components:ScoreComponent[],vetoes:string[]=[]):ModelScore{
  const denom=components.reduce((s,c)=>s+c.weight,0)||1;
  let score=components.reduce((s,c)=>s+c.contribution,0)/denom;
  if(vetoes.some(v=>/critical|insufficient reliable|going concern|accounting/i.test(v))) score=Math.min(score,84.9);
  score=Math.round(clamp(score)*10)/10;
  return {score,band:band(score),components,vetoes};
}

function financialHealth(f:FundamentalSnapshot){
  const liquidity=lin(f.currentRatio,0.8,2.5);
  const leverage=inv(f.debtToEquity,0.2,2.0);
  const fcf=f.freeCashFlowMargin==null?50:lin(f.freeCashFlowMargin,-5,20);
  const netCash=f.cash!=null&&f.debt!=null?(f.cash>=f.debt?85:lin((f.cash||0)/(f.debt||1),0,1)):50;
  return 0.30*liquidity+0.30*leverage+0.25*fcf+0.15*netCash;
}
function quality(f:FundamentalSnapshot){
  const roe=lin(f.returnOnEquity,0,25), roic=lin(f.returnOnInvestedCapital,0,20);
  const op=f.operatingMargin==null?50:lin(f.operatingMargin,0,25);
  const gm=f.grossMargin==null?50:lin(f.grossMargin,15,60);
  return .30*roe+.30*roic+.25*op+.15*gm;
}
function growth(f:FundamentalSnapshot){
  const rev=lin(f.revenueGrowth,-5,30), eps=lin(f.epsGrowth,-10,35);
  const margin=f.operatingMargin==null?50:lin(f.operatingMargin,-5,25);
  return .45*rev+.35*eps+.20*margin;
}
function valuation(f:FundamentalSnapshot){
  const pe=f.forwardPE??f.priceToEarnings;
  const peScore=pe==null?50:(pe<=0?25:inv(pe,12,50));
  const psScore=f.priceToSales==null?50:inv(f.priceToSales,1.5,12);
  const pfcf=f.priceToFreeCashFlow==null?50:(f.priceToFreeCashFlow<=0?25:inv(f.priceToFreeCashFlow,12,60));
  const evs=f.evToSales==null?50:inv(f.evToSales,1.5,12);
  return .35*peScore+.25*psScore+.25*pfcf+.15*evs;
}
function shareholder(f:FundamentalSnapshot){
  const dilution=f.sharesGrowth==null?50:inv(f.sharesGrowth,-5,20);
  const sbc=f.latestAnnual?.stockBasedCompensation && f.latestAnnual?.revenue
    ? inv((f.latestAnnual.stockBasedCompensation/f.latestAnnual.revenue)*100,2,18):55;
  return .7*dilution+.3*sbc;
}
function technical(t:TechnicalSnapshot){
  let trendScore=t.trend==='strong-up'?92:t.trend==='up'?80:t.trend==='sideways'?55:t.trend==='down'?35:t.trend==='strong-down'?18:50;
  const r=t.rsi14==null?50:(t.rsi14>=45&&t.rsi14<=68?85:t.rsi14>68&&t.rsi14<=78?65:t.rsi14>=35&&t.rsi14<45?65:t.rsi14>78?42:35);
  const ext=t.distanceSma50Atr==null?50:(Math.abs(t.distanceSma50Atr)<=2?85:Math.abs(t.distanceSma50Atr)<=4?65:35);
  const vol=t.relativeVolume==null?50:lin(t.relativeVolume,.6,2.0);
  return .45*trendScore+.25*r+.20*ext+.10*vol;
}
function risk(f:FundamentalSnapshot, quote:Quote, catalysts:CatalystItem[]){
  let s=80;
  if(f.debtToEquity!=null&&f.debtToEquity>2)s-=20;
  if(f.sharesGrowth!=null&&f.sharesGrowth>15)s-=18;
  if((quote.avgVolume??quote.volume??0)<200000)s-=15;
  if(catalysts.some(c=>c.binary))s-=12;
  s-=Math.min(25,f.warnings.length*5);
  return clamp(s);
}
function catalyst(c:CatalystItem[]){
  if(!c.length)return 45;
  const next=c.filter(x=>!x.date||new Date(x.date)>=new Date());
  if(next.some(x=>x.binary))return 65;
  return Math.min(85,55+next.length*8);
}
function asymmetry(f:FundamentalSnapshot,t:TechnicalSnapshot,quote:Quote){
  const size=quote.marketCap==null?55:(quote.marketCap<300e6?55:quote.marketCap<2e9?85:quote.marketCap<10e9?72:55);
  const g=growth(f),v=valuation(f),tech=technical(t);
  return .30*size+.30*g+.25*v+.15*tech;
}
function psychology(t:TechnicalSnapshot,quote:Quote){
  let s=75;
  if((t.rsi14??50)>78)s-=20;
  if(Math.abs(t.distanceSma20Atr??0)>3)s-=15;
  if(quote.yearHigh&&quote.price/quote.yearHigh>.98&&(t.rsi14??0)>70)s-=8;
  return clamp(s);
}

export function buildScores(
  f:FundamentalSnapshot,t:TechnicalSnapshot,q:Quote,c:CatalystItem[],
  dataCompleteness:number,
  safeguards:{isOtc?:boolean; stalePrice?:boolean}={}
){
  const fin=financialHealth(f),qual=quality(f),gro=growth(f),val=valuation(f),share=shareholder(f),tech=technical(t),cat=catalyst(c),rsk=risk(f,q,c),asym=asymmetry(f,t,q),psy=psychology(t,q);
  const investmentVetoes:string[]=[];
  if(dataCompleteness<45)investmentVetoes.push('Insufficient reliable data for a high-confidence investment score.');
  if(f.warnings.some(w=>/going concern|material weakness|restatement|auditor/i.test(w)))investmentVetoes.push('Accounting or financial-reporting concern requires caution.');
  if((f.sharesGrowth??0)>25)investmentVetoes.push('Extreme recent share dilution.');
  const core=finalize([
    comp('Financial health',fin,.22,'Balance sheet, liquidity, leverage and cash generation.'),
    comp('Business quality',qual,.18,'Profitability and returns on invested capital.'),
    comp('Growth',gro,.16,'Revenue, earnings and margin growth.'),
    comp('Valuation',val,.18,'Price relative to earnings, sales and cash flow.'),
    comp('Shareholder alignment',share,.10,'Dilution, buyback and stock-compensation effects.'),
    comp('Risk control',rsk,.10,'Financial, liquidity and event risk.'),
    comp('Technical context',tech,.06,'Longer-term price trend and extension.')
  ],investmentVetoes);
  const growthScore=finalize([
    comp('Growth',gro,.24,'Growth rate and durability.'),comp('Business quality',qual,.18,'Quality of the underlying company.'),
    comp('Financial health',fin,.15,'Ability to fund growth.'),comp('Valuation',val,.15,'Price paid for expected growth.'),
    comp('Technical context',tech,.12,'Current market confirmation.'),comp('Catalyst quality',cat,.10,'Upcoming events that can change expectations.'),
    comp('Shareholder alignment',share,.06,'Dilution and capital allocation.')
  ],investmentVetoes);
  const asymmetric=finalize([
    comp('Asymmetry',asym,.30,'Upside potential relative to company size, growth, valuation and trend.'),comp('Growth',gro,.20,'Potential to expand the business.'),
    comp('Valuation',val,.15,'Whether expectations already look expensive.'),comp('Financial health',fin,.12,'Ability to survive while the thesis develops.'),
    comp('Catalyst quality',cat,.10,'Events that could reprice the company.'),comp('Shareholder alignment',share,.05,'Dilution and owner alignment.'),
    comp('Psychology/crowding',psy,.03,'Chasing and crowding risk.'),comp('Risk control',rsk,.05,'Permanent-loss risk controls.')
  ],investmentVetoes);
  const trade=buildTradePlan(q,t,c,dataCompleteness);
  const swingVetoes:string[]=[];
  if(dataCompleteness<45)swingVetoes.push('Insufficient reliable data for a fully qualified trade.');
  swingVetoes.push(...trade.reasoning.filter(x=>/PASS|No clear|insufficient|illiquid|sub-\$2|downtrend/i.test(x)));
  let swing=finalize([
    comp('Entry/invalidation structure',trade.status==='Qualified Trade'?92:trade.status==='Watch'?72:35,.25,'Whether risk can be defined before entry.'),
    comp('Technical quality',tech,.20,'Trend, momentum and extension.'),
    comp('Reward/risk',trade.rewardRisk==null?35:lin(Math.min(trade.rewardRisk,4),1,4),.15,'Potential reward compared with defined downside. Reward/risk is only counted after setup quality and execution risks are considered.'),
    comp('Liquidity/execution',(q.avgVolume??q.volume??0)>1e6?90:(q.avgVolume??q.volume??0)>2e5?70:35,.10,'Ability to enter and exit without excessive friction.'),
    comp('Catalyst',cat,.10,'Upcoming events that may move price.'),comp('Psychology/crowding',psy,.05,'Risk of chasing or crowding.'),
    comp('Risk control',rsk,.05,'Event and balance-sheet risks.'),comp('Financial health',fin,.05,'Company stability.'),comp('Growth',gro,.05,'Fundamental backdrop.')
  ],swingVetoes);

  // A mathematically attractive reward/risk ratio cannot override a rejected setup.
  // Pass setups are capped below the research-only band; Watch setups cannot become
  // Strong/Elite until the underlying setup itself qualifies.
  if(trade.status==='Pass' && swing.score!=null && swing.score>69.9){
    swing={...swing,score:69.9,band:band(69.9)};
  }else if(trade.status==='Watch' && swing.score!=null && swing.score>89.9){
    swing={...swing,score:89.9,band:band(89.9)};
  }

  // Full actionable plans require at least a 90 Swing Trade score.
  if(trade.status==='Qualified Trade' && (swing.score==null || swing.score<90)){
    trade.status='Watch';
    trade.reasoning.push('The setup has measurable levels, but the overall Swing Trade score is below 90, so MarketClarity will not present it as an active trade plan.');
  }

  // Do not publish a numerical investment rating when most of the evidence is absent.
  const fundamentalEvidence=[
    f.revenueGrowth, f.epsGrowth, f.operatingMargin, f.freeCashFlowMargin,
    f.debtToEquity, f.currentRatio, f.priceToEarnings, f.priceToSales,
    f.returnOnEquity, f.cash
  ].filter(v=>v!=null && Number.isFinite(v)).length;
  const annualAgeDays=f.latestAnnual?.date
    ?(Date.now()-Date.parse(f.latestAnnual.date))/(86400000)
    :undefined;
  const evidenceInsufficient=dataCompleteness<55||fundamentalEvidence<4||
    (annualAgeDays!=null&&annualAgeDays>540);
  const unrate=(model:ModelScore,reason:string):ModelScore=>({
    ...model,score:null,band:'Not Rated',
    vetoes:[...model.vetoes,reason]
  });
  const reason='Not enough reliable, recent company financial information to calculate a trustworthy numerical investment rating.';
  const coreFinal=evidenceInsufficient?unrate(core,reason):core;
  const growthFinal=evidenceInsufficient?unrate(growthScore,reason):growthScore;
  const asymmetricFinal=evidenceInsufficient?unrate(asymmetric,reason):asymmetric;

  // Very thin / stale trading data should not receive a fabricated trading grade.
  const quoteUnreliable=safeguards.stalePrice||q.price<0.01||
    ((q.avgVolume??q.volume??0)*q.price<50000);
  const swingFinal=quoteUnreliable
    ?unrate(swing,'Price data are stale, sub-penny, or too thinly traded for a reliable executable swing-trade rating.')
    :swing;

  if(swingFinal.score===null){
    trade.status='Pass';
    trade.reasoning.push('No actionable trade plan: reliable price discovery and execution data are insufficient.');
    delete trade.preferredEntryLow;
    delete trade.preferredEntryHigh;
    delete trade.confirmationAbove;
    delete trade.invalidationBelow;
    delete trade.target1;
    delete trade.target2;
    delete trade.stretchTarget;
    delete trade.rewardRisk;
  }

  return {core:coreFinal,growth:growthFinal,asymmetric:asymmetricFinal,swing:swingFinal,tradePlan:trade};
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
