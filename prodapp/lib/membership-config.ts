export function authConfigured() {
  const publicKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!publicKey || !secretKey) return false;
  if (process.env.VERCEL_ENV === 'production') {
    return publicKey.startsWith('pk_live_') && secretKey.startsWith('sk_live_');
  }
  return true;
}

export function membershipPriceIds() {
  return [process.env.STRIPE_MONTHLY_PRICE_ID, process.env.STRIPE_ANNUAL_PRICE_ID]
    .filter((id): id is string => Boolean(id));
}

export function billingConfigured() {
  const key = process.env.STRIPE_SECRET_KEY;
  return Boolean(key && membershipPriceIds().length && process.env.APP_BASE_URL
    && (process.env.VERCEL_ENV !== 'production' || /^(sk|rk)_live_/.test(key)));
}

export function checkoutConfigured() {
  return billingConfigured() && Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

export function liveStripeKey() {
  return /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? '');
}

// Return URLs are fixed local member routes, never arbitrary URLs from a request.
export function memberDestination(value?: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/research';
  try {
    const url = new URL(value, 'https://marketclarity.invalid');
    if (url.origin !== 'https://marketclarity.invalid' || !['/research', '/radar'].includes(url.pathname)) return '/research';
    return `${url.pathname}${url.search}`;
  } catch {
    return '/research';
  }
}

