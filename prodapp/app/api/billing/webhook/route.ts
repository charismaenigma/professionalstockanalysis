import { clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { authConfigured, billingConfigured, liveStripeKey } from '@/lib/membership-config';
import { customerMetadataKey, customerHasMembership, stripeClient } from '@/lib/billing';

export const runtime = 'nodejs';
const events = new Set([
  'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed',
  'invoice.paid', 'invoice.payment_failed',
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'customer.subscription.paused', 'customer.subscription.resumed',
]);

export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!authConfigured() || !billingConfigured() || !webhookSecret) {
    return NextResponse.json({ error: 'Billing notifications are not configured.' }, { status: 503, headers });
  }
  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature.' }, { status: 400, headers });
  const stripe = stripeClient();
  let event: Stripe.Event;
  try {
    // Verify the exact raw body; never accept a parsed or unsigned event.
    event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: 'Invalid billing notification.' }, { status: 400, headers });
  }
  if (event.livemode !== liveStripeKey()) return NextResponse.json({ error: 'Incorrect billing environment.' }, { status: 400, headers });
  if (!events.has(event.type)) return NextResponse.json({ received: true }, { headers });
  const object = event.data.object as Stripe.Checkout.Session | Stripe.Invoice | Stripe.Subscription;
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = object as Stripe.Checkout.Session;
    if (!['paid', 'no_payment_required'].includes(session.payment_status)) {
      return NextResponse.json({ received: true }, { headers });
    }
  }
  const customerId = typeof object.customer === 'string' ? object.customer : object.customer?.id;
  if (!customerId) return NextResponse.json({ received: true }, { headers });
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted || customer.metadata.application !== 'marketclarity') {
      return NextResponse.json({ received: true }, { headers });
    }
    const userId = customer.metadata.clerkUserId;
    if (!userId) return NextResponse.json({ received: true }, { headers });
    const clerk = await clerkClient();
    const user = await clerk.users.getUser(userId);
    if (user.privateMetadata[customerMetadataKey()] !== customerId) {
      return NextResponse.json({ error: 'Membership ownership could not be verified.' }, { status: 409, headers });
    }
    // Re-read current state instead of trusting event order. Retries are idempotent;
    // an old paid event cannot reinstate an expired or canceled subscription.
    const active = await customerHasMembership(customerId);
    await clerk.users.updateUserMetadata(userId, { privateMetadata: {
      [liveStripeKey() ? 'stripeLiveMembership' : 'stripeTestMembership']: {
        active, checkedAt: new Date().toISOString(), lastEventId: event.id,
      },
    } });
    return NextResponse.json({ received: true }, { headers });
  } catch {
    // A failed reconciliation remains retryable and never acknowledges fulfillment.
    return NextResponse.json({ error: 'Billing notification could not be processed.' }, { status: 503, headers });
  }
}
