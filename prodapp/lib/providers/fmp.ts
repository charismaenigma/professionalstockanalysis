import type { Bar, CatalystItem, FundamentalSnapshot, Quote } from '../types';

const BASE='https://financialmodelingprep.com/stable';
function key(){const k=process.env.FMP_API_KEY; if(!k) throw new Error('FMP_API_KEY is not configured'); return k;}
async function get<T=any>(path:string,params:Record<string,string|number|undefined>={}):Promise<T>{
  const url=new URL(BASE+path); Object.entries(params).forEach(([k,v])=>{if(v!==undefined)url.searchParams.set(k,String(v))}); url.searchParams.set('apikey',key());
  const r=await fetch(url,{next:{revalidate:300}}); if(!r.ok)throw new Error(`FMP ${path} failed (${r.status})`); return r.json();
}
const n=(x:any)=>Number.isFinite(Number(x))?Number(x):undefined;
const pct=(x:any)=>{const v=n(x); return v==null?undefined:(Math.abs(v)<=2?v*100:v)};
const growth=(a?:number,b?:number)=>a!=null&&b!=null&&b!==0?((a/b)-1)*100:undefined;

export async function fmpQuote(symbol:string):Promise<Quote>{
  const a:any[]=await get('/quote',{symbol}); const q=a?.[0]; if(!q)throw new Error('Ticker not found');
  return {symbol, name:q.name, price:n(q.price)??n(q.previousClose)??0, change:n(q.change), changePercent:n(q.changePercentage)??n(q.changesPercentage), volume:n(q.volume), avgVolume:n(q.avgVolume), marketCap:n(q.marketCap), yearHigh:n(q.yearHigh), yearLow:n(q.yearLow), timestamp:new Date().toISOString()};
}
export async function fmpBars(symbol:string,days=420):Promise<Bar[]>{
  const from=new Date(Date.now()-days*86400000).toISOString().slice(0,10); const to=new Date().toISOString().slice(0,10);
  try{
    const a:any[]=await get('/historical-price-eod/full',{symbol,from,to});
    return (a??[]).map(x=>({date:String(x.date),open:n(x.open)??0,high:n(x.high)??0,low:n(x.low)??0,close:n(x.close)??0,volume:n(x.volume)??0,vwap:n(x.vwap)})).filter(x=>x.close>0).sort((a,b)=>a.date.localeCompare(b.date));
  }catch(err:any){
    if(!String(err?.message||'').includes('(402)')) throw err;
    const a:any[]=await get('/historical-price-eod/light',{symbol,from,to});
    return (a??[]).map(x=>{
      const price=n(x.price)??0;
      return {date:String(x.date),open:price,high:price,low:price,close:price,volume:n(x.volume)??0,vwap:price};
    }).filter(x=>x.close>0).sort((a,b)=>a.date.localeCompare(b.date));
  }
}

export async function fmpFundamentals(symbol:string):Promise<{snapshot:FundamentalSnapshot;companyName?:string;cik?:string}>{
  const [profileA, ratiosA, metricsA, incomeA, balanceA, cashA, qIncomeA, qBalanceA, qCashA]=await Promise.all([
    get<any[]>('/profile',{symbol}).catch(()=>[]), get<any[]>('/ratios-ttm',{symbol}).catch(()=>[]), get<any[]>('/key-metrics-ttm',{symbol}).catch(()=>[]),
    get<any[]>('/income-statement',{symbol,period:'annual',limit:3}).catch(()=>[]), get<any[]>('/balance-sheet-statement',{symbol,period:'annual',limit:3}).catch(()=>[]), get<any[]>('/cash-flow-statement',{symbol,period:'annual',limit:3}).catch(()=>[]),
    get<any[]>('/income-statement',{symbol,period:'quarter',limit:5}).catch(()=>[]), get<any[]>('/balance-sheet-statement',{symbol,period:'quarter',limit:5}).catch(()=>[]), get<any[]>('/cash-flow-statement',{symbol,period:'quarter',limit:5}).catch(()=>[])
  ]);
  const p=profileA?.[0]??{}, r=ratiosA?.[0]??{}, m=metricsA?.[0]??{};
  const annual=(i:number)=>({
    date:incomeA?.[i]?.date,period:incomeA?.[i]?.period,revenue:n(incomeA?.[i]?.revenue),grossProfit:n(incomeA?.[i]?.grossProfit),operatingIncome:n(incomeA?.[i]?.operatingIncome),netIncome:n(incomeA?.[i]?.netIncome),eps:n(incomeA?.[i]?.epsDiluted??incomeA?.[i]?.eps),ebitda:n(incomeA?.[i]?.ebitda),
    totalAssets:n(balanceA?.[i]?.totalAssets),totalCurrentAssets:n(balanceA?.[i]?.totalCurrentAssets),cashAndCashEquivalents:n(balanceA?.[i]?.cashAndCashEquivalents??balanceA?.[i]?.cashAndShortTermInvestments),totalDebt:n(balanceA?.[i]?.totalDebt),totalCurrentLiabilities:n(balanceA?.[i]?.totalCurrentLiabilities),totalStockholdersEquity:n(balanceA?.[i]?.totalStockholdersEquity),
    operatingCashFlow:n(cashA?.[i]?.operatingCashFlow??cashA?.[i]?.netCashProvidedByOperatingActivities),capitalExpenditure:n(cashA?.[i]?.capitalExpenditure??cashA?.[i]?.investmentsInPropertyPlantAndEquipment),freeCashFlow:n(cashA?.[i]?.freeCashFlow),stockBasedCompensation:n(cashA?.[i]?.stockBasedCompensation),weightedAverageShsOutDil:n(incomeA?.[i]?.weightedAverageShsOutDil)
  });
  const quarter=(i:number)=>({date:qIncomeA?.[i]?.date,period:qIncomeA?.[i]?.period,revenue:n(qIncomeA?.[i]?.revenue),grossProfit:n(qIncomeA?.[i]?.grossProfit),operatingIncome:n(qIncomeA?.[i]?.operatingIncome),netIncome:n(qIncomeA?.[i]?.netIncome),eps:n(qIncomeA?.[i]?.epsDiluted??qIncomeA?.[i]?.eps),totalDebt:n(qBalanceA?.[i]?.totalDebt),cashAndCashEquivalents:n(qBalanceA?.[i]?.cashAndCashEquivalents??qBalanceA?.[i]?.cashAndShortTermInvestments),freeCashFlow:n(qCashA?.[i]?.freeCashFlow),weightedAverageShsOutDil:n(qIncomeA?.[i]?.weightedAverageShsOutDil)});
  const latestAnnual=annual(0), priorAnnual=annual(1), latestQuarter=quarter(0), priorQuarter=quarter(4);
  const fcfMargin=latestAnnual.freeCashFlow!=null&&latestAnnual.revenue?latestAnnual.freeCashFlow/latestAnnual.revenue*100:undefined;
  const sharesGrowth=growth(latestAnnual.weightedAverageShsOutDil,priorAnnual.weightedAverageShsOutDil);
  const warnings:string[]=[];
  if(sharesGrowth!=null&&sharesGrowth>10)warnings.push(`Diluted share count increased about ${sharesGrowth.toFixed(1)}% year over year.`);
  if(latestAnnual.freeCashFlow!=null&&latestAnnual.freeCashFlow<0)warnings.push('Free cash flow is negative in the latest annual period.');
  if(n(r.debtToEquityRatioTTM)!=null&&Number(r.debtToEquityRatioTTM)>2)warnings.push('Debt-to-equity is elevated.');
  const snapshot:FundamentalSnapshot={
    sector:p.sector,industry:p.industry,description:p.description,beta:n(p.beta),
    priceToEarnings:n(r.priceToEarningsRatioTTM),forwardPE:n(p.forwardPE),priceToSales:n(r.priceToSalesRatioTTM),priceToBook:n(r.priceToBookRatioTTM),
    enterpriseValue:n(m.enterpriseValueTTM??r.enterpriseValueTTM),evToSales:n(m.evToSalesTTM),evToEbitda:n(m.evToEBITDATTM??r.enterpriseValueMultipleTTM),priceToFreeCashFlow:n(r.priceToFreeCashFlowRatioTTM),
    currentRatio:n(r.currentRatioTTM??m.currentRatioTTM),quickRatio:n(r.quickRatioTTM),debtToEquity:n(r.debtToEquityRatioTTM),returnOnEquity:pct(m.returnOnEquityTTM),returnOnInvestedCapital:pct(m.returnOnInvestedCapitalTTM),
    grossMargin:pct(r.grossProfitMarginTTM),operatingMargin:pct(r.operatingProfitMarginTTM),netMargin:pct(r.netProfitMarginTTM),freeCashFlowMargin:fcfMargin,
    revenueGrowth:growth(latestQuarter.revenue,priorQuarter.revenue)??growth(latestAnnual.revenue,priorAnnual.revenue),epsGrowth:growth(latestQuarter.eps,priorQuarter.eps)??growth(latestAnnual.eps,priorAnnual.eps),sharesGrowth,
    cash:latestAnnual.cashAndCashEquivalents,debt:latestAnnual.totalDebt,latestAnnual,priorAnnual,latestQuarter,priorQuarter,warnings
  };
  return {snapshot,companyName:p.companyName??p.name,cik:p.cik?String(p.cik).padStart(10,'0'):undefined};
}

export async function fmpCatalysts(symbol:string):Promise<CatalystItem[]>{
  const today=new Date(); const from=new Date(today.getTime()-14*86400000).toISOString().slice(0,10); const to=new Date(today.getTime()+75*86400000).toISOString().slice(0,10);
  const [earnings,news]=await Promise.all([
    get<any[]>('/earnings-calendar',{from,to}).catch(()=>[]), get<any[]>('/news/stock',{symbols:symbol,from, to, page:0,limit:12}).catch(()=>[])
  ]);
  const out:CatalystItem[]=[];
  for(const e of earnings.filter((x:any)=>String(x.symbol).toUpperCase()===symbol.toUpperCase()).slice(0,3)) out.push({date:e.date,type:'Earnings',title:`Earnings announcement${e.epsEstimated!=null?` — estimated EPS ${e.epsEstimated}`:''}`,source:'FMP',binary:false});
  for(const x of news.slice(0,8)) out.push({date:x.publishedDate,type:'News',title:x.title,summary:x.text,url:x.url,source:x.publisher??x.site,binary:false});
  return out;
}
