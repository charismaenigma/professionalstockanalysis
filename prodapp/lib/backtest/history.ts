import {dataGet} from '../paper/alpaca';
import {intraday, type IntervalId, type PeriodId, validateSelection} from './config';

export interface Candle {
  timestamp:string;
  day:string;
  open:number;high:number;low:number;close:number;volume:number;
  vwap?:number;
}

const timezone = new Intl.DateTimeFormat('en-US',{
  timeZone:'America/New_York', year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short',
});
function marketTime(time:string|number|Date) {
  const parts=Object.fromEntries(timezone.formatToParts(new Date(time)).map(p=>[p.type,p.value]));
  return {day:`${parts.year}-${parts.month}-${parts.day}`, minute:Number(parts.hour)*60+Number(parts.minute),weekday:parts.weekday};
}
function weekKey(date:string) {
  const d=new Date(date+'T12:00:00Z');
  const shift=(d.getUTCDay()+6)%7;
  d.setUTCDate(d.getUTCDate()-shift);
  return d.toISOString().slice(0,10);
}
type ApiBar={t:string;o:number;h:number;l:number;c:number;v:number;vw?:number};
type BarsResponse={bars?:ApiBar[];next_page_token?:string|null};

/** Selects only *completed* regular-market candles; never backtests partial sessions. */
export function completedBars(raw:ApiBar[], interval:IntervalId, now=new Date()):Candle[] {
  const current=marketTime(now);
  const currentWeek=weekKey(current.day);
  const dayComplete=current.minute>=16*60+10;
  const weekComplete=(current.weekday==='Fri'&&dayComplete)||current.weekday==='Sat'||current.weekday==='Sun';
  return raw.flatMap(b=>{
    if(!Number.isFinite(b.o)||!Number.isFinite(b.h)||!Number.isFinite(b.l)||!Number.isFinite(b.c)||
      !Number.isFinite(b.v)||b.o<=0||b.h<=0||b.l<=0||b.c<=0||b.v<0||b.h<b.l)return [];
    // Alpaca's weekly timestamp represents the week's first UTC trading day.
    // Converting that midnight timestamp to New York time can incorrectly put
    // it on the prior Sunday and make an unfinished week appear completed.
    const local=interval==='1Week'
      ?{day:new Date(b.t).toISOString().slice(0,10),minute:0,weekday:''}
      :marketTime(b.t);
    if(intraday(interval)&&(local.minute<570||local.minute>=960))return [];
    if(interval==='1Week'&&weekKey(local.day)===currentWeek&&!weekComplete)return [];
    if(interval!=='1Week'&&local.day===current.day&&!dayComplete)return [];
    return [{timestamp:b.t,day:local.day,open:b.o,high:b.h,low:b.l,close:b.c,volume:b.v,vwap:b.vw}];
  }).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
}

/** Build true 9:30–16:00 ET hourly candles from 30-minute regular-session data.
 * An Alpaca 1Hour bar may cross the 9:30 opening boundary, mixing premarket
 * volume with RTH. Bucketing 30-minute bars avoids that distortion. */
export function hourlyFromHalfHours(halfHours:Candle[]):Candle[]{
  const grouped=new Map<string,Candle[]>();
  for(const b of halfHours){
    const minute=marketTime(b.timestamp).minute;
    if(minute<570||minute>=960)continue;
    const bucket=Math.floor((minute-570)/60);
    const key=`${b.day}:${bucket}`;
    const found=grouped.get(key)||[];
    found.push(b);grouped.set(key,found);
  }
  return [...grouped.values()].map(group=>{
    const first=group[0],last=group.at(-1)!;
    const volume=group.reduce((acc,b)=>acc+b.volume,0);
    const weighted=group.reduce((acc,b)=>acc+(b.vwap??(b.high+b.low+b.close)/3)*b.volume,0);
    return {timestamp:first.timestamp,day:first.day,open:first.open,high:Math.max(...group.map(b=>b.high)),
      low:Math.min(...group.map(b=>b.low)),close:last.close,volume,vwap:volume?weighted/volume:undefined};
  }).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
}

export function windowStart(bars:Candle[], period:PeriodId, interval:IntervalId):number {
  const p=validateSelection(period,interval);
  if(!bars.length)return 0;
  if(interval==='1Week')return Math.max(0,bars.length-Math.ceil(p.sessions/5));
  const days=[...new Set(bars.map(b=>b.day))];
  const selected=days[Math.max(0,days.length-p.sessions)];
  const index=bars.findIndex(b=>b.day===selected);
  return Math.max(0,index);
}

export async function fetchHistoricalBars(symbol:string,period:PeriodId,interval:IntervalId,now=new Date()) {
  const p=validateSelection(period,interval);
  if(!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol))throw new Error('Invalid stock ticker.');
  // The extra history is for indicator warmup, never included in reported results.
  const warmup:Record<IntervalId,number>={
    '5Min':20,'15Min':42,'30Min':70,'1Hour':125,'1Day':340,'1Week':650,
  };
  const start=new Date(now.getTime()-(p.days+warmup[interval])*86400000).toISOString();
  const end=now.toISOString();
  const result:ApiBar[]=[];
  let pageToken:string|undefined;
  for(let page=0;page<5;page++){
    const params=new URLSearchParams({timeframe:interval==='1Hour'?'30Min':interval,start,end,feed:'iex',adjustment:'split',limit:'10000'});
    if(pageToken)params.set('page_token',pageToken);
    const batch=await dataGet<BarsResponse>(`/v2/stocks/${encodeURIComponent(symbol)}/bars?${params}`);
    if(!Array.isArray(batch.bars))throw new Error('The historical data provider returned an invalid response.');
    result.push(...batch.bars);
    pageToken=batch.next_page_token||undefined;
    if(!pageToken)break;
    if(page===4)throw new Error('Historical data exceeded the safe page limit; choose a larger candle interval.');
  }
  const cleaned=completedBars(result,interval==='1Hour'?'30Min':interval,now);
  const bars=interval==='1Hour'?hourlyFromHalfHours(cleaned):cleaned;
  if(!bars.length)throw new Error('No completed regular-session historical bars are available for '+symbol+'.');
  const startIndex=windowStart(bars,period,interval);
  return {bars,startIndex,source:'Alpaca historical IEX (single exchange; split-adjusted)' as const,
    first:bars[startIndex]?.day,last:bars[bars.length-1]?.day};
}
