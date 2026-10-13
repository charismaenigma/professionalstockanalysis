'use client';
import { useState } from 'react';

export default function BillingButton({ action, priceId, destination, children }: {
  action: 'checkout' | 'portal'; priceId?: string; destination?: string; children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function openBilling() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/billing/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, destination }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Billing is temporarily unavailable.');
      const url = new URL(body.url);
      if (url.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname)) {
        throw new Error('Unable to open secure billing.');
      }
      window.location.assign(url.href);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Billing is temporarily unavailable.'); setBusy(false);
    }
  }
  return <div><button className="membershipButton" type="button" disabled={busy} onClick={openBilling}>
    {busy ? 'Opening secure billing…' : children}
  </button>{error && <p className="error" role="alert">{error}</p>}</div>;
}

