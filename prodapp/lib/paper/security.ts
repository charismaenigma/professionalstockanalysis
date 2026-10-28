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
  process.env.PAPER_CONTROL_TOKEN
    ? Response.json({error: 'Access denied. Check the control token for this environment.'}, {status: 401})
    : Response.json({error: 'This deployment has no PAPER_CONTROL_TOKEN configured. Preview deployments do not inherit Production secrets. Add a separate control token under Vercel Preview environment variables.'}, {status: 503});
