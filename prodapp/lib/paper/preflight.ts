import {paperGet,dataGet,paperConfigured,liveResearchConfigured,paperOrdersEnabled,autoScanEnabled,readPaperWatchlist,type PaperAccount,type PaperPosition,type PaperOrder,type PaperSnapshot} from './alpaca';
import {calculatePaperBudget,positionSlots,type PaperRiskBudget} from './risk';

export type ReadinessCheck={id:string;status:'pass'|'warning'|'block';detail:string};
export type PreflightReport={
 asOf:string;readOnly:true;marketOpen:boolean;manualPaperOrdersEnabled:boolean;automaticPaperOrdersEnabled:boolean;
 watchlist:string[];budget:PaperRiskBudget|null;coreVooValue:number;accountEquity:number|null;
 checkCount:{pass:number;warning:number;block:number};checks:ReadinessCheck[];
 readyForPreview:boolean;readyForManualPaperOrder:boolean;
};
export function summarizeReadiness(checks:ReadinessCheck[],marketOpen:boolean,ordersEnabled:boolean){
 return {pass:checks.filter(x=>x.status==='pass').length,
 warning:checks.filter(x=>x.status==='warning').length,
 block:checks.filter(x=>x.status==='block').length,
 readyForPreview:checks.every(x=>x.status!=='block'),
 readyForManualPaperOrder:marketOpen&&ordersEnabled&&checks.every(x=>x.status==='pass')
 };
}
/** Read-only PRE-FLIGHT: no calls to /v2/orders POST, PUT or DELETE. */
export async function runPaperPreflight():Promise<PreflightReport>{
 const checks:ReadinessCheck[]=[];
 const add=(id:string,status:ReadinessCheck['status'],detail:string)=>checks.push({id,status,detail});
 const report:PreflightReport={
  asOf:new Date().toISOString(),readOnly:true,marketOpen:false,manualPaperOrdersEnabled:paperOrdersEnabled(),
  automaticPaperOrdersEnabled:autoScanEnabled(),watchlist:[],budget:null,coreVooValue:0,accountEquity:null,
  checks,checkCount:{pass:0,warning:0,block:0},readyForPreview:false,readyForManualPaperOrder:false
 };
 if(!paperConfigured()) {add('broker','block','Alpaca PAPER credentials are missing from this environment.');return finalize(report);}
 if(!liveResearchConfigured())add('research','block','Massive live research feed not configured; never use demo data for entries.');
 else add('research','pass','Market research feed is configured (not a guarantee of real-time coverage).');
 const [acct,clock,positions,orders,watchlist]=await Promise.all([
  paperGet<PaperAccount>('/v2/account'),
  paperGet<{is_open:boolean}>('/v2/clock'),
  paperGet<PaperPosition[]>('/v2/positions'),
  paperGet<PaperOrder[]>('/v2/orders?status=open&limit=500'),
  readPaperWatchlist()
 ]);
 report.marketOpen=clock.is_open;report.watchlist=watchlist.symbols.slice(0,5);
 const equity=Number(acct.equity);report.accountEquity=Number.isFinite(equity)?Math.round(equity*100)/100:null;
 add('broker',acct.status==='ACTIVE'&&!acct.trading_blocked?'pass':'block',
  acct.status==='ACTIVE'&&!acct.trading_blocked?'Alpaca PAPER account is active and trading is not blocked.':'Paper account not active or trading blocked.');
 add('market',clock.is_open?'pass':'warning',clock.is_open?'Regular market session is open.':'Market is closed; live entry assessment cannot be completed now.');
 const cash=Number(acct.cash),last=Number(acct.last_equity);
 add('capital',Number.isFinite(equity)&&equity>0&&Number.isFinite(cash)&&cash>0?'pass':'block',
  Number.isFinite(equity)&&equity>0&&Number.isFinite(cash)&&cash>0?'Paper equity and cash are positive.':'Paper equity or cash is invalid/nonpositive.');
 add('daily-loss',last>0&&equity<last*.99?'block':'pass',
   last>0&&equity<last*.99?'Current paper equity exceeds the 1% account-wide loss gate.':'Account-wide 1% daily loss gate has not tripped based on available equity.');
 const core=positions.filter(p=>p.symbol==='VOO').reduce((n,p)=>n+Math.max(0,Number(p.market_value)||0),0);
 report.coreVooValue=Math.round(core*100)/100;
 add('voo-core',core>0?'pass':'warning',core>0?'An existing VOO paper position was found.':'No VOO paper holding. The 95% core is reserved conceptually but is not invested automatically.');
 try{
  const budget=calculatePaperBudget(acct,positions,orders,positionSlots());
  report.budget=budget;
  const good=budget.remainingSleeveValue>0&&budget.availableSlots>0;
  add('sleeve',good?'pass':'block',good?
    '5% combined active sleeve has capacity for '+budget.availableSlots+' more positions; available $'+budget.remainingSleeveValue.toFixed(2)+'.':
    'Active trading allocation is exhausted or all '+budget.slotCount+' slots are occupied.');
 }catch(e){add('sleeve','block',e instanceof Error?e.message:'Unable to verify paper sleeve exposure.');}
 add('watchlist',report.watchlist.length?'pass':'warning',
  report.watchlist.length?report.watchlist.length+' symbol(s) on Alpaca paper watchlist.':'Paper watchlist is empty; choose stocks explicitly before preview scanning.');
 // A quote read from AAPL is connectivity-only, never a selection or order.
 const sample=report.watchlist[0]||'AAPL';
 try{
  const snapshot=await dataGet<PaperSnapshot>('/v2/stocks/'+encodeURIComponent(sample)+'/snapshot?feed=iex');
  const quote=snapshot.latestQuote,trade=snapshot.latestTrade;
  const qTime=Date.parse(quote?.t||''),tTime=Date.parse(trade?.t||'');
  const valid=Number.isFinite(qTime)&&Number.isFinite(tTime)&&Number(quote?.ap)>0&&Number(quote?.bp)>0&&Number(trade?.p)>0;
  const age=valid?Math.max(Date.now()-qTime,Date.now()-tTime):Infinity;
  const fresh=valid&&age>=-60000&&age<=300000;
  const status:ReadinessCheck['status']=!valid?'block':fresh?'pass':'warning';
  add('iex-feed',status,!valid?'IEX snapshot is unavailable or lacks a two-sided quote and trade.':
   fresh?'Alpaca IEX quote/trade snapshot is currently fresh (sample '+sample+').':
   'IEX quote/trade snapshot exists but is stale ('+sample+'); this is expected after market close. Freshness must be rechecked during market hours.');
 }catch(e){add('iex-feed','block','Alpaca IEX snapshot lookup failed: '+(e instanceof Error?e.message.slice(0,100):'unknown provider error'));}
 add('manual-switch',paperOrdersEnabled()?'pass':'warning',
   paperOrdersEnabled()?'Manual PAPER order submissions are enabled.':'Manual PAPER orders remain disabled until separately approved.');
 add('automatic-switch',!autoScanEnabled()?'pass':'warning',
   !autoScanEnabled()?'Unattended PAPER order submission is OFF.':'Unattended PAPER order flag is ON: requires separate operational review.');
 return finalize(report);
}
function finalize(report:PreflightReport):PreflightReport {
 const x=summarizeReadiness(report.checks,report.marketOpen,report.manualPaperOrdersEnabled);
 report.checkCount={pass:x.pass,warning:x.warning,block:x.block};
 report.readyForPreview=report.marketOpen&&report.checks
  .filter(c=>!['voo-core','manual-switch','automatic-switch'].includes(c.id))
  .every(c=>c.status==='pass');
 report.readyForManualPaperOrder=report.readyForPreview&&report.manualPaperOrdersEnabled&&!report.automaticPaperOrdersEnabled;
 return report;
}
