'use client';

import {useEffect,useState} from 'react';
import {periods,strategies,intervalAllowed,recommended,type Period,type Interval,type Strategy} from '@/lib/backtest';

type Trade={entered:string;exited:string;entry:number;exit:number;profit:number;reason:string;shares:number;entryCost:number;exitProceeds:number;returnPct:number;stop:number;target:number};
type Result={
 strategy:string;symbol:string;period:string;interval:string;bars:number;firstBar:string;lastBar:string;portfolio:number;corePercent:number;coreLabel:string;tradingPercent:number;slots:2|3;tradingSleeveInitial:number;tradingSleeveReturnPct:number;averageTradeReturnPct:number|null;bestTradeReturnPct:number|null;worstTradeReturnPct:number|null;realizedPnl:number;
 source:string;dataCoverage:string;returnPct:number;holdPct:number;closedTrades:number;winRate:number|null;
 profitFactor:number|null;maxDrawdownPct:number;timeInMarketPct:number;trades:Trade[];assumptions:string;
 curve:{time:number;equity:number}[];
 openPosition:boolean;openTrade:{entered:string;entry:number;stop:number;target:number;shares:number;lastPrice:number;unrealizedPnl:number;unrealizedReturnPct:number}|null;
};
type ScanResult={symbol:string;score:number|null;status:string;reason:string};
const names:Record<Period,string>={
 '1d':'Most recent trading day','1w':'1 week','3w':'3 weeks','1m':'1 month',
 '3m':'3 months','6m':'6 months','1y':'1 year','3y':'3 years','5y':'5 years'
};
const intervalNames:Record<Interval,string>={
 '5m':'5 minutes','15m':'15 minutes','30m':'30 minutes','1h':'Hourly','1d':'Daily','1w':'Weekly'
};
const number=(n:number)=>Number.isFinite(n)?n.toFixed(2):'—';
const fmtMarketTime=(iso:string, interval:string)=>{
 const daily=interval==='1d'||interval==='1w';
 return new Date(iso).toLocaleString('en-US',{timeZone:daily?'UTC':'America/New_York',
  year:'numeric',month:'short',day:'numeric',...(daily?{}:{hour:'numeric',minute:'2-digit'})});
};

