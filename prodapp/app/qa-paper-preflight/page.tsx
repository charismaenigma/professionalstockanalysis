import {runPaperPreflight} from '@/lib/paper/preflight';
import {runPaperScan} from '@/lib/paper/engine';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export default async function Page(){
 if(process.env.VERCEL_ENV!=='preview')return <main><h1>Preview only</h1></main>;
 try{
  const r=await runPaperPreflight();
  const scan=await runPaperScan(false);
  return <main><h1>Paper preflight diagnostic</h1>
   <p>Broker read: success. Preflight is read-only. Market open: {String(r.marketOpen)}.</p>
   <p>Checks: {r.checkCount.pass} pass; {r.checkCount.warning} warnings; {r.checkCount.block} blocks.</p>
   <p>Watchlist count: {r.watchlist.length}. Slots: {r.budget?.slotCount??0}; active symbols: {r.budget?.activeSymbols.length??0}; remaining sleeve available: {r.budget&&r.budget.remainingSleeveValue>0?'yes':'no'}.</p>
   <p>Conditions: {r.checks.map(x=>x.id+':'+x.status).join('; ')}</p>
   <p>Manual orders enabled: {String(r.manualPaperOrdersEnabled)}; unattended enabled: {String(r.automaticPaperOrdersEnabled)}.</p>
   <p>Dry-run scan mode: {scan.mode}; submitted: {scan.submitted}; event count: {scan.events.length}; first outcome: {scan.events[0]?.outcome??'none'}.</p>
   <p>Temporary restricted-to-preview diagnostic. No account identities, balances, symbols, tokens, or position details displayed.</p>
  </main>;
 }catch(e){return <main><h1>Paper preflight diagnostic failed</h1><p>{e instanceof Error?e.message.slice(0,120):'Unknown issue'}</p></main>}
}