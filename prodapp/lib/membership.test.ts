import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ auth: vi.fn(), customer: vi.fn(), subscribed: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({ auth: mock.auth }));
vi.mock('./billing', () => ({ linkedCustomer: mock.customer, customerHasMembership: mock.subscribed }));
import { getMembership, requireMemberApi, requireMemberPage } from './membership';

beforeEach(() => {
  vi.resetAllMocks(); vi.unstubAllEnvs();
  vi.stubEnv('MARKETCLARITY_PAYWALL_ENABLED', 'true');
  vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
  vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_fixture');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture');
  vi.stubEnv('STRIPE_MONTHLY_PRICE_ID', 'price_membership');
  vi.stubEnv('APP_BASE_URL', 'https://marketclarity.example');
  vi.stubEnv('MARKETCLARITY_ADMIN_USER_IDS', '');
  vi.stubEnv('VERCEL_ENV', 'preview');
  mock.auth.mockResolvedValue({ userId: 'user_member' });
  mock.customer.mockResolvedValue('cus_member');
  mock.subscribed.mockResolvedValue(true);
});

describe('server membership guard', () => {
  it.each(['', 'false'])('opens pages and APIs without auth or billing when the paywall is %j', async value => {
    vi.stubEnv('MARKETCLARITY_PAYWALL_ENABLED', value);
    vi.stubEnv('CLERK_SECRET_KEY', '');
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    expect(await requireMemberApi()).toBeNull();
    expect(await requireMemberPage('/research?ticker=MSFT')).toEqual({ status: 'public' });
    expect(await requireMemberPage('/radar')).toEqual({ status: 'public' });
    expect(mock.auth).not.toHaveBeenCalled();
    expect(mock.customer).not.toHaveBeenCalled();
    expect(mock.subscribed).not.toHaveBeenCalled();
  });
  it('requires authentication before contacting payment services', async () => {
    mock.auth.mockResolvedValue({ userId: null });
    const denied = await requireMemberApi();
    expect(denied?.status).toBe(401);
    expect(mock.customer).not.toHaveBeenCalled();
    expect(denied?.headers.get('cache-control')).toBe('private, no-store');
  });
  it('blocks a signed-in nonmember', async () => {
    mock.subscribed.mockResolvedValue(false);
    expect((await requireMemberApi())?.status).toBe(403);
  });
  it('allows a verified subscription', async () => {
    expect(await requireMemberApi()).toBeNull();
  });
  it('denies a user without a linked billing account', async () => {
    mock.customer.mockResolvedValue(null);
    expect((await getMembership()).status).toBe('not-subscribed');
    expect(mock.subscribed).not.toHaveBeenCalled();
  });
  it('fails closed during provider errors and never leaks the exception', async () => {
    mock.subscribed.mockRejectedValue(new Error('private-sdk-secret'));
    const denied = await requireMemberApi();
    expect(denied?.status).toBe(503);
    expect(JSON.stringify(await denied?.json())).not.toContain('private-sdk-secret');
  });
  it('fails closed without configuration', async () => {
    vi.stubEnv('CLERK_SECRET_KEY', '');
    expect((await requireMemberApi())?.status).toBe(503);
    expect(mock.auth).not.toHaveBeenCalled();
  });
  it('never accepts development credentials on production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect((await requireMemberApi())?.status).toBe(503);
    expect(mock.auth).not.toHaveBeenCalled();
  });
  it('allows only server-configured owner IDs, even before billing setup', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    vi.stubEnv('MARKETCLARITY_ADMIN_USER_IDS', 'user_owner');
    expect((await getMembership()).status).toBe('unavailable');
    mock.auth.mockResolvedValue({ userId: 'user_owner' });
    expect(await getMembership()).toEqual({ status: 'member', userId: 'user_owner', admin: true });
    expect(mock.customer).not.toHaveBeenCalled();
  });
  it('does not share membership results across different callers', async () => {
    expect((await getMembership()).status).toBe('member');
    mock.auth.mockResolvedValue({ userId: null });
    expect((await getMembership()).status).toBe('signed-out');
  });
});

