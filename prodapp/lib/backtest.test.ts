import {describe,it,expect} from 'vitest';
import {backtest,type Candle} from './backtest';

const initial=5000;
function candles():Candle[]{
 const base=Date.UTC(2026,5,1);
 return Array.from({length:100},(_,i)=>{
  const close=i<60?100:i===60?80:i===61?82:i===62?92:92;
  const open=i<60?100:i===60?100:i===61?80:i===62?82:92;
  return {time:base+i*86400000,open,close,high:Math.max(open,close)+1,low:Math.min(open,close)-1,volume:10000};
 });
}
describe('trade-first backtester',()=>{
 it('uses the 5% sleeve and logs net trade returns rather than overall core portfolio return',()=>{
  const test=backtest(candles(),'Mean Reversion',1,initial,55,3);
  expect(test.tradingSleeveInitial).toBe(initial);
  expect(test.closedTrades).toBeGreaterThan(0);
  for(const trade of test.trades){
   expect(trade.entryCost).toBeLessThanOrEqual(initial/3+0.02);
   expect(trade.returnPct).toBeCloseTo((trade.exitProceeds-trade.entryCost)/trade.entryCost*100,1);
   expect(trade.stop).toBeLessThan(trade.target);
  }
  const expectedAverage=test.trades.reduce((sum,trade)=>sum+trade.returnPct,0)/test.trades.length;
  expect(test.averageTradeReturnPct).toBeCloseTo(expectedAverage,9);
 });
 it('reports no trade return for an entirely flat market',()=>{
  const flat=candles().map(c=>({...c,open:100,high:101,low:99,close:100}));
  const result=backtest(flat,'Mean Reversion',.25,initial,55,2);
  expect(result.closedTrades).toBe(0);
  expect(result.averageTradeReturnPct).toBeNull();
  expect(result.bestTradeReturnPct).toBeNull();
  expect(result.tradingSleeveReturnPct).toBe(0);
 });
 it('rejects invalid slot counts and risk levels',()=>{
  expect(()=>backtest(candles(),'Mean Reversion',.25,initial,55,4 as 2|3)).toThrow();
  expect(()=>backtest(candles(),'Mean Reversion',5,initial,55,3)).toThrow();
 });
});
