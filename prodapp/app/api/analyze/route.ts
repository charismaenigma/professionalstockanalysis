import { NextRequest, NextResponse } from 'next/server';
import { analyzeSymbol } from '@/lib/analysis';

export const runtime='nodejs';
export async function GET(req:NextRequest){
  try{
    const symbol=req.nextUrl.searchParams.get('symbol')||'RSKD';
    const data=await analyzeSymbol(symbol);
    return NextResponse.json(data,{headers:{'Cache-Control':data.mode==='live'?'s-maxage=120, stale-while-revalidate=300':'no-store'}});
  }catch(e:any){return NextResponse.json({error:e?.message||'Analysis failed'},{status:400})}
}
