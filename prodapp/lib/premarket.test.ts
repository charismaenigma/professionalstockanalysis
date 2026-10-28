import {describe,it,expect} from 'vitest';
import {assessPremarketRow,discoverCandidates,rankPremarketRows} from './premarket';
const now=new Date('2026-10-28T12:30:00Z');
function t(price:number,time:string,barVolume=1000){
 return assessPremarketRow({ticker:'AAPL',source:'watchlist',previousClose:100,previousVolume:1000000,
 latestTrade:{p:price,t:time},latestQuote:{bp:price-.05,ap:price+.05,t:time},
 bars:[{t:time,c:price,v:barVolume,o:price,h:price,l:price}],
 asOf:now,newsCount:1});
}
describe('premarket research safety',()=>{
 it('requires an actual same-session trade and quote; does not rank yesterday news as a live gap',()=>{
  const x=t(110,'2026-10-27T20:00:00Z');
  expect(x.latestPrice).toBeNull();expect(x.gapPct).toBeNull();
  expect(x.evidence).toBe('missing');expect(x.score).toBeNull();
 });
 it('uses current-session IEX evidence, with an explicit exchange volume unit',()=>{
  const x=t(105,'2026-10-28T12:25:00Z');
  expect(x.gapPct).toBe(5);expect(x.premarketVolumeIex).toBe(1000);
  expect(x.liquidity).toBe('pass');expect(x.score).toBeGreaterThan(0);
 });
 it('fails liquidity when the quote is stale despite a recent last trade',()=>{
  const x=assessPremarketRow({ticker:'NVDA',source:'previous-session',previousClose:110,previousVolume:200000,
   latestTrade:{p:111,t:'2026-10-28T12:29:00Z'},
   latestQuote:{bp:110,ap:111,t:'2026-10-28T12:00:00Z'},asOf:now,newsCount:0});
  expect(x.evidence).toBe('fresh');expect(x.liquidity).toBe('watch');
 });
 it('ranks fresh evidence first and excludes ticker ambiguity from weak previous-day candidates',()=>{
  const rows=rankPremarketRows([t(110,'2026-10-27T15:00:00Z'),t(108,'2026-10-28T12:28:00Z')]);
  expect(rows[0].score).not.toBeNull();expect(rows[1].rank).toBeNull();
  const discovered=discoverCandidates([{T:'AAPL',o:95,c:100,v:1000000},{T:'XLK',o:95,c:100,v:1000000},{T:'ABC-PA',o:10,c:11,v:2000000}],['SOFI']);
  expect(discovered).toContain('AAPL');expect(discovered).toContain('SOFI');expect(discovered).not.toContain('XLK');expect(discovered).not.toContain('ABC-PA');
 });
});
