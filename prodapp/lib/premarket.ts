import {dataGet,readPaperWatchlist,paperConfigured} from './paper/alpaca';

export type PremarketPhase='early'|'rank'|'final';
export type EvidenceStatus='fresh'|'stale'|'missing';
type Bar={t:string;o:number;h:number;l:number;c:number;v:number};
type Grouped={results?:Array<{T:string;o:number;c:number;v:number}>};
type Snap={latestTrade?:{p:number;t:string};latestQuote?:{ap:number;bp:number;t:string};minuteBar?:{c:number;v:number;t:string};prevDailyBar?:{c:number}};
type SnapResponse={snapshots?:Record<string,Snap>} & Record<string,unknown>;
type BarResponse={bars?:Record<string,Bar[]>;next_page_token?:string|null};
type NewsResponse={news?:Array<{id:number;headline:string;created_at:string;url?:string;symbols?:string[];source?:string}>};
export type PremarketCandidate={
 ticker:string;source:'previous-session'|'watchlist';previousClose:number;
 latestPrice:number|null;gapPct:number|null;gapDollars:number|null;
 quoteAgeMinutes:number|null;tradeAgeMinutes:number|null;bid:number|null;ask:number|null;spreadPct:number|null;
 premarketVolumeIex:number|null;estimatedPremarketDollarVolume:number|null;
 regularSessionVolumeIex:number|null;session:'premarket'|'regular'|'outside';sessionVolumeIex:number|null;
 previousSessionVolume:number;priorDayDollarVolume:number;
 evidence:EvidenceStatus;rank:number|null;score:number|null;liquidity:'pass'|'watch'|'fail';
 newsCount:number;
};
export type PremarketSector={ticker:string;sector:string;gapPct:number|null;evidence:EvidenceStatus};
export type PremarketHeadline={headline:string;published:string;source:string;url:string|null;symbols:string[]};
export type PremarketReport={
 version:'premarket-research-v0.1';phase:PremarketPhase;asOf:string;marketDate:string;previousSession:string|null;
 feed:'Alpaca IEX single-exchange, Massive prior completed session';
 ranked:PremarketCandidate[];sectors:PremarketSector[];news:PremarketHeadline[];
 watchlist:string[];candidateUniverse:number;freshCandidates:number;
 snapshotDiagnostics:{requested:number;returned:number;missing:number;tradeAbsent:number;tradeInvalidTimestamp:number;tradePreviousSession:number;tradeCurrentSession:number;tradeFresh:number;tradeStaleCurrentSession:number;quoteAbsent:number;quoteInvalidTimestamp:number;quotePreviousSession:number;quoteCurrentSession:number;quoteFresh:number;quoteStaleCurrentSession:number;failedBatches:number;wrappedBatches:number;directBatches:number;unrecognizedBatches:number};
 warnings:string[];readOnly:true;ordersSubmitted:0;
};
const ET='America/New_York';
const benchmarks=[
 ['VOO','S&P 500'],['VTI','Total US market'],['XLK','Technology'],['XLC','Communication Services'],
 ['XLE','Energy'],['XLF','Financials'],['XLV','Health Care'],['XLI','Industrials'],
 ['XLU','Utilities'],['XLY','Consumer Discretionary'],['XLP','Consumer Staples'],
 ['XLB','Materials'],['XLRE','Real Estate']
] as const;
const exclusion=new Set<string>([...benchmarks.map(x=>String(x[0])),...[
 'SPY','QQQ','IWM','DIA','TQQQ','SQQQ','SOXL','SOXS','LABU','LABD','ARKK','ARKG','UVXY','SVXY','GLD','SLV','TLT','SH','SDS'
]]);
const validTicker=(ticker:string)=>/^[A-Z]{1,5}(?:[.][A-Z])?$/.test(ticker)&&!exclusion.has(ticker);
const round=(x:number|null,digits=2)=>x==null||!Number.isFinite(x)?null:Number(x.toFixed(digits));
const iso=(d:Date)=>d.toISOString().slice(0,10);
function etParts(time:Date){
 const p=new Intl.DateTimeFormat('en-US',{timeZone:ET,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
   .formatToParts(time);
 return Object.fromEntries(p.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
}
function marketDate(now:Date){const p=etParts(now);return p.year+'-'+p.month+'-'+p.day;}
function previousWeekday(date:string,offset=1){
 let d=new Date(date+'T12:00:00Z');let skipped=0;
 while(skipped<offset){d=new Date(d.getTime()-86400000);if(![0,6].includes(d.getUTCDay()))skipped++;}
 return iso(d);
}
function sameMarketDay(timestamp:string,date:string){
 const d=new Date(timestamp);
 return Number.isFinite(d.getTime())&&marketDate(d)===date;
}
function premarketWindow(now:Date){
 const p=etParts(now);const date=p.year+'-'+p.month+'-'+p.day;
 return {start:new Date(date+'T04:00:00-04:00').toISOString(),end:now.toISOString()};
}
// Historical bars must not include regular-session trades; ET offset is obtained from the instant.
function etPremarketDateTime(time:Date){
 const p=etParts(time);
 return {date:p.year+'-'+p.month+'-'+p.day,hour:Number(p.hour),minute:Number(p.minute)};
}
export function assessPremarketRow(input:{
 ticker:string;source:'previous-session'|'watchlist';previousClose:number;previousVolume:number;
 latestTrade?:{p:number;t:string};latestQuote?:{bp:number;ap:number;t:string};bars?:Bar[];
 asOf:Date;newsCount:number;
}):PremarketCandidate{
 const {ticker,source,previousClose,previousVolume,latestTrade,latestQuote,asOf,newsCount}=input;
 const day=marketDate(asOf);
 const last=Number(latestTrade?.p),tradeTime=Date.parse(latestTrade?.t||'');
 const tradeSameDay=Number.isFinite(tradeTime)&&sameMarketDay(latestTrade!.t,day);
 const price=tradeSameDay&&Number.isFinite(last)&&last>0?last:null;
 const qTime=Date.parse(latestQuote?.t||'');
 const quoteSameDay=Number.isFinite(qTime)&&sameMarketDay(latestQuote!.t,day);
 const ask=quoteSameDay&&Number(latestQuote?.ap)>0?Number(latestQuote!.ap):null;
 const bid=quoteSameDay&&Number(latestQuote?.bp)>0?Number(latestQuote!.bp):null;
 const spread=ask&&bid&&bid<ask?((ask-bid)/ask)*100:null;
 const quoteAge=quoteSameDay?(asOf.getTime()-qTime)/60000:null;
 const tradeAge=tradeSameDay?(asOf.getTime()-tradeTime)/60000:null;
 const sessionMinute=Number(etParts(asOf).hour)*60+Number(etParts(asOf).minute);
 const session:PremarketCandidate['session']=sessionMinute>=570&&sessionMinute<960?'regular':sessionMinute>=240&&sessionMinute<570?'premarket':'outside';
 const validBars=(input.bars||[]).filter(b=>{
  const t=new Date(b.t);
  if(!Number.isFinite(t.getTime())||t.getTime()>asOf.getTime())return false;
  const z=etPremarketDateTime(t);return z.date===day&&((z.hour>=4&&z.hour<9)||(z.hour===9&&z.minute<30)||(z.hour===9&&z.minute>=30)||(z.hour>=10&&z.hour<16));
 });
 const preBars=validBars.filter(b=>{const z=etPremarketDateTime(new Date(b.t));return z.hour<9||(z.hour===9&&z.minute<30);});
 const regularBars=validBars.filter(b=>{const z=etPremarketDateTime(new Date(b.t));return z.hour>9||(z.hour===9&&z.minute>=30);});
 const sumVolume=(items:Bar[])=>items.length?items.reduce((n,b)=>n+(Number.isFinite(b.v)&&b.v>0?b.v:0),0):null;
 const volume=sumVolume(preBars),regularVolume=sumVolume(regularBars);
 const sessionVolume=session==='regular'?regularVolume:session==='premarket'?volume:null;
 const dollarVolume=preBars.length?preBars.reduce((total,b)=>total+(Number.isFinite(b.c)&&Number.isFinite(b.v)?b.c*b.v:0),0):null;
 const gap=price&&previousClose>0?(price/previousClose-1)*100:null;
 const fresh=price!=null&&tradeAge!=null&&tradeAge>=-1&&tradeAge<=15;
 const quoteFresh=ask!=null&&bid!=null&&quoteAge!=null&&quoteAge>=-1&&quoteAge<=10;
 const evidence:EvidenceStatus=fresh?'fresh':price?'stale':'missing';
 // Pre-market quotes from IEX alone are sparse; a pass means the exact IEX quote meets
 // the research gates, not a full consolidated NBBO or trade execution approval.
 const liquidity:'pass'|'watch'|'fail'=
  evidence==='missing'||previousClose<=0?'fail':
  fresh&&quoteFresh&&spread!=null&&spread<=.6&&ask!>=3&&session!=='outside'&&(sessionVolume??0)>=500?'pass':'watch';
 // Purely descriptive *unvalidated* rank: reward observed gap and exchange volume.
 // Unobserved data gets no score and no fictitious zero gap.
 const score=gap!=null&&fresh?Math.min(100,Math.max(0,
  35+Math.min(30,Math.abs(gap)*3)+Math.min(20,Math.log10(1+(sessionVolume??0))*3)+
  (liquidity==='pass'?10:0)-Math.min(20,(spread??1)*5))):null;
 return {ticker,source,previousClose,latestPrice:price,gapPct:round(gap),gapDollars:round(price==null?null:price-previousClose),
  quoteAgeMinutes:round(quoteAge,1),tradeAgeMinutes:round(tradeAge,1),bid,ask,spreadPct:round(spread,3),
  premarketVolumeIex:volume,estimatedPremarketDollarVolume:round(dollarVolume),
  regularSessionVolumeIex:regularVolume,session,sessionVolumeIex:sessionVolume,
  previousSessionVolume:previousVolume,priorDayDollarVolume:round(previousClose*previousVolume)||0,
  evidence,rank:null,score:round(score,1),liquidity,newsCount};
}
export function rankPremarketRows(rows:PremarketCandidate[]):PremarketCandidate[]{
 return [...rows].sort((a,b)=>
  (b.score??-1)-(a.score??-1)||
  (b.premarketVolumeIex??-1)-(a.premarketVolumeIex??-1)||
  a.ticker.localeCompare(b.ticker))
 .map((x,i)=>({...x,rank:x.score==null?null:i+1}));
}
async function fetchPreviousDay(today:string,warnings:string[]){
 for(let i=1;i<=5;i++){
  const date=previousWeekday(today,i);
  const apiKey=process.env.MASSIVE_API_KEY;
  if(!apiKey)break;
  const url=new URL('https://api.massive.com/v2/aggs/grouped/locale/us/market/stocks/'+date);
  url.searchParams.set('adjusted','true');url.searchParams.set('apiKey',apiKey);
  try{
   const res=await fetch(url,{next:{revalidate:18000},signal:AbortSignal.timeout(15000)});
   if(res.status===429){warnings.push('Massive provider rate limit hit; cannot verify the previous session.');break;}
   if(!res.ok){warnings.push('Previous session '+date+' provider returned '+res.status);continue;}
   const json=await res.json() as Grouped;
   const rows=(json.results||[]).filter(x=>x.T&&Number(x.c)>0&&Number(x.v)>0);
   if(rows.length)return {date,rows};
  }catch{warnings.push('Previous-session daily data unavailable for '+date);}
 }
 return {date:null,rows:[] as NonNullable<Grouped['results']>};
}
export function discoverCandidates(rows:NonNullable<Grouped['results']>,watchlist:string[]):string[]{
 const eligible=rows.filter(x=>validTicker(x.T)&&x.c>=3&&x.c<=500&&x.v>=200000&&x.c*x.v>=1500000);
 const unique=new Set<string>();
 // Combine notable previous-session movement with heavily traded names. This is NOT
 // a full-market premarket movers detector; live IEX snapshots may cover only these seeds.
 for(const x of [...eligible].sort((a,b)=>Math.abs(b.c/b.o-1)-Math.abs(a.c/a.o-1)).slice(0,35))
  unique.add(x.T);
 for(const x of [...eligible].sort((a,b)=>b.c*b.v-a.c*a.v).slice(0,20))unique.add(x.T);
 for(const x of watchlist.filter(validTicker))unique.add(x);
 return [...unique].slice(0,65);
}
export async function runPremarketResearch(phase:PremarketPhase,now=new Date()):Promise<PremarketReport>{
 if(!['early','rank','final'].includes(phase))throw new Error('Invalid premarket phase.');
 if(!paperConfigured())throw new Error('Alpaca paper data credentials are required.');
 const today=marketDate(now),p=etParts(now),weekday=new Date(today+'T12:00:00Z').getUTCDay();
 const warnings:string[]=['Observations use Alpaca IEX (single exchange) and are not consolidated market-wide premarket volume or NBBO.','Momentum ranks are experimental research heuristics, not proven trade signals or paper order approvals.'];
 if(weekday===0||weekday===6)warnings.push('Weekend: there is no regular US stock session today.');
 if(Number(p.hour)<4)warnings.push('Before 04:00 Eastern: current-session premarket observations may not exist.');
 if(Number(p.hour)>=9&&(Number(p.hour)>9||Number(p.minute)>=30))warnings.push('Market is at/after 09:30 Eastern: regular-session volume is tracked separately from premarket volume.');
 const watchlist=(await readPaperWatchlist()).symbols.filter(validTicker).slice(0,5);
 const prior=await fetchPreviousDay(today,warnings);
 if(!prior.rows.length)warnings.push('Unable to obtain verified prior completed session; gaps and rankings will be suppressed.');
 const priorMap=new Map(prior.rows.map(x=>[x.T,x]));
 const selections=discoverCandidates(prior.rows,watchlist);
 const etfs=benchmarks.map(x=>x[0]);
 const symbols=[...new Set([...selections,...etfs])];
 const chunks:string[][]=[];
 for(let i=0;i<symbols.length;i+=35)chunks.push(symbols.slice(i,i+35));
 const all:Record<string,Snap>={};
 // Avoid over-claiming completeness: Alpaca snapshots only cover IEX prints/quotes.
 const results=await Promise.allSettled(chunks.map(c=>dataGet<SnapResponse>('/v2/stocks/snapshots?symbols='+encodeURIComponent(c.join(','))+'&feed=iex')));
 let wrappedBatches=0,directBatches=0,unrecognizedBatches=0;
 for(let i=0;i<results.length;i++){
  const r=results[i];
  if(r.status==='rejected'){
   warnings.push('Alpaca IEX snapshot batch '+(i+1)+' unavailable; partial results only.');
   continue;
  }
  const payload=r.value;
  // Alpaca multi-symbol snapshots can be represented as a direct symbol map
  // or under a snapshots key. Accept only explicitly requested ticker keys.
  const wrapped=payload?.snapshots;
  const source=wrapped&&typeof wrapped==='object'&&!Array.isArray(wrapped)?wrapped:payload;
  if(source&&typeof source==='object'&&!Array.isArray(source)){
   let matched=0;
   for(const ticker of chunks[i]){
    const snap=(source as Record<string,unknown>)[ticker];
    if(snap&&typeof snap==='object'&&!Array.isArray(snap)){
     all[ticker]=snap as Snap;
     matched++;
    }
   }
   if(wrapped)wrappedBatches++;else directBatches++;
   if(!matched)warnings.push('Snapshot batch '+(i+1)+' returned no requested symbol records.');
  }else{
   unrecognizedBatches++;
   warnings.push('Snapshot batch '+(i+1)+' returned an unrecognized response structure.');
  }
 }
 // Aggregate timestamp diagnostics across the entire requested candidate universe.
 // Do not expose raw brokerage payloads or loosen any screening gates.
 const snapshotDiagnostics={
  requested:selections.length,returned:0,missing:0,
  tradeAbsent:0,tradeInvalidTimestamp:0,tradePreviousSession:0,
  tradeCurrentSession:0,tradeFresh:0,tradeStaleCurrentSession:0,
  quoteAbsent:0,quoteInvalidTimestamp:0,quotePreviousSession:0,
  quoteCurrentSession:0,quoteFresh:0,quoteStaleCurrentSession:0,
  failedBatches:results.filter(x=>x.status==='rejected').length,
  wrappedBatches,directBatches,unrecognizedBatches
 };
 for(const ticker of selections){
  const snap=all[ticker];
  if(!snap){snapshotDiagnostics.missing++;continue;}
  snapshotDiagnostics.returned++;
  for(const kind of ['trade','quote'] as const){
   const item=kind==='trade'?snap.latestTrade:snap.latestQuote;
   if(!item){snapshotDiagnostics[kind==='trade'?'tradeAbsent':'quoteAbsent']++;continue;}
   const ms=Date.parse(item.t||'');
   if(!Number.isFinite(ms)){snapshotDiagnostics[kind==='trade'?'tradeInvalidTimestamp':'quoteInvalidTimestamp']++;continue;}
   if(!sameMarketDay(item.t,today)){snapshotDiagnostics[kind==='trade'?'tradePreviousSession':'quotePreviousSession']++;continue;}
   snapshotDiagnostics[kind==='trade'?'tradeCurrentSession':'quoteCurrentSession']++;
   const age=(now.getTime()-ms)/60000;
   if(age>=-1&&age<=(kind==='trade'?15:10))
    snapshotDiagnostics[kind==='trade'?'tradeFresh':'quoteFresh']++;
   else snapshotDiagnostics[kind==='trade'?'tradeStaleCurrentSession':'quoteStaleCurrentSession']++;
  }
 }
 const nowEt=etPremarketDateTime(now);
 const bars:Record<string,Bar[]>={};
 if(nowEt.hour>=4&&nowEt.hour<16&&selections.length){
  const start=new Date(now.getTime());
  const nowM=nowEt.hour*60+nowEt.minute;
  start.setTime(now.getTime()-(nowM-240)*60000);
  // Up to 3 pages; more pages would be required if provider changes page size.
  // Separate premarket and regular-session bars; never mix their volume totals.
  const url=new URL('https://data.alpaca.markets/v2/stocks/bars');
  url.searchParams.set('symbols',selections.join(','));
  url.searchParams.set('timeframe','5Min');url.searchParams.set('feed','iex');
  url.searchParams.set('start',start.toISOString());
  url.searchParams.set('end',now.toISOString());
  url.searchParams.set('limit','10000');
  let nextToken:string|null=null;
  for(let page=0;page<3;page++){
   if(nextToken)url.searchParams.set('page_token',nextToken);
   try{
    const pageData=await dataGet<BarResponse>(url.pathname+url.search);
    for(const [ticker,values] of Object.entries(pageData.bars||{}))bars[ticker]=(bars[ticker]||[]).concat(values);
    nextToken=pageData.next_page_token||null;
    if(!nextToken)break;
   }catch{warnings.push('IEX 5-minute session bars unavailable; volume fields will be marked missing.');break;}
  }
  if(nextToken)warnings.push('IEX bar results were truncated after 3 pages; session volume may be incomplete.');
 }
 let rawNews:NonNullable<NewsResponse['news']>=[];
 try{
  const start=new Date(now.getTime()-16*3600000).toISOString();
  const response=await dataGet<NewsResponse>('/v1beta1/news?start='+encodeURIComponent(start)+'&end='+encodeURIComponent(now.toISOString())+'&sort=desc&limit=40');
  rawNews=(response.news||[]).filter(x=>Number.isFinite(Date.parse(x.created_at))&&Date.parse(x.created_at)<=now.getTime());
 }catch{warnings.push('Alpaca news API unavailable for these credentials; catalyst coverage is incomplete.');}
 const news=rawNews.slice(0,30).map(x=>({headline:x.headline,published:x.created_at,source:x.source||'Alpaca News',
  url:x.url?.startsWith('https://')?x.url:null,symbols:(x.symbols||[]).slice(0,10)}));
 const candidates=selections.map(ticker=>{
  const priorRow=priorMap.get(ticker),snap=all[ticker];
  return assessPremarketRow({ticker,source:watchlist.includes(ticker)?'watchlist':'previous-session',
   previousClose:Number(priorRow?.c||snap?.prevDailyBar?.c||0),
   previousVolume:Number(priorRow?.v||0),latestTrade:snap?.latestTrade,latestQuote:snap?.latestQuote,
   bars:bars[ticker],asOf:now,newsCount:news.filter(x=>x.symbols.includes(ticker)).length});
 });
 const sectors=benchmarks.map(([ticker,sector])=>{
  const prev=Number(priorMap.get(ticker)?.c||all[ticker]?.prevDailyBar?.c||0);
  const snap=all[ticker],stamp=snap?.latestTrade?.t||'',last=Number(snap?.latestTrade?.p);
  const same=sameMarketDay(stamp,today)&&last>0;
  const age=Date.parse(stamp);
  return {ticker,sector,gapPct:round(same&&prev>0?(last/prev-1)*100:null),
   evidence:(same&&now.getTime()-age<=15*60000?'fresh':same?'stale':'missing') as EvidenceStatus};
 });
 const ranked=rankPremarketRows(candidates).slice(0,phase==='early'?30:phase==='rank'?20:15);
 const freshCount=ranked.filter(x=>x.evidence==='fresh').length;
 if(!freshCount)warnings.push('No ranked watchlist stock has a fresh same-session IEX trade; no current gap ranking is validated.');
 return {version:'premarket-research-v0.1',phase,asOf:now.toISOString(),marketDate:today,previousSession:prior.date,
  feed:'Alpaca IEX single-exchange, Massive prior completed session',
  ranked,sectors,news,watchlist,candidateUniverse:selections.length,freshCandidates:freshCount,snapshotDiagnostics,warnings,readOnly:true,ordersSubmitted:0};
}
