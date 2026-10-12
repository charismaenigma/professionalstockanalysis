import {describe,it,expect} from 'vitest';
import {buildScores,buildTradePlan} from './scoring';
import type {FundamentalSnapshot,TechnicalSnapshot,Quote} from './types';

const incomplete:FundamentalSnapshot={warnings:[]};
const weakTechnical:TechnicalSnapshot={
  trend:'strong-down',sma20:0.000002,sma50:0.00001,sma200:0.00005,
  rsi14:26,atr14:0.000001,support:0.000001,resistance:0.00005,
  relativeVolume:0, distanceSma20Atr:-1,distanceSma50Atr:-9
};
const subpenny:Quote={symbol:'TEST',price:0.000001,volume:0,avgVolume:0,timestamp:'2026-09-30'};

describe('OTC and data-quality safeguards',()=>{
  it('does not rate a stale and fundamentally opaque subpenny stock',()=>{
    const result=buildScores(incomplete,weakTechnical,subpenny,[],30,{isOtc:true,stalePrice:true});
    expect(result.core.score).toBeNull();
    expect(result.growth.score).toBeNull();
    expect(result.asymmetric.score).toBeNull();
    expect(result.swing.score).toBeNull();
    expect(result.swing.band).toBe('Not Rated');
    expect(result.tradePlan.status).toBe('Pass');
    expect(result.tradePlan.target1).toBeUndefined();
    expect(result.tradePlan.rewardRisk).toBeUndefined();
  });

  it('never qualifies a subpenny stock solely because of theoretical reward/risk',()=>{
    const plan=buildTradePlan(subpenny,weakTechnical,[],100);
    expect(plan.status).toBe('Pass');
  });

  it('keeps a fully populated ordinary company eligible for a numerical score',()=>{
    const f:FundamentalSnapshot={
      warnings:[],currentRatio:2,debtToEquity:.2,returnOnEquity:23,
      returnOnInvestedCapital:20,operatingMargin:25,netMargin:18,
      grossMargin:46,revenueGrowth:17,epsGrowth:20,
      priceToEarnings:22,priceToSales:4,freeCashFlowMargin:20,cash:2e9,debt:1e9,
      latestAnnual:{date:'2026-07-01',revenue:15e9,stockBasedCompensation:0}
    };
    const t:TechnicalSnapshot={
      trend:'strong-up',rsi14:54,atr14:3,sma20:100,sma50:96,sma200:88,
      support:91,resistance:110,relativeVolume:1.3,distanceSma20Atr:1
    };
    const q:Quote={symbol:'EXAMPLE',price:103,avgVolume:2e6,marketCap:15e9};
    const result=buildScores(f,t,q,[],95,{stalePrice:false,isOtc:false});
    expect(result.core.score).not.toBeNull();
    expect(result.core.band).not.toBe('Not Rated');
  });
});

describe('honest conditional trading plans',()=>{
  const q:Quote={symbol:'EXAMPLE',price:100,avgVolume:2_000_000,volume:2_100_000,timestamp:'2026-10-09'};
  const t:TechnicalSnapshot={
    trend:'strong-up',rsi14:55,atr14:2,sma20:98,sma50:96,sma200:88,
    support:96,resistance:118,relativeVolume:1.2,distanceSma20Atr:1
  };
  it('shows one conditional pullback plan with a historical resistance target, not a manufactured 2R exit',()=>{
    const plan=buildTradePlan(q,t,[],95);
    expect(plan.status).toBe('Qualified Trade');
    expect(plan.target1).toBe(118);
    expect(plan.target2).toBeUndefined();
    expect(plan.preferredEntryLow!).toBeLessThan(plan.preferredEntryHigh!);
    expect(plan.confirmationAbove).toBe(plan.preferredEntryHigh);
    expect(plan.invalidationBelow!).toBeLessThan(plan.preferredEntryLow!);
    expect(plan.rewardRisk!).toBeGreaterThanOrEqual(2);
    const risk=plan.preferredEntryHigh!-plan.invalidationBelow!;
    const measured=(plan.target1!-plan.preferredEntryHigh!)/risk;
    expect(measured).toBeCloseTo(plan.rewardRisk!,1);
  });
  it('rejects a pretty setup when the observed resistance is too close instead of pushing the target out',()=>{
    const plan=buildTradePlan(q,{...t,resistance:101},[],95);
    expect(plan.status).toBe('Pass');
    expect(plan.target1).toBe(101);
    expect(plan.reasoning.join(' ')).toMatch(/No target was invented/i);
  });
  it('does not qualify otherwise favorable price structure with a nearby binary event',()=>{
    const plan=buildTradePlan(q,t,[{
      type:'binary',title:'One-time regulatory decision',
      date:new Date(Date.now()+6*86400000).toISOString(),binary:true
    }],95);
    expect(plan.status).toBe('Watch');
  });
});

