import {NextRequest, NextResponse} from 'next/server';
import {updatePaperWatchlist, readPaperWatchlist} from '@/lib/paper/alpaca';
import {controlAuthorized, unauthorized} from '@/lib/paper/security';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  if (!controlAuthorized(request)) return unauthorized();
  try { return NextResponse.json(await readPaperWatchlist()); }
  catch (e) { return NextResponse.json({error: e instanceof Error ? e.message : 'Broker error'}, {status: 502}); }
}
export async function PUT(request: NextRequest) {
  if (!controlAuthorized(request)) return unauthorized();
  try {
    const body = await request.json();
    if (!Array.isArray(body.symbols) || body.symbols.some((x: unknown) => typeof x !== 'string')) {
      return NextResponse.json({error:'Use a list of ticker symbols.'}, {status: 400});
    }
    await updatePaperWatchlist(body.symbols);
    return NextResponse.json(await readPaperWatchlist());
  } catch (e) { return NextResponse.json({error:e instanceof Error ? e.message:'Broker error'}, {status: 400}); }
}
