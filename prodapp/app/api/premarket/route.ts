import {NextRequest,NextResponse} from 'next/server';
import {controlAuthorized,unauthorized} from '@/lib/paper/security';
import {runPremarketResearch,type PremarketPhase} from '@/lib/premarket';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:NextRequest){
 if(!controlAuthorized(request))return unauthorized();
 const phase=request.nextUrl.searchParams.get('phase')||'early';
 if(!['early','rank','final'].includes(phase))return NextResponse.json({error:'Choose early, rank or final.'},{status:400});
 try{return NextResponse.json(await runPremarketResearch(phase as PremarketPhase),{headers:{'Cache-Control':'private, no-store'}});}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Premarket research unavailable'},{status:502,headers:{'Cache-Control':'no-store'}});}
}
