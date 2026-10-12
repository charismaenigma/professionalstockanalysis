import type { FinancialStatement, FundamentalSnapshot } from './types';
import { matchedYearAgoQuarter, singleQuarterAt, trailingTwelveMonths, trailingFromFiscalYtd } from './secPeriods';

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
  // These are independent current/noncurrent securities balances. Never add a
  // second aggregate 'Investments' fact on top, which would double count.
  const shortInvestments=concept(facts,['ShortTermInvestments','MarketableSecuritiesCurrent','AvailableForSaleSecuritiesCurrent'],['USD']);
  const longInvestments=concept(facts,['LongTermInvestments','MarketableSecuritiesNoncurrent','AvailableForSaleSecuritiesNoncurrent'],['USD']);
  const incomeTax=concept(facts,['IncomeTaxExpenseBenefit'],['USD']);
  const pretax=concept(facts,['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest','IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments'],['USD']);
  const debtTotal=concept(facts,['LongTermDebtAndFinanceLeaseObligations','LongTermDebt'],['USD']);
  const debtCurrent=concept(facts,['LongTermDebtCurrent','LongTermDebtAndFinanceLeaseObligationsCurrent'],['USD']);
  const debtNoncurrent=concept(facts,['LongTermDebtNoncurrent','LongTermDebtAndFinanceLeaseObligationsNoncurrent'],['USD']);
  const shortBorrowings=concept(facts,['CommercialPaper','ShortTermBorrowings'],['USD']);
  const ocf=concept(facts,['NetCashProvidedByUsedInOperatingActivities'],['USD']);
  const capex=concept(facts,['PaymentsToAcquirePropertyPlantAndEquipment'],['USD']);
  const sbc=concept(facts,['ShareBasedCompensation'],['USD']);
  const shares=concept(facts,['WeightedAverageNumberOfDilutedSharesOutstanding'],['shares']);

  const ay=(rows:FactRow[],i=0)=>v(annual(rows,i));
  const qAt=(rows:FactRow[],endDate?:string)=>v(singleQuarterAt(rows,endDate));
  // Unlike "instant(rows, i)", this only compares balance-sheet values
  // from the SAME fiscal reporting date.
  const iAt=(rows:FactRow[],endDate?:string)=>{
    if(!endDate)return undefined;
    const matching=rows.filter(x=>(x.form==='10-Q'||x.form==='10-K')&&x.end===endDate&&!x.start)
      .sort((a,b)=>String(b.filed??'').localeCompare(String(a.filed??'')));
    return v(matching[0]);
  };

  const debtAt=(endDate?:string)=>{
    const current=iAt(debtCurrent,endDate),noncurrent=iAt(debtNoncurrent,endDate);
    // When both components are reported, they give the clearest debt
    // breakdown; never add an already aggregated LongTermDebt on top.
    const termDebt=current!=null&&noncurrent!=null
      ?current+noncurrent
      :iAt(debtTotal,endDate)??noncurrent??current;
    const paper=iAt(shortBorrowings,endDate);
    return termDebt!=null||paper!=null?(termDebt??0)+(paper??0):undefined;
  };
  const makeAnnual=(i:number):FinancialStatement=>{
    const endDate=annual(revenue,i)?.end;
    const rev=ay(revenue,i), oc=ay(ocf,i), cx=ay(capex,i);
    return {
      date:endDate,period:'FY',revenue:rev,marketableSecurities:(()=>{const a=iAt(shortInvestments,endDate),b=iAt(longInvestments,endDate);return a!=null||b!=null?(a??0)+(b??0):undefined})(),incomeTaxExpense:ay(incomeTax,i),pretaxIncome:ay(pretax,i),grossProfit:ay(gross,i),operatingIncome:ay(opIncome,i),netIncome:ay(net,i),eps:ay(eps,i),
      totalAssets:iAt(assets,endDate),totalCurrentAssets:iAt(currentAssets,endDate),cashAndCashEquivalents:iAt(cash,endDate),
      totalDebt:debtAt(endDate),totalCurrentLiabilities:iAt(currentLiab,endDate),
      totalStockholdersEquity:iAt(equity,endDate),operatingCashFlow:oc,capitalExpenditure:cx,
      freeCashFlow:oc!=null&&cx!=null?oc-cx:undefined,
      stockBasedCompensation:ay(sbc,i),weightedAverageShsOutDil:ay(shares,i)
    };
  };
  const makeQuarter=(endDate?:string):FinancialStatement=>({
    date:endDate,period:'Q',revenue:qAt(revenue,endDate),marketableSecurities:(()=>{const a=iAt(shortInvestments,endDate),b=iAt(longInvestments,endDate);return a!=null||b!=null?(a??0)+(b??0):undefined})(),grossProfit:qAt(gross,endDate),
    operatingIncome:qAt(opIncome,endDate),netIncome:qAt(net,endDate),eps:qAt(eps,endDate),
    totalAssets:iAt(assets,endDate),totalCurrentAssets:iAt(currentAssets,endDate),
    cashAndCashEquivalents:iAt(cash,endDate),totalDebt:iAt(debt,endDate),
    totalCurrentLiabilities:iAt(currentLiab,endDate),totalStockholdersEquity:iAt(equity,endDate),
    freeCashFlow:undefined,weightedAverageShsOutDil:qAt(shares,endDate)
  });
  const latestAnnual=makeAnnual(0), priorAnnual=makeAnnual(1);
  const latestQ=quarter(revenue,0);
  const sameQuarterLastYear=matchedYearAgoQuarter(revenue,latestQ);
  const latestQuarter=makeQuarter(latestQ?.end);
  const priorQuarter=makeQuarter(sameQuarterLastYear?.end);
  const mostRecentBalance=latestQuarter.date&&latestAnnual.date&&latestQuarter.date>latestAnnual.date
    ?latestQuarter:latestAnnual;
  const rev=latestAnnual.revenue, ni=latestAnnual.netIncome, eq=latestAnnual.totalStockholdersEquity;
  const sh=latestQuarter.weightedAverageShsOutDil??latestAnnual.weightedAverageShsOutDil;
  const marketCap=price!=null&&sh!=null?price*sh:undefined;
  const fcf=latestAnnual.freeCashFlow;
  const debtVal=mostRecentBalance.totalDebt??0, cashVal=mostRecentBalance.cashAndCashEquivalents??0;
  const ev=marketCap!=null?marketCap+debtVal-cashVal:undefined;
  const taxRate=latestAnnual.incomeTaxExpense!=null && latestAnnual.pretaxIncome!=null && latestAnnual.pretaxIncome>0
    ?Math.max(0,Math.min(.40,latestAnnual.incomeTaxExpense/latestAnnual.pretaxIncome)):.25;
  const annualDebt=latestAnnual.totalDebt,annualEquity=latestAnnual.totalStockholdersEquity;
  const annualOperatingCash=latestAnnual.cashAndCashEquivalents??0;
  // Treat excess cash as potentially non-operating; exclude only when invested
  // capital remains positive. ROIC is an estimate, not audited management ROIC.
  const grossInvested=annualDebt!=null&&annualEquity!=null?annualDebt+annualEquity:undefined;
  const investedCapital=grossInvested!=null&&grossInvested>0
    ?grossInvested-Math.min(annualOperatingCash,Math.max(0,grossInvested*.25)):undefined;
  const estimatedROIC=investedCapital!=null&&investedCapital>0&&latestAnnual.operatingIncome!=null
    ?latestAnnual.operatingIncome*(1-taxRate)/investedCapital*100:undefined;
  const ttmEps=trailingTwelveMonths(eps);
  const ttmRevenue=trailingFromFiscalYtd(revenue,latestQuarter.date,priorQuarter.date);
  const ttmOcf=trailingFromFiscalYtd(ocf,latestQuarter.date,priorQuarter.date);
  const ttmCapex=trailingFromFiscalYtd(capex,latestQuarter.date,priorQuarter.date);
  const ttmFcf=ttmOcf!=null&&ttmCapex!=null?ttmOcf-ttmCapex:undefined;
  const trailingSales=ttmRevenue??(latestQuarter.date&&latestAnnual.date&&latestQuarter.date>latestAnnual.date?undefined:rev);
  const trailingCashFlow=ttmFcf??(latestQuarter.date&&latestAnnual.date&&latestQuarter.date>latestAnnual.date?undefined:fcf);
  const warnings:string[]=[];
  const sharesGrowth=growth(latestAnnual.weightedAverageShsOutDil,priorAnnual.weightedAverageShsOutDil);
  if(sharesGrowth!=null&&sharesGrowth>10)warnings.push(`Diluted share count increased about ${sharesGrowth.toFixed(1)}% year over year.`);
  if(fcf!=null&&fcf<0)warnings.push('Free cash flow is negative in the latest annual filing.');
  if(price!=null&&ttmEps==null)warnings.push('Trailing-twelve-month earnings per share could not be reliably reconstructed from SEC filings; P/E is not available.');
  if(price!=null&&trailingSales==null)warnings.push('Trailing-twelve-month revenue could not be aligned across filings; sales-based valuation ratios are withheld.');
  if(price!=null&&trailingCashFlow==null)warnings.push('Trailing-twelve-month free cash flow could not be aligned across filings; cash-flow valuation is withheld.');

  const snapshot:FundamentalSnapshot={
    priceToEarnings:price!=null&&ttmEps!=null&&ttmEps>0?price/ttmEps:undefined,
    priceToSales:marketCap!=null&&trailingSales?marketCap/trailingSales:undefined,
    priceToBook:marketCap!=null&&eq?marketCap/eq:undefined,
    enterpriseValue:ev,
    evToSales:ev!=null&&trailingSales?ev/trailingSales:undefined,
    priceToFreeCashFlow:marketCap!=null&&trailingCashFlow&&trailingCashFlow>0?marketCap/trailingCashFlow:undefined,
    currentRatio:mostRecentBalance.totalCurrentAssets!=null&&mostRecentBalance.totalCurrentLiabilities?mostRecentBalance.totalCurrentAssets/mostRecentBalance.totalCurrentLiabilities:undefined,
    debtToEquity:mostRecentBalance.totalDebt!=null&&mostRecentBalance.totalStockholdersEquity?mostRecentBalance.totalDebt/mostRecentBalance.totalStockholdersEquity:undefined,
    returnOnEquity:ni!=null&&eq?ni/eq*100:undefined,
    returnOnInvestedCapital:estimatedROIC,
    grossMargin:latestAnnual.grossProfit!=null&&rev?latestAnnual.grossProfit/rev*100:undefined,
    operatingMargin:latestAnnual.operatingIncome!=null&&rev?latestAnnual.operatingIncome/rev*100:undefined,
    netMargin:ni!=null&&rev?ni/rev*100:undefined,
    freeCashFlowMargin:fcf!=null&&rev?fcf/rev*100:undefined,
    revenueGrowth:growth(latestQuarter.revenue,priorQuarter.revenue)??growth(latestAnnual.revenue,priorAnnual.revenue),
    epsGrowth:growth(latestQuarter.eps,priorQuarter.eps)??growth(latestAnnual.eps,priorAnnual.eps),
    sharesGrowth,cash:mostRecentBalance.cashAndCashEquivalents,marketableSecurities:mostRecentBalance.marketableSecurities,debt:mostRecentBalance.totalDebt,
    latestAnnual,priorAnnual,latestQuarter,priorQuarter,warnings
  };
  return {snapshot,companyName:info.name,cik:info.cik};
}
