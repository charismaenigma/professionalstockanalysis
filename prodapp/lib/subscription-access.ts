import type Stripe from 'stripe';

// A paid invoice alone, a different product, or a checkout return URL never grants access.
export function subscriptionGrantsAccess(
  subscription: Pick<Stripe.Subscription, 'status' | 'items' | 'pause_collection'>,
  allowedPriceIds: string[],
  now = Math.floor(Date.now() / 1000),
) {
  if (!['active', 'trialing'].includes(subscription.status) || subscription.pause_collection) return false;
  return subscription.items.data.some(item =>
    allowedPriceIds.includes(item.price.id) && item.quantity != null && item.quantity > 0
    && item.current_period_end > now,
  );
}

