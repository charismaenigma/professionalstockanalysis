import {describe,it,expect} from 'vitest';
import {assessSwing} from './paper/strategy';
import {equityCurve,maxDrawdown,reconstructTrades,summarizeTrades} from './paper/metrics';
import type {AnalysisResult} from './types';
import type {PaperSnapshot,PaperFill} from './paper/alpaca';

const NOW = Date.parse('2026-10-27T15:30:00.000Z');
function analysis():AnalysisResult {
  return {
    mode:'live', symbol:'TEST', instrumentType:'Stock',
    marketClassification:'Listed', priceDataAgeDays:0,
    scores:{swing:{score:94,vetoes:[]}},
    tradePlan:{status:'Qualified Trade'},
    technicals:{trend:'up',sma20:99,sma50:95,rsi14:58,relativeVolume:1.4,atr14:2},
    quote:{price:100},
  } as unknown as AnalysisResult;
}
function snapshot():PaperSnapshot {
  return {latestQuote:{bp:99.99,ap:100.01,t:new Date(NOW).toISOString()},
    latestTrade:{p:100,t:new Date(NOW).toISOString()}};
}
describe('paper strategy risk gates',()=>{
  it('sizes a long-only paper bracket order from equity, exposure and cash limits',()=>{
    const decision=assessSwing(analysis(),snapshot(),100000,40000,NOW);
    expect(decision.order).toBeTruthy();
    expect(decision.order?.qty).toBeGreaterThan(0);
    expect(decision.order!.qty*decision.order!.limit).toBeLessThanOrEqual(5000);
    expect(decision.order!.riskDollars).toBeLessThanOrEqual(250);
    expect(decision.order!.target).toBeGreaterThan(decision.order!.limit);
    expect(decision.order!.stop).toBeLessThan(decision.order!.limit);
  });
  it('never trades demo mode even when scores appear favorable',()=>{
    const a=analysis();a.mode='demo';
    expect(assessSwing(a,snapshot(),100000,40000,NOW).order).toBeUndefined();
  });
  it('rejects stale quotes and wide spreads',()=>{
    const old=snapshot();old.latestQuote!.t='2026-10-27T15:00:00Z';
    expect(assessSwing(analysis(),old,100000,40000,NOW).order).toBeUndefined();
    const wide=snapshot();wide.latestQuote!.bp=98;
    expect(assessSwing(analysis(),wide,100000,40000,NOW).order).toBeUndefined();
  });
  it('rejects hard vetoes and insufficient cash',()=>{
    const a=analysis();a.scores.swing.vetoes=['Dilution'];
    expect(assessSwing(a,snapshot(),100000,40000,NOW).order).toBeUndefined();
    expect(assessSwing(analysis(),snapshot(),100000,1,NOW).order).toBeUndefined();
  });
});
describe('paper performance',()=>{
  const fills:PaperFill[]=[
    {id:'1',order_id:'a',symbol:'TEST',side:'buy',qty:'10',price:'100',transaction_time:'2026-10-01T14:00:00Z'},
    {id:'2',order_id:'b',symbol:'TEST',side:'sell',qty:'5',price:'110',transaction_time:'2026-10-02T14:00:00Z'},
    {id:'3',order_id:'c',symbol:'TEST',side:'sell',qty:'5',price:'90',transaction_time:'2026-10-03T14:00:00Z'},
  ];
  it('matches FIFO fills and calculates closed trade metrics',()=>{
    const trades=reconstructTrades(fills);
    const result=summarizeTrades(trades);
    expect(trades).toHaveLength(2);
    expect(result.winRate).toBe(50);
    expect(result.realizedPnl).toBe(0);
    expect(result.profitFactor).toBe(1);
  });
  it('calculates equity drawdown using valid history points',()=>{
    const curve=equityCurve({timestamp:[1,2,3],equity:[100,120,90],profit_loss:[],profit_loss_pct:[]});
    expect(maxDrawdown(curve.map(x=>x.equity))).toBeCloseTo(25);
  });
});
