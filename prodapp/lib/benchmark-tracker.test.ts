import {describe,it,expect} from 'vitest';
import {BENCHMARKS,comparePrices,reviewWindow} from './benchmark-tracker';
import type {DailyBar} from './opportunity-lab';
const bar=(ticker:string,open:number,close:number,date:string):DailyBar=>({ticker,open,close,date,high:Math.max(open,close),low:Math.min(open,close),volume:1000000});
describe('daily ETF benchmark comparison',()=>{
 it('includes VOO and all 11 distinct SPDR sector ETFs',()=>{
  expect(BENCHMARKS.map(x=>x.ticker)).toEqual(['VOO','XLK','XLC','XLE','XLF','XLV','XLI','XLU','XLY','XLP','XLB','XLRE']);
  expect(new Set(BENCHMARKS.map(x=>x.ticker)).size).toBe(12);
 });
 it('compares screened stocks and each ETF over identical start-to-end dates',()=>{
  const start=[bar('VOO',100,102,'2026-10-01'),bar('XLK',80,88,'2026-10-01'),bar('TEST',50,55,'2026-10-01')];
  const finish=[bar('VOO',101,110,'2026-10-08'),bar('XLK',90,88,'2026-10-08'),bar('TEST',57,60,'2026-10-08')];
  const result=comparePrices([{ticker:'TEST'}],start,finish,'2026-10-08');
  expect(result.benchmarks[0].returnPct).toBe(10);
  expect(result.benchmarks[1].returnPct).toBe(10);
  expect(result.tracked[0].returnPct).toBe(20);
  expect(result.tracked[0].vsVooPctPoints).toBe(10);
  expect(result.benchmarks.find(x=>x.ticker==='XLE')?.returnPct).toBeNull();
 });
 it('never uses future session prices when review window is incomplete',()=>{
  const window=reviewWindow('2026-10-26','1w','2026-10-27');
  expect(window.end).toBe('2026-10-27');
  expect(window.complete).toBe(false);
  expect(window.requestedEnd).toBe('2026-11-02');
  expect(reviewWindow('2026-10-26','1d','2026-10-27').end).toBe('2026-10-26');
 });
});