export default function BacktestDesk(){
 const [token,setToken]=useState('');
 const [symbol,setSymbol]=useState('');
 const [watchlist,setWatchlist]=useState('');
 const [period,setPeriod]=useState<Period>('1m');
 const [interval,setInterval]=useState<Interval>('1h');
 const [strategy,setStrategy]=useState<Strategy>('Conservative Swing');
 const [risk,setRisk]=useState(.25);
 const [portfolio,setPortfolio]=useState(100000);
 const [slots,setSlots]=useState<2|3>(3);
 const [scanResult,setScanResult]=useState<ScanResult[]|null>(null);
 const [result,setResult]=useState<Result|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState<'test'|'scan'|null>(null);
 const [retryUntil,setRetryUntil]=useState(0);
 const [now,setNow]=useState(0);
 useEffect(()=>{if(!retryUntil)return;setNow(Date.now());const handle=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(handle);},[retryUntil]);
 const remaining=Math.max(0,Math.ceil((retryUntil-now)/1000));
 const onCooldown=retryUntil>0&&remaining>0;
 const supported=intervalAllowed[period];
 const disabledRotation=strategy==='Relative Strength Rotation';
 const validSymbol=/^[A-Z][A-Z0-9.]{0,8}$/.test(symbol.trim());

 async function run(){
   if(busy||onCooldown)return;
   setBusy('test');setError('');setResult(null);
   try{
     const params=new URLSearchParams({symbol:symbol.trim(),period,interval,strategy,risk:String(risk),portfolio:String(portfolio),slots:String(slots)});
     const response=await fetch('/api/backtest?'+params,{cache:'no-store',headers:{'x-marketclarity-token':token}});
     const data=await response.json();
     if(response.status===429){
       const header=Number(response.headers.get('retry-after'));
       const seconds=Number.isFinite(header)&&header>0?header:Number(data.retryAfterSeconds)||65;
       setRetryUntil(Date.now()+Math.max(5,Math.min(300,seconds))*1000);
     }
     if(!response.ok)throw Error(data.error||'Historical test could not be completed.');
     setResult(data as Result);
   }catch(e){setError(e instanceof Error?e.message:'Historical test failed.');}
   finally{setBusy(null);}
 }

 async function scanWatchlist(){
   if(busy||onCooldown)return;
   setBusy('scan');setError('');setScanResult(null);
   try{
     const response=await fetch('/api/backtest/scan'+(watchlist.trim()?'?symbols='+encodeURIComponent(watchlist):''),{headers:{'x-marketclarity-token':token},cache:'no-store'});
     const data=await response.json();
     if(!response.ok)throw Error(data.error||'Could not scan watchlist.');
     setScanResult(data.results as ScanResult[]);
   }catch(e){setError(e instanceof Error?e.message:'Watchlist scan failed.');}
   finally{setBusy(null);}
 }
 return <main className="shell backtestLab">
  <header className="top">
   <div><div className="brand">MarketClarity</div><div className="tag">Strategy Lab · Historical research</div></div>
   <a className="radarHome" href="/paper">← Back to Paper Trading</a>
  </header>
  <section className="panel">
   <div className="backtestIntro">
    <div><span className="eyebrow">Anytime Strategy Lab · v0.4 Preview</span>
     <h1>Study the market. On your schedule.</h1>
     <p>Test historical setups, compare strategies and review your watchlist using completed market data—even after the closing bell. Historical tests never place broker orders.</p>
    </div>
    <span className="backtestBadge">HISTORICAL ONLY</span>
   </div>
   <div className="backtestPrivacy">
    <div>
     <label htmlFor="backtestToken">Private dashboard access</label>
     <div className="backtestPrivacyInput">
      <input className="btInput" id="backtestToken" type="password" autoComplete="off"
       placeholder="Your control token" value={token} onChange={e=>setToken(e.target.value)}/>
     </div>
     <p>Use the control token configured for this deployment. Preview credentials are separate from Production.</p>
    </div>
    <span className="backtestBadge">Protected research</span>
   </div>
   <div className="backtestControls">
    <div className="backtestControl">
     <label htmlFor="backtestTicker">Ticker symbol</label>
     <input className="btInput" id="backtestTicker" placeholder="e.g. SOFI" maxLength={9} autoCapitalize="characters"
      value={symbol} onChange={e=>setSymbol(e.target.value.toUpperCase())}/>
     <p className="backtestControlHint">Choose a stock to test. No default recommendation.</p>
    </div>
    <div className="backtestControl">
     <label htmlFor="backtestStrategy">Trading strategy</label>
     <select className="btSelect" id="backtestStrategy" value={strategy} onChange={e=>setStrategy(e.target.value as Strategy)}>
      {strategies.map(s=><option key={s} value={s}>{s}</option>)}
     </select>
     <p className="backtestControlHint">Ten strategy families; rotation is not yet supported.</p>
    </div>
    <div className="backtestControl">
     <label htmlFor="backtestPeriod">Historical period</label>
     <select className="btSelect" id="backtestPeriod" value={period}
      onChange={e=>{const next=e.target.value as Period;setPeriod(next);setInterval(recommended[next]);}}>
      {periods.map(p=><option key={p} value={p}>{names[p]}</option>)}
     </select>
     <p className="backtestControlHint">Periods are constrained by your data subscription.</p>
    </div>
    <div className="backtestControl">
     <label htmlFor="backtestInterval">Candle interval</label>
     <select className="btSelect" id="backtestInterval" value={interval}
      onChange={e=>setInterval(e.target.value as Interval)}>
      {supported.map(i=><option key={i} value={i}>{intervalNames[i]}{i===recommended[period]?' (recommended)':''}</option>)}
     </select>
     <p className="backtestControlHint">Auto-recommended when you change the historical period.</p>
    </div>
    <div className="backtestControl">
     <label htmlFor="btPortfolio">Hypothetical total portfolio (USD)</label>
     <input className="btInput" id="btPortfolio" type="number" min={1000} max={10000000} step={1000} value={portfolio} onChange={e=>setPortfolio(Number(e.target.value))}/>
     <p className="backtestControlHint">95% core allocation reserved; 5% available for active trading. No VOO shares are simulated.</p>
    </div>
    <div className="backtestControl">
     <label htmlFor="btSlots">Trading positions to reserve</label>
     <select className="btSelect" id="btSlots" value={slots} onChange={e=>setSlots(Number(e.target.value) as 2|3)}>
      <option value={2}>2 positions · up to 2.5% each</option><option value={3}>3 positions · up to 1.67% each</option>
     </select>
     <p className="backtestControlHint">Per-position capacity for this single-stock test; multi-ticker trading is not simulated yet.</p>
    </div>
    <div className="backtestControl">
     <label htmlFor="backtestRisk">Risk budget per trade: {risk.toFixed(2)}% of trading sleeve</label>
     <input id="backtestRisk" type="range" min=".1" max="1" step=".05" value={risk}
      onChange={e=>setRisk(Number(e.target.value))}/>
     <p className="backtestControlHint">Risk is based on your 5% trading allocation, not the 95% core.</p>
    </div>
   </div>
   <div className="backtestControl" style={{marginTop:18,maxWidth:620}}>
    <label htmlFor="backtestWatchlist">After-hours scan tickers (optional)</label>
    <input className="btInput" id="backtestWatchlist" value={watchlist}
     placeholder="SOFI, PYPL, GLXY, CLS, AVGO"
     onChange={e=>setWatchlist(e.target.value.toUpperCase())}/>
    <p className="backtestControlHint">Enter up to five tickers separated by commas. Leave blank to read your connected Alpaca paper watchlist.</p>
   </div>
   {disabledRotation&&<div className="warningBar" style={{marginTop:16}}>
    Relative Strength Rotation needs historical data for multiple stocks. It is not implemented in this preview.
   </div>}
   <div className="backtestActions">
    <button className="btBtn" disabled={busy!==null||onCooldown||!validSymbol||!token||disabledRotation||portfolio<1000||portfolio>10000000} onClick={run}>
     {busy==='test'?'Running historical test…':onCooldown?'Provider cooldown active':'Run historical backtest'}
    </button>
    <button className="btBtn secondaryBtn" disabled={busy!==null||onCooldown||!token} onClick={scanWatchlist}>
     {busy==='scan'?'Scanning watchlist…':'Scan selected stocks'}
    </button>
   </div>
   <p className="backtestInfo">After-hours scanning uses the latest available data, not live executable quotes. Enter tickers above to scan without a broker connection; leaving them blank requires Alpaca paper credentials.</p>
   {onCooldown&&<p className="warningBar" role="status">Market-data cooldown: retry in approximately {remaining} seconds. Multiple scans share your provider's API allowance.</p>}
   {error&&<div className="error backtestError" role="alert">{error}</div>}
  </section>
  {scanResult&&<section className="panel">
   <span className="eyebrow">Anytime research scan</span><h2>Paper watchlist results</h2>
   <div className="backtestSection">
    {!scanResult.length?<p>No symbols in your watchlist.</p>:
     scanResult.map((x,i)=><p key={i}><strong>{x.symbol}</strong> · Swing score {x.score==null?'N/A':x.score.toFixed(1)} · {x.status} · {x.reason}</p>)}
   </div>
   <p className="backtestInfo">Research only. No orders placed and no current entry price verified.</p>
  </section>}
  {result&&<section className="panel">
   <span className="eyebrow">Historical simulation · {result.source}</span>
   <h2>{result.symbol} · {result.strategy}</h2>
   <p className="muted">{result.bars} bars in selected period · {fmtMarketTime(result.firstBar,result.interval)} – {fmtMarketTime(result.lastBar,result.interval)}</p>
   <div className="backtestStats">
    <div className="backtestStat"><span>Average return per completed trade</span><b>{result.averageTradeReturnPct==null?'—':number(result.averageTradeReturnPct)+'%'}</b></div>
    <div className="backtestStat"><span>Best / worst completed trade</span><b>{result.bestTradeReturnPct==null?'—':number(result.bestTradeReturnPct)+'% / '+number(result.worstTradeReturnPct??0)+'%'}</b></div>
    <div className="backtestStat"><span>Completed trades</span><b>{result.closedTrades}</b></div>
    <div className="backtestStat"><span>Trading sleeve return</span><b>{number(result.tradingSleeveReturnPct)}%</b></div>
    <div className="backtestStat"><span>Net realized trading P/L</span><b>{result.realizedPnl.toLocaleString('en-US',{style:'currency',currency:'USD'})}</b></div>
    <div className="backtestStat"><span>Win rate</span><b>{result.winRate==null?'—':number(result.winRate)+'%'}</b></div>
    <div className="backtestStat"><span>Profit factor</span><b>{result.profitFactor==null?'—':number(result.profitFactor)}</b></div>
    <div className="backtestStat"><span>Trading sleeve max drawdown</span><b>{number(result.maxDrawdownPct)}%</b></div>
    <div className="backtestStat"><span>Buy and hold {result.symbol} (not VOO)</span><b>{number(result.holdPct)}%</b></div>
   </div>
   <div className="backtestSection">
    <h3>Allocation used for this test</h3>
    <p><strong>{(result.portfolio*.95).toLocaleString('en-US',{style:'currency',currency:'USD'})}</strong> reserved as 95% VOO core (not purchased or price-tested); <strong>{result.tradingSleeveInitial.toLocaleString('en-US',{style:'currency',currency:'USD'})}</strong> simulated trading sleeve; <strong>{result.slots}</strong> reserved position slots.</p>
    <p>Each simulated entry is limited to one of {result.slots} trading slots and the risk budget. The current engine tests one ticker at a time; it does not yet coordinate overlapping trades across two or three different stocks.</p>
   </div>
   {result.openTrade&&<div className="backtestSection">
     <h3>Still-open hypothetical position (not a completed trade)</h3>
     <p>{result.openTrade.shares} shares · entered {fmtMarketTime(result.openTrade.entered,result.interval)} at {result.openTrade.entry.toFixed(2)} · last historical close {result.openTrade.lastPrice.toFixed(2)}.</p>
     <p>Stop: {result.openTrade.stop.toFixed(2)} · take-profit target: {result.openTrade.target.toFixed(2)} · unrealized return {number(result.openTrade.unrealizedReturnPct)}% · unrealized P/L {result.openTrade.unrealizedPnl.toLocaleString('en-US',{style:'currency',currency:'USD'})}.</p>
     <p className="backtestInfo">The open position is marked to the last historical close, before estimated future exit friction. It is included in trading-sleeve return but not the completed-trade win rate or average.</p>
   </div>}
   <div className="backtestSection">
    <h3>Every completed simulated trade</h3>
    {!result.trades.length?<p>No completed trades; average and best/worst trade returns are intentionally blank.</p>:
    <div className="tableWrap"><table>
      <thead><tr><th>Entry date</th><th>Buy price</th><th>Sell date</th><th>Sell price</th><th>Shares</th><th>Net trade return</th><th>Net P/L</th><th>Stop / target</th><th>Exit reason</th></tr></thead>
      <tbody>{result.trades.map((t,i)=><tr key={i}>
       <td>{fmtMarketTime(t.entered,result.interval)}</td><td>{t.entry.toFixed(2)}</td>
       <td>{fmtMarketTime(t.exited,result.interval)}</td><td>{t.exit.toFixed(2)}</td>
       <td>{t.shares}</td>
       <td style={{color:t.returnPct>=0?'#4bd49f':'#ff7d86',fontWeight:800}}>{t.returnPct>=0?'+':''}{number(t.returnPct)}%</td>
       <td>{t.profit.toLocaleString('en-US',{style:'currency',currency:'USD'})}</td>
       <td>{t.stop.toFixed(2)} / {t.target.toFixed(2)}</td>
       <td>{t.reason}</td>
      </tr>)}</tbody>
    </table></div>}
    <p className="backtestInfo">Trade return = net exit proceeds minus entry cost, divided by entry cost. Net profits include estimated entry and exit friction. Unrealized open positions affect sleeve return, not completed-trade averages.</p>
   </div>
   <p className="backtestInfo">{result.assumptions} {result.dataCoverage} Prototype results are exploratory and not a verified trading edge.</p>
  </section>}
 </main>;
}