describe('Scoring v2 structural protections and score ceilings',()=>{
 const t:TechnicalSnapshot={
   trend:'strong-up',rsi14:55,atr14:2,sma20:99,sma50:98,sma200:89,
   relativeVolume:1.9,distanceSma20Atr:.5,distanceSma50Atr:.5,
   support:96,resistance:140
 };
 const q:Quote={symbol:'BEST',price:100,avgVolume:3_000_000,volume:3_000_000,marketCap:1e9,timestamp:'2026-10-09'};
 const annual={date:'2026-07-01',revenue:300e6,stockBasedCompensation:0};
 const ideal:FundamentalSnapshot={
   warnings:[],currentRatio:3,debtToEquity:.1,returnOnEquity:35,
   returnOnInvestedCapital:30,operatingMargin:35,grossMargin:70,
   revenueGrowth:42,epsGrowth:50,freeCashFlowMargin:30,
   priceToEarnings:10,priceToSales:1,priceToFreeCashFlow:10,evToSales:1,
   sharesGrowth:-6,cash:150e6,marketableSecurities:50e6,debt:50e6,
   latestAnnual:annual
 };
 it('allows truly exceptional, sufficiently documented companies to exceed 95 without score inflation',()=>{
   const x=buildScores(ideal,t,q,[],100);
   expect(x.business.score).toBeGreaterThanOrEqual(95);
   expect(x.core.score).toBeGreaterThanOrEqual(95);
   expect(x.growth.score).toBeGreaterThanOrEqual(95);
   expect(x.asymmetric.score).toBeGreaterThanOrEqual(95);
   expect(x.swing.score).toBeGreaterThanOrEqual(95);
   expect(x.tradePlan.status).toBe('Qualified Trade');
   expect(x.core.modelVersion).toBe('2.0.0-research');
 });
 it('distinguishes excellent business fundamentals from an expensive current purchase price',()=>{
   const appleLike:FundamentalSnapshot={
     ...ideal,currentRatio:.9,debtToEquity:.77,returnOnEquity:125,
     returnOnInvestedCapital:39,operatingMargin:30,grossMargin:46,
     revenueGrowth:16.4,epsGrowth:29,freeCashFlowMargin:23.7,
     priceToEarnings:38.6,priceToSales:10,priceToFreeCashFlow:42,evToSales:10,
     sharesGrowth:-3,cash:40e9,marketableSecurities:107e9,debt:85e9,
     latestAnnual:{...annual,revenue:420e9,stockBasedCompensation:8e9}
   };
   const result=buildScores(appleLike,t,{...q,symbol:'AAPL',marketCap:5e12},[],93);
   expect(result.business.score).toBeGreaterThan(result.core.score!+15);
   expect(result.business.score).toBeGreaterThanOrEqual(80);
   expect(result.core.components.find(x=>x.name==='Valuation')?.raw).toBeLessThan(40);
   expect(result.business.components.some(x=>x.name==='Valuation')).toBe(false);
 });
 it('keeps incomplete evidence below elite rather than giving missing inputs a 50',()=>{
   const f={...ideal,returnOnInvestedCapital:undefined,priceToSales:undefined};
   const r=buildScores(f,t,q,[],75);
   expect(r.core.score).toBeLessThan(90);
   expect(r.core.confidence).not.toBe('High');
   expect(r.business.confidence).not.toBe('High');
   expect(r.core.score).not.toBeNull();
 });
 it('requires actual ROIC and free-cash-flow valuation for Elite confidence',()=>{
   const f={...ideal,returnOnInvestedCapital:undefined};
   const r=buildScores(f,t,q,[],93);
   expect(r.core.confidence).toBe('Moderate');
   expect(r.business.score).toBeLessThan(90);
   expect(r.core.score).toBeLessThan(90);
 });
 it('cannot turn a rejected mathematical trade into an approved 95+ signal',()=>{
   const r=buildScores(ideal,{...t,resistance:101},q,[],100);
   expect(r.tradePlan.status).toBe('Pass');
   expect(r.swing.score).toBeLessThanOrEqual(69.9);
 });
});
