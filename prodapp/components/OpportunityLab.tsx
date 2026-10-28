'use client';
import {useState} from 'react';
type Mode='day'|'swing';
type Candidate={ticker:string;score:number;rank:number;features:{price:number;volume:number;dollarVolume:number;relativeVolume:number;previousReturnPct:number;previousRangePct:number};reasons:string[]};
type Observed={ticker:string;openToClosePct:number;maxFavorableFromOpenPct:number;maxAdverseFromOpenPct:number};
type Result={modelVersion:string;requestedSession:string;selectionAsOf:string;baselineDate:string;mode:Mode;scanUniverse:number;selected:Candidate[];preSessionBasis:string;limitations:string[];audit:null|{observedPicks:{pick:Candidate;observed:Observed|null}[];missed:(Observed&{priorRank:number|null;reason:string})[];capturedLeaders:number;leaderCount:number;observedPickCount:number;positiveMoveCount:number;observedPositiveRate:number|null;averageOpenToClosePct:number|null;missedPositiveEligibleCount:number;payoff:string;caveat:string}};
const fmtPct=(x:number)=> (x>0?'+':'')+x.toFixed(2)+'%';
export default function OpportunityLab(){
 const [token,setToken]=useState(''),[date,setDate]=useState(''),[mode,setMode]=useState<Mode>('day');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<Result|null>(null);
 async function run(){
  if(!token||busy)return;setBusy(true);setError('');setResult(null);
  try{
   const p=new URLSearchParams({mode});if(date)p.set('date',date);
   const response=await fetch('/api/opportunity-lab?'+p,{headers:{'x-marketclarity-token':token},cache:'no-store'});
   const v=await response.json();if(!response.ok)throw new Error(v.error||'Opportunity scan unavailable');
   setResult(v);
  }catch(e){setError(e instanceof Error?e.message:'Opportunity scan failed')}
  finally{setBusy(false)}
 }
 return <main className="shell opportunityLab">
  <header className="top"><div><div className="brand">MarketClarity</div><div className="tag">Adaptive Opportunity Lab · Research preview</div></div>
  <div className="mainTopActions"><a className="radarHome" href="/backtest">Historical Backtesting</a><a className="radarHome" href="/paper">Paper Trading</a></div></header>
  <section className="panel">
   <span className="eyebrow">Research prototype · Daily replay</span>
   <h1>What did we select? What did we miss?</h1>
   <p className="muted">Rank tomorrow's candidates using completed prior-session information, then review what actually happened. No paper orders, automatic rule changes, or hindsight-optimized recommendations.</p>
   <div className="backtestControls" style={{marginTop:24}}>
    <div className="backtestControl"><label htmlFor="opToken">Private preview control token</label><input className="btInput" type="password" autoComplete="off" id="opToken" value={token} onChange={e=>setToken(e.target.value)} placeholder="Your Preview token"/></div>
    <div className="backtestControl"><label htmlFor="opDate">Trading session to replay</label><input className="btInput" type="date" id="opDate" value={date} onChange={e=>setDate(e.target.value)}/><span className="backtestControlHint">Leave blank for the most recent weekday; holidays may require choosing another date.</span></div>
    <div className="backtestControl"><label htmlFor="opMode">Candidate focus</label><select className="btSelect" id="opMode" value={mode} onChange={e=>setMode(e.target.value as Mode)}><option value="day">Day-trading research</option><option value="swing">Swing-trading research</option></select><span className="backtestControlHint">Pre-session ranking only; not execution-ready strategies.</span></div>
   </div>
   <div className="backtestActions"><button className="btBtn" disabled={!token||busy} onClick={run}>{busy?'Loading grouped market sessions…':'Run historical opportunity replay'}</button></div>
   {error&&<div className="error" role="alert">{error}</div>}
  </section>
  {result&&<section className="panel" style={{marginTop:18}}>
   <span className="eyebrow">Fixed model {result.modelVersion}</span>
   <h2>{result.mode==='day'?'Day-trading':'Swing-trading'} opportunity research · {result.requestedSession}</h2>
   <p className="muted">Selection information cut off: <strong>{result.selectionAsOf}</strong>. Baseline: {result.baselineDate}. Eligible universe: {result.scanUniverse.toLocaleString()} symbols.</p>
   <div className="backtestStats">
    <div className="backtestStat"><span>Pre-session candidates</span><b>{result.selected.length}</b></div>
    <div className="backtestStat"><span>Observed positive next-day moves</span><b>{result.audit?.observedPositiveRate==null?'Pending':result.audit.observedPositiveRate.toFixed(1)+'%'}</b></div>
    <div className="backtestStat"><span>Top-20 upside names captured</span><b>{result.audit?result.audit.capturedLeaders+' / '+result.audit.leaderCount:'Pending'}</b></div>
   </div>
   <div className="backtestSection"><h3>Selected before the session</h3>
    <div className="tableWrap"><table className="opportunityTable"><thead><tr><th>Rank</th><th>Ticker</th><th>Research score</th><th>Prior price</th><th>Prior day %</th><th>Volume ratio</th><th>Next session open → close</th></tr></thead><tbody>
     {result.selected.map(x=>{
      const observed=result.audit?.observedPicks.find(v=>v.pick.ticker===x.ticker)?.observed;
      return <tr key={x.ticker}><td>{x.rank}</td><td><strong>{x.ticker}</strong></td><td>{x.score.toFixed(1)}</td><td>${x.features.price.toFixed(2)}</td><td>{fmtPct(x.features.previousReturnPct)}</td><td>{x.features.relativeVolume.toFixed(2)}×</td><td style={{color:observed?(observed.openToClosePct>=0?'var(--green)':'var(--red)'):undefined}}>{observed?fmtPct(observed.openToClosePct):'Pending'}</td></tr>;
     })}</tbody></table></div>
   </div>
   {result.audit&&<div className="backtestSection">
    <h3>After-close missed-opportunity review</h3>
    <p>These tickers rose during the session but weren't among our ten pre-session picks. This is a <strong>hindsight audit</strong>—not evidence we could have bought at the open or sold at the high.</p>
    <div className="tableWrap"><table className="opportunityTable"><thead><tr><th>Ticker</th><th>Open → close</th><th>Max favorable from open</th><th>Prior rank</th><th>Why we missed it</th></tr></thead><tbody>
     {result.audit.missed.map(x=><tr key={x.ticker}><td><strong>{x.ticker}</strong></td><td style={{color:'var(--green)'}}>{fmtPct(x.openToClosePct)}</td><td>{fmtPct(x.maxFavorableFromOpenPct)}</td><td>{x.priorRank??'Not ranked'}</td><td style={{textAlign:'left'}}>{x.reason}</td></tr>)}
    </tbody></table></div>
    <p className="backtestInfo">Observed positive share of picks: {result.audit.positiveMoveCount} of {result.audit.observedPickCount}; average open-to-close change: {result.audit.averageOpenToClosePct==null?'—':fmtPct(result.audit.averageOpenToClosePct)}. Neither measure is a simulated trading win rate.</p>
   </div>}
   {!result.audit&&<div className="backtestEmpty">This session has not completed. The selection is visible; no target-session outcomes were used or audited.</div>}
   <div className="warningBar" style={{marginTop:18}}><strong>Research limitations</strong>{result.limitations.map((s,i)=><span key={i}>{s}</span>)}</div>
   <p className="backtestInfo">Next phase: store timestamped selections before the open, replay intraday 5-/15-minute strategies on the selected tickers, compare out-of-sample candidates, and schedule daily audit reports. No optimization happens automatically yet.</p>
  </section>}
 </main>
}
