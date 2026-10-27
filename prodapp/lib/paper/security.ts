import {timingSafeEqual} from 'node:crypto';

function sameSecret(actual: string | null, expected: string | undefined) {
  if (!expected || !actual) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function controlAuthorized(request: Request) {
  return sameSecret(request.headers.get('x-marketclarity-token'), process.env.PAPER_CONTROL_TOKEN);
}
export function cronAuthorized(request: Request) {
  const h = request.headers.get('authorization');
  return sameSecret(h?.startsWith('Bearer ') ? h.slice(7) : null, process.env.CRON_SECRET);
}
export const unauthorized = () =>
  Response.json({error: 'Access denied. Enter the MarketClarity control token.'}, {status: 401});
