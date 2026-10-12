import type { OptionContract } from '../types';
const BASE='https://api.massive.com';
export async function massiveOptions(symbol:string):Promise<OptionContract[]>{
  const apiKey=process.env.MASSIVE_API_KEY; if(!apiKey)return [];
  const url=new URL(`${BASE}/v3/snapshot/options/${encodeURIComponent(symbol)}`); url.searchParams.set('limit','250'); url.searchParams.set('apiKey',apiKey);
  const r=await fetch(url,{next:{revalidate:60}}); if(!r.ok)throw new Error(`Massive options failed (${r.status})`); const j:any=await r.json();
  return (j.results??[]).map((x:any)=>({
    ticker:x.details?.ticker??'', type:(x.details?.contract_type==='put'?'put':'call') as 'call'|'put', strike:Number(x.details?.strike_price??0), expiration:String(x.details?.expiration_date??''),
    bid:x.last_quote?.bid==null?undefined:Number(x.last_quote.bid),ask:x.last_quote?.ask==null?undefined:Number(x.last_quote.ask),last:x.last_trade?.price==null?(x.day?.close==null?undefined:Number(x.day.close)):Number(x.last_trade.price),
    volume:x.day?.volume==null?undefined:Number(x.day.volume),openInterest:x.open_interest==null?undefined:Number(x.open_interest),impliedVolatility:x.implied_volatility==null?undefined:Number(x.implied_volatility),
    delta:x.greeks?.delta,gamma:x.greeks?.gamma,theta:x.greeks?.theta,vega:x.greeks?.vega,breakEven:x.break_even_price
  })).filter((x:OptionContract)=>x.ticker&&x.strike>0).sort((a:OptionContract,b:OptionContract)=>a.expiration.localeCompare(b.expiration)||a.strike-b.strike);
}
