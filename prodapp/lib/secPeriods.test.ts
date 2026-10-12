import {describe,it,expect} from 'vitest';
import {matchedYearAgoQuarter, singleQuarterAt, trailingTwelveMonths, trailingFromFiscalYtd, yearToDateAt} from './secPeriods';

type F={form:'10-Q'|'10-K';start:string;end:string;val:number;filed:string};
function f(form:F['form'],start:string,end:string,val:number,filed='2026-08-03'):F{
 return {form,start,end,val,filed};
}
// Apple example: 10-Q is filed for Q1, Q2, Q3; Q4 arrives in the 10-K.
// An offset of "4 prior quarterly reports" incorrectly compares Q3 with Q2.
const revenue:F[]=[
 f('10-K','2024-09-29','2025-09-27',416_161),
 f('10-Q','2024-12-29','2025-03-29',95_359),
 f('10-Q','2025-03-30','2025-06-28',94_036),
 f('10-Q','2025-12-28','2026-03-28',105_600),
 f('10-Q','2026-03-29','2026-06-27',109_400),
 f('10-Q','2024-09-29','2025-06-28',313_695),
 f('10-Q','2025-09-28','2026-06-27',345_000)
];
const eps:F[]=[
 f('10-K','2024-09-29','2025-09-27',7.47),
 f('10-Q','2024-09-29','2025-06-28',5.62),
 f('10-Q','2025-09-28','2026-06-27',6.85),
 f('10-Q','2025-03-30','2025-06-28',1.57),
 f('10-Q','2026-03-29','2026-06-27',2.02),
 f('10-Q','2024-12-29','2025-03-29',1.65),
 f('10-Q','2025-12-28','2026-03-28',1.99)
];
describe('SEC filing fiscal-year alignment',()=>{
 it('compares Q3 2026 with Q3 2025 rather than previous Q2',()=>{
   const now=singleQuarterAt(revenue,'2026-06-27');
   const prior=matchedYearAgoQuarter(revenue,now);
   expect(prior?.end).toBe('2025-06-28');
   expect(prior?.val).toBe(94_036);
   expect((now!.val/prior!.val-1)*100).toBeCloseTo(16.338,0);
 });
 it('uses trailing 12-month diluted EPS instead of previous FY alone',()=>{
   expect(trailingTwelveMonths(eps)).toBeCloseTo(8.70,2);
   expect(336.64/trailingTwelveMonths(eps)!).toBeCloseTo(38.69,1);
   expect(336.64/7.47).toBeGreaterThan(45);
 });
 it('reconstructs latest trailing revenue rather than stale fiscal-year sales',()=>{
   expect(trailingFromFiscalYtd(revenue,'2026-06-27','2025-06-28'))
     .toBe(416_161+345_000-313_695);
 });
 it('does not invent cash flow multiples when recent SEC cash flow data are missing',()=>{
   expect(trailingFromFiscalYtd(
     [f('10-K','2024-09-29','2025-09-27',100)],
     '2026-06-27','2025-06-28')).toBeUndefined();
 });
 it('uses comparable fiscal year-to-date reported figures',()=>{
   expect(yearToDateAt(revenue,'2026-06-27')?.val).toBe(345_000);
   expect(yearToDateAt(eps,'2025-06-28')?.val).toBe(5.62);
 });
 it('does not guess the trailing EPS when required year-ago earnings are unavailable',()=>{
   expect(trailingTwelveMonths(eps.filter(x=>x.end!=='2025-06-28'))).toBeUndefined();
 });
});
