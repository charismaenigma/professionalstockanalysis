import {runPremarketResearch} from '@/lib/premarket';
import {dataGet} from '@/lib/paper/alpaca';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export default async function Check(){
 if(process.env.VERCEL_ENV!=='preview')return <main><h1>Not available</h1></main>;
 try{
  const r=await runPremarketResearch('early');
  return <main><h1>Premarket read-only integration test: PASS</h1>
    <p>Feed IEX; sampled {r.candidateUniverse}; fresh {r.freshCandidates}; ETF count {r.sectors.length}; headline count {r.news.length}; prior session exists: {String(!!r.previousSession)}.</p>
    <p>Read only {String(r.readOnly)}; orders submitted: {r.ordersSubmitted}; phase {r.phase}.</p>
    <p>Warnings count {r.warnings.length}; no tickers or private account information displayed.</p>
    <p>Delayed SIP connection: {await dataGet<{snapshots?:Record<string,{latestTrade?:{p:number;t:string}}>} >('/v2/stocks/snapshots?symbols=AAPL,VTI&feed=delayed_sip')
      .then(x=>'accessible; samples='+Object.keys(x.snapshots||{}).length+
        '; latest trade present='+String(Boolean(x.snapshots?.AAPL?.latestTrade?.p)))
      .catch(()=> 'not available under current Alpaca data subscription')}</p>
  </main>;
 }catch(e){
  return <main><h1>Premarket read-only integration test: FAILED</h1>
    <p>Cause category: {e instanceof Error?e.message.replace(/[^A-Za-z0-9,.! ]/g,' ').slice(0,110):'unknown'}</p>
  </main>;
 }
}