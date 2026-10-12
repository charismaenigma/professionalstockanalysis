import type { CatalystItem } from './types';

const userAgent=()=>process.env.SEC_USER_AGENT||'MarketClarity research app contact@example.com';

export interface SecFiling extends CatalystItem {
  accession?: string;
  primaryDocument?: string;
  form?: string;
}

export async function recentSecFilings(cik?:string):Promise<SecFiling[]>{
  if(!cik)return [];
  const padded=cik.replace(/\D/g,'').padStart(10,'0');
  const r=await fetch(`https://data.sec.gov/submissions/CIK${padded}.json`,{
    headers:{'User-Agent':userAgent(),'Accept-Encoding':'gzip, deflate'},
    next:{revalidate:1800}
  });
  if(!r.ok)return [];
  const j:any=await r.json();
  const rec=j.filings?.recent;
  if(!rec?.form)return [];

  const useful=new Set(['10-K','10-Q','8-K','20-F','6-K','S-1','S-3','424B3','424B5']);
  const out:SecFiling[]=[];
  for(let i=0;i<rec.form.length&&out.length<12;i++){
    const form=String(rec.form[i]);
    if(!useful.has(form))continue;
    const accession=String(rec.accessionNumber[i]||'');
    const doc=String(rec.primaryDocument[i]||'');
    if(!accession||!doc)continue;
    const accNo=accession.replace(/-/g,'');
    const numeric=String(Number(padded));
    const url=`https://www.sec.gov/Archives/edgar/data/${numeric}/${accNo}/${doc}`;
    out.push({
      date:rec.filingDate[i],
      type:'SEC Filing',
      title:`${form} filed ${rec.filingDate[i]}`,
      url,
      source:'SEC EDGAR',
      binary:false,
      accession,
      primaryDocument:doc,
      form
    });
  }
  return out;
}
