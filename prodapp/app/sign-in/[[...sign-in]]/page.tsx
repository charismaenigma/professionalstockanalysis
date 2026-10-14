import { SignIn } from '@clerk/nextjs';
import { authConfigured, memberDestination, paywallEnabled } from '@/lib/membership-config';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!paywallEnabled()) redirect(memberDestination((await searchParams).next));
  if (!authConfigured()) redirect('/pricing');
  const { next } = await searchParams;
  const destination = next?.startsWith('/pricing?next=') ? `/pricing?next=${encodeURIComponent(memberDestination(new URL(next, 'https://marketclarity.invalid').searchParams.get('next')))}` : memberDestination(next);
  return <main className="shell authPage"><a className="radarBrand" href="/">MarketClarity</a>
    <SignIn forceRedirectUrl={destination} signUpUrl={`/sign-up?next=${encodeURIComponent(destination)}`} /></main>;
}

