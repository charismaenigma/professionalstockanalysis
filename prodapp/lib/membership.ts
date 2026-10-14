import 'server-only';
import { cache } from 'react';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { authConfigured, billingConfigured, memberDestination, paywallEnabled } from './membership-config';
import { customerHasMembership, linkedCustomer } from './billing';

export type Membership = {
  status: 'member' | 'signed-out' | 'not-subscribed' | 'unavailable';
  userId?: string;
  admin?: boolean;
};

// React cache deduplicates within a render; membership is never cached across users or requests.
export const getMembership = cache(async (): Promise<Membership> => {
  if (!authConfigured()) return { status: 'unavailable' };
  try {
    const { userId } = await auth();
    if (!userId) return { status: 'signed-out' };
    const admins = (process.env.MARKETCLARITY_ADMIN_USER_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean);
    if (admins.includes(userId)) return { status: 'member', userId, admin: true };
    if (!billingConfigured()) return { status: 'unavailable', userId };
    const customerId = await linkedCustomer(userId);
    const hasAccess = customerId ? await customerHasMembership(customerId) : false;
    return { status: hasAccess ? 'member' : 'not-subscribed', userId };
  } catch {
    // Provider outages must not turn into free access or expose SDK errors/secrets.
    return { status: 'unavailable' };
  }
});

export async function requireMemberPage(destination: string) {
  if (!paywallEnabled()) return { status: 'public' as const };
  const membership = await getMembership();
  if (membership.status === 'member') return membership;
  const next = encodeURIComponent(memberDestination(destination));
  if (membership.status === 'signed-out') redirect(`/sign-in?next=${next}`);
  redirect(`/pricing?next=${next}`);
}

export async function requireMemberApi() {
  if (!paywallEnabled()) return null;
  const membership = await getMembership();
  if (membership.status === 'member') return null;
  const status = membership.status === 'signed-out' ? 401 : membership.status === 'unavailable' ? 503 : 403;
  return NextResponse.json({
    error: status === 401 ? 'Sign in to access MarketClarity research.'
      : status === 403 ? 'An active MarketClarity membership is required.'
      : 'Membership access is temporarily unavailable.',
  }, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

