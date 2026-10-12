import {describe,it,expect} from 'vitest';
import {knownLeveraged,researchAlternatives,leveragedContext} from './leveraged';
import type {BenchmarkResult,TechnicalSnapshot,Quote} from './types';

const tech:TechnicalSnapshot={trend:'down',rsi14:34.5,sma50:67,sma200:60.7,atr14:2.3};
const quote:Quote={symbol:'TNA',price:58.11};
const ref=(symbol:'VOO'|'VTI',timing:number):BenchmarkResult=>({
 symbol,longTermQuality:95.5,timing,technical:{trend:'up'},price:100,explanation:'End-of-day data'
});
describe('leveraged ETF research guardrails',()=>{
 it('recognizes paired bullish/bearish daily leverage with correct index',()=>{
  expect(knownLeveraged('TNA')?.dailyMultiple).toBe(3);
  expect(knownLeveraged('TZA')?.dailyMultiple).toBe(-3);
  expect(knownLeveraged('TNA')?.opposite).toBe('TZA');
  expect(knownLeveraged('TQQQ')?.index).toBe('Nasdaq-100');
 });
 it('does not imply live alternative validation from other EOD benchmark data',()=>{
  const alts=researchAlternatives('TNA','down',[ref('VOO',94),ref('VTI',90)]);
  expect(alts.map(a=>a.symbol)).toEqual(['TZA','UPRO']);
  expect(alts.every(a=>a.isVerifiedNow===false)).toBe(true);
  expect(alts.every(a=>!a.reason.toLowerCase().includes('buy now'))).toBe(true);
 });
 it('does not imply a fresh entry or intraday signal',()=>{
  const ctx=leveragedContext(knownLeveraged('TNA')!,tech,quote);
  expect(ctx.headline).toContain('weak');
  expect(ctx.summary).toContain('end-of-day context only');
  expect(ctx.summary).toContain('no verified intraday entry');
 });
});
