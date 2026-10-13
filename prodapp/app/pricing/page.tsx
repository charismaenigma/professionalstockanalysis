import { availableMembershipPrices } from '@/lib/billing';
import { getMembership } from '@/lib/membership';
import { memberDestination, checkoutConfigured } from '@/lib/membership-config';
import BillingButton from '@/components/BillingButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Membership | MarketClarity' };
export default async function PricingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const destination = memberDestination(next);
  const [membership, prices] = await Promise.all([
    getMembership(), availableMembershipPrices().catch(() => []),
  ]);
  const ready = prices.length > 0 && membership.status !== 'unavailable' && checkoutConfigured();
  return <main className="shell membershipPage">
    <a className="radarBrand" href="/">MarketClarity</a>
    <section className="panel membershipIntro"><span className="eyebrow">MarketClarity membership</span>
      <h1>Make the evidence part of your process.</h1>
      <p>Member access brings company research and the Daily Opportunity Radar together in one place.</p>
      <ul className="membershipFeatures"><li>Company strength, valuation and growth analysis</li>
        <li>Four separate research perspectives</li><li>Conditional swing setups and risk explanations</li>
        <li>Daily Opportunity Radar and full company reports</li></ul>
      {membership.status === 'member' ? <div className="membershipNotice"><b>Your membership is active.</b>
        <p><a className="membershipLink" href={destination}>Open MarketClarity →</a></p>
        <a href="/account">Manage your account</a></div> : ready ?
        <div className="pricingGrid">{prices.map(price => <article className="priceCard" key={price.id}>
          <h2>{price.interval === 'month' ? 'Monthly membership' : 'Annual membership'}</h2>
          <div className="membershipPrice">{new Intl.NumberFormat('en-US', { style: 'currency', currency: price.currency }).format(price.amount / 100)}<span> / {price.interval}</span></div>
          <p>Full access to MarketClarity research.</p>
          {membership.userId ? <BillingButton action="checkout" priceId={price.id} destination={destination}>Subscribe</BillingButton>
            : <a className="membershipLink" href={`/sign-up?next=${encodeURIComponent(`/pricing?next=${encodeURIComponent(destination)}`)}`}>Create an account to subscribe</a>}
          <p className="tiny">Renews automatically until canceled. Manage billing and cancellation in your account. Applicable taxes may be added at checkout.</p>
        </article>)}</div> : <div className="membershipNotice"><h2>Monthly membership</h2>
          <div className="membershipPrice">$12.99<span> / month</span></div>
          <p><strong>Membership enrollment is not open yet.</strong></p>
          <p>MarketClarity’s research tools are now reserved for members. Please check back for subscription availability.</p></div>}
      <p className="tiny">Educational research only. Scores are research classifications, not predictions or guarantees of investment returns.</p>
    </section>
  </main>;
}

