import {describe,expect,it} from 'vitest';
import {PERIODS,STRATEGIES,validateSelection} from './backtest/config';
import {completedBars,hourlyFromHalfHours,windowStart,type Candle} from './backtest/history';
import {simulate} from './backtest/engine';

function bar(time:string,price=100):{t:string;o:number;h:number;l:number;c:number;v:number;vw:number}{
  return {t:time,o:price,h:price+1,l:price-1,c:price,v:1000,vw:price};
}
function dailyBars(length:number):Candle[]{
  const first=new Date('2026-01-01T14:30:00Z');
  return Array.from({length},(_,i)=>{
    const now=new Date(first.getTime()+i*86400000),price=100+i*.01;
    return {timestamp:now.toISOString(),day:now.toISOString().slice(0,10),open:price,high:price+0.5,
      low:price-0.5,close:price,volume:1000};
  });
}
describe('historical research configuration',()=>{
  it('provides nine supported periods and ten distinct technical strategies',()=>{
    expect(PERIODS).toHaveLength(9);
    expect(STRATEGIES).toHaveLength(10);
    expect(new Set(STRATEGIES.map(s=>s.id)).size).toBe(10);
  });
  it('supports all short-term bar intervals and rejects overly dense long-term selections',()=>{
    for(const p of ['1d','1w','3w'])for(const frame of ['5Min','15Min','30Min','1Hour'])
      expect(validateSelection(p,frame).id).toBe(p);
    expect(()=>validateSelection('5y','5Min')).toThrow(/supported/);
    expect(()=>validateSelection('unknown','1Day')).toThrow(/supported/);
  });
});
describe('historical candle integrity',()=>{
  it('does not expose unfinished current-day sessions, including during market hours',()=>{
    const raw=[bar('2026-10-26T14:30:00Z'),bar('2026-10-27T14:30:00Z')];
    const during=new Date('2026-10-27T16:00:00Z'); // 12:00 ET
    const settled=new Date('2026-10-27T20:12:00Z'); // 16:12 ET
    expect(completedBars(raw,'5Min',during)).toHaveLength(1);
    expect(completedBars(raw,'5Min',settled)).toHaveLength(2);
  });
  it('excludes premarket and after-hours bars',()=>{
    const raw=[bar('2026-10-26T12:00:00Z'),bar('2026-10-26T13:30:00Z'),bar('2026-10-26T20:15:00Z')];
    const processed=completedBars(raw,'30Min',new Date('2026-10-27T23:00:00Z'));
    expect(processed).toHaveLength(1);
    expect(processed[0].timestamp).toBe('2026-10-26T13:30:00Z');
  });
  it('excludes unfinished weekly candles without accidentally shifting Monday to Sunday',()=>{
    const raw=[bar('2026-10-19T00:00:00Z'),bar('2026-10-26T00:00:00Z')];
    const processed=completedBars(raw,'1Week',new Date('2026-10-27T22:00:00Z'));
    expect(processed).toHaveLength(1);
    expect(processed[0].day).toBe('2026-10-19');
  });
  it('constructs 9:30 ET anchored hourly bars from regular-session halves',()=>{
    const halfHours=completedBars([
      bar('2026-10-26T13:30:00Z',100),
      bar('2026-10-26T14:00:00Z',102),
      bar('2026-10-26T14:30:00Z',105),
    ],'30Min',new Date('2026-10-27T23:00:00Z'));
    const hourly=hourlyFromHalfHours(halfHours);
    expect(hourly).toHaveLength(2);
    expect(hourly[0]).toMatchObject({open:100,high:103,low:99,close:102,volume:2000});
    expect(hourly[1].open).toBe(105);
  });
  it('selects exactly the requested number of completed sessions with warmup',()=>{
    const candles=dailyBars(80);
    expect(windowStart(candles,'1w','15Min')).toBe(75);
    expect(windowStart(candles,'3w','30Min')).toBe(65);
  });
});
describe('long-only replay safety',()=>{
  it('marks intraday-only strategies as incompatible with daily data',()=>{
    const result=simulate('opening_range',dailyBars(100),45,'1Day');
    expect(result.status).toBe('incompatible');
    expect(result.trades).toBe(0);
  });
  it('cannot fill a signal at its own closing price and never invests beyond 5% of equity',()=>{
    const bars=dailyBars(81);
    const last=bars[bars.length-1];
    bars[bars.length-1]={...last,open:100,high:101,low:59,close:60,volume:3000};
    const previous=simulate('mean_reversion',bars,60,'1Day');
    expect(previous.trades).toBe(0);
    const next:Candle={timestamp:'2026-04-30T14:30:00Z',day:'2026-04-30',open:61,high:63,low:60,close:62,volume:3000};
    const tested=simulate('mean_reversion',[...bars,next],60,'1Day');
    expect(tested.trades).toBe(1);
    expect(tested.recentTrades[0].entry).toBe(next.timestamp);
    expect(tested.recentTrades[0].qty*tested.recentTrades[0].entryPrice).toBeLessThanOrEqual(5001);
  });
  it('returns an honest zero-trade result and zero profit for a flat opportunity set',()=>{
    const bars=dailyBars(100).map(b=>({...b,volume:0}));
    const result=simulate('momentum_breakout',bars,55,'1Day');
    expect(result.trades).toBe(0);
    expect(result.returnPct).toBe(0);
    expect(result.winRate).toBeNull();
  });
});
