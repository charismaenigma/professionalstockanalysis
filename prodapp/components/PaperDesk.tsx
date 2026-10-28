'use client';
import {useEffect,useState} from 'react';

type Position = {symbol:string;qty:string;avg_entry_price:string;current_price:string;unrealized_pl:string;unrealized_plpc:string};
type Order = {id:string;symbol:string;side:string;qty:string;status:string;created_at:string;filled_avg_price?:string|null};
type CurvePoint = {timestamp:number;equity:number};
type PaperBudget={tradingSleeveValue:number;reservedCoreValue:number;slotMaxValue:number;usedSleeveValue:number;remainingSleeveValue:number;usedPctOfSleeve:number;slotCount:2|3;availableSlots:number;riskBudgetPerTrade:number;activeSymbols:string[];coreSymbol:string};
type ClosedTrade={symbol:string;closedAt:string;qty:number;entry:number;exit:number;pnl:number;returnPct:number};
type Preflight={asOf:string;marketOpen:boolean;readOnly:true;readyForPreview:boolean;readyForManualPaperOrder:boolean;coreVooValue:number;checkCount:{pass:number;warning:number;block:number};checks:Array<{id:string;status:'pass'|'warning'|'block';detail:string}>};
type Dashboard = {
  flags: {configured:boolean;liveResearch:boolean;ordersEnabled:boolean;autoEnabled:boolean;dataFeed:string};
  account?: {status:string;equity:number;cash:number;lastEquity:number};
  watchlist:string[];
  budget?:PaperBudget;
  trades?:ClosedTrade[];
  positions:Position[];
  orders:Order[];
  history:CurvePoint[];
  metrics?: {closedTrades:number;winRate:number|null;realizedPnl:number;averagePnl:number|null;averageTradeReturnPct:number|null;bestTradeReturnPct:number|null;worstTradeReturnPct:number|null;profitFactor:number|null;maxDrawdownPct:number;sampleNotice:string}|null;
};
type Scan = {asOf:string;mode:string;submitted:number;marketOpen:boolean;budget?:PaperBudget;events:Array<{symbol:string;outcome:string;message:string;score?:number;qty?:number}>};
const money=(x:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(x);
const percent=(x:number|null|undefined)=>x==null?'—':x.toFixed(1)+'%';

function EquityChart({points}:{points:CurvePoint[]}) {
  if(points.length<2)return <p className="muted">An equity chart appears after the paper account accumulates history.</p>;
  const values=points.map(p=>p.equity);
  const low=Math.min(...values), high=Math.max(...values);
  const range=Math.max(1,high-low);
  const path=points.map((p,i)=>{
    const x=16+(i/(points.length-1))*668;
    const y=152-((p.equity-low)/range)*122;
    return (i===0?'M':'L')+x.toFixed(1)+','+y.toFixed(1);
  }).join(' ');
  return <div className="equityChart" role="img" aria-label={'Paper account equity chart, from '+money(values[0])+' to '+money(values[values.length-1])}>
    <svg viewBox="0 0 700 175" preserveAspectRatio="none">
      <line x1="16" y1="152" x2="684" y2="152" stroke="#29435e" />
      <line x1="16" y1="30" x2="684" y2="30" stroke="#29435e" strokeDasharray="4 5" />
      <path d={path} fill="none" stroke="#5bd5e7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    <div className="chartLegend"><span>{new Date(points[0].timestamp*1000).toLocaleDateString()}</span><b>{money(values[values.length-1])}</b><span>{new Date(points[points.length-1].timestamp*1000).toLocaleDateString()}</span></div>
  </div>;
}
export default function PaperDesk(){
  const [token,setToken]=useState('');
  const [dashboard,setDashboard]=useState<Dashboard|null>(null);
  const [watchInput,setWatchInput]=useState('');
  const [scan,setScan]=useState<Scan|null>(null);
  const [preflight,setPreflight]=useState<Preflight|null>(null);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [screenerPicks,setScreenerPicks]=useState<string[]>([]);
  const [screenDate,setScreenDate]=useState('');
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const supplied=params.get('candidates')||'';
    const candidates=[...new Set(supplied.toUpperCase().split(',').map(x=>x.trim()).filter(x=>/^[A-Z]{1,5}(?:[.][A-Z])?$/.test(x)))].slice(0,5);
    setScreenerPicks(candidates);
    const date=params.get('screenDate')||'';
    if(/^\d{4}-\d{2}-\d{2}$/.test(date))setScreenDate(date);
  },[]);
  const request=async(path:string,method='GET',body?:unknown)=>{
    const response=await fetch(path,{method,headers:{'x-marketclarity-token':token,'Content-Type':'application/json'},
      body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Request failed');
    return result;
  };
  async function refresh(){
    setBusy('refresh');setError('');
    try{setDashboard(await request('/api/paper/status'));}catch(e){setError(e instanceof Error?e.message:'Unable to connect');}
    finally{setBusy('');}
  }
  async function inspectReadiness(){
    setBusy('preflight');setError('');setPreflight(null);
    try{setPreflight(await request('/api/paper/preflight'));}
    catch(e){setError(e instanceof Error?e.message:'Preflight check failed');}
    finally{setBusy('');}
  }
  async function saveWatchlist(symbols:string[]){
    setBusy('watchlist');setError('');
    try{
      const data=await request('/api/paper/watchlist','PUT',{symbols});
      setDashboard(old=>old?{...old,watchlist:data.symbols}:old);setWatchInput('');
    }catch(e){setError(e instanceof Error?e.message:'Unable to save watchlist');}
    finally{setBusy('');}
  }
  async function run(execute:boolean){
    setBusy('scan');setError('');setScan(null);
    try{setScan(await request('/api/paper/run','POST',{execute}));await refresh();}
    catch(e){setError(e instanceof Error?e.message:'Scan failed');}
    finally{setBusy('');}
  }
  return <section className="panel paperDesk" id="paper-trading">
    <div className="paperHeading"><div><span className="eyebrow">New · Paper-trading lab</span><h3>Measure the strategy. Never risk real money.</h3>
      <p className="muted">Long-only swing scanner, live-market gating, simulated bracket orders and account performance. Real brokerage orders are not supported.</p></div>
      <span className="paperBadge">PAPER ONLY</span></div>
    {!dashboard&&<div className="paperAuth">
      <label htmlFor="paperToken">Control token</label>
      <input id="paperToken" type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)} placeholder="Enter your private dashboard token"/>
      <button disabled={!token||!!busy} onClick={refresh}>{busy?'Connecting…':'Connect dashboard'}</button>
      <p className="tiny">This token protects your paper-account data and controls. It stays in this page's memory and is not your broker API secret.</p>
    </div>}
    {error&&<div className="error" role="alert">{error}</div>}
    {dashboard&&<>
      <div className="paperStatus"><span className={dashboard.flags.configured?'statusOk':'statusOff'}>{dashboard.flags.configured?'● Alpaca paper connected':'● Paper broker not connected'}</span>
        <span>{dashboard.flags.liveResearch?'Live research configured':'Live research unavailable'}</span>
        <span>{dashboard.flags.ordersEnabled?'Paper orders enabled':'Paper order submissions disabled'}</span>
        <span>{dashboard.flags.autoEnabled?'Scheduled scans enabled':'Scheduled scans paused'}</span></div>
      {!dashboard.flags.configured&&<p className="warningBar">Set ALPACA_PAPER_KEY and ALPACA_PAPER_SECRET on the server to enable the simulator. MASSIVE_API_KEY is also required before any trading scan.</p>}
      {dashboard.budget&&<div className="paperBudget">
        <div className="paperBudgetHeading"><h4>95 / 5 paper allocation · shared cap</h4><span>Swing-trading research</span></div>
        <div className="paperBudgetBar" role="img" aria-label="5 percent maximum active paper-trading sleeve">
          <div className="paperBudgetCore"></div><div className="paperBudgetSleeve"></div>
        </div>
        <div className="paperBudgetDetails">
          <div><span>VOO core reservation (95%)</span><strong>{money(dashboard.budget.reservedCoreValue)}</strong></div>
          <div><span>Active trading sleeve (5%)</span><strong>{money(dashboard.budget.tradingSleeveValue)}</strong></div>
          <div><span>Committed active positions and buys</span><strong>{money(dashboard.budget.usedSleeveValue)}</strong></div>
          <div><span>Remaining active sleeve</span><strong>{money(dashboard.budget.remainingSleeveValue)}</strong></div>
          <div><span>Maximum per position ({dashboard.budget.slotCount} slots)</span><strong>{money(dashboard.budget.slotMaxValue)}</strong></div>
          <div><span>Maximum risk per entry (0.25% of sleeve)</span><strong>{money(dashboard.budget.riskBudgetPerTrade)}</strong></div>
        </div>
        <p className="tiny">VOO is reserved conceptually; MarketClarity does not automatically buy it. Existing VOO holdings are treated as core. Other paper positions and open buy orders count toward the combined 5% cap, even if manually placed.</p>
        {dashboard.budget.usedPctOfSleeve>100&&<p className="warningBar">Active paper allocation is already above 5%. Additional entries are blocked.</p>}
      </div>}
      <div className="paperStats">
        <div><span>Paper equity</span><b>{dashboard.account?money(dashboard.account.equity):'—'}</b></div>
        <div><span>Realized P/L · recent fills</span><b className={(dashboard.metrics?.realizedPnl??0)<0?'negative':'positive'}>{dashboard.metrics?money(dashboard.metrics.realizedPnl):'—'}</b></div>
        <div><span>Win rate</span><b>{percent(dashboard.metrics?.winRate)}</b></div>
        <div><span>Average return per closed trade</span><b>{percent(dashboard.metrics?.averageTradeReturnPct)}</b></div>
        <div><span>Maximum drawdown · 3 months</span><b>{dashboard.metrics?percent(dashboard.metrics.maxDrawdownPct):'—'}</b></div>
        <div><span>Profit factor</span><b>{dashboard.metrics?.profitFactor==null?'—':dashboard.metrics.profitFactor.toFixed(2)+'×'}</b></div>
        <div><span>Closed trade lots</span><b>{dashboard.metrics?.closedTrades??'—'}</b></div>
      </div>
      <EquityChart points={dashboard.history||[]}/>
      <p className="tiny">{dashboard.metrics?.sampleNotice||'Performance is account-wide; use a dedicated Alpaca paper account for MarketClarity.'} This is simulated performance, not a prediction of live returns.</p>
      <div className="paperColumns">
        <div className="paperPane">
          <h4>Scanner watchlist <span className="muted">({dashboard.watchlist.length}/5)</span></h4>
          <p className="tiny">You choose the stocks. Opportunity Lab candidates are proposals, not orders.</p>
          {screenerPicks.length>0&&<div className="paperScreenSuggestions">
            <p><strong>From Opportunity Lab</strong>{screenDate?' · '+screenDate:''}</p>
            <p className="tiny">{screenerPicks.join(' · ')} · Live swing qualification still applies.</p>
            <button disabled={!!busy||!dashboard.flags.configured} onClick={()=>saveWatchlist([...new Set([...dashboard.watchlist,...screenerPicks])].slice(0,5))}>Add candidates to paper watchlist</button>
          </div>}
          <div className="watchChips">{dashboard.watchlist.map(s=><span key={s}>{s}<button aria-label={'Remove '+s} disabled={!!busy} onClick={()=>saveWatchlist(dashboard.watchlist.filter(x=>x!==s))}>×</button></span>)}</div>
          <form className="watchForm" onSubmit={e=>{e.preventDefault();saveWatchlist([...dashboard.watchlist,watchInput.toUpperCase()])}}>
            <input aria-label="Ticker" placeholder="Ticker, e.g. MSFT" value={watchInput} onChange={e=>setWatchInput(e.target.value.toUpperCase())} maxLength={10}/>
            <button disabled={!!busy||!dashboard.flags.configured||!watchInput.trim()||dashboard.watchlist.length>=5}>Add</button>
          </form>
          <p className="tiny">Feed: {dashboard.flags.dataFeed}. Single-exchange data may miss volume or liquidity elsewhere.</p>
        </div>
        <div className="paperPane">
          <h4>Trading controls</h4>
          <p className="tiny">0.25% of the 5% sleeve at risk per entry · 5% aggregate active exposure · up to {dashboard.budget?.slotCount||3} positions · 1% total-account daily loss circuit breaker. Long-only paper bracket orders.</p>
          <div className="paperButtons">
            <button className="paperRefresh" disabled={!!busy||!dashboard.flags.configured} onClick={inspectReadiness}>Run read-only preflight</button>
            <button disabled={!!busy||!dashboard.flags.configured||!dashboard.flags.liveResearch} onClick={()=>run(false)}>{busy?'Working…':'Preview scan'}</button>
            <button className="paperExecute" disabled={!!busy||!dashboard.flags.ordersEnabled||!dashboard.flags.liveResearch||!dashboard.flags.configured} onClick={()=>run(true)}>Submit qualifying PAPER orders</button>
            <button className="paperRefresh" disabled={!!busy} onClick={refresh}>Refresh</button>
          </div>
          {!dashboard.flags.ordersEnabled&&<p className="tiny">Safe mode: paper submissions are disabled. After checking the account and a dry-run, enabling PAPER_TRADE_ENABLED allows manual simulated orders. Keep PAPER_AUTO_ENABLED off for the initial pilot.</p>}
        </div>
      </div>
      {preflight&&<section className="paperPreflight" aria-label="Paper-trading safety preflight">
         <h4>Broker and strategy preflight · {new Date(preflight.asOf).toLocaleString()}</h4>
         <p className="tiny">Read-only test. {preflight.checkCount.pass} passed · {preflight.checkCount.warning} warnings · {preflight.checkCount.block} blocks. A live signal is not guaranteed even when all checks pass.</p>
         <div className="paperPreflightList">{preflight.checks.map(c=><div className={'paperPreflightRow paperPreflight-'+c.status} key={c.id}><span>{c.status==='pass'?'✓':c.status==='warning'?'!':'×'} {c.id.replaceAll('-',' ')}</span><p>{c.detail}</p></div>)}</div>
         <p className="tiny">VOO core actual holding: {money(preflight.coreVooValue)} (this system never buys VOO automatically).</p>
         <p className="tiny">Live-signal evaluation: {preflight.readyForPreview?'Preflight clear to try a manual preview scan.':'Not fully ready yet.'} Manual orders: {preflight.readyForManualPaperOrder?'Eligible for further review':'Not enabled / not safe yet'}.</p>
       </section>}
      {scan&&<div className="scanResults" role="status"><h4>{scan.mode==='preview'?'Preview results':'Paper scan results'} · {scan.submitted} submitted</h4>
        <p className="tiny">As of {new Date(scan.asOf).toLocaleString()} · Market {scan.marketOpen?'open':'closed'}</p>
        {scan.events.map((event,i)=><div key={i}><b>{event.symbol}</b><span>{event.outcome.toUpperCase()}</span><p>{event.message}{event.score!=null?' · Score '+event.score.toFixed(1):''}</p></div>)}</div>}
      {dashboard.trades?.length?<div className="paperTradeJournal">
        <h4>Recent completed paper trades · price return</h4>
        <div className="tableWrap"><table><thead><tr><th>Stock</th><th>Exit date</th><th>Shares</th><th>Entry</th><th>Exit</th><th>Return</th><th>Paper P/L</th></tr></thead><tbody>
        {dashboard.trades.map((t,i)=><tr key={t.symbol+'|'+t.closedAt+'|'+i}>
          <td>{t.symbol}</td><td>{new Date(t.closedAt).toLocaleDateString()}</td><td>{t.qty}</td><td>{money(t.entry)}</td>
          <td>{money(t.exit)}</td><td className={t.returnPct>=0?'positive':'negative'}>{t.returnPct>=0?'+':''}{percent(t.returnPct)}</td>
          <td className={t.pnl>=0?'positive':'negative'}>{money(t.pnl)}</td>
        </tr>)}</tbody></table></div>
        <p className="tiny">FIFO returns use recent paper fills and exclude additional costs. Alpaca provides only the latest 100 fill activities for this view.</p>
      </div>:null}
      <div className="paperColumns">
        <div className="paperPane"><h4>Open paper positions</h4>
          {!dashboard.positions?.length?<p className="muted">No open paper positions.</p>:<div className="paperRows">{dashboard.positions.map(p=><div key={p.symbol}><b>{p.symbol}</b><span>{p.qty} shares</span><span className={Number(p.unrealized_pl)<0?'negative':'positive'}>{money(Number(p.unrealized_pl))}</span></div>)}</div>}</div>
        <div className="paperPane"><h4>Recent paper orders</h4>
          {!dashboard.orders?.length?<p className="muted">No submitted paper orders yet.</p>:<div className="paperRows">{dashboard.orders.slice(0,8).map(o=><div key={o.id}><b>{o.symbol}</b><span>{o.side} {o.qty}</span><span>{o.status}</span></div>)}</div>}</div>
      </div>
    </>}
  </section>;
}
