import {NextRequest,NextResponse} from 'next/server';
import {controlAuthorized,unauthorized} from '@/lib/paper/security';
import {readPaperWatchlist} from '@/lib/paper/alpaca';
import {analyzeSymbol} from '@/lib/analysis';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
export async function GET(req:NextRequest){
 if(!controlAuthorized(req))return unauthorized();
 try{
  if(!process.env.MASSIVE_API_KEY)throw Error('Massive research feed is not configured.');
  const list=await readPaperWatchlist();
  const results=[];
  for(const symbol of list.symbols.slice(0,5)){
   try{const a=await analyzeSymbol(symbol);results.push({symbol,score:a.scores.swing.score,status:a.tradePlan.status,reason:a.scores.swing.vetoes.slice(0,2).join('; ')||'Research criteria evaluated',asOf:a.asOf,mode:a.mode});}
   catch(e){results.push({symbol,score:null,status:'Unavailable',reason:e instanceof Error?e.message:'Research unavailable'});}
  }
  return NextResponse.json({results,notice:'End-of-day research scan only; orders disabled and no live entry verified.'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Scan unavailable'},{status:502});}
}