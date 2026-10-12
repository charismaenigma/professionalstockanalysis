import {describe,it,expect} from 'vitest';
import {screenDailyRadar,qualifyRadarLead,type DailyBar,type RadarLead} from './radar';
import type {AnalysisResult,ModelScore} from './types';

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

describe('Daily Radar full-model qualification',()=>{
  const row:RadarLead={
    symbol:'PLTR',category:'momentum',close:209.05,previousClose:205,
    changePercent:1.98,volume:10000000,volumeRatio:1.3,
    dollarVolume:2090500000,dayRangePercent:3,closeLocationPercent:80,
    priority:87,reasons:['Activity'],cautions:[],source:'Massive daily grouped bars',
    qualification:'PRELIMINARY – full MarketClarity analysis required'
  };
  const score=(s:number|null):ModelScore=>({
    score:s,band:s==null?'Not Rated':s>=95?'Elite Opportunity':s>=90?'Strong Candidate':s>=85?'Watchlist':s>=70?'Research Only':'Pass',
    components:[],vetoes:[]
  });
  function data(scores:[number|null,number|null,number|null,number|null],status:'Pass'|'Watch'|'Qualified Trade'='Pass'){
    return {
      mode:'live',instrumentType:'Stock',marketClassification:'Unknown',symbol:'PLTR',
      quote:{symbol:'PLTR',price:209.05,timestamp:'2026-10-09'},
      priceDataAgeDays:3,assessmentWarnings:[],dataCompleteness:93,
      scores:{core:score(scores[0]),growth:score(scores[1]),asymmetric:score(scores[2]),swing:score(scores[3])},
      tradePlan:{status,reasoning:[]}
    } as Pick<AnalysisResult,'mode'|'instrumentType'|'marketClassification'|'symbol'|'quote'|'priceDataAgeDays'|'assessmentWarnings'|'scores'|'tradePlan'|'dataCompleteness'>;
  }
  it('rejects the actual sub-80 Palantir screenshot numbers even with an 87 activity priority',()=>{
    expect(qualifyRadarLead(row,data([67.8,69.3,62.3,52.8]))).toBeNull();
  });
  it('withholds all unrated fundamentals and an under-80 swing model',()=>{
    expect(qualifyRadarLead(row,data([null,null,null,74]))).toBeNull();
  });
  it('features 80+ investment research without pretending it qualified for swing trading',()=>{
    const lead=qualifyRadarLead(row,data([81,null,77,52.8]));
    expect(lead?.verified?.featuredScore).toBe(81);
    expect(lead?.verified?.featuredModel).toBe('Core Investment');
    expect(lead?.verified?.verdict).toBe('Research Watch (80+)');
    expect(lead?.verified?.tradeStatus).toBe('Pass');
  });
  it('won’t feature a trade score over 80 if hard-vetoed as a pass',()=>{
    expect(qualifyRadarLead(row,data([65,65,70,87],'Pass'))).toBeNull();
  });
  it('features a 95+ Elite when the exact full model confirms it',()=>{
    const lead=qualifyRadarLead(row,data([94,96,85,92],'Qualified Trade'));
    expect(lead?.verified?.featuredScore).toBe(96);
    expect(lead?.verified?.verdict).toBe('Elite (95+)');
  });
});
