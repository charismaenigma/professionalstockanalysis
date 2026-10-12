import type { Bar, FundamentalSnapshot, Quote, CatalystItem } from './types';

const base:any={
  RSKD:{name:'Riskified Ltd',price:7.86,marketCap:1900000000,sector:'Technology',industry:'Software',rev:21.8,eps:18,pe:20.3,ps:2.82,pfcf:21,current:3.62,de:0.11,roe:11,roic:9,gm:46,op:5,nm:-2,fcf:11,shares:-6,short:1.55,trend:.004},
  KODK:{name:'Eastman Kodak Co',price:10.02,marketCap:820000000,sector:'Industrials',industry:'Specialty Services',rev:18.3,eps:14,pe:16,ps:.84,pfcf:18,current:3.14,de:.21,roe:7,roic:6,gm:20,op:4,nm:2,fcf:7,shares:12,short:10.06,trend:.0015},
  SIMO:{name:'Silicon Motion Technology',price:282.98,marketCap:9500000000,sector:'Technology',industry:'Semiconductors',rev:54,eps:38,pe:24.8,ps:4.1,pfcf:27,current:4,de:.24,roe:22,roic:18,gm:49,op:18,nm:16,fcf:18,shares:1,short:3,trend:.003},
  VTI:{name:'Vanguard Total Stock Market ETF',price:410,marketCap:0,sector:'ETF',industry:'Broad Market ETF',rev:8,eps:8,pe:25,ps:2.8,pfcf:25,current:2,de:.5,roe:18,roic:14,gm:40,op:15,nm:12,fcf:10,shares:0,short:1,trend:.0012},
  VOO:{name:'Vanguard S&P 500 ETF',price:675,marketCap:0,sector:'ETF',industry:'Large-Cap ETF',rev:9,eps:9,pe:26,ps:3,pfcf:26,current:2,de:.5,roe:19,roic:15,gm:41,op:16,nm:13,fcf:11,shares:0,short:1,trend:.0011}
};
function hash(s:string){let h=2166136261; for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)} return h>>>0;}
function noise(seed:number,i:number){const x=Math.sin((seed+i*971)*12.9898)*43758.5453; return (x-Math.floor(x))-.5;}
export function demoBars(symbol:string):Bar[]{
  const d=base[symbol]??base.RSKD; const seed=hash(symbol); const out:Bar[]=[]; let p=d.price/Math.pow(1+d.trend,260);
  const start=new Date(Date.now()-370*86400000); let k=0;
  for(let i=0;i<370;i++){const dt=new Date(start.getTime()+i*86400000); if(dt.getUTCDay()===0||dt.getUTCDay()===6)continue; const n=noise(seed,k++); p=Math.max(.5,p*(1+d.trend+n*.025)); const open=p*(1+noise(seed,k+11)*.01); const close=p; const high=Math.max(open,close)*(1+Math.abs(noise(seed,k+31))*.015); const low=Math.min(open,close)*(1-Math.abs(noise(seed,k+51))*.015); out.push({date:dt.toISOString().slice(0,10),open,high,low,close,volume:400000+Math.round((noise(seed,k+71)+.5)*1800000),vwap:(open+high+low+close)/4});}
  const scale=d.price/(out.at(-1)?.close||d.price); return out.map(b=>({...b,open:b.open*scale,high:b.high*scale,low:b.low*scale,close:b.close*scale,vwap:(b.vwap||0)*scale}));
}
export function demoQuote(symbol:string):Quote{const d=base[symbol]??base.RSKD;return {symbol,name:d.name,price:d.price,marketCap:d.marketCap,volume:900000,avgVolume:1000000,yearHigh:d.price*1.08,yearLow:d.price*.55,timestamp:new Date().toISOString()}}
export function demoFundamentals(symbol:string):FundamentalSnapshot{const d=base[symbol]??base.RSKD; return {sector:d.sector,industry:d.industry,priceToEarnings:d.pe,forwardPE:d.pe,priceToSales:d.ps,priceToFreeCashFlow:d.pfcf,currentRatio:d.current,debtToEquity:d.de,returnOnEquity:d.roe,returnOnInvestedCapital:d.roic,grossMargin:d.gm,operatingMargin:d.op,netMargin:d.nm,freeCashFlowMargin:d.fcf,revenueGrowth:d.rev,epsGrowth:d.eps,sharesGrowth:d.shares,shortFloat:d.short,cash:300000000,debt:50000000,warnings:symbol==='KODK'?['Turnaround cash-flow quality deserves extra review.']:[]}}
export function demoCatalysts(symbol:string):CatalystItem[]{return [{date:new Date(Date.now()+28*86400000).toISOString().slice(0,10),type:'Earnings',title:`Illustrative ${symbol} earnings date`,source:'Demo',binary:false},{date:new Date(Date.now()-3*86400000).toISOString().slice(0,10),type:'News',title:'Illustrative company update for demo mode',summary:'Demo content only. Connect live data providers for current catalysts.',source:'Demo'}]}
export const demoSymbols=Object.keys(base);
