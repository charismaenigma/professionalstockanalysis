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
      priceToEarnings:22,priceToSales:4,freeCashFlowMargin:20,cash:2e9,debt:1e9
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
