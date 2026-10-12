import type { Bar, TechnicalSnapshot } from './types';

const avg = (xs: number[]) => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : undefined;
const pct = (a?: number, b?: number) => (a == null || b == null || b === 0) ? undefined : ((a / b) - 1) * 100;

export function sma(values: number[], n: number): number | undefined {
  if (values.length < n) return undefined;
  return avg(values.slice(-n));
}

export function rsi(values: number[], n=14): number | undefined {
  if (values.length < n + 1) return undefined;
  const diffs = values.slice(-(n+1)).slice(1).map((v,i)=>v-values.slice(-(n+1))[i]);
  const gains = diffs.map(x=>Math.max(0,x));
  const losses = diffs.map(x=>Math.max(0,-x));
  const ag = avg(gains) ?? 0;
  const al = avg(losses) ?? 0;
  if (al === 0) return ag === 0 ? 50 : 100;
  const rs = ag / al;
  return 100 - 100/(1+rs);
}

export function atr(bars: Bar[], n=14): number | undefined {
  if (bars.length < n + 1) return undefined;
  const recent = bars.slice(-(n+1));
  const trs: number[] = [];
  for (let i=1;i<recent.length;i++) {
    const b = recent[i], p = recent[i-1];
    trs.push(Math.max(b.high-b.low, Math.abs(b.high-p.close), Math.abs(b.low-p.close)));
  }
  return avg(trs);
}

export function vwap(bars: Bar[], n=20): number | undefined {
  const recent = bars.slice(-n);
  if (!recent.length) return undefined;
  let pv = 0, vol = 0;
  for (const b of recent) {
    const price = b.vwap ?? ((b.high+b.low+b.close)/3);
    pv += price*b.volume;
    vol += b.volume;
  }
  return vol ? pv/vol : undefined;
}

function slopePct(values:number[], n:number): number|undefined {
  if(values.length < n+5) return undefined;
  const now=sma(values,n); const prev=sma(values.slice(0,-5),n);
  return pct(now,prev);
}

export function technicalSnapshot(inputBars: Bar[]): TechnicalSnapshot {
  const bars = [...inputBars].sort((a,b)=>a.date.localeCompare(b.date));
  const closes = bars.map(b=>b.close);
  const vols = bars.map(b=>b.volume);
  const last = closes.at(-1);
  const s20=sma(closes,20), s50=sma(closes,50), s200=sma(closes,200), a14=atr(bars,14);
  const rv = vols.length >= 21 && avg(vols.slice(-21,-1)) ? (vols.at(-1)! / (avg(vols.slice(-21,-1))!)) : undefined;
  const recent=bars.slice(-60);
  const support = recent.length ? Math.min(...recent.slice(-20).map(b=>b.low)) : undefined;
  const resistance = recent.length ? Math.max(...recent.slice(-20).map(b=>b.high)) : undefined;
  let trend: TechnicalSnapshot['trend']='unknown';
  if(last!=null && s50!=null && s200!=null){
    const s50s=slopePct(closes,50) ?? 0, s200s=slopePct(closes,200) ?? 0;
    if(last>s50 && s50>s200 && s50s>0 && s200s>=0) trend='strong-up';
    else if(last>s50 && s50s>=0) trend='up';
    else if(last<s50 && s50<s200 && s50s<0 && s200s<=0) trend='strong-down';
    else if(last<s50 && s50s<0) trend='down';
    else trend='sideways';
  }
  return {
    sma20:s20,sma50:s50,sma200:s200,
    sma50Slope:slopePct(closes,50),sma200Slope:slopePct(closes,200),
    rsi14:rsi(closes,14),atr14:a14,relativeVolume:rv,vwap20:vwap(bars,20),
    distanceSma20Atr:(last!=null&&s20!=null&&a14)?(last-s20)/a14:undefined,
    distanceSma50Atr:(last!=null&&s50!=null&&a14)?(last-s50)/a14:undefined,
    distanceSma200Pct:pct(last,s200),momentum20:closes.length>20?pct(last,closes.at(-21)):undefined,
    momentum63:closes.length>63?pct(last,closes.at(-64)):undefined,
    momentum126:closes.length>126?pct(last,closes.at(-127)):undefined,
    support,resistance,trend
  };
}
