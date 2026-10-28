'use client';
import {useEffect,useState} from 'react';
type Mode='day'|'swing';
type Horizon='1d'|'1w'|'1m';
type Candidate={ticker:string;score:number;rank:number;features:{price:number;volume:number;dollarVolume:number;relativeVolume:number;previousReturnPct:number;previousRangePct:number};reasons:string[]};
type Observed={ticker:string;openToClosePct:number;maxFavorableFromOpenPct:number;maxAdverseFromOpenPct:number};
type PriceComparison={ticker:string;startOpen:number|null;endClose:number|null;returnPct:number|null;vsVooPctPoints:number|null};
type Benchmark=PriceComparison&{sector:string};
type BenchmarkResult={horizon:Horizon;requestedEnd:string;complete:boolean;status:string;endDate:string;observedSessionStart:string;benchmarks:Benchmark[];tracked:PriceComparison[];method:string};
type Audit={observedPicks:{pick:Candidate;observed:Observed|null}[];missed:(Observed&{priorRank:number|null;reason:string})[];capturedLeaders:number;leaderCount:number;observedPickCount:number;positiveMoveCount:number;observedPositiveRate:number|null;averageOpenToClosePct:number|null;missedPositiveEligibleCount:number;caveat:string};
type Result={modelVersion:string;requestedSession:string;selectionAsOf:string;baselineDate:string;mode:Mode;horizon:Horizon;scanUniverse:number;selected:Candidate[];preSessionBasis:string;limitations:string[];audit:Audit|null;benchmarks:BenchmarkResult|null};
type Saved={ticker:string;date:string;mode:Mode;rank:number|null;score:number|null};
const STORAGE='marketclarity-opportunity-tracked-v1';
const fmtPct=(v:number|null|undefined)=>v==null||!Number.isFinite(v)?'—':(v>0?'+':'')+v.toFixed(2)+'%';
const money=(v:number|null)=>v===null?'—':'$'+v.toFixed(2);
const tone=(n:number|null|undefined)=>n==null?undefined:n>=0?'var(--green)':'var(--red)';
function value(result:Result,ticker:string):PriceComparison|undefined{
 return result.benchmarks?.tracked.find(x=>x.ticker===ticker);
}
export default function OpportunityLab(){
 const [token,setToken]=useState('');
 const [date,setDate]=useState('');
 const [mode,setMode]=useState<Mode>('day');
 const [horizon,setHorizon]=useState<Horizon>('1d');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<Result|null>(null);
 const [saved,setSaved]=useState<Saved[]>([]);
 const [storageReady,setStorageReady]=useState(false);
 useEffect(()=>{try{
  const raw=window.localStorage.getItem(STORAGE);
  const parsed=raw?JSON.parse(raw):[];
  if(Array.isArray(parsed))setSaved(parsed.filter((x:Saved)=>typeof x.ticker==='string'&&typeof x.date==='string'&&(x.mode==='day'||x.mode==='swing')).slice(0,80));
 }catch{/* unavailable browser storage */}setStorageReady(true);},[]);
 useEffect(()=>{if(!storageReady)return;
  try{window.localStorage.setItem(STORAGE,JSON.stringify(saved.slice(0,80)))}catch{/* private browsing may disable storage */}
 },[storageReady,saved]);
 const isSaved=(ticker:string,dateKey:string,kind:Mode)=>saved.some(x=>x.ticker===ticker&&x.date===dateKey&&x.mode===kind);
 function toggle(ticker:string,when:string,kind:Mode,score:number|null,rank:number|null){
  setSaved(old=>old.some(x=>x.ticker===ticker&&x.date===when&&x.mode===kind)?
   old.filter(x=>!(x.ticker===ticker&&x.date===when&&x.mode===kind)):
   [{ticker,date:when,mode:kind,score,rank},...old].slice(0,80));
 }
 async function run(selection?:{date:string;mode:Mode;horizon:Horizon}){
  if(!token||busy)return;
  const d=selection?.date??date,m=selection?.mode??mode,h=selection?.horizon??horizon;
  if(selection){setDate(d);setMode(m);setHorizon(h)}
  setBusy(true);setError('');setResult(null);
  try{
   const p=new URLSearchParams({mode:m,horizon:h});if(d)p.set('date',d);
   const response=await fetch('/api/opportunity-lab?'+p,{headers:{'x-marketclarity-token':token},cache:'no-store'});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||'Opportunity scan unavailable');
   setResult(data as Result);
  }catch(e){setError(e instanceof Error?e.message:'Opportunity scan failed')}
  finally{setBusy(false)}
 }
 const voo=result?.benchmarks?.benchmarks.find(x=>x.ticker==='VOO');
 const benchmarkSort=result?.benchmarks?.benchmarks||[];
 return <main className="shell backtestLab opportunityLab">
  <header className="top"><div><div className="brand">MarketClarity</div><div className="tag">Opportunity Lab · Market & sector tracking</div></div>
   <div className="mainTopActions"><a className="radarHome" href="/backtest">Historical Backtesting</a><a className="radarHome" href="/paper">Paper Trading</a></div>
  </header>
  <section className="panel">
   <span className="eyebrow">Daily research · Historical tracking</span>
   <h1>See the stocks. See the whole market.</h1>
   <p className="muted">Compare each screener selection with the S&P 500 benchmark (VOO) and all 11 sector ETFs over matching historical dates. Track noteworthy stocks and revisit their original screening session.</p>
   <div className="backtestControls" style={{marginTop:22}}>
    <div className="backtestControl"><label htmlFor="opToken">Private preview token</label>
     <input className="btInput" type="password" autoComplete="off" id="opToken" value={token} onChange={e=>setToken(e.target.value)} placeholder="Your Preview token"/></div>
    <div className="backtestControl"><label htmlFor="opDate">Original screening session</label>
     <input className="btInput" type="date" id="opDate" value={date} onChange={e=>setDate(e.target.value)}/>
     <span className="backtestControlHint">Leave blank for most recent weekday. For completed outcomes, select an earlier session.</span></div>
    <div className="backtestControl"><label htmlFor="opMode">Screening approach</label>
     <select className="btSelect" id="opMode" value={mode} onChange={e=>setMode(e.target.value as Mode)}><option value="day">Day-trading candidates</option><option value="swing">Swing-trading candidates</option></select></div>
    <div className="backtestControl"><label htmlFor="opHorizon">Performance review window</label>
     <select className="btSelect" id="opHorizon" value={horizon} onChange={e=>setHorizon(e.target.value as Horizon)}>
      <option value="1d">Selection day</option><option value="1w">Through 1 week</option><option value="1m">Through 1 month</option>
     </select>
     <span className="backtestControlHint">Incomplete windows are marked partial. Future prices are never used.</span></div>
   </div>
   <div className="backtestActions"><button className="btBtn" disabled={!token||busy} onClick={()=>run()}>{busy?'Comparing historical market snapshots…':'Run screener + benchmark comparison'}</button></div>
   {error&&<div className="error" role="alert">{error}</div>}
  </section>
  <section className="panel" style={{marginTop:18}}>
   <div className="opSectionHeading"><div><span className="eyebrow">Personal shortlist</span><h2>Stocks you're tracking</h2></div><span className="opMiniCount">{saved.length} saved</span></div>
   {saved.length===0?<p className="muted">Use “Track” next to a screener result to save that stock and its discovery date. You can reopen the original screen later to compare its performance against all sectors.</p>:
   <div className="opSavedList">{saved.map(x=><div className="opSavedItem" key={x.ticker+':'+x.date+':'+x.mode}>
     <div><strong>{x.ticker}</strong><span>{x.date} · {x.mode==='day'?'Day':'Swing'} screen{x.rank!=null?' · Rank #'+x.rank:''}</span></div>
     <div className="opSavedActions"><button disabled={!token||busy} onClick={()=>run({date:x.date,mode:x.mode,horizon})}>Review</button>
      <button className="opRemove" onClick={()=>toggle(x.ticker,x.date,x.mode,x.score,x.rank)} aria-label={'Stop tracking '+x.ticker}>Remove</button></div>
    </div>)}</div>}
   <p className="backtestInfo">This shortlist is saved only in your current browser, not in the cloud. It is not automatically refreshed in the background. To see updated returns, select Review.</p>
  </section>
  {result&&<section className="panel" style={{marginTop:18}}>
   <span className="eyebrow">Versioned pre-session model · {result.modelVersion}</span>
   <h2>{result.mode==='day'?'Day':'Swing'} opportunities · {result.requestedSession}</h2>
   <p className="muted">Screened using only bars from {result.baselineDate} and {result.selectionAsOf} · {result.scanUniverse.toLocaleString()} eligible symbols · {result.selected.length} shortlisted.</p>
   <div className="backtestStats">
    <div className="backtestStat"><span>VOO over matched period</span><b style={{color:tone(voo?.returnPct)}}>{fmtPct(voo?.returnPct)}</b></div>
    <div className="backtestStat"><span>Screened stocks rising on day 1</span><b>{result.audit?.observedPositiveRate==null?'Pending':result.audit.observedPositiveRate.toFixed(1)+'%'}</b></div>
    <div className="backtestStat"><span>Top-20 same-day movers captured</span><b>{result.audit?result.audit.capturedLeaders+' / '+result.audit.leaderCount:'Pending'}</b></div>
   </div>
   {result.benchmarks&&<div className="opComparisonInfo">
    <strong>{result.benchmarks.complete?'Completed':'Partial'} review</strong>
    <span>{result.benchmarks.observedSessionStart} open → {result.benchmarks.endDate} close
    {!result.benchmarks.complete?' · Full requested window ends '+result.benchmarks.requestedEnd:''}</span>
   </div>}
   <div className="backtestSection">
    <div className="opSectionHeading"><div><h3>All benchmarks · VOO + 11 sectors</h3><p>Every ETF appears, even when historical data is missing.</p></div><span className="opMiniCount">12 ETFs</span></div>
    <div className="tableWrap"><table className="opportunityTable opBenchTable"><thead><tr><th>ETF</th><th>Market / sector</th><th>Start open</th><th>End close</th><th>Price change</th><th>vs. VOO</th></tr></thead><tbody>
     {(benchmarkSort.length?benchmarkSort:[
       {ticker:'VOO',sector:'S&P 500 — primary market benchmark'},
       {ticker:'XLK',sector:'Technology'},{ticker:'XLC',sector:'Communication Services'},
       {ticker:'XLE',sector:'Energy'},{ticker:'XLF',sector:'Financials'},
       {ticker:'XLV',sector:'Health Care'},{ticker:'XLI',sector:'Industrials'},
       {ticker:'XLU',sector:'Utilities'},{ticker:'XLY',sector:'Consumer Discretionary'},
       {ticker:'XLP',sector:'Consumer Staples'},{ticker:'XLB',sector:'Materials'},
       {ticker:'XLRE',sector:'Real Estate'},
      ].map(x=>({...x,startOpen:null,endClose:null,returnPct:null,vsVooPctPoints:null}))).map(x=>
      <tr key={x.ticker} className={x.ticker==='VOO'?'opVooRow':''}>
       <td><strong>{x.ticker}</strong></td><td>{x.sector}</td>
       <td>{money(x.startOpen)}</td><td>{money(x.endClose)}</td>
       <td style={{color:tone(x.returnPct),fontWeight:800}}>{fmtPct(x.returnPct)}</td>
       <td style={{color:tone(x.vsVooPctPoints)}}>{x.ticker==='VOO'?'Baseline':x.vsVooPctPoints==null?'—':fmtPct(x.vsVooPctPoints)+' pts'}</td>
      </tr>)}
    </tbody></table></div>
    <p className="backtestInfo">VOO represents the S&P 500, not the entire US stock market. Sector ETFs represent S&P 500 sectors. Prices are split-adjusted, but ETF distributions/dividends, fees and taxes are excluded.</p>
   </div>
   <div className="backtestSection">
    <div className="opSectionHeading"><div><h3>Screened stocks · matched performance</h3>
     <p>Returns start at the screening session's open; they are observed buy-and-hold changes, not simulated strategy trade returns.</p></div></div>
    <div className="tableWrap"><table className="opportunityTable opTrackingTable"><thead><tr><th>Rank</th><th>Stock</th><th>Score</th><th>Prior close</th><th>Volume ratio</th><th>Day 1 change</th><th>Review window change</th><th>vs. VOO</th><th>Follow</th></tr></thead><tbody>
     {result.selected.map(x=>{
      const observed=result.audit?.observedPicks.find(v=>v.pick.ticker===x.ticker)?.observed;
      const p=value(result,x.ticker);
      const pinned=isSaved(x.ticker,result.requestedSession,result.mode);
      return <tr key={x.ticker}><td>{x.rank}</td><td><strong>{x.ticker}</strong></td><td>{x.score.toFixed(1)}</td>
       <td>{money(x.features.price)}</td><td>{x.features.relativeVolume.toFixed(2)}×</td>
       <td style={{color:tone(observed?.openToClosePct)}}>{fmtPct(observed?.openToClosePct)}</td>
       <td style={{color:tone(p?.returnPct),fontWeight:800}}>{fmtPct(p?.returnPct)}</td>
       <td style={{color:tone(p?.vsVooPctPoints)}}>{p?.vsVooPctPoints==null?'—':fmtPct(p.vsVooPctPoints)+' pts'}</td>
       <td><button className={'opTrackBtn'+(pinned?' opTrackActive':'')} onClick={()=>toggle(x.ticker,result.requestedSession,result.mode,x.score,x.rank)}>{pinned?'Saved':'Track'}</button></td>
      </tr>;
     })}</tbody></table></div>
   </div>
   {result.audit&&<div className="backtestSection">
    <h3>What we missed · after-close audit</h3>
    <p>Stocks that rose but weren't selected. Some were excluded by the original rules. This is hindsight analysis, not proof they were tradable opportunities.</p>
    <div className="tableWrap"><table className="opportunityTable"><thead><tr><th>Stock</th><th>Day 1</th><th>Through review date</th><th>Prior rank</th><th>Reason omitted</th><th>Follow</th></tr></thead><tbody>
     {result.audit.missed.map(x=>{
      const p=value(result,x.ticker),pinned=isSaved(x.ticker,result.requestedSession,result.mode);
      return <tr key={x.ticker}><td><strong>{x.ticker}</strong></td><td style={{color:tone(x.openToClosePct)}}>{fmtPct(x.openToClosePct)}</td>
       <td style={{color:tone(p?.returnPct)}}>{fmtPct(p?.returnPct)}</td><td>{x.priorRank??'—'}</td><td style={{textAlign:'left'}}>{x.reason}</td>
       <td><button className={'opTrackBtn'+(pinned?' opTrackActive':'')} onClick={()=>toggle(x.ticker,result.requestedSession,result.mode,null,x.priorRank)}>{pinned?'Saved':'Track'}</button></td>
      </tr>;
     })}</tbody></table></div>
    <p className="backtestInfo">The day's strongest movers are selected retrospectively to diagnose screening misses. They were never added to the original shortlist or counted as predicted wins.</p>
   </div>}
   {!result.audit&&<p className="warningBar">This session is not yet available as a completed historical day; performance will appear only after completed daily data is available.</p>}
   <p className="backtestInfo">{result.benchmarks?.method||'No completed price window available.'}</p>
   <div className="warningBar" style={{marginTop:18}}><strong>Research limitations</strong>{result.limitations.map((s,i)=><span key={i}>{s}</span>)}</div>
  </section>}
 </main>;
}
