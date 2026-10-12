import {describe,it,expect} from 'vitest';
import {screenDailyRadar,type DailyBar} from './radar';

const row=(symbol:string,close:number,prior=false,otc=false):DailyBar=>({
  symbol,close,open:prior?close:close*.98,high:close*1.05,low:close*.95,
  volume:prior?900_000:2_000_000,otc
});
describe('Daily Opportunity Radar safety and ranking',()=>{
  const prev=[row('ACME',10,true),row('ZZOTC',8,true,true),row('TNA',50,true),row('THIN',10,true),row('BAD',.003,true)];
  const today=[row('ACME',10.5),row('ZZOTC',9,false,true),row('TNA',52),{...row('THIN',11),volume:2000},row('BAD',.004)];

  it('uses actual completed session dates and never certifies a preliminary 95+',()=>{
    const r=screenDailyRadar(today,prev,'2026-10-09','2026-10-08');
    expect(r.reportDate).toBe('2026-10-09');
    expect(r.verifiedElite).toBeNull();
    expect(r.verifiedStrong).toBeNull();
    const leads=Object.values(r.categories).flat();
    expect(leads.length).toBeGreaterThan(0);
    expect(leads.every(l=>l.priority<=89)).toBe(true);
    expect(leads.every(l=>l.qualification.includes('PRELIMINARY'))).toBe(true);
    expect(leads.some(l=>l.symbol==='ACME')).toBe(true);
  });
  it('excludes OTC and thinly traded names rather than presenting speculative picks',()=>{
    const r=screenDailyRadar(today,prev,'2026-10-09','2026-10-08');
    const names=Object.values(r.categories).flat().map(l=>l.symbol);
    expect(names).not.toContain('ZZOTC');
    expect(names).not.toContain('THIN');
    expect(names).not.toContain('BAD');
  });
  it('routes leveraged ETF leads to a separate category with daily leverage warnings',()=>{
    const r=screenDailyRadar(today,prev,'2026-10-09','2026-10-08');
    const tna=r.categories.leveraged.find(x=>x.symbol==='TNA');
    expect(tna?.leveraged?.multiple).toBe(3);
    expect(tna?.cautions.join(' ')).toMatch(/daily reset/i);
    expect(r.categories.momentum.some(x=>x.symbol==='TNA')).toBe(false);
  });
  it('returns an empty shortlist honestly when no candidate qualifies',()=>{
    const r=screenDailyRadar([{...row('TINY',1.1),volume:10}],[], '2026-10-09','2026-10-08');
    expect(Object.values(r.categories).every(a=>a.length===0)).toBe(true);
  });
});
