import { beforeEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { NextRequest } from 'next/server';

const mock = vi.hoisted(() => ({ retrieve: vi.fn(), user: vi.fn(), update: vi.fn(), membership: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({ clerkClient: async () => ({ users: { getUser: mock.user, updateUserMetadata: mock.update } }) }));
vi.mock('@/lib/billing', async () => {
  const { default: Stripe } = await import('stripe');
  return {
    customerMetadataKey: () => 'stripeTestCustomerId', customerHasMembership: mock.membership,
    stripeClient: () => ({ webhooks: new Stripe('sk_test_fixture').webhooks, customers: { retrieve: mock.retrieve } }),
  };
});
import { POST } from '../app/api/billing/webhook/route';
const webhooks = new Stripe('sk_test_fixture').webhooks;

function event(type = 'invoice.paid', paymentStatus = 'paid', live = false) {
  return { id: 'evt_fixture', type, livemode: live, data: { object: { customer: 'cus_member', payment_status: paymentStatus } } };
}
function request(body: unknown, signed = true, timestamp?: number) {
  const payload = JSON.stringify(body);
  const signature = webhooks.generateTestHeaderString({ payload, secret: 'whsec_fixture', ...(timestamp ? { timestamp } : {}) });
  return new NextRequest('https://marketclarity.example/api/billing/webhook', {
    method: 'POST', body: payload, headers: signed ? { 'stripe-signature': signature } : {},
  });
}
beforeEach(() => {
  vi.resetAllMocks(); vi.unstubAllEnvs();
  vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
  vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_fixture');
  vi.stubEnv('STRIPE_SECRET_KEY', 'rk_test_fixture');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_fixture');
  vi.stubEnv('STRIPE_MONTHLY_PRICE_ID', 'price_membership');
  vi.stubEnv('APP_BASE_URL', 'https://marketclarity.example');
  vi.stubEnv('VERCEL_ENV', 'preview');
  mock.retrieve.mockResolvedValue({ metadata: { application: 'marketclarity', clerkUserId: 'user_member' } });
  mock.user.mockResolvedValue({ privateMetadata: { stripeTestCustomerId: 'cus_member' } });
  mock.membership.mockResolvedValue(true);
});

describe('signed billing notifications', () => {
  it('blocks unsigned or stale signed events before using any provider', async () => {
    expect((await POST(request(event(), false))).status).toBe(400);
    expect((await POST(request(event(), true, Math.floor(Date.now() / 1000) - 1000))).status).toBe(400);
    expect(mock.retrieve).not.toHaveBeenCalled();
  });
  it('rejects payload tampering and signatures from a different endpoint', async () => {
    const payload = JSON.stringify(event());
    const signature = webhooks.generateTestHeaderString({ payload, secret: 'whsec_other' });
    expect((await POST(new NextRequest('https://marketclarity.example/api/billing/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': signature } }))).status).toBe(400);
    expect(mock.update).not.toHaveBeenCalled();
  });
  it('rejects live/test environment mismatch', async () => {
    expect((await POST(request(event('invoice.paid', 'paid', true)))).status).toBe(400);
    expect(mock.retrieve).not.toHaveBeenCalled();
  });
  it('does not fulfill an unpaid completed checkout', async () => {
    expect((await POST(request(event('checkout.session.completed', 'unpaid')))).status).toBe(200);
    expect(mock.retrieve).not.toHaveBeenCalled();
  });
  it('does not modify accounts for unrelated products or mismatched linkage', async () => {
    mock.retrieve.mockResolvedValue({ metadata: { application: 'other-app' } });
    expect((await POST(request(event()))).status).toBe(200);
    mock.retrieve.mockResolvedValue({ metadata: { application: 'marketclarity', clerkUserId: 'user_member' } });
    mock.user.mockResolvedValue({ privateMetadata: { stripeTestCustomerId: 'cus_someone_else' } });
    expect((await POST(request(event()))).status).toBe(409);
    expect(mock.update).not.toHaveBeenCalled();
  });
  it('reconciles paid checkout and asynchronous success against current membership', async () => {
    for (const type of ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'invoice.paid']) {
      const result = await POST(request(event(type)));
      expect(result.status).toBe(200);
      expect(result.headers.get('cache-control')).toBe('private, no-store');
    }
    expect(mock.update).toHaveBeenCalledWith('user_member', { privateMetadata: { stripeTestMembership: { active: true, checkedAt: expect.any(String), lastEventId: 'evt_fixture' } } });
  });
  it('does not reinstate canceled access when an old paid event is retried', async () => {
    mock.membership.mockResolvedValue(false);
    await POST(request(event('invoice.paid'))); await POST(request(event('invoice.paid')));
    expect(mock.update).toHaveBeenLastCalledWith('user_member', { privateMetadata: { stripeTestMembership: { active: false, checkedAt: expect.any(String), lastEventId: 'evt_fixture' } } });
  });
  it('returns retryable errors without disclosing provider exception contents', async () => {
    mock.update.mockRejectedValue(new Error('private-key-value'));
    const result = await POST(request(event()));
    expect(result.status).toBe(503);
    expect(JSON.stringify(await result.json())).not.toContain('private-key-value');
  });
  it('does not accept notifications before signing configuration is complete', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    expect((await POST(request(event()))).status).toBe(503);
    expect(mock.retrieve).not.toHaveBeenCalled();
  });
});
