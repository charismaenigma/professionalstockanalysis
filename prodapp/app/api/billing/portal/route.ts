import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { appOrigin, linkedCustomer, stripeClient } from '@/lib/billing';
import { authConfigured, billingConfigured } from '@/lib/membership-config';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!authConfigured() || !billingConfigured()) return NextResponse.json({ error: 'Billing is temporarily unavailable.' }, { status: 503, headers });
  try {
    const origin = appOrigin();
    if (request.headers.get('origin') !== origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers });
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Sign in to manage billing.' }, { status: 401, headers });
    const customerId = await linkedCustomer(userId);
    if (!customerId) return NextResponse.json({ error: 'No billing account is linked to your membership.' }, { status: 404, headers });
    const session = await stripeClient().billingPortal.sessions.create({ customer: customerId, return_url: `${origin}/account` });
    return NextResponse.json({ url: session.url }, { headers });
  } catch {
    return NextResponse.json({ error: 'Unable to open billing. Please try again later.' }, { status: 503, headers });
  }
}
