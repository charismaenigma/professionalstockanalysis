'use client';
import {useEffect,useState} from 'react';
import type {RadarReport,RadarCategory,RadarLead} from '@/lib/radar';

const tabs:{id:RadarCategory;title:string;desc:string}[]=[
 {id:'momentum',title:'Momentum leaders',desc:'Rose during the last completed session and closed relatively near the day’s high.'},
 {id:'rebound',title:'Rebound watch',desc:'Fell on the day but recovered from the session low. Not proof of a bottom.'},
 {id:'unusual-volume',title:'Unusual activity',desc:'Trading volume increased relative to the immediately previous session.'},
 {id:'leveraged',title:'Leveraged ETFs',desc:'Daily-reset leverage funds that merit a separate short-term risk review.'}
];
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:n<1?4:2,maximumFractionDigits:n<1?6:2}).format(n);
const compact=(n:number)=>Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(n);
function Lead({lead}:{lead:RadarLead}){
 return <article className="radarLead">
   <div className="radarLeadTop"><div><span className="radarTicker">{lead.symbol}</span><span className="radarTag">Preliminary lead</span></div><span className="radarPriority">{lead.priority.toFixed(0)} <small>/ 100 Radar Priority</small></span></div>
   <div className="radarNumbers">
     <div><span>EOD close</span><strong>{money(lead.close)}</strong></div>
     <div><span>Daily change</span><strong className={lead.changePercent>=0?'radarUp':'radarDown'}>{lead.changePercent>=0?'+':''}{lead.changePercent.toFixed(2)}%</strong></div>
     <div><span>Volume vs previous day</span><strong>{lead.volumeRatio.toFixed(2)}×</strong></div>
     <div><span>Dollar activity</span><strong>{compact(lead.dollarVolume)}</strong></div>
   </div>
   {lead.leveraged&&<p className="radarLeveraged">Daily leveraged exposure: {lead.leveraged.multiple>0?'+':''}{lead.leveraged.multiple}× {lead.leveraged.index} · {lead.leveraged.direction}{lead.leveraged.opposite?` · Compare with ${lead.leveraged.opposite}`:''}</p>}
   <div className="radarLeadNotes">
     <div><b>Why it appeared</b>{lead.reasons.map((r,i)=><p key={i}>✓ {r}</p>)}</div>
     <div><b>What could go wrong</b>{lead.cautions.slice(0,2).map((r,i)=><p key={i}>⚠ {r}</p>)}</div>
   </div>
   <div className="radarActions"><span>Full fundamental, technical and risk checks still required.</span><a href={`/?ticker=${encodeURIComponent(lead.symbol)}`}>Analyze {lead.symbol} →</a></div>
 </article>;
}
export default function OpportunityRadar(){
 const [report,setReport]=useState<RadarReport|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [tab,setTab]=useState<RadarCategory>('momentum');
 useEffect(()=>{
   let mounted=true;
   async function load(){
     try{
       const r=await fetch('/api/radar');
       const data=await r.json();
       if(!r.ok)throw new Error(data.error||'Daily Radar is unavailable.');
       if(mounted)setReport(data);
     }catch(e:any){if(mounted)setError(e.message||'Unable to load Daily Radar.')}
     finally{if(mounted)setLoading(false);}
   }
   void load();
   return ()=>{mounted=false};
 },[]);
 const current=tabs.find(t=>t.id===tab)!;
 const count=report?.categories[tab]?.length??0;
 return <main className="shell">
    <header className="top"><div><a className="radarBrand" href="/">MarketClarity</a><div className="tag">Complex analysis underneath. Simple answers on top.</div></div><a className="radarHome" href="/">← Stock Analyzer</a></header>
    <section className="hero panel radarHero"><div><span className="eyebrow">Before the opening bell · Based on completed sessions</span><h1>Daily Opportunity Radar</h1><p>Stop guessing which stocks deserve attention. Review evidence-based screening leads, understand why they appeared, and open a full MarketClarity analysis before making any decision.</p><div className="radarStatus"><b>Discovery, not prediction</b><span>Radar Priority is NOT an investment rating, a verified 95+ score, or a probability of profit.</span></div></div><div className="heroSide"><div className="bigLabel">No forced picks.</div><b>Screen first.<br/>Verify next.</b><p>A first-pass lead needs company research, longer price history, liquidity checks and an actionable setup before it could qualify.</p></div></section>
    {loading&&<section className="panel radarLoading"><h3>Preparing the daily shortlist…</h3><p>Reading the latest completed U.S. market sessions from your connected market-data provider.</p></section>}
    {error&&<section className="panel radarError"><h3>Radar data temporarily unavailable</h3><p>{error}</p><p>We do not substitute invented stocks or cached demo picks for a missing market report. You can still <a href="/">analyze a symbol individually</a>.</p></section>}
    {report&&<>
     <section className="panel radarOverview">
       <div className="radarOverviewHeading"><div><span className="eyebrow">Latest completed trading session</span><h3>{report.reportDate}</h3><p className="tiny">Compared with {report.comparisonDate} · {report.source}</p></div><div className="radarLastUpdated">Report generated {new Date(report.generatedAt).toLocaleString()}</div></div>
       <div className="radarStats">
         <div><span>Daily symbols scanned</span><b>{report.scanned.toLocaleString()}</b></div>
         <div><span>Basic liquidity eligible</span><b>{report.eligible.toLocaleString()}</b></div>
         <div><span>Leads displayed</span><b>{Object.values(report.categories).reduce((sum,arr)=>sum+arr.length,0)}</b></div>
         <div><span>Verified 95+ analyses</span><b>Not assessed</b></div>
       </div>
       <p className="tiny">The screen covers daily market bars, not real-time premarket trades. It screens for basic liquidity and price movement, not earnings growth or intrinsic value. OTC records are excluded from this first version.</p>
     </section>
     <section className="panel radarResults">
       <span className="eyebrow">Discovery watchlists</span><h3>Which stocks deserve deeper research?</h3>
       <nav className="radarTabs" aria-label="Opportunity Radar categories">
         {tabs.map(x=><button type="button" key={x.id} className={tab===x.id?'selected':''} aria-pressed={tab===x.id} onClick={()=>setTab(x.id)}>{x.title} <span>{report.categories[x.id].length}</span></button>)}
       </nav>
       <div className="radarListHeading"><div><h3>{current.title}</h3><p>{current.desc}</p></div><span>{count} screening {count===1?'lead':'leads'}</span></div>
       {count? <div className="radarGrid">{report.categories[tab].map(lead=><Lead key={lead.symbol} lead={lead}/>)}</div>:<div className="radarNone"><h3>No candidates met this category's first-pass filters.</h3><p>This is a valid result. We don't lower thresholds to fill a list.</p></div>}
     </section>
     <section className="panel radarLimits"><span className="eyebrow">How to interpret the Radar</span><h3>Why these are leads, not Elite opportunities</h3><p>Today's shortlist uses only the two latest completed trading-session summaries. Volume comparisons are with the prior day, not a twenty-day average. No entry, stop or projected return is established here.</p>
       <div className="radarSteps"><div><b>1 · Screen</b><p>Find stocks with significant activity and acceptable basic liquidity.</p></div><div><b>2 · Investigate</b><p>Open the full analyzer and check company reports, multi-month trends, risk and trade suitability.</p></div><div><b>3 · Qualify or reject</b><p>Only evidence-supported full analysis can earn a 95+ score. A preliminary lead is never automatically qualified.</p></div></div>
       <details><summary>Data limitations and screening policy</summary>{report.limits.map(x=><p className="tiny" key={x}>{x}</p>)}</details>
     </section>
     <footer>Educational market research only. No screening score is a probability of profit or a live trading recommendation. Data: {report.source}. For customer-facing use, obtain the appropriate market-data redistribution permissions.</footer>
    </>}
 </main>;
}
