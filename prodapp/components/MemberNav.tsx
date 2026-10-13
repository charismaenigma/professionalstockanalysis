'use client';
import { Show, UserButton } from '@clerk/nextjs';

export default function MemberNav({ configured }: { configured: boolean }) {
  return <nav className="memberNav" aria-label="Account">
    <a href="/pricing">Membership</a>
    {configured && <><Show when="signed-out"><a href="/sign-in">Sign in</a></Show>
      <Show when="signed-in"><a href="/account">My account</a><UserButton /></Show></>}
  </nav>;
}

