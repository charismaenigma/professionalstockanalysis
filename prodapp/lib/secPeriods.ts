/** Matching fiscal periods is essential: most U.S. issuers file only three
 * Form 10-Qs each year, not four. A "fourth previous 10-Q" is NOT last
 * year's comparable quarter. SEC fact arrays also repeat prior periods in
 * later filings, so select by period end rather than array position. */
export type PeriodFact={
  start?:string;end?:string;val:number;form?:string;filed?:string;
};
const duration=(x:PeriodFact)=>x.start&&x.end?(Date.parse(x.end)-Date.parse(x.start))/86400000:NaN;
const elapsed=(later:string,earlier:string)=>(Date.parse(later)-Date.parse(earlier))/86400000;
const mostRecent=(a:PeriodFact,b:PeriodFact)=>String(b.filed??'').localeCompare(String(a.filed??''));

export function singleQuarterAt<T extends PeriodFact>(rows:T[],end?:string):T|undefined{
  if(!end)return undefined;
  return rows.filter(x=>x.form==='10-Q'&&x.end===end&&duration(x)>=60&&duration(x)<=125)
    .sort(mostRecent)[0];
}
export function matchedYearAgoQuarter<T extends PeriodFact>(rows:T[],last?:T):T|undefined{
  if(!last?.end)return undefined;
  return rows.filter(x=>x.form==='10-Q'&&x.end&&x.end!==last.end&&duration(x)>=60&&duration(x)<=125)
    .map(x=>({x,delta:elapsed(last.end!,x.end!)}))
    .filter(o=>o.delta>=340&&o.delta<=390)
    .sort((a,b)=>Math.abs(a.delta-365)-Math.abs(b.delta-365)||
      String(b.x.filed??'').localeCompare(String(a.x.filed??'')))[0]?.x;
}
export function yearToDateAt<T extends PeriodFact>(rows:T[],end?:string):T|undefined{
  if(!end)return undefined;
  return rows.filter(x=>x.form==='10-Q'&&x.end===end&&duration(x)>=60&&duration(x)<=310)
    .sort((a,b)=>duration(b)-duration(a)||mostRecent(a,b))[0];
}
export function latestAnnual<T extends PeriodFact>(rows:T[]):T|undefined{
  return rows.filter(x=>x.form==='10-K'&&duration(x)>=300&&duration(x)<=380)
    .sort((a,b)=>String(b.end??'').localeCompare(String(a.end??''))||mostRecent(a,b))[0];
}
export function trailingTwelveMonths<T extends PeriodFact>(rows:T[]):number|undefined{
  const yearly=latestAnnual(rows);
  const current=rows.filter(x=>x.form==='10-Q'&&x.end&&duration(x)>=60&&duration(x)<=125)
    .sort((a,b)=>String(b.end).localeCompare(String(a.end)))[0];
  if(!yearly||!Number.isFinite(yearly.val))return undefined;
  if(!current?.end||!yearly.end||current.end<=yearly.end)return yearly.val;
  if(elapsed(current.end,yearly.end)>370)return undefined; // no annual bridge
  const prior=matchedYearAgoQuarter(rows,current);
  const thisYtd=yearToDateAt(rows,current.end);
  const priorYtd=yearToDateAt(rows,prior?.end);
  if(!thisYtd||!priorYtd||![thisYtd.val,priorYtd.val].every(Number.isFinite))return undefined;
  // Sum of FY + latest fiscal YTD - comparable prior-year fiscal YTD.
  // EPS is an approximate diluted-TTM reconstruction because the diluted
  // weighted-average shares can vary between fiscal periods.
  const output=yearly.val+thisYtd.val-priorYtd.val;
  return Number.isFinite(output)&&output>0?output:undefined;
}
