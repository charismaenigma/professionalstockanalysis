import {describe,it,expect} from 'vitest';
import {rankCandidates,auditCandidates,type DailyBar} from './opportunity-lab';
const bar=(ticker:string,close:number,volume:number,date:string,open=close):DailyBar=>({ticker,date,open,close,volume,high:Math.max(open,close)*1.02,low:Math.min(open,close)*.98});
describe('point-in-time opportunity scanner',()=>{
 it('does not use target-session outcomes in pre-session selection',()=>{
  const old=[bar('AAA',20,1000000,'2026-10-20'),bar('BBB',20,1000000,'2026-10-20')];
  const prior=[bar('AAA',22,2000000,'2026-10-21'),bar('BBB',20,1000000,'2026-10-21')];
  const first=rankCandidates(old,prior,'day');
  expect(first.all[0].ticker).toBe('AAA');
  const winners=[bar('AAA',5,1000000,'2026-10-22',8),bar('BBB',40,1000000,'2026-10-22',20)];
  const losers=[bar('AAA',60,1000000,'2026-10-22',10),bar('BBB',5,1000000,'2026-10-22',20)];
  auditCandidates(first.all,winners,first.discarded,1);auditCandidates(first.all,losers,first.discarded,1);
  expect(rankCandidates(old,prior,'day').all).toEqual(first.all);
 });
 it('reports observed open-to-close moves, not trade profits',()=>{
  const old=[bar('AAA',20,1000000,'2026-10-20'),bar('BBB',20,1000000,'2026-10-20')];
  const prior=[bar('AAA',22,2000000,'2026-10-21'),bar('BBB',20,1000000,'2026-10-21')];
  const r=rankCandidates(old,prior,'day');
  const audit=auditCandidates(r.all,[bar('AAA',18,1000000,'2026-10-22',20),bar('BBB',30,1000000,'2026-10-22',20)],r.discarded,1);
  expect(audit.observedPicks[0].observed?.openToClosePct).toBe(-10);
  expect(audit.missed[0].ticker).toBe('BBB');
  expect(audit.missed[0].openToClosePct).toBe(50);
 });
 it('excludes illiquid and very low-priced tickers before seeing outcomes',()=>{
  const ranked=rankCandidates([bar('AAA',3,10000,'2026-10-20')],[bar('AAA',3,10000,'2026-10-21')],'swing');
  expect(ranked.all).toHaveLength(0);
 });
});
