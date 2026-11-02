import {NextRequest, NextResponse} from 'next/server';
import {runPaperScan} from '@/lib/paper/engine';
import {autoScanEnabled, paperOrdersEnabled} from '@/lib/paper/alpaca';
import {controlAuthorized, cronAuthorized, unauthorized} from '@/lib/paper/security';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  if (!controlAuthorized(request)) return unauthorized();
  try {
    const body = await request.json().catch(() => ({}));
    const result = await runPaperScan(body.execute === true);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({error:e instanceof Error ? e.message:'Scan failed'}, {status: 400});
  }
}
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return unauthorized();
  // Explicit scheduled preview: never submits orders, regardless of trading flags.
  if (request.nextUrl.searchParams.get('dry_run') === '1') {
    try {
      const rawIndex = request.nextUrl.searchParams.get('index');
      const index = rawIndex === null ? undefined : Number(rawIndex);
      if (rawIndex !== null && (!/^[0-4]$/.test(rawIndex))) return NextResponse.json({error:'Invalid watchlist index'}, {status:400});
      return NextResponse.json(await runPaperScan(false, index), {headers: {'Cache-Control': 'no-store'}});
    }
    catch (e) { return NextResponse.json({error:e instanceof Error ? e.message:'Preview scan failed'}, {status:502}); }
  }
  if (!autoScanEnabled() || !paperOrdersEnabled()) {
    return NextResponse.json({status:'paused',reason:'Automatic paper orders are not enabled.'});
  }
  try { return NextResponse.json(await runPaperScan(true)); }
  catch (e) { return NextResponse.json({error:e instanceof Error ? e.message:'Scan failed'}, {status:502}); }
}
