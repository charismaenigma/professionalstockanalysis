import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import { subscriptionGrantsAccess } from './subscription-access';
import { memberDestination } from './membership-config';

const subscription = (status = 'active', price = 'price_membership', end = 2000, quantity = 1, pause = null) => ({
  status, pause_collection: pause,
  items: { data: [{ price: { id: price }, current_period_end: end, quantity }] },
}) as unknown as Pick<Stripe.Subscription, 'status' | 'items' | 'pause_collection'>;

describe('paid membership eligibility', () => {
  it('permits a current active or configured trial subscription', () => {
    for (const status of ['active', 'trialing']) expect(subscriptionGrantsAccess(subscription(status), ['price_membership'], 1000)).toBe(true);
  });
  it.each(['past_due', 'unpaid', 'canceled', 'paused', 'incomplete', 'incomplete_expired'])('denies %s subscriptions', status => {
    expect(subscriptionGrantsAccess(subscription(status), ['price_membership'], 1000)).toBe(false);
  });
  it('denies another product, zero seats, expired access, or no allowlist', () => {
    expect(subscriptionGrantsAccess(subscription('active', 'price_other'), ['price_membership'], 1000)).toBe(false);
    expect(subscriptionGrantsAccess(subscription('active', 'price_membership', 2000, 0), ['price_membership'], 1000)).toBe(false);
    expect(subscriptionGrantsAccess(subscription('active', 'price_membership', 1000), ['price_membership'], 1000)).toBe(false);
    expect(subscriptionGrantsAccess(subscription(), [], 1000)).toBe(false);
  });
  it('denies paused collection even if Stripe still calls the subscription active', () => {
    expect(subscriptionGrantsAccess({ ...subscription(), pause_collection: { behavior: 'void', resumes_at: null } }, ['price_membership'], 1000)).toBe(false);
  });
  it('keeps access during a paid period scheduled for cancellation', () => {
    const scheduled = { ...subscription(), cancel_at_period_end: true };
    expect(subscriptionGrantsAccess(scheduled, ['price_membership'], 1000)).toBe(true);
    expect(subscriptionGrantsAccess(scheduled, ['price_membership'], 2000)).toBe(false);
  });
});

describe('safe return destinations', () => {
  it('preserves a selected ticker and the radar destination', () => {
    expect(memberDestination('/research?ticker=MSFT')).toBe('/research?ticker=MSFT');
    expect(memberDestination('/radar')).toBe('/radar');
  });
  it.each(['https://evil.example', '//evil.example', '/\\evil.example', '/research/../../account', '/api/research', '/research\n'])('rejects %s', destination => {
    expect(memberDestination(destination)).toBe('/research');
  });
});

