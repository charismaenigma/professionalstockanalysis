import { getMembership } from '@/lib/membership';
import { memberDestination, paywallEnabled } from '@/lib/membership-config';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export default async function BillingReturnPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const destination = memberDestination(next);
  if (!paywallEnabled()) redirect(destination);
  const membership = await getMembership();
  if (membership.status === 'member') redirect(destination);
  if (membership.status === 'signed-out') redirect(`/sign-in?next=${encodeURIComponent(destination)}`);
  return <main className="shell membershipPage"><section className="panel"><span className="eyebrow">Secure checkout</span>
    <h1>We’re checking your membership.</h1><p>Access opens once your subscription is confirmed. If you just finished checkout, confirmation may take a moment.</p>
    <a className="membershipLink" href={`/billing/return?next=${encodeURIComponent(destination)}`}>Check membership again</a>
    <p><a href="/account">Go to your account</a></p></section></main>;
}

