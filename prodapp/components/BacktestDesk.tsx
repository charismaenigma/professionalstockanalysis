'use client';
import {useEffect,useMemo,useState} from 'react';
import {PERIODS,type IntervalId,type PeriodId,type StrategyId} from '@/lib/backtest/config';
import type {BacktestReport,BacktestStrategyResult} from '@/lib/backtest/engine';

type CloseScan={mode:string;asOf:string;results:Array<{symbol:string;asOf?:string;close?:number;triggers?:string[];details?:string;error?:string}>};
const intervalLabels:Record<IntervalId,string>={'5Min':'5 min','15Min':'15 min','30Min':'30 min','1Hour':'1 hour','1Day':'Daily','1Week':'Weekly'};
const money=(value:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value);
const percent=(value:number|null)=>value==null?'—':value.toFixed(2)+'%';

function Curve({result}:{result:BacktestStrategyResult}){
  if(result.curve.length<2)return <p className="tiny">Not enough completed candles to plot an equity curve.</p>;
  const values=result.curve.map(p=>p.equity);
  const low=Math.min(...values,100000),high=Math.max(...values,100000);
  const distance=Math.max(1,high-low);
  const path=result.curve.map((p,i)=>{
    const x=8+i/(result.curve.length-1)*684,y=135-(p.equity-low)/distance*118;
    return `${i?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const zero=135-(100000-low)/distance*118;
  return <div className="backtestCurve" role="img" aria-label={`${result.name} hypothetical equity moved from $100,000 to ${money(values.at(-1)!)}.`}>
    <svg viewBox="0 0 700 150" preserveAspectRatio="none" focusable="false" aria-hidden="true">
      <line x1="8" x2="692" y1={zero} y2={zero} stroke="#4c6474" strokeDasharray="4 5"/>
      <path d={path} fill="none" stroke={result.returnPct>=0?'#63e7ce':'#ff9f9f'} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
    <div className="chartLegend"><span>{result.curve[0].date.slice(0,10)}</span><b>{money(values.at(-1)!)}</b><span>{result.curve.at(-1)!.date.slice(0,10)}</span></div>
  </div>;
}

export default function BacktestDesk({token,watchlist}:{token:string;watchlist:string[]}){
  const [symbol,setSymbol]=useState('');
  const [period,setPeriod]=useState<PeriodId>('1w');
  const [interval,setInterval]=useState<IntervalId>('15Min');
  const [report,setReport]=useState<BacktestReport|null>(null);
  const [closeScan,setCloseScan]=useState<CloseScan|null>(null);
  const [activeStrategy,setActiveStrategy]=useState<StrategyId>('momentum_breakout');
  const [busy,setBusy]=useState<'backtest'|'scan'|''>('');
  const [error,setError]=useState('');

  useEffect(()=>{if(watchlist.length)setSymbol(old=>old||watchlist[0]);},[watchlist]);
  const activePeriod=PERIODS.find(item=>item.id===period)!;
  const activeResult=report?.results.find(s=>s.id===activeStrategy)??report?.results.find(s=>s.status==='tested');
  const tested=useMemo(()=>report?.results.filter(s=>s.status==='tested')??[],[report]);
  const ranked=useMemo(()=>[...tested].sort((a,b)=>b.returnPct-a.returnPct),[tested]);

  async function send(body:unknown){
    const response=await fetch('/api/paper/backtest',{method:'POST',cache:'no-store',
      headers:{'Content-Type':'application/json','x-marketclarity-token':token},body:JSON.stringify(body)});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Historical data is unavailable.');
    return result;
  }
  async function test(){
    setBusy('backtest');setError('');setReport(null);
    try{
      const data:BacktestReport=await send({mode:'backtest',symbol:symbol.trim().toUpperCase(),period,interval});
      setReport(data);
      const first=data.results.find(s=>s.status==='tested'&&s.id===activeStrategy)??data.results.find(s=>s.status==='tested');
      if(first)setActiveStrategy(first.id);
    }catch(e){setError(e instanceof Error?e.message:'Unable to run test.');}
    finally{setBusy('');}
  }
  async function scan(){
    setBusy('scan');setError('');setCloseScan(null);
    try{setCloseScan(await send({mode:'scan'}));}
    catch(e){setError(e instanceof Error?e.message:'Unable to scan latest close.');}
    finally{setBusy('');}
  }
  function changePeriod(next:PeriodId){
    const nextPeriod=PERIODS.find(p=>p.id===next)!;
    setPeriod(next);setInterval(nextPeriod.defaultInterval);setReport(null);
  }

  return <section className="backtestLab" aria-labelledby="backtestTitle">
    <div className="backtestTop"><div>
      <span className="eyebrow">Historical research · Anytime access</span>
      <h4 id="backtestTitle">The market closes. Your research doesn&apos;t.</h4>
      <p className="muted">Explore completed market days, test ten transparent technical strategies, and compare hypothetical outcomes. No orders are placed by these tools.</p>
    </div><span className="backtestReadOnly">READ-ONLY TESTING</span></div>

    <div className="backtestScanArea">
      <div><h5>Latest-close watchlist scan</h5><p className="tiny">Uses the newest completed daily candle for each watchlist stock—even nights, weekends and holidays. Historical signals only; no execution checks.</p></div>
      <button className="btButton btPrimary" disabled={!!busy||!watchlist.length} onClick={scan}>{busy==='scan'?'Scanning…':'Scan latest close'}</button>
    </div>
    {closeScan&&<div className="backtestScanResults" role="status"><p className="tiny">Research generated {new Date(closeScan.asOf).toLocaleString()}</p>
      <div className="backtestScanGrid">{closeScan.results.map(s=><div key={s.symbol}><strong>{s.symbol}</strong>
        <small>{s.error?'Data unavailable':`Last completed session: ${s.asOf||'—'} · ${money(s.close??0)}`}</small>
        {s.error?<p className="btErrorText">{s.error}</p>:<p>{s.triggers?.length?s.triggers.join(' · '):'No technical entry signals at latest close.'}</p>}
      </div>)}</div></div>}

    <div className="backtestDivider"/>
    <div className="backtestSectionHead"><h5>Strategy backtesting</h5><p className="tiny">Start with $100,000 hypothetical cash · Maximum 5% allocated to this one stock · 0.1% entry and exit slippage</p></div>
    <div className="backtestSymbolLine"><label htmlFor="btSymbol">Stock symbol</label>
      <input id="btSymbol" maxLength={10} autoCapitalize="characters" spellCheck={false} value={symbol} onChange={e=>{setSymbol(e.target.value.toUpperCase());setReport(null);}} placeholder="e.g. MSFT"/>
      <div className="backtestQuickSymbols">{watchlist.map(s=><button className={s===symbol?'isActive':''} key={s} onClick={()=>{setSymbol(s);setReport(null);}}>{s}</button>)}</div>
    </div>
    <label className="backtestLabel">Test period</label>
    <div className="backtestPeriodGrid" role="group" aria-label="Historical test period">{PERIODS.map(p=><button type="button" key={p.id} aria-pressed={p.id===period} className={p.id===period?'isActive':''} onClick={()=>changePeriod(p.id)}>{p.label}</button>)}</div>
    <div className="backtestIntervalLine"><div><span className="backtestLabel" id="btIntervalLabel">Candle interval</span><p className="tiny">Intervals are matched to the length of the historical test.</p></div>
      <div className="backtestIntervalGrid" role="group" aria-labelledby="btIntervalLabel">{activePeriod.intervals.map(value=><button key={value} className={value===interval?'isActive':''} aria-pressed={value===interval} onClick={()=>{setInterval(value);setReport(null);}}>{intervalLabels[value]}</button>)}</div>
    </div>
    <div className="backtestAction"><button className="btButton btPrimary" disabled={!!busy||!symbol.trim()} onClick={test}>{busy==='backtest'?'Testing strategies…':'Run 10-strategy backtest'}</button>
      <p className="tiny">Indicators use earlier completed candles for warm-up. Trades enter on the following bar, with stop-loss and take-profit assumptions.</p></div>
    {error&&<p className="backtestError" role="alert">{error}</p>}

    {report&&<div className="backtestReport" aria-live="polite">
      <div className="backtestReportTitle"><div><span className="eyebrow">Simulation report</span><h5>{report.symbol} <span>· {PERIODS.find(p=>p.id===report.period)?.label} · {intervalLabels[report.interval]}</span></h5>
        <p className="tiny">{report.first} to {report.last} · {report.sampleBars.toLocaleString()} test candles · {report.warmupBars.toLocaleString()} warm-up candles · {report.source}</p></div>
        <span className="backtestReadOnly">NO ORDERS SENT</span></div>
      <div className="backtestMetricRow">
        <div><small>Strategies evaluated</small><strong>{tested.length}<span> / 10</span></strong></div>
        <div><small>Highest simulated return</small><strong className={(ranked[0]?.returnPct??0)<0?'negative':'positive'}>{ranked.length?percent(ranked[0].returnPct):'—'}</strong></div>
        <div><small>Reference: 5% buy-and-hold</small><strong className={report.benchmarkReturnPct<0?'negative':''}>{percent(report.benchmarkReturnPct)}</strong></div>
      </div>
      {report.coverageWarning&&<p className="backtestError" role="status">{report.coverageWarning}</p>}
      <p className="tiny">Results are ranked by in-sample return, which does not prove predictive skill. Zero-trade strategies return 0% and are not evidence of success.</p>
      <div className="backtestTableScroll"><table className="backtestTable"><thead><tr><th>Strategy</th><th>Trades</th><th>Win rate</th><th>Return</th><th>Max drawdown</th><th>Profit factor</th></tr></thead>
        <tbody>{[...report.results].sort((a,b)=>{
          if(a.status!=='tested'&&b.status!=='tested')return 0;
          if(a.status!=='tested')return 1;if(b.status!=='tested')return -1;return b.returnPct-a.returnPct;
        }).map(s=><tr key={s.id} className={s.id===activeStrategy?'selected':''}>
          <td><button className="btStrategyPick" onClick={()=>setActiveStrategy(s.id)} aria-pressed={activeStrategy===s.id}>{s.name}</button>{s.status!=='tested'&&<small title={s.notice}>{s.status==='incompatible'?'Not suited to interval':'Insufficient data'}</small>}</td>
          <td>{s.status==='tested'?s.trades:'—'}</td><td>{s.status==='tested'?percent(s.winRate):'—'}</td>
          <td className={s.returnPct<0?'negative':s.returnPct>0?'positive':''}>{s.status==='tested'?percent(s.returnPct):'—'}</td>
          <td>{s.status==='tested'?percent(s.maxDrawdownPct):'—'}</td><td>{s.status==='tested'?(s.profitFactor==null?'—':s.profitFactor.toFixed(2)+'×'):'—'}</td>
        </tr>)}</tbody></table></div>
      {activeResult&&<div className="backtestDetail"><div className="backtestDetailTop"><h5>{activeResult.name}</h5><span>{activeResult.status==='tested'?`${activeResult.trades} closed hypothetical trades`:activeResult.notice}</span></div>
        {activeResult.status==='tested'?<><Curve result={activeResult}/>
          <div className="backtestDetailStats"><span>Net simulated P/L: <b className={activeResult.realizedPnl<0?'negative':'positive'}>{money(activeResult.realizedPnl)}</b></span><span>Avg trade: <b>{percent(activeResult.averageTradePct)}</b></span><span>Win rate: <b>{percent(activeResult.winRate)}</b></span></div>
          {activeResult.recentTrades.length>0&&<><h6>Recent completed trades</h6><div className="backtestTableScroll"><table className="backtestTable backtestTradeTable"><thead><tr><th>Entry</th><th>Exit</th><th>Shares</th><th>Net P/L</th><th>Exit reason</th></tr></thead><tbody>{activeResult.recentTrades.map((t,i)=><tr key={t.entry+t.exit+i}><td>{t.entry.slice(0,10)}</td><td>{t.exit.slice(0,10)}</td><td>{t.qty}</td><td className={t.pnl<0?'negative':'positive'}>{money(t.pnl)}</td><td>{t.reason}</td></tr>)}</tbody></table></div></>}
        </>:<p className="tiny">{activeResult.notice}</p>}</div>}
      <div className="backtestDisclaimer"><strong>Research limitations</strong><p>{report.disclaimer} Historical results can be distorted by sparse IEX volume, survivorship and symbol-selection biases, and testing multiple strategies against the same period. This is not a forecast or investment recommendation.</p></div>
    </div>}
  </section>;
}
