/** Browser-only research archive: deliberately excludes credentials and provider keys.
 * This module is pure and can be verified without a browser.
 */
export const ARCHIVE_VERSION=1;
export const MAX_ARCHIVE_ENTRIES=120;
export type SavedStock={ticker:string;date:string;mode:'day'|'swing';rank:number|null;score:number|null};
export type ReturnRow={ticker:string;returnPct:number|null;vsVooPctPoints:number|null};
export type BenchmarkRow=ReturnRow&{sector:string};
export type ArchiveSource={
 requestedSession:string;mode:'day'|'swing';horizon:'1d'|'1w'|'1m';modelVersion:string;
 scanUniverse:number;
 selected:{ticker:string;rank:number;score:number}[];
 audit:null|{missed:{ticker:string;reason:string}[];observedPositiveRate:number|null;capturedLeaders:number;leaderCount:number};
 benchmarks:null|{endDate:string;complete:boolean;benchmarks:BenchmarkRow[];tracked:ReturnRow[]};
};
export type ArchiveEntry={
 id:string;capturedAt:string;session:string;mode:'day'|'swing';horizon:'1d'|'1w'|'1m';
 modelVersion:string;reviewEnd:string|null;complete:boolean;scanUniverse:number;
 selected:{ticker:string;rank:number;score:number}[];benchmarks:BenchmarkRow[];
 stocks:ReturnRow[];missed:{ticker:string;reason:string}[];
 observedPositiveRate:number|null;capturedLeaders:number|null;leaderCount:number|null;
};
export type ArchiveBackup={version:1;exportedAt:string;entries:ArchiveEntry[];shortlist:SavedStock[]};
export function createArchiveEntry(source:ArchiveSource,now:string):ArchiveEntry{
 const benchmark=source.benchmarks;
 return {
  id:[source.requestedSession,source.mode,source.horizon].join('|'),
  capturedAt:now,session:source.requestedSession,mode:source.mode,horizon:source.horizon,
  modelVersion:source.modelVersion,reviewEnd:benchmark?.endDate??null,complete:benchmark?.complete??false,
  scanUniverse:source.scanUniverse,
  selected:source.selected.map(x=>({ticker:x.ticker,rank:x.rank,score:x.score})),
  benchmarks:(benchmark?.benchmarks||[]).map(x=>({...x})),
  stocks:(benchmark?.tracked||[]).map(x=>({...x})),
  missed:(source.audit?.missed||[]).map(x=>({ticker:x.ticker,reason:x.reason})),
  observedPositiveRate:source.audit?.observedPositiveRate??null,
  capturedLeaders:source.audit?.capturedLeaders??null,leaderCount:source.audit?.leaderCount??null
 };
}
export function upsertArchive(entries:ArchiveEntry[],record:ArchiveEntry):ArchiveEntry[]{
 return [record,...entries.filter(x=>x.id!==record.id)]
  .sort((a,b)=>b.capturedAt.localeCompare(a.capturedAt))
  .slice(0,MAX_ARCHIVE_ENTRIES);
}
export function isArchiveEntry(value:unknown):value is ArchiveEntry{
 if(!value||typeof value!=='object')return false;
 const v=value as Partial<ArchiveEntry>;
 return typeof v.id==='string'&&v.id.length<100&&typeof v.capturedAt==='string'&&
 /^\d{4}-\d{2}-\d{2}$/.test(v.session||'')&&['day','swing'].includes(v.mode||'')&&
 ['1d','1w','1m'].includes(v.horizon||'')&&typeof v.modelVersion==='string'&&
 Array.isArray(v.selected)&&v.selected.length<=25&&v.selected.every(x=>/^[A-Z0-9.]{1,10}$/.test(x.ticker))&&
 Array.isArray(v.benchmarks)&&v.benchmarks.length<=20&&v.benchmarks.every(x=>/^[A-Z0-9.]{1,10}$/.test(x.ticker))&&
 Array.isArray(v.stocks)&&v.stocks.length<=50&&v.stocks.every(x=>/^[A-Z0-9.]{1,10}$/.test(x.ticker))&&
 Array.isArray(v.missed)&&v.missed.length<=30&&v.missed.every(x=>/^[A-Z0-9.]{1,10}$/.test(x.ticker));
}
export function importBackup(raw:unknown):ArchiveBackup{
 if(!raw||typeof raw!=='object')throw new Error('Not a MarketClarity research backup.');
 const b=raw as Partial<ArchiveBackup>;
 if(b.version!==ARCHIVE_VERSION||!Array.isArray(b.entries)||!Array.isArray(b.shortlist)||b.entries.length>500)
  throw new Error('Unsupported or invalid MarketClarity research backup.');
 if(!b.entries.every(isArchiveEntry)||!b.shortlist.every(x=>x&&/^[A-Z0-9.]{1,10}$/.test(x.ticker)&&/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&['day','swing'].includes(x.mode))||b.shortlist.length>100)
  throw new Error('Backup contains invalid or unsupported records.');
 return {version:1,exportedAt:String(b.exportedAt||''),entries:b.entries.slice(0,MAX_ARCHIVE_ENTRIES),shortlist:b.shortlist.slice(0,80)};
}
const quote=(value:unknown)=>'"'+String(value??'').replace(/"/g,'""')+'"';
export function archiveToCsv(entries:ArchiveEntry[]):string{
 const headers=['Captured at','Screen date','Mode','Review','Review end','Completed','Record type','Ticker','Sector / note','Screener rank','Screener score','Price return %','vs VOO (percentage points)','Model version'];
 const rows=entries.flatMap(e=>{
  const base=[e.capturedAt,e.session,e.mode,e.horizon,e.reviewEnd??'',e.complete?'yes':'no'];
  const benchmarks=e.benchmarks.map(x=>[...base,'Benchmark',x.ticker,x.sector,'','',x.returnPct,x.vsVooPctPoints,e.modelVersion]);
  const stockMap=new Map(e.stocks.map(x=>[x.ticker,x]));
  const picks=e.selected.map(x=>{const r=stockMap.get(x.ticker);return [...base,'Screened stock',x.ticker,'',x.rank,x.score,r?.returnPct??null,r?.vsVooPctPoints??null,e.modelVersion]});
  const missed=e.missed.map(x=>{const r=stockMap.get(x.ticker);return [...base,'Missed stock',x.ticker,x.reason,'','',r?.returnPct??null,r?.vsVooPctPoints??null,e.modelVersion]});
  return [...benchmarks,...picks,...missed];
 });
 return '\ufeff'+[headers,...rows].map(row=>row.map(quote).join(',')).join('\r\n');
}
