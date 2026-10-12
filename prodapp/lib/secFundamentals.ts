import type { FinancialStatement, FundamentalSnapshot } from './types';

const ua=()=>process.env.SEC_USER_AGENT||'MarketClarity research app contact@example.com';
const headers={'User-Agent':ua(),'Accept-Encoding':'gzip, deflate'};

type FactRow={start?:string;end?:string;val:number;accn?:string;fy?:number;fp?:string;form?:string;filed?:string;frame?:string};
type Facts=Record<string,any>;

async function json(url:string){
  const r=await fetch(url,{headers,next:{revalidate:21600}});
  if(!r.ok)throw new Error(`SEC request failed (${r.status})`);
  return r.json();
}

export async function secTickerInfo(symbol:string):Promise<{cik:string;name:string}|null>{
  const j:any=await json('https://www.sec.gov/files/company_tickers.json');
  const target=symbol.toUpperCase();
  for(const row of Object.values(j) as any[]){
    if(String(row.ticker).toUpperCase()===target)return {cik:String(row.cik_str).padStart(10,'0'),name:String(row.title)};
  }
  return null;
}

function concept(facts:Facts,names:string[],units:string[]):FactRow[]{
  for(const n of names){
    const f=facts?.['us-gaap']?.[n];
    if(!f?.units)continue;
    for(const u of units){if(Array.isArray(f.units[u]))return f.units[u];}
    const first=Object.values(f.units)[0]; if(Array.isArray(first))return first as FactRow[];
  }
  return [];
}
const days=(a?:string,b?:string)=>a&&b?(new Date(b).getTime()-new Date(a).getTime())/86400000:0;
function annual(rows:FactRow[],offset=0){
  const xs=rows.filter(x=>x.form==='10-K'&&x.start&&x.end&&days(x.start,x.end)>250)
    .sort((a,b)=>String(b.end).localeCompare(String(a.end)));
  const unique=xs.filter((x,i)=>i===0||x.end!==xs[i-1].end);
  return unique[offset];
}
function quarter(rows:FactRow[],offset=0){
  const xs=rows.filter(x=>x.form==='10-Q'&&x.start&&x.end&&days(x.start,x.end)>=60&&days(x.start,x.end)<=120)
    .sort((a,b)=>String(b.end).localeCompare(String(a.end)));
  const unique=xs.filter((x,i)=>i===0||x.end!==xs[i-1].end);
  return unique[offset];
}
function instant(rows:FactRow[],forms=['10-K','10-Q'],offset=0){
  const xs=rows.filter(x=>forms.includes(String(x.form))&&x.end).sort((a,b)=>String(b.end).localeCompare(String(a.end)));
  const unique=xs.filter((x,i)=>i===0||x.end!==xs[i-1].end);
  return unique[offset];
}
const v=(x?:FactRow)=>x&&Number.isFinite(Number(x.val))?Number(x.val):undefined;
const growth=(a?:number,b?:number)=>a!=null&&b!=null&&b!==0?((a/b)-1)*100:undefined;

