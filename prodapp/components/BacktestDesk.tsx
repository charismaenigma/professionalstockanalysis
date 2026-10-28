'use client';

import {useState} from 'react';
import {periods,strategies,intervalAllowed,recommended,type Period,type Interval,type Strategy} from '@/lib/backtest';

type Trade={entered:string;exited:string;profit:number;reason:string};
type Result={
 strategy:string;symbol:string;period:string;interval:string;bars:number;firstBar:string;lastBar:string;
 source:string;dataCoverage:string;returnPct:number;holdPct:number;closedTrades:number;winRate:number|null;
 profitFactor:number|null;maxDrawdownPct:number;timeInMarketPct:number;trades:Trade[];assumptions:string;
 curve:{time:number;equity:number}[];
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

export default function BacktestDesk(){
 const [token,setToken]=useState('');
 const [symbol,setSymbol]=useState('');
 const [period,setPeriod]=useState<Period>('1m');
 const [interval,setInterval]=useState<Interval>('1h');
 const [strategy,setStrategy]=useState<Strategy>('Conservative Swing');
 const [risk,setRisk]=useState(.25);
 const [scanResult,setScanResult]=useState<ScanResult[]|null>(null);
 const [result,setResult]=useState<Result|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState<'test'|'scan'|null>(null);
 const supported=intervalAllowed[period];
 const disabledRotation=strategy==='Relative Strength Rotation';
 const validSymbol=/^[A-Z][A-Z0-9.]{0,8}$/.test(symbol.trim());

 async function run(){
   setBusy('test');setError('');setResult(null);
   try{
     const params=new URLSearchParams({symbol:symbol.trim(),period,interval,strategy,risk:String(risk)});
     const response=await fetch('/api/backtest?'+params,{cache:'no-store',headers:{'x-marketclarity-token':token}});
     const data=await response.json();
     if(!response.ok)throw Error(data.error||'Historical test could not be completed.');
     setResult(data as Result);
   }catch(e){setError(e instanceof Error?e.message:'Historical test failed.');}
   finally{setBusy(null);}
 }

 async function scanWatchlist(){
   setBusy('scan');setError('');setScanResult(null);
   try{
     const response=await fetch('/api/backtest/scan',{headers:{'x-marketclarity-token':token},cache:'no-store'});
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
     <label htmlFor="backtestRisk">Risk budget per simulated trade: {risk.toFixed(2)}%</label>
     <input id="backtestRisk" type="range" min=".1" max="1" step=".05" value={risk}
      onChange={e=>setRisk(Number(e.target.value))}/>
     <p className="backtestControlHint">Position size is also capped at 5% of simulated equity.</p>
    </div>
   </div>
   {disabledRotation&&<div className="warningBar" style={{marginTop:16}}>
    Relative Strength Rotation needs historical data for multiple stocks. It is not implemented in this preview.
   </div>}
   <div className="backtestActions">
    <button className="btBtn" disabled={busy!==null||!validSymbol||!token||disabledRotation} onClick={run}>
     {busy==='test'?'Running historical test…':'Run historical backtest'}
    </button>
    <button className="btBtn secondaryBtn" disabled={busy!==null||!token} onClick={scanWatchlist}>
     {busy==='scan'?'Scanning watchlist…':'Scan paper watchlist'}
    </button>
   </div>
   <p className="backtestInfo">After-hours scanning uses the latest available data, not live executable quotes. Watchlist scans also require your paper broker connection.</p>
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
   <p className="muted">{result.bars} bars in selected period · {new Date(result.firstBar).toLocaleDateString()} – {new Date(result.lastBar).toLocaleDateString()}</p>
   <div className="backtestStats">
    <div className="backtestStat"><span>Strategy return</span><b>{number(result.returnPct)}%</b></div>
    <div className="backtestStat"><span>Buy-and-hold comparison</span><b>{number(result.holdPct)}%</b></div>
    <div className="backtestStat"><span>Completed trades</span><b>{result.closedTrades}</b></div>
    <div className="backtestStat"><span>Win rate</span><b>{result.winRate==null?'—':number(result.winRate)+'%'}</b></div>
    <div className="backtestStat"><span>Profit factor</span><b>{result.profitFactor==null?'—':number(result.profitFactor)}</b></div>
    <div className="backtestStat"><span>Maximum drawdown</span><b>{number(result.maxDrawdownPct)}%</b></div>
   </div>
   <div className="backtestSection">
    <h3>Recent simulated trade exits</h3>
    {!result.trades.length?<p>No completed trades for this test. An empty trade sample cannot validate a strategy.</p>:
     result.trades.slice(0,15).map((t,i)=><p key={i}>
      {new Date(t.exited).toLocaleDateString()} · {t.reason} · {t.profit.toFixed(2){'}'} simulated P/L
     </p>)}
   </div>
   <p className="backtestInfo">{result.assumptions} {result.dataCoverage} Prototype results are exploratory and not a verified trading edge.</p>
  </section>}
 </main>;
}
