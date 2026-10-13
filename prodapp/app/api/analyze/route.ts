import { NextRequest, NextResponse } from 'next/server';
import { analyzeSymbol } from '@/lib/analysis';
import { requireMemberApi } from '@/lib/membership';

export const runtime='nodejs';
export async function GET(req:NextRequest){
  const denied=await requireMemberApi();if(denied)return denied;
  try{
    const symbol=req.nextUrl.searchParams.get('symbol')||'RSKD';
    const data=await analyzeSymbol(symbol);
    return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});
  }catch(e:any){return NextResponse.json({error:'Analysis is temporarily unavailable. Check the ticker and try again.'},{status:400,headers:{'Cache-Control':'private, no-store'}})}
}
