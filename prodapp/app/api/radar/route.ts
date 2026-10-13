import { NextResponse } from 'next/server';
import { getRadar } from '@/lib/radar-server';
import { requireMemberApi } from '@/lib/membership';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
  const denied=await requireMemberApi();if(denied)return denied;
  try{
    const report=await getRadar();
    return NextResponse.json(report,{
      headers:{'Cache-Control':'private, no-store'}
    });
  }catch(e:any){
    return NextResponse.json({error:'Daily Radar is temporarily unavailable.'},{
      status:503,headers:{'Cache-Control':'no-store'}
    });
  }
}
