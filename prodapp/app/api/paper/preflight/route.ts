import {NextRequest,NextResponse} from 'next/server';
import {controlAuthorized,unauthorized} from '@/lib/paper/security';
import {runPaperPreflight} from '@/lib/paper/preflight';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 if(!controlAuthorized(request))return unauthorized();
 try{return NextResponse.json(await runPaperPreflight(),{headers:{'Cache-Control':'no-store'}});}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Paper preflight unavailable.'},{status:502,headers:{'Cache-Control':'no-store'}});}
}