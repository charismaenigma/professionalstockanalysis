import {runPaperScan} from '@/lib/paper/engine';
import {paperConfigured,paperOrdersEnabled,autoScanEnabled} from '@/lib/paper/alpaca';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export default async function PaperConnectionDiagnostic(){
 let result='Not run';
 let info='No broker account information is displayed.';
 let mode='read-only';
 if(process.env.VERCEL_ENV!=='preview')result='Disabled outside preview';
 else if(!paperConfigured())result='Paper credentials missing in current deployment';
 else try{
   const scan=await runPaperScan(false);
   result='Read-only Alpaca paper connectivity: SUCCESS';
   info='Paper broker account, market clock, positions, open/recent orders, and watchlist were read. Market currently '+(scan.marketOpen?'open':'closed')+'. Preview events: '+scan.events.length+'. Submitted orders: '+scan.submitted+'.';
 }catch(e){
   result='Read-only Alpaca paper connectivity: FAILED';
   const message=e instanceof Error?e.message:'Unknown error';
   info=message.replace(/APCA-API-KEY-ID|APCA-API-SECRET-KEY|Bearer [^ ]+/gi,'[redacted]').slice(0,160);
 }
 return <main className="shell"><section className="panel"><h1>{result}</h1><p>{info}</p><p>Manual order submissions: {paperOrdersEnabled()?'enabled':'disabled'}; unattended paper orders: {autoScanEnabled()?'enabled':'disabled'}.</p><p className="muted">Temporary preview-only diagnostic. No order submission occurs; automatically removed after readback.</p></section></main>;
}