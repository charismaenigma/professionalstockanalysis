import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getMembership } from '@/lib/membership';
import { authConfigured, billingConfigured } from '@/lib/membership-config';
import BillingButton from '@/components/BillingButton';

export const dynamic = 'force-dynamic';
export default async function AccountPage() {
  if (!authConfigured()) redirect('/pricing');
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  const membership = await getMembership();
  return <main className="shell membershipPage"><a className="radarBrand" href="/">MarketClarity</a>
    <section className="panel"><span className="eyebrow">Your account</span><h1>Membership and billing</h1>
      <p>{membership.status === 'member' ? membership.admin ? 'Owner access is enabled.' : 'Your MarketClarity membership is active.'
        : membership.status === 'unavailable' ? 'Membership status is temporarily unavailable. Please try again later.' : 'You do not have an active membership.'}</p>
      <div className="accountActions">{membership.status === 'member' && <a className="membershipLink" href="/research">Open research</a>}
        <a href="/pricing">View membership options</a>
        {billingConfigured() && !membership.admin && <BillingButton action="portal">Manage billing or cancel</BillingButton>}</div>
      <p className="tiny">A subscription canceled at the end of its billing period keeps access through the paid period.</p>
    </section></main>;
}

