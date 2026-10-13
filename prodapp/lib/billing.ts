import 'server-only';
import Stripe from 'stripe';
import { clerkClient } from '@clerk/nextjs/server';
import { billingConfigured, membershipPriceIds } from './membership-config';
import { subscriptionGrantsAccess } from './subscription-access';

export function stripeClient() {
  if (!billingConfigured()) throw new Error('Membership enrollment is not open yet.');
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { timeout: 15000, maxNetworkRetries: 1 });
}

export function appOrigin() {
  const url = new URL(process.env.APP_BASE_URL!);
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')) {
    throw new Error('A secure application origin is required.');
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('APP_BASE_URL must be an origin without a path or query.');
  }
  return url.origin;
}

function customerMetadataKey() {
  return process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'stripeLiveCustomerId' : 'stripeTestCustomerId';
}

export async function linkedCustomer(userId: string, create = false) {
  const clerk = await clerkClient();
  const user = await clerk.users.getUser(userId);
  const metadataKey = customerMetadataKey();
  const existing = user.privateMetadata[metadataKey];
  const stripe = stripeClient();
  if (typeof existing === 'string') {
    const customer = await stripe.customers.retrieve(existing);
    if (!customer.deleted && customer.metadata.clerkUserId === userId) return existing;
    // A mismatched owner fails closed; never relink an existing payment account by email.
    throw new Error('Unable to verify membership ownership.');
  }
  if (!create) return null;
  const email = user.emailAddresses.find(address => address.id === user.primaryEmailAddressId)?.emailAddress;
  const customer = await stripe.customers.create({
    ...(email ? { email } : {}),
    metadata: { clerkUserId: userId, application: 'marketclarity' },
  }, { idempotencyKey: `marketclarity-customer-${metadataKey}-${userId}` });
  await clerk.users.updateUserMetadata(userId, { privateMetadata: { [metadataKey]: customer.id } });
  return customer.id;
}

export async function customerHasMembership(customerId: string) {
  const subscriptions = stripeClient().subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
  for await (const subscription of subscriptions) {
    if (subscriptionGrantsAccess(subscription, membershipPriceIds())) return true;
  }
  return false;
}

export type MembershipPrice = { id: string; amount: number; currency: string; interval: 'month' | 'year' };
export async function availableMembershipPrices(): Promise<MembershipPrice[]> {
  if (!billingConfigured()) return [];
  const stripe = stripeClient();
  const prices = await Promise.all(membershipPriceIds().map(id => stripe.prices.retrieve(id)));
  return prices.filter(price => price.active && price.currency === 'usd' && price.type === 'recurring' && price.unit_amount != null
    && price.unit_amount > 0 && price.recurring?.interval_count === 1
    && ['month', 'year'].includes(price.recurring?.interval ?? '')).map(price => ({
      id: price.id, amount: price.unit_amount!, currency: price.currency,
      interval: price.recurring!.interval as 'month' | 'year',
    }));
}

