import { NextRequest, NextResponse } from 'next/server';
import { getRadar } from '@/lib/radar-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
  const secret=process.env.CRON_SECRET;
  if(!secret)return NextResponse.json({error:'Cron authorization not configured.'},{status:503});
  if(req.headers.get('authorization')!==`Bearer ${secret}`)
    return NextResponse.json({error:'Unauthorized'},{status:401});
  try{
    const report=await getRadar();
    return NextResponse.json({
      warmed:true,
      session:report.reportDate,
      screened:report.scanned,
      candidates:Object.fromEntries(Object.entries(report.categories).map(([k,v])=>[k,v.length]))
    },{headers:{'Cache-Control':'no-store'}});
  }catch(e:any){
    return NextResponse.json({error:String(e?.message||'Radar warming failed')},{status:503});
  }
}
