'use client';
import {useEffect,useState} from 'react';
import type {PremarketReport,PremarketPhase} from '@/lib/premarket';
type HistoricalReport={key:string;report:PremarketReport};
const KEY='mc-premarket-research-v1';
const STEP:{phase:PremarketPhase;time:string;name:string;description:string}[]=[
 {phase:'early',time:'6:00–7:00 AM',name:'Overnight discovery',description:'Watchlist, previous-session momentum, overnight headlines and first observable IEX prices'},
 {phase:'rank',time:'7:30 AM',name:'Primary ranking',description:'Re-rank candidates by timestamped gaps, IEX premarket prints and spread quality'},
 {phase:'final',time:'8:15 AM',name:'Pre-open check',description:'Check quote freshness, spreads, observed IEX volume and sector context before the bell'}
];
const fmt=(x:number|null,d=2)=>x==null?'—':x.toFixed(d);
const pcent=(x:number|null,d=2)=>x==null?'—':(x>=0?'+':'')+x.toFixed(d)+'%';
function save(filename:string,content:string,type:string){
 const href=URL.createObjectURL(new Blob([content],{type}));
 const a=document.createElement('a');a.href=href;a.download=filename;document.body.appendChild(a);a.click();a.remove();
 window.setTimeout(()=>URL.revokeObjectURL(href),1000);
}
export default function PremarketDesk(){
 const [token,setToken]=useState('');
 const [report,setReport]=useState<PremarketReport|null>(null);
 const [history,setHistory]=useState<HistoricalReport[]>([]);
 const [ready,setReady]=useState(false);
 const [busy,setBusy]=useState<PremarketPhase|null>(null);
 const [err,setErr]=useState('');
 const [info,setInfo]=useState('');
 useEffect(()=>{
  try{const raw=window.localStorage.getItem(KEY);if(raw){const data=JSON.parse(raw);
   if(Array.isArray(data))setHistory(data.filter(x=>x&&x.key&&x.report?.version==='premarket-research-v0.1').slice(0,30));}}
  catch{setInfo('Browser archive could not be read.');}setReady(true);
 },[]);
 useEffect(()=>{if(ready)try{window.localStorage.setItem(KEY,JSON.stringify(history));}catch{setInfo('Browser storage is full: export JSON backup.');}},[history,ready]);
 async function run(phase:PremarketPhase){
  setBusy(phase);setErr('');setInfo('');
  try{
   const response=await fetch('/api/premarket?phase='+phase,{headers:{'x-marketclarity-token':token},cache:'no-store'});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||'Research endpoint unavailable');
   const data=result as PremarketReport;
   if(!data.readOnly||data.ordersSubmitted!==0)throw new Error('Unexpected order-execution response; refused to archive.');
   setReport(data);
   const key=data.marketDate+'|'+phase;
   setHistory(old=>[{key,report:data},...old.filter(x=>x.key!==key)].slice(0,30));
   setInfo('Research snapshot saved to this browser; no orders were placed.');
  }catch(e){setErr(e instanceof Error?e.message:'Unable to run premarket research');}
  finally{setBusy(null);}
 }
 function exportJson(){
  save('marketclarity-premarket-'+new Date().toISOString().slice(0,10)+'.json',
   JSON.stringify({version:1,exportedAt:new Date().toISOString(),reports:history},null,2),'application/json');
 }
 function exportCsv(){
  const h=['Captured at','Market date','Phase','Previous completed session','Ticker','Research rank','Candidate source','Previous close','IEX latest trade','Gap %','IEX premarket volume shares','Estimated IEX dollar volume','IEX quote age (minutes)','IEX bid/ask spread %','Quote/liquidity assessment','Evidence','Experimental score','News items','Single-exchange feed'];
  const rows=history.flatMap(({report:r})=>r.ranked.map(x=>[r.asOf,r.marketDate,r.phase,r.previousSession||'',x.ticker,x.rank,x.source,x.previousClose,x.latestPrice,x.gapPct,x.premarketVolumeIex,x.estimatedPremarketDollarVolume,x.quoteAgeMinutes,x.spreadPct,x.liquidity,x.evidence,x.score,x.newsCount,r.feed]));
  const q=(x:unknown)=>'"'+String(x??'').replace(/"/g,'""')+'"';
  save('marketclarity-premarket-'+new Date().toISOString().slice(0,10)+'.csv','\uFEFF'+[h,...rows].map(r=>r.map(q).join(',')).join('\r\n'),'text/csv;charset=utf-8');
 }
 const top=report?.ranked.slice(0,20)||[];
 const qualified=report?.ranked.filter(x=>x.liquidity==='pass'&&x.score!=null).slice(0,5)||[];
 return <section className="panel preMarketDesk">
  <div className="preHero"><span className="eyebrow">Read-only · US stocks · IEX</span>
   <h1>Premarket Research Desk</h1>
   <p className="muted">Three checkpoints before the 8:30 AM Central opening bell. Investigate overnight movers, rank observed premarket changes and recheck liquidity. This is research, not paper trading or a market-wide SIP screener.</p>
   <div className="preSecurity"><label htmlFor="preToken">Private preview control token</label>
    <input id="preToken" type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)} placeholder="Enter the private Preview token"/>
    <span>Token stays in this tab's memory; never written into local storage.</span></div>
  </div>
  <div className="prePhases">{STEP.map(s=><div className="prePhase" key={s.phase}>
   <span>{s.time} · Central</span><h2>{s.name}</h2><p>{s.description}</p>
   <button disabled={!token||!!busy} onClick={()=>run(s.phase)}>{busy===s.phase?'Scanning…':'Run '+s.name.toLowerCase()}</button>
  </div>)}</div>
  {err&&<p className="error" role="alert">{err}</p>}
  {info&&<p className="preNotice" role="status">{info}</p>}
  {report&&<>
   <div className="preHeading"><div><span className="eyebrow">Latest captured evidence</span><h2>{report.marketDate} · {STEP.find(x=>x.phase===report.phase)?.name}</h2>
    <p className="tiny">As of {new Date(report.asOf).toLocaleString()} · Prior session {report.previousSession||'Unavailable'} · {report.candidateUniverse} symbols sampled · {report.freshCandidates} fresh in the displayed shortlist</p></div><span className="paperBadge">NO ORDERS</span></div>
   {report.warnings.length>0&&<div className="preWarnings">{report.warnings.map((w,i)=><p key={i}>• {w}</p>)}</div>}
   <div className="preMetrics">
    <div><span>Candidate sample</span><strong>{report.candidateUniverse}</strong></div>
    <div><span>Fresh IEX trades</span><strong>{report.freshCandidates}</strong></div>
    <div><span>Fresh liquidity passes</span><strong>{qualified.length}</strong></div>
    <div><span>News headlines</span><strong>{report.news.length}</strong></div>
   </div>
   <div className="preHeading"><h2>Candidate ranking</h2>
    <a href={'/paper?candidates='+encodeURIComponent(qualified.map(x=>x.ticker).join(','))+'&screenDate='+encodeURIComponent(report.marketDate)}>Review qualifying candidates in Paper Lab</a></div>
   <p className="tiny">MarketClarity never sends these symbols to Alpaca's watchlist or places an order without an additional user action. Gaps require a same-session trade; blank means unverified, not zero. The score is an experimental sorting heuristic.</p>
   <div className="preScroll"><table className="preTable"><thead><tr><th>Rank</th><th>Ticker</th><th>IEX trade</th><th>vs prior close</th><th>IEX premarket shares</th><th>Quote age</th><th>Spread</th><th>Evidence</th><th>Liquidity</th><th>Score</th><th>News</th></tr></thead>
    <tbody>{top.map(x=><tr key={x.ticker}><td>{x.rank??'—'}</td><td><strong>{x.ticker}</strong><small>{x.source==='watchlist'?'Existing watchlist':'Daily baseline'}</small></td>
     <td>{x.latestPrice==null?'—':'$'+fmt(x.latestPrice)}</td><td className={x.gapPct!=null&&x.gapPct>=0?'positive':'negative'}>{pcent(x.gapPct)}</td>
     <td>{x.premarketVolumeIex?.toLocaleString()??'—'}</td><td>{x.quoteAgeMinutes==null?'—':fmt(x.quoteAgeMinutes,1)+'m'}</td>
     <td>{x.spreadPct==null?'—':fmt(x.spreadPct,2)+'%'}</td><td>{x.evidence}</td><td>{x.liquidity}</td><td>{fmt(x.score,1)}</td><td>{x.newsCount}</td>
    </tr>)}</tbody></table></div>
   <h2 className="preSectionTitle">Sector ETF and market context</h2>
   <div className="preSectorGrid">{report.sectors.map(x=><div key={x.ticker}><strong>{x.ticker}</strong><span>{x.sector}</span><b className={x.gapPct!=null&&x.gapPct>=0?'positive':'negative'}>{pcent(x.gapPct)}</b><small>{x.evidence}</small></div>)}</div>
   <h2 className="preSectionTitle">Overnight headlines</h2>
   {report.news.length===0?<p className="muted">No articles verified from the connected news feed for this lookback.</p>:
    <div className="preNews">{report.news.slice(0,20).map((x,i)=><div key={i}><strong>{x.url?<a href={x.url} target="_blank" rel="noopener noreferrer">{x.headline}</a>:x.headline}</strong><p>{new Date(x.published).toLocaleString()} · {x.source} · {x.symbols.join(', ')||'Market-wide'}</p></div>)}</div>}
  </>}
  <div className="preArchive"><div><h2>Local premarket archive</h2><p className="tiny">{history.length} saved checkpoints, up to 30. Stored in this browser only. There is no cloud sync or unattended persistence yet.</p></div>
   <div className="preArchiveButtons"><button disabled={!history.length} onClick={exportJson}>Export JSON backup</button><button disabled={!history.length} onClick={exportCsv}>Export CSV for Google Sheets</button></div>
   {history.length>0&&<div className="preArchiveRows">{history.map(({key,report:r})=><div key={key}>
    <button onClick={()=>setReport(r)}>{r.marketDate} · {r.phase} · {r.freshCandidates} fresh</button>
    <button aria-label={'Delete '+key} onClick={()=>{if(window.confirm('Delete this saved premarket research checkpoint?'))setHistory(old=>old.filter(x=>x.key!==key));}}>Delete</button>
   </div>)}</div>}
  </div>
 </section>;
}
