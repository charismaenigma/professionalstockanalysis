'use client';
import {useState} from 'react';
import {periods,strategies,intervalAllowed,recommended,type Period,type Interval,type Strategy} from '@/lib/backtest';
type Result={strategy:string;symbol:string;period:string;interval:string;bars:number;firstBar:string;lastBar:string;source:string;dataCoverage:string;returnPct:number;holdPct:number;closedTrades:number;winRate:number|null;profitFactor:number|null;maxDrawdownPct:number;timeInMarketPct:number;trades:{entered:string;exited:string;profit:number;reason:string}[];assumptions:string;curve:{time:number;equity:number}[]};
const names:Record<string,string>={'1d':'Most recent market day','1w':'1 week','3w':'3 weeks','1m':'1 month','3m':'3 months','6m':'6 months','1y':'1 year','3y':'3 years','5y':'5 years'};
const intervalNames:Record<string,string>={'5m':'5 minutes','15m':'15 minutes','30m':'30 minutes','1h':'Hourly','1d':'Daily','1w':'Weekly'};
export default function BacktestDesk(){
 const [token,setToken]=useState(''),[symbol,setSymbol]=useState('SOFI'),[period,setPeriod]=useState<Period>('1m'),[interval,setInterval]=useState<Interval>('1h'),[strategy,setStrategy]=useState<Strategy>('Conservative Swing'),[risk,setRisk]=useState(.25);
 const [result,setResult]=useState<Result|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function run(){setBusy(true);setError('');setResult(null);try{const p=new URLSearchParams({symbol,period,interval,strategy,risk:String(risk)});const r=await fetch('/api/backtest?'+p,{cache:'no-store',headers:{'x-marketclarity-token':token}});const j=await r.json();if(!r.ok)throw Error(j.error||'Failed');setResult(j)}catch(e){setError(e instanceof Error?e.message:'Failed')}finally{setBusy(false)}}
 const supported=intervalAllowed[period];const disabledRotation=strategy==='Relative Strength Rotation';
 return <main className="shell"><header className="top"><div><div className="brand">MarketClarity</div><div className="tag">Anytime Strategy Lab · Historical simulation</div></div><a className="radarHome" href="/paper">← Paper Trading</a></header>
 <section className="panel"><span className="eyebrow">v0.4 · Historical backtesting</span><h1>Test strategies after market close.</h1><p className="muted">Research on completed historical candles, independent of Alpaca account orders. No orders are placed by this page.</p>
 <label style={{display:"block",marginBottom:12}}>Private paper dashboard token <input type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)} style={{padding:12,background:"#071521",color:"#fff",border:"1px solid #36526d",borderRadius:8,marginLeft:12}} /></label>
 <div className="tradeGrid">
 <div><span>Ticker</span><input style={{width:'100%',padding:12,background:'#071521',color:'#fff',border:'1px solid #36526d',borderRadius:8}} value={symbol} maxLength={9} onChange={e=>setSymbol(e.target.value.toUpperCase())}/></div>
 <div><span>Strategy</span><select style={{width:'100%',padding:12}} value={strategy} onChange={e=>setStrategy(e.target.value as Strategy)}>{strategies.map(s=><option key={s}>{s}</option>)}</select></div>
 <div><span>Historical period</span><select style={{width:'100%',padding:12}} value={period} onChange={e=>{const p=e.target.value as Period;setPeriod(p);setInterval(recommended[p]);}}>{periods.map(p=><option key={p} value={p}>{names[p]}</option>)}</select></div>
 <div><span>Candle interval</span><select style={{width:'100%',padding:12}} value={interval} onChange={e=>setInterval(e.target.value as Interval)}>{supported.map(i=><option key={i} value={i}>{intervalNames[i]}{i===recommended[period]?' · recommended':''}</option>)}</select></div>
 <div><span>Risk per trade: {risk.toFixed(2)}%</span><input type="range" min=".1" max="1" step=".05" value={risk} onChange={e=>setRisk(Number(e.target.value))} style={{width:'100%'}}/></div>
 </div><button disabled={busy||disabledRotation||!token} onClick={run}>{busy?'Testing historical bars…':'Run backtest'}</button>
 {disabledRotation&&<p className="warningBar">Relative Strength Rotation requires a multi-stock historical universe. It is listed for planning, but not yet supported by this first engine.</p>}
 {error&&<div className="error" role="alert">{error}</div>}
 </section>
 {result&&<section className="panel"><span className="eyebrow">Historical simulation · {result.source}</span><h2>{result.symbol} · {result.strategy||strategy}</h2><p className="tiny">{result.bars} requested-period bars · {new Date(result.firstBar).toLocaleDateString()} through {new Date(result.lastBar).toLocaleDateString()}</p>
 <div className="paperStats"><div><span>Strategy return</span><b>{result.returnPct.toFixed(2)}%</b></div><div><span>Buy & hold</span><b>{result.holdPct.toFixed(2)}%</b></div><div><span>Closed trades</span><b>{result.closedTrades}</b></div><div><span>Win rate</span><b>{result.winRate==null?'—':result.winRate.toFixed(1)+'%'}</b></div><div><span>Profit factor</span><b>{result.profitFactor==null?'—':result.profitFactor.toFixed(2)+'×'}</b></div><div><span>Maximum drawdown</span><b>{result.maxDrawdownPct.toFixed(2)}%</b></div></div>
 <div className="paperPane"><h3>Recent simulated exits</h3>{!result.trades.length?<p>No completed historical trades for these conditions.</p>:result.trades.slice(0,15).map((t,i)=><p key={i}>{new Date(t.exited).toLocaleDateString()} · {t.reason} · {t.profit.toFixed(2)} simulated P/L</p>)}</div>
 <p className="tiny">{result.assumptions} {result.dataCoverage} This is an exploratory engine, not a validated or forward-tested trading edge.</p>
 </section>}
 </main>;
}
