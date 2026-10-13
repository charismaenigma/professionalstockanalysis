import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { authConfigured, billingConfigured, memberDestination } from '@/lib/membership-config';
import { appOrigin, availableMembershipPrices, customerHasMembership, linkedCustomer, stripeClient } from '@/lib/billing';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!authConfigured() || !billingConfigured()) return NextResponse.json({ error: 'Membership enrollment is not open yet.' }, { status: 503, headers });
  try {
    const origin = appOrigin();
    if (request.headers.get('origin') !== origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers });
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Sign in before subscribing.' }, { status: 401, headers });
    const body = await request.json();
    const prices = await availableMembershipPrices();
    const price = prices.find(price => price.id === body.priceId);
    if (!price) return NextResponse.json({ error: 'Select an available membership plan.' }, { status: 400, headers });
    const customerId = await linkedCustomer(userId, true);
    if (!customerId) throw new Error('Customer unavailable');
    if (await customerHasMembership(customerId)) return NextResponse.json({ error: 'You already have an active membership. Manage it from your account.' }, { status: 409, headers });
    const stripe = stripeClient();
    const destination = memberDestination(typeof body.destination === 'string' ? body.destination : undefined);
    const successUrl = `${origin}/billing/return?next=${encodeURIComponent(destination)}`;
    const cancelUrl = `${origin}/pricing?next=${encodeURIComponent(destination)}`;
    const open = await stripe.checkout.sessions.list({ customer: customerId, status: 'open', limit: 100 });
    const reusable = open.data.find(session => session.metadata?.clerkUserId === userId && session.metadata?.priceId === price.id
      && session.success_url === successUrl && session.url);
    if (reusable) return NextResponse.json({ url: reusable.url }, { headers });
    // Close other unfinished MarketClarity sessions so changing plans does not leave multiple checkouts open.
    for (const session of open.data.filter(session => session.metadata?.application === 'marketclarity')) {
      await stripe.checkout.sessions.expire(session.id);
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', customer: customerId, client_reference_id: userId,
      line_items: [{ price: price.id, quantity: 1 }], success_url: successUrl, cancel_url: cancelUrl,
      metadata: { application: 'marketclarity', clerkUserId: userId, priceId: price.id },
      subscription_data: { metadata: { application: 'marketclarity', clerkUserId: userId } },
      ...(process.env.STRIPE_AUTOMATIC_TAX === 'true' ? { automatic_tax: { enabled: true }, customer_update: { address: 'auto' as const } } : {}),
    }, { idempotencyKey: `marketclarity-checkout-${userId}-${price.id}-${Math.floor(Date.now() / 60000)}` });
    if (!session.url) throw new Error('Checkout unavailable');
    return NextResponse.json({ url: session.url }, { headers });
  } catch {
    return NextResponse.json({ error: 'Unable to start checkout. Please try again later.' }, { status: 503, headers });
  }
}

