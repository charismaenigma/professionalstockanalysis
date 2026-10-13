import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mock = vi.hoisted(() => ({
  auth: vi.fn(), customer: vi.fn(), subscribed: vi.fn(), prices: vi.fn(),
  list: vi.fn(), checkout: vi.fn(), expire: vi.fn(), portal: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({ auth: mock.auth }));
vi.mock('@/lib/billing', () => ({
  appOrigin: () => 'https://marketclarity.example', linkedCustomer: mock.customer,
  customerHasMembership: mock.subscribed, availableMembershipPrices: mock.prices,
  stripeClient: () => ({ checkout: { sessions: { list: mock.list, create: mock.checkout, expire: mock.expire } }, billingPortal: { sessions: { create: mock.portal } } }),
}));
import { POST as checkout } from '../app/api/billing/checkout/route';
import { POST as portal } from '../app/api/billing/portal/route';

function request(body = {}, origin = 'https://marketclarity.example') {
  return new NextRequest('https://marketclarity.example/api/billing/checkout', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks(); vi.unstubAllEnvs();
  vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
  vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_fixture');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_fixture');
  vi.stubEnv('STRIPE_MONTHLY_PRICE_ID', 'price_membership');
  vi.stubEnv('APP_BASE_URL', 'https://marketclarity.example');
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('STRIPE_AUTOMATIC_TAX', 'false');
  mock.auth.mockResolvedValue({ userId: 'user_member' });
  mock.prices.mockResolvedValue([{ id: 'price_membership', amount: 1000, currency: 'usd', interval: 'month' }]);
  mock.customer.mockResolvedValue('cus_trusted');
  mock.subscribed.mockResolvedValue(false);
  mock.list.mockResolvedValue({ data: [] });
  mock.checkout.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/session' });
  mock.portal.mockResolvedValue({ url: 'https://billing.stripe.com/p/session' });
});

describe('trusted billing requests', () => {
  it('rejects cross-site requests to checkout and portal before using providers', async () => {
    expect((await checkout(request({}, 'https://evil.example'))).status).toBe(403);
    expect((await portal(request({}, 'https://evil.example'))).status).toBe(403);
    expect(mock.auth).not.toHaveBeenCalled();
  });
  it('requires a signed-in account for both billing operations', async () => {
    mock.auth.mockResolvedValue({ userId: null });
    expect((await checkout(request())).status).toBe(401);
    expect((await portal(request())).status).toBe(401);
    expect(mock.customer).not.toHaveBeenCalled();
  });
  it('fails closed when billing is unconfigured', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    expect((await checkout(request())).status).toBe(503);
    expect((await portal(request())).status).toBe(503);
    expect(mock.auth).not.toHaveBeenCalled();
  });
  it('rejects client-supplied prices outside the approved allowlist', async () => {
    expect((await checkout(request({ priceId: 'price_cheap_injected' }))).status).toBe(400);
    expect(mock.customer).not.toHaveBeenCalled();
    expect(mock.checkout).not.toHaveBeenCalled();
  });
  it('prevents a current member from buying a duplicate subscription', async () => {
    mock.subscribed.mockResolvedValue(true);
    expect((await checkout(request({ priceId: 'price_membership' }))).status).toBe(409);
    expect(mock.checkout).not.toHaveBeenCalled();
  });
  it('ignores injected identity, customer, amount, and return URL', async () => {
    const result = await checkout(request({ priceId: 'price_membership', customerId: 'cus_victim', userId: 'user_victim', amount: 1, destination: 'https://evil.example' }));
    expect(result.status).toBe(200);
    expect(mock.customer).toHaveBeenCalledWith('user_member', true);
    expect(mock.checkout).toHaveBeenCalledWith(expect.objectContaining({
      customer: 'cus_trusted', client_reference_id: 'user_member',
      line_items: [{ price: 'price_membership', quantity: 1 }],
      success_url: 'https://marketclarity.example/billing/return?next=%2Fresearch',
    }), expect.objectContaining({ idempotencyKey: expect.any(String) }));
    expect(result.headers.get('cache-control')).toBe('private, no-store');
  });
  it('reuses an unfinished checkout for the same account and destination', async () => {
    mock.list.mockResolvedValue({ data: [{ id: 'cs_open', metadata: { clerkUserId: 'user_member', priceId: 'price_membership' }, success_url: 'https://marketclarity.example/billing/return?next=%2Fresearch', url: 'https://checkout.stripe.com/c/pay/existing' }] });
    expect(await (await checkout(request({ priceId: 'price_membership' }))).json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/existing' });
    expect(mock.checkout).not.toHaveBeenCalled();
  });
  it('opens the billing portal only for the authenticated account', async () => {
    const result = await portal(request({ customerId: 'cus_victim', return_url: 'https://evil.example' }));
    expect(result.status).toBe(200);
    expect(mock.customer).toHaveBeenCalledWith('user_member');
    expect(mock.portal).toHaveBeenCalledWith({ customer: 'cus_trusted', return_url: 'https://marketclarity.example/account' });
  });
  it('does not create a customer just to open the billing portal', async () => {
    mock.customer.mockResolvedValue(null);
    expect((await portal(request())).status).toBe(404);
    expect(mock.portal).not.toHaveBeenCalled();
  });
  it('does not disclose provider exception contents', async () => {
    mock.checkout.mockRejectedValue(new Error('private-provider-secret'));
    const result = await checkout(request({ priceId: 'price_membership' }));
    expect(result.status).toBe(503);
    expect(JSON.stringify(await result.json())).not.toContain('private-provider-secret');
  });
});

