import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ user: vi.fn(), update: vi.fn(), retrieve: vi.fn(), create: vi.fn(), prices: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({ clerkClient: async () => ({ users: { getUser: mock.user, updateUserMetadata: mock.update } }) }));
vi.mock('stripe', () => ({ default: vi.fn(function () { return { customers: { retrieve: mock.retrieve, create: mock.create }, prices: { retrieve: mock.prices } }; }) }));
import { linkedCustomer, availableMembershipPrices, appOrigin } from './billing';

beforeEach(() => {
  vi.resetAllMocks(); vi.unstubAllEnvs();
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture');
  vi.stubEnv('STRIPE_MONTHLY_PRICE_ID', 'price_membership');
  vi.stubEnv('STRIPE_ANNUAL_PRICE_ID', '');
  vi.stubEnv('APP_BASE_URL', 'https://marketclarity.example');
  vi.stubEnv('VERCEL_ENV', 'preview');
  mock.user.mockResolvedValue({ privateMetadata: { stripeTestCustomerId: 'cus_test' }, primaryEmailAddressId: 'email_1', emailAddresses: [{ id: 'email_1', emailAddress: 'test@example.com' }] });
  mock.retrieve.mockResolvedValue({ id: 'cus_test', metadata: { clerkUserId: 'user_member' }, deleted: false });
});

describe('server-owned customer linkage', () => {
  it('accepts a stored customer only when Stripe confirms ownership', async () => {
    expect(await linkedCustomer('user_member')).toBe('cus_test');
    expect(mock.retrieve).toHaveBeenCalledWith('cus_test');
  });
  it('denies mismatched and deleted customers instead of relinking by email', async () => {
    mock.retrieve.mockResolvedValue({ metadata: { clerkUserId: 'user_victim' } });
    await expect(linkedCustomer('user_member', true)).rejects.toThrow('ownership');
    mock.retrieve.mockResolvedValue({ deleted: true });
    await expect(linkedCustomer('user_member', true)).rejects.toThrow('ownership');
    expect(mock.create).not.toHaveBeenCalled();
  });
  it('keeps live customer IDs separate from test customer IDs', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_fixture');
    expect(await linkedCustomer('user_member')).toBeNull();
    expect(mock.retrieve).not.toHaveBeenCalled();
  });
  it('uses the live customer linkage for a restricted live key', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'rk_live_fixture');
    vi.stubEnv('VERCEL_ENV', 'production');
    mock.user.mockResolvedValue({ privateMetadata: { stripeLiveCustomerId: 'cus_live' } });
    expect(await linkedCustomer('user_member')).toBe('cus_live');
    expect(mock.retrieve).toHaveBeenCalledWith('cus_live');
  });
  it('creates a customer idempotently with server-verified identity and private linkage', async () => {
    mock.user.mockResolvedValue({ privateMetadata: {}, primaryEmailAddressId: 'email_1', emailAddresses: [{ id: 'email_1', emailAddress: 'test@example.com' }] });
    mock.create.mockResolvedValue({ id: 'cus_new' });
    expect(await linkedCustomer('user_member', true)).toBe('cus_new');
    expect(mock.create).toHaveBeenCalledWith({ email: 'test@example.com', metadata: { clerkUserId: 'user_member', application: 'marketclarity' } }, { idempotencyKey: 'marketclarity-customer-stripeTestCustomerId-user_member' });
    expect(mock.update).toHaveBeenCalledWith('user_member', { privateMetadata: { stripeTestCustomerId: 'cus_new' } });
  });
  it('does not display archived, one-time, unsupported-currency, or zero prices', async () => {
    for (const invalid of [{ active: false }, { type: 'one_time' }, { currency: 'jpy' }, { unit_amount: 0 }, { recurring: { interval: 'week', interval_count: 1 } }]) {
      mock.prices.mockResolvedValue({ id: 'price_membership', active: true, type: 'recurring', currency: 'usd', unit_amount: 1000, recurring: { interval: 'month', interval_count: 1 }, ...invalid });
      expect(await availableMembershipPrices()).toEqual([]);
    }
  });
  it('rejects an app origin containing credentials, a path, or query parameters', () => {
    for (const value of ['https://user:password@example.com', 'https://example.com/research', 'https://example.com/?evil=yes']) {
      vi.stubEnv('APP_BASE_URL', value);
      expect(() => appOrigin()).toThrow();
    }
  });
});
