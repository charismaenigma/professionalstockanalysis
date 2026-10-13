'use client';
import {useEffect,useMemo,useState} from 'react';
import type {RadarLead,RadarReport} from '@/lib/radar';

type Grade='all'|'strong'|'watch';
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:n<1?4:2,maximumFractionDigits:n<1?6:2}).format(n);
const compact=(n:number)=>Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(n);
const scoreText=(n:number|null)=>n==null?'Not rated':n.toFixed(1);
const rank=(lead:RadarLead)=>lead.verified?.featuredScore??0;

function GradeCard({lead}:{lead:RadarLead}){
  const v=lead.verified;
  if(!v||v.featuredScore<80)return null;
  const swingApproved=v.swing!=null&&v.swing>=90&&v.tradeStatus==='Qualified Trade';
  return <article className="radarLead">
    <div className="radarLeadTop">
      <div><span className="radarTicker">{lead.symbol}</span><span className="radarTag">Full-model screened</span></div>
      <div className="radarGrade"><strong>{v.featuredScore.toFixed(1)}/100</strong><small>{v.featuredModel}</small></div>
    </div>
    <div className={v.featuredScore>=95?'radarVerdict elite':v.featuredScore>=90?'radarVerdict strong':'radarVerdict watch'}>{v.verdict}{swingApproved?' · Conditional swing plan available':' · Research first'}</div>
    <p className="radarExplanation">{v.explanation}</p>
    <div className="radarBusinessLabel"><span>Company strength (excludes share price)</span><strong>{scoreText(v.business??null)}</strong></div>
    <div className="radarModelScores">
      <div><span>Investment at price</span><strong>{scoreText(v.core)}</strong></div>
      <div><span>Active growth</span><strong>{scoreText(v.growth)}</strong></div>
      <div><span>Asymmetric</span><strong>{scoreText(v.asymmetric)}</strong></div>
      <div><span>Swing trade</span><strong>{scoreText(v.swing)}</strong></div>
    </div>
    <div className="radarNumbers">
      <div><span>Latest closing price</span><strong>{money(lead.close)}</strong></div>
      <div><span>Prior-session change</span><strong className={lead.changePercent>=0?'radarUp':'radarDown'}>{lead.changePercent>=0?'+':''}{lead.changePercent.toFixed(2)}%</strong></div>
      <div><span>Share volume vs previous session</span><strong>{lead.volumeRatio.toFixed(2)}×</strong></div>
      <div><span>Daily dollar activity</span><strong>{compact(lead.dollarVolume)}</strong></div>
    </div>
    <div className="radarLeadNotes">
      <div><b>Why it appeared in the original screen</b>{lead.reasons.slice(0,2).map((t,i)=><p key={i}>✓ {t}</p>)}</div>
      <div><b>Important cautions</b>{lead.cautions.slice(0,2).map((t,i)=><p key={i}>⚠ {t}</p>)}</div>
    </div>
    <div className="radarActions"><span>Checked against stock scoring models. Data as of {v.evidenceAsOf}. Confirm prices and risks before acting.</span><a href={`/research?ticker=${encodeURIComponent(lead.symbol)}`}>See full analysis →</a></div>
  </article>;
}
export default function OpportunityRadar(){
  const [report,setReport]=useState<RadarReport|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [grade,setGrade]=useState<Grade>('all');
  useEffect(()=>{
    let open=true;
    async function load(){
      try{
        const resp=await fetch('/api/radar');
        const body=await resp.json();
        if(!resp.ok)throw new Error(body.error||'Unable to obtain the latest screening report.');
        if(open)setReport(body);
      }catch(e:any){if(open)setError(String(e?.message||'Radar unavailable'))}
      finally{if(open)setLoading(false)}
    }
    void load();
    return ()=>{open=false};
  },[]);
  const featured=useMemo(()=>{
    if(!report?.review)return [];
    const seen=new Set<string>();
    return Object.values(report.categories)
      .flat()
      .filter(x=>{
        if(!x.verified||x.verified.featuredScore<80||seen.has(x.symbol))return false;
        seen.add(x.symbol);return true;
      }).sort((a,b)=>rank(b)-rank(a));
  },[report]);
  const selected=featured.filter(x=>grade==='all'||(grade==='strong'?rank(x)>=90:rank(x)<90));
  const reviewed=report?.review;
  const totalScored=reviewed?.reviewed??0;
  const strong=featured.filter(x=>rank(x)>=90).length;
  const watch=featured.filter(x=>rank(x)>=80&&rank(x)<90).length;
  const hasData=!!report;
  return <main className="shell">
    <header className="top"><div><a className="radarBrand" href="/">MarketClarity</a><div className="tag">Complex analysis underneath. Simple answers on top.</div></div><a className="radarHome" href="/research">← Stock Analyzer</a></header>
    <section className="hero panel radarHero"><div>
      <span className="eyebrow">Daily Opportunity Radar · Quality first</span>
      <h1>Only show what passes the screen.</h1>
      <p>High trading volume doesn't make a good trade. We search for activity, then check the actual investment and trading scores. Only stocks scoring <strong>80 or higher</strong> in a verified model can appear as featured research ideas.</p>
      <div className="radarStatus"><b>95+ Elite · 90+ Strong · 80+ Research Watch</b><span>No forced recommendations. An 80–89 rating is not a buy signal or an approved trade plan.</span></div>
    </div><div className="heroSide"><div className="bigLabel">Market discipline</div><b>Fewer picks.<br/>Better explanations.</b><p>Below-80 and unverified tickers stay off the featured list, even if price action was exciting.</p></div></section>
    {loading&&<section className="panel radarLoading"><h3>Reviewing the latest available report…</h3><p>Checking research scores, available evidence and market-data dates.</p></section>}
    {error&&<section className="panel radarError"><h3>Screening report unavailable</h3><p>{error}</p><p>This is a provider or research-coverage issue, not evidence that the market has no opportunities. <a href="/">Individual stock analysis is still available</a>.</p></section>}
    {hasData&&report&&<>
      <section className="panel radarOverview">
        <div className="radarOverviewHeading"><div><span className="eyebrow">Most recent completed market session</span><h3>{report.reportDate}</h3><p className="tiny">Compared against {report.comparisonDate} · End-of-day prices, not live premarket quotes</p></div><div className="radarLastUpdated">Computed {new Date(report.generatedAt).toLocaleString()}</div></div>
        <div className="radarStats">
          <div><span>Daily symbols observed</span><b>{report.scanned.toLocaleString()}</b></div>
          <div><span>Fundamentally and technically reviewed</span><b>{totalScored}</b></div>
          <div><span>Scored 90+</span><b>{strong}</b></div>
          <div><span>Scored 80–89.9</span><b>{watch}</b></div>
        </div>
        {report.marketPulse&&<div className="radarPulse">
          <div><span>Liquid stocks advancing</span><strong>{report.marketPulse.percentageAdvancing.toFixed(1)}%</strong><small>{report.marketPulse.advancing.toLocaleString()} higher vs. {report.marketPulse.declining.toLocaleString()} lower · Last session only</small></div>
          {report.marketPulse.indexes.map(x=><div key={x.symbol}><span>{x.symbol} · Last close</span><strong>{money(x.close)}</strong><small>{x.dayChangePercent>=0?'+':''}{x.dayChangePercent.toFixed(2)}% during that session</small></div>)}
        </div>}
        {reviewed?<div className="radarReviewStatus">
          <h3>What happened to the other stocks?</h3>
          <p>{reviewed.message}</p>
          <p className="tiny">Reviewed: {reviewed.reviewed} · Below 80: {reviewed.below80} · Insufficient evidence: {reviewed.insufficientData} · Provider/research errors: {reviewed.failures}. Another {reviewed.queued} activity leads have not received the full-model check. This is a LIMITED sample, not the whole market.</p>
        </div>:<div className="radarReviewStatus"><h3>Qualification data unavailable</h3><p>We are not displaying activity-only tickers as investment picks until their 80+ threshold can be verified.</p></div>}
      </section>
      <section className="panel radarResults">
        <span className="eyebrow">Verified research candidates only</span>
        <h3>Today's featured watchlist</h3>
        <nav className="radarTabs" aria-label="Filter candidate quality">
          <button className={grade==='all'?'selected':''} onClick={()=>setGrade('all')}>All 80+ <span>{featured.length}</span></button>
          <button className={grade==='strong'?'selected':''} onClick={()=>setGrade('strong')}>Strong / Elite (90+) <span>{strong}</span></button>
          <button className={grade==='watch'?'selected':''} onClick={()=>setGrade('watch')}>Research Watch (80–89) <span>{watch}</span></button>
        </nav>
        {selected.length>0?<div className="radarGrid">{selected.map(lead=><GradeCard key={lead.symbol} lead={lead}/>)}</div>:
          <div className="radarNone">
            <h3>{grade==='all'?'No verified 80+ opportunities surfaced in this review.':grade==='strong'?'No reviewed stocks scored 90+ in this category.':'No reviewed stocks scored 80–89.9.'}</h3>
            <p>We didn't lower the threshold or promote a stock just because it traded heavily. <strong>This does not mean no worthwhile stock exists today.</strong> It means the candidates evaluated with the current data access did not meet this category's standard.</p>
            <p className="tiny">Value isn't always a buy signal. A disciplined research platform should also explain when its screening results don't justify an entry. The market-participation data and review statistics above remain available regardless of featured results.</p>
          </div>}
      </section>
      <section className="panel radarLimits"><span className="eyebrow">Transparent methodology</span><h3>How MarketClarity separates attention from opportunity</h3>
        <div className="radarSteps">
          <div><b>1 · Market-wide activity scan</b><p>Looks for liquid stocks with notable price and volume changes, using completed daily trading sessions.</p></div>
          <div><b>2 · Verify the model score</b><p>Runs stock-price history, SEC financial data and the same four MarketClarity scoring models on a small research sample.</p></div>
          <div><b>3 · Only feature verified 80+</b><p>An 80+ investment grade is not necessarily a good short-term trade. Entry/exit plans require their own separate swing-trade approval.</p></div>
        </div>
        <p className="tiny">The free personal-use market data plan limits how many candidates can be deeply reviewed each session. A truly comprehensive daily 80+ ranking requires licensed market data, scheduled processing, durable storage and historical validation. Leveraged funds require a separate model and current intraday data for day-trade entries.</p>
        <details><summary>View additional limitations</summary>{report.limits.map(x=><p className="tiny" key={x}>{x}</p>)}</details>
      </section>
      <footer>Educational screening only · No guaranteed returns · Source: {report.source} · Market data license required for commercial redistribution.</footer>
    </>}
  </main>;
}
