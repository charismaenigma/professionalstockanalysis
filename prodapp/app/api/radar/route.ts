import { NextResponse } from 'next/server';
import { getRadar } from '@/lib/radar-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
  try{
    const report=await getRadar();
    return NextResponse.json(report,{
      headers:{'Cache-Control':'public, s-maxage=3600, stale-while-revalidate=3600'}
    });
  }catch(e:any){
    return NextResponse.json({error:String(e?.message||'Daily Radar is unavailable.')},{
      status:503,headers:{'Cache-Control':'no-store'}
    });
  }
}
