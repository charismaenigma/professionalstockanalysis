import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mock = vi.hoisted(() => ({ guard: vi.fn(), analyze: vi.fn(), radar: vi.fn(), openai: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/membership', () => ({ requireMemberApi: mock.guard }));
vi.mock('@/lib/analysis', () => ({ analyzeSymbol: mock.analyze }));
vi.mock('@/lib/radar-server', () => ({ getRadar: mock.radar }));
vi.mock('openai', () => ({ default: mock.openai }));
import { GET as analyze } from '../app/api/analyze/route';
import { GET as radar } from '../app/api/radar/route';
import { POST as research } from '../app/api/research/route';

beforeEach(() => { vi.resetAllMocks(); });
describe('premium API enforcement', () => {
  it.each([401, 403, 503])('blocks every premium provider before it can run (HTTP %i)', async status => {
    mock.guard.mockImplementation(async () => NextResponse.json({ error: 'denied' }, { status, headers: { 'Cache-Control': 'private, no-store' } }));
    const results = await Promise.all([
      analyze(new NextRequest('https://marketclarity.example/api/analyze?symbol=MSFT')),
      radar(), research(new NextRequest('https://marketclarity.example/api/research', { method: 'POST', body: '{}' })),
    ]);
    for (const result of results) {
      expect(result.status).toBe(status);
      expect(result.headers.get('cache-control')).toBe('private, no-store');
    }
    expect(mock.analyze).not.toHaveBeenCalled();
    expect(mock.radar).not.toHaveBeenCalled();
    expect(mock.openai).not.toHaveBeenCalled();
  });
  it('returns member analysis and radar results without public caching', async () => {
    mock.guard.mockResolvedValue(null);
    mock.analyze.mockResolvedValue({ symbol: 'MSFT', mode: 'live' });
    mock.radar.mockResolvedValue({ reportDate: '2026-10-12', scanned: 50 });
    const results = await Promise.all([analyze(new NextRequest('https://marketclarity.example/api/analyze?symbol=MSFT')), radar()]);
    for (const result of results) expect(result.headers.get('cache-control')).toBe('private, no-store');
    expect(await results[0].json()).toEqual({ symbol: 'MSFT', mode: 'live' });
  });
});
