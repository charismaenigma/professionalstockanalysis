import { SignUp } from '@clerk/nextjs';
import { authConfigured, memberDestination, paywallEnabled } from '@/lib/membership-config';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!paywallEnabled()) redirect(memberDestination((await searchParams).next));
  if (!authConfigured()) redirect('/pricing');
  const { next } = await searchParams;
  const destination = next?.startsWith('/pricing?next=') ? `/pricing?next=${encodeURIComponent(memberDestination(new URL(next, 'https://marketclarity.invalid').searchParams.get('next')))}` : memberDestination(next);
  return <main className="shell authPage"><a className="radarBrand" href="/">MarketClarity</a>
    <SignUp forceRedirectUrl={destination} signInUrl={`/sign-in?next=${encodeURIComponent(destination)}`} /></main>;
}

