import type {PaperAccount,PaperPosition,PaperOrder} from './alpaca';
/** The 95% VOO sleeve is a reservation only: the bot never buys VOO.
 * Existing VOO holdings are treated as core; all other positions and pending buy
 * orders use up the 5% active trading sleeve, including manual holdings.
 */
export const PAPER_TRADING_PCT = 5;
export const PAPER_TRADE_RISK_PCT_OF_SLEEVE = .25;
export function positionSlots():2|3 {return process.env.PAPER_POSITION_SLOTS==='2'?2:3;}
export type PaperRiskBudget={
 tradingSleeveValue:number;slotMaxValue:number;remainingSleeveValue:number;
 usedSleeveValue:number;usedPctOfSleeve:number;availableSlots:number;
 reservedCoreValue:number;slotCount:2|3;riskBudgetPerTrade:number;
 activeSymbols:string[];coreSymbol:'VOO';
};
const nonnegative=(raw:unknown,label:string)=>{
 const n=Number(raw);if(!Number.isFinite(n)||n<0)throw new Error('Cannot verify '+label+' safely.');
 return n;
};
export function calculatePaperBudget(
 account:Pick<PaperAccount,'equity'|'cash'>,
 positions:PaperPosition[],
 openOrders:PaperOrder[],
 slots:2|3=3
):PaperRiskBudget{
 const equity=nonnegative(account.equity,'paper equity'),cash=nonnegative(account.cash,'available paper cash');
 if(equity<=0)throw new Error('Paper account equity is zero.');
 if(slots!==2&&slots!==3)throw new Error('Only 2 or 3 trading slots are supported.');
 const sleeve=equity*.05;
 let used=0;
 const active=new Set<string>();
 for(const p of positions){
  if(p.symbol==='VOO')continue;
  if(p.market_value==null||p.qty==null)throw new Error('Missing paper position exposure for '+p.symbol+'.');
  const qty=Number(p.qty),marketValue=Number(p.market_value);
  if(!Number.isFinite(qty)||qty<0||!Number.isFinite(marketValue)||marketValue<0)throw new Error('Cannot verify long-only paper position exposure for '+p.symbol+'.');
  if(qty<=0)continue;
  used+=marketValue;active.add(p.symbol);
 }
 for(const o of openOrders){
  if(o.side!=='buy'||o.symbol==='VOO')continue;
  const qty=nonnegative(o.qty,'open buy order size for '+o.symbol);
  const filled=nonnegative(o.filled_qty??'0','open buy filled quantity for '+o.symbol);
  if(filled>qty)throw new Error('Open buy filled quantity exceeds order quantity.');
  const remaining=qty-filled;
  if(!remaining)continue;
  // This bot uses limit entries. Unknown-priced open market buys block new orders.
  if(o.limit_price==null)throw new Error('Cannot determine pending buy order exposure for '+o.symbol+'.');
  const limit=nonnegative(o.limit_price,'pending buy limit for '+o.symbol);
  if(limit<=0)throw new Error('Pending buy limit must be positive.');
  used+=remaining*limit;
  active.add(o.symbol);
 }
 const remaining=Math.max(0,sleeve-used);
 return {
  tradingSleeveValue:Math.round(sleeve*100)/100,
  reservedCoreValue:Math.round(equity*.95*100)/100,
  usedSleeveValue:Math.round(used*100)/100,
  usedPctOfSleeve:used/sleeve*100,
  remainingSleeveValue:Math.round(Math.min(remaining,cash)*100)/100,
  slotMaxValue:Math.round(sleeve/slots*100)/100,
  slotCount:slots,
  riskBudgetPerTrade:Math.round(sleeve*PAPER_TRADE_RISK_PCT_OF_SLEEVE/100*100)/100,
  availableSlots:Math.max(0,slots-active.size),
  activeSymbols:[...active].sort(),coreSymbol:'VOO'
 };
}
