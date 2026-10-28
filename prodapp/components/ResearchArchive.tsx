'use client';
import {useEffect,useState} from 'react';
import {archiveToCsv,createArchiveEntry,importBackup,upsertArchive,ARCHIVE_VERSION,MAX_ARCHIVE_ENTRIES,type ArchiveEntry,type ArchiveSource,type SavedStock} from '@/lib/research-archive';
const KEY='marketclarity-research-archive-v1';
function downloadFile(filename:string,body:string,mime:string){
 const blob=new Blob([body],{type:mime});
 const href=URL.createObjectURL(blob);
 const anchor=document.createElement('a');anchor.href=href;anchor.download=filename;document.body.appendChild(anchor);anchor.click();anchor.remove();
 window.setTimeout(()=>URL.revokeObjectURL(href),1000);
}
export default function ResearchArchive({
 result,saved,restoreSaved
}:{result:ArchiveSource|null;saved:SavedStock[];restoreSaved:(next:SavedStock[])=>void}){
 const [records,setRecords]=useState<ArchiveEntry[]>([]);
 const [ready,setReady]=useState(false);
 const [status,setStatus]=useState('');
 const [filter,setFilter]=useState('');
 useEffect(()=>{
  try{
   const raw=window.localStorage.getItem(KEY);
   if(raw){const parsed=JSON.parse(raw);if(Array.isArray(parsed)){
    const valid=parsed.filter((x:ArchiveEntry)=>x&&typeof x.id==='string'&&Array.isArray(x.selected)&&Array.isArray(x.benchmarks));
    setRecords(valid.slice(0,MAX_ARCHIVE_ENTRIES));
   }}
  }catch{setStatus('The browser archive could not be read. Export a backup before clearing browser data.')}
  setReady(true);
 },[]);
 useEffect(()=>{
  if(!ready||!result)return;
  setRecords(old=>upsertArchive(old,createArchiveEntry(result,new Date().toISOString())));
 },[result,ready]);
 useEffect(()=>{
  if(!ready)return;
  try{window.localStorage.setItem(KEY,JSON.stringify(records));}
  catch{setStatus('Your browser storage is full or unavailable. Export a JSON backup before leaving.')}
 },[records,ready]);
 function backup(){
  const data={version:ARCHIVE_VERSION,exportedAt:new Date().toISOString(),entries:records,shortlist:saved};
  downloadFile('marketclarity-research-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(data,null,2),'application/json;charset=utf-8');
  setStatus('JSON backup downloaded, including your saved stocks. Keep it somewhere outside this browser.');
 }
 function csv(){
  if(!records.length)return;
  downloadFile('marketclarity-research-'+new Date().toISOString().slice(0,10)+'.csv',archiveToCsv(records),'text/csv;charset=utf-8');
  setStatus('CSV exported for Google Sheets. This is an export, not an automatic Google account sync.');
 }
 async function load(e:React.ChangeEvent<HTMLInputElement>){
  const f=e.target.files?.[0];e.target.value='';if(!f)return;
  try{
   if(f.size>3_000_000)throw new Error('Backup file too large (3 MB maximum).');
   const value=importBackup(JSON.parse(await f.text()));
   setRecords(old=>{
    let combined=old;
    for(const item of value.entries)combined=upsertArchive(combined,item);
    return combined;
   });
   restoreSaved([...new Map([...saved,...value.shortlist].map(x=>[x.ticker+'|'+x.date+'|'+x.mode,x])).values()].slice(0,80));
   setStatus('Backup imported. Entries with the same date, mode and review window were merged.');
  }catch(err){setStatus(err instanceof Error?'Import rejected: '+err.message:'Could not read the backup.');}
 }
 function remove(id:string){
  if(!window.confirm('Delete this archived research snapshot? Export a backup first if you want to preserve it.'))return;
  setRecords(old=>old.filter(x=>x.id!==id));
  setStatus('Research snapshot deleted from this browser.');
 }
 function trim(days:number){
  const border=Date.now()-days*86400000;
  const older=records.filter(x=>{const time=Date.parse(x.capturedAt);return Number.isFinite(time)&&time<border;}).length;
  if(!older){setStatus('No records older than '+days+' days.');return;}
  if(!window.confirm('Permanently remove '+older+' archived snapshots older than '+days+' days from this browser?'))return;
  setRecords(old=>old.filter(x=>{const time=Date.parse(x.capturedAt);return !Number.isFinite(time)||time>=border;}));
  setStatus(older+' old research snapshots deleted.');
 }
 function clearAll(){
  if(!records.length)return;
  if(!window.confirm('Delete ALL archived research snapshots in this browser? This cannot be undone without a backup. Your separate tracked-stock shortlist will remain.'))return;
  setRecords([]);
  setStatus('All archived research snapshots cleared in this browser.');
 }
 const shown=records.filter(x=>(x.session+' '+x.mode+' '+x.horizon+' '+x.selected.map(s=>s.ticker).join(' ')).toUpperCase().includes(filter.trim().toUpperCase())).slice(0,30);
 return <section className="panel opArchivePanel" style={{marginTop:18}}>
  <div className="opSectionHeading">
   <div><span className="eyebrow">Browser-based research records</span><h2>Research archive</h2></div>
   <span className="opMiniCount">{records.length} / {MAX_ARCHIVE_ENTRIES} snapshots</span>
  </div>
  <p className="muted">Every successful Opportunity Lab screen automatically saves a dated snapshot in this browser, including candidate ranks, ETF returns, missed stocks and the model version. Re-running the same session and review window refreshes that record. No control token is stored.</p>
  <div className="opArchiveActions">
   <button onClick={backup} className="btBtn">Export JSON backup</button>
   <button onClick={csv} disabled={!records.length} className="btBtn secondaryBtn">Export CSV for Google Sheets</button>
   <label className="opImportAction">Import JSON backup<input aria-label="Import a MarketClarity JSON research backup" type="file" accept=".json,application/json" onChange={load}/></label>
  </div>
  <p className="backtestInfo">A browser archive is not a cloud backup: clearing site data, switching devices or using private browsing can erase it. Download JSON backups regularly. CSV exports can be imported into Google Sheets but do not sync automatically.</p>
  {status&&<p className="opArchiveStatus" role="status">{status}</p>}
  {records.length>0&&<>
   <div className="opArchiveTools"><label htmlFor="opArchiveFilter">Find a saved screening date or ticker</label>
    <input className="btInput" id="opArchiveFilter" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="e.g. SOFI, 2026-10-26, swing"/></div>
   <div className="opArchiveList">
    {shown.length?shown.map(x=><div key={x.id} className="opArchiveItem">
     <div><strong>{x.session} · {x.mode==='day'?'Day':'Swing'} · {x.horizon}</strong>
      <span>Captured {new Date(x.capturedAt).toLocaleString()} · {x.selected.length} screened stocks · {x.benchmarks.length} ETFs · {x.complete?'Completed':'Partial'} observation</span>
      <span>Screened: {x.selected.map(s=>s.ticker).join(', ')||'None'}</span>
     </div><button className="opRemoveArchive" onClick={()=>remove(x.id)}>Delete</button>
    </div>):<p className="muted">No saved records match that search.</p>}
   </div>
   {records.length>30&&<p className="backtestInfo">Showing the 30 most recent matching records; CSV and JSON exports include every saved record.</p>}
   <div className="opArchiveCleanup">
    <button onClick={()=>trim(30)}>Delete records older than 30 days</button>
    <button onClick={()=>trim(90)}>Delete records older than 90 days</button>
    <button className="opDanger" onClick={clearAll}>Clear all research records</button>
   </div>
  </>}
 </section>;
}