export async function secFundamentals(symbol:string,price?:number):Promise<{snapshot:FundamentalSnapshot;companyName?:string;cik?:string}>{
  const info=await secTickerInfo(symbol);
  if(!info)return {snapshot:{warnings:['SEC company facts were not available for this ticker.']}};
  const j:any=await json(`https://data.sec.gov/api/xbrl/companyfacts/CIK${info.cik}.json`);
  const facts=j.facts??{};

  const revenue=concept(facts,['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet'],['USD']);
  const gross=concept(facts,['GrossProfit'],['USD']);
  const opIncome=concept(facts,['OperatingIncomeLoss'],['USD']);
  const net=concept(facts,['NetIncomeLoss','ProfitLoss'],['USD']);
  const eps=concept(facts,['EarningsPerShareDiluted'],['USD/shares']);
  const assets=concept(facts,['Assets'],['USD']);
  const currentAssets=concept(facts,['AssetsCurrent'],['USD']);
  const currentLiab=concept(facts,['LiabilitiesCurrent'],['USD']);
  const equity=concept(facts,['StockholdersEquity','StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],['USD']);
  const cash=concept(facts,['CashAndCashEquivalentsAtCarryingValue','CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],['USD']);
  const debt=concept(facts,['LongTermDebtAndFinanceLeaseObligations','LongTermDebt','LongTermDebtNoncurrent'],['USD']);
  const ocf=concept(facts,['NetCashProvidedByUsedInOperatingActivities'],['USD']);
  const capex=concept(facts,['PaymentsToAcquirePropertyPlantAndEquipment'],['USD']);
  const sbc=concept(facts,['ShareBasedCompensation'],['USD']);
  const shares=concept(facts,['WeightedAverageNumberOfDilutedSharesOutstanding'],['shares']);

  const ay=(rows:FactRow[],i=0)=>v(annual(rows,i));
  const qy=(rows:FactRow[],i=0)=>v(quarter(rows,i));
  const iy=(rows:FactRow[],i=0)=>v(instant(rows,['10-K','10-Q'],i));

  const makeAnnual=(i:number):FinancialStatement=>{
    const rev=ay(revenue,i), oc=ay(ocf,i), cx=ay(capex,i);
    return {
      date:annual(revenue,i)?.end,period:'FY',revenue:rev,grossProfit:ay(gross,i),operatingIncome:ay(opIncome,i),netIncome:ay(net,i),eps:ay(eps,i),
      totalAssets:iy(assets,i),totalCurrentAssets:iy(currentAssets,i),cashAndCashEquivalents:iy(cash,i),totalDebt:iy(debt,i),totalCurrentLiabilities:iy(currentLiab,i),
      totalStockholdersEquity:iy(equity,i),operatingCashFlow:oc,capitalExpenditure:cx,freeCashFlow:oc!=null&&cx!=null?oc-cx:undefined,
      stockBasedCompensation:ay(sbc,i),weightedAverageShsOutDil:ay(shares,i)
    };
  };
  const makeQuarter=(i:number):FinancialStatement=>({
    date:quarter(revenue,i)?.end,period:'Q',revenue:qy(revenue,i),grossProfit:qy(gross,i),operatingIncome:qy(opIncome,i),netIncome:qy(net,i),eps:qy(eps,i),
    totalAssets:iy(assets,i),totalCurrentAssets:iy(currentAssets,i),cashAndCashEquivalents:iy(cash,i),totalDebt:iy(debt,i),totalCurrentLiabilities:iy(currentLiab,i),
    totalStockholdersEquity:iy(equity,i),freeCashFlow:undefined,weightedAverageShsOutDil:qy(shares,i)
  });

  const latestAnnual=makeAnnual(0), priorAnnual=makeAnnual(1), latestQuarter=makeQuarter(0), priorQuarter=makeQuarter(4);
  const rev=latestAnnual.revenue, ni=latestAnnual.netIncome, eq=latestAnnual.totalStockholdersEquity, sh=latestAnnual.weightedAverageShsOutDil;
  const marketCap=price!=null&&sh!=null?price*sh:undefined;
  const fcf=latestAnnual.freeCashFlow;
  const debtVal=latestAnnual.totalDebt??0, cashVal=latestAnnual.cashAndCashEquivalents??0;
  const ev=marketCap!=null?marketCap+debtVal-cashVal:undefined;
  const warnings:string[]=[];
  const sharesGrowth=growth(latestAnnual.weightedAverageShsOutDil,priorAnnual.weightedAverageShsOutDil);
  if(sharesGrowth!=null&&sharesGrowth>10)warnings.push(`Diluted share count increased about ${sharesGrowth.toFixed(1)}% year over year.`);
  if(fcf!=null&&fcf<0)warnings.push('Free cash flow is negative in the latest annual filing.');

  const snapshot:FundamentalSnapshot={
    priceToEarnings:price!=null&&latestAnnual.eps&&latestAnnual.eps>0?price/latestAnnual.eps:undefined,
    priceToSales:marketCap!=null&&rev?marketCap/rev:undefined,
    priceToBook:marketCap!=null&&eq?marketCap/eq:undefined,
    enterpriseValue:ev,
    evToSales:ev!=null&&rev?ev/rev:undefined,
    priceToFreeCashFlow:marketCap!=null&&fcf&&fcf>0?marketCap/fcf:undefined,
    currentRatio:latestAnnual.totalCurrentAssets!=null&&latestAnnual.totalCurrentLiabilities?latestAnnual.totalCurrentAssets/latestAnnual.totalCurrentLiabilities:undefined,
    debtToEquity:latestAnnual.totalDebt!=null&&eq?latestAnnual.totalDebt/eq:undefined,
    returnOnEquity:ni!=null&&eq?ni/eq*100:undefined,
    grossMargin:latestAnnual.grossProfit!=null&&rev?latestAnnual.grossProfit/rev*100:undefined,
    operatingMargin:latestAnnual.operatingIncome!=null&&rev?latestAnnual.operatingIncome/rev*100:undefined,
    netMargin:ni!=null&&rev?ni/rev*100:undefined,
    freeCashFlowMargin:fcf!=null&&rev?fcf/rev*100:undefined,
    revenueGrowth:growth(latestQuarter.revenue,priorQuarter.revenue)??growth(latestAnnual.revenue,priorAnnual.revenue),
    epsGrowth:growth(latestQuarter.eps,priorQuarter.eps)??growth(latestAnnual.eps,priorAnnual.eps),
    sharesGrowth,cash:latestAnnual.cashAndCashEquivalents,debt:latestAnnual.totalDebt,
    latestAnnual,priorAnnual,latestQuarter,priorQuarter,warnings
  };
  return {snapshot,companyName:info.name,cik:info.cik};
}
