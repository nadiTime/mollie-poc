'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, money } from '@/lib/client';

export default function ReturnPage() {
  const [payment, setPayment] = useState<any>(null);
  const [subs, setSubs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const wasSubscription = typeof window !== 'undefined' && sessionStorage.getItem('lastMode') === 'subscription';

  useEffect(() => {
    const id = sessionStorage.getItem('lastPaymentId');
    if (!id) return setError('No payment id remembered in this browser session.');

    const tick = async () => {
      try {
        const p = await api(`/api/payments/${id}`);
        setPayment(p);
        // The subscription is created by the webhook, so it appears a moment
        // after the payment flips to paid.
        if (p.customerId) {
          api(`/api/subscriptions?customerId=${p.customerId}`).then(setSubs).catch(() => {});
        }
      } catch (e: any) { setError(e.message); }
    };

    tick();
    const t = setInterval(tick, 2000);
    setTimeout(() => clearInterval(t), 30000);
    return () => clearInterval(t);
  }, []);

  const status = payment?.status;
  const tone = status === 'paid' ? 'ok' : status === 'open' || status === 'pending' ? 'warn' : 'err';
  const linked = subs.filter((s) => s.description?.includes(payment?.id));

  return (
    <>
      <h1>Back from Mollie</h1>
      {error && <div className="banner err">{error}</div>}

      {payment && (
        <div className="card">
          <div className="row" style={{ alignItems: 'center', marginBottom: 12 }}>
            <span className={`pill ${tone}`}>{status}</span>
            <span className="pill">{payment.sequenceType}</span>
            <strong>{money(payment.amount)}</strong>
            <span className="muted">{payment.description}</span>
            <span className="mono muted small">{payment.id}</span>
          </div>
          {payment.mandateId && (
            <p className="small">Mandate stored: <span className="mono">{payment.mandateId}</span></p>
          )}
          <p className="muted small">
            Polling for 30s — the definitive signal is the webhook, see <Link href="/webhooks">Webhooks</Link>.
          </p>
          <pre>{JSON.stringify(payment, null, 2)}</pre>
        </div>
      )}

      {wasSubscription && (
        <div className="card">
          <h2>Subscription</h2>
          {linked.length > 0 ? (
            linked.map((s) => (
              <p key={s.id}>
                <span className="pill ok">{s.status}</span>{' '}
                <span className="mono">{s.id}</span> — {money(s.amount)} every {s.interval}
                {s.times ? ` × ${s.times}` : ''}, next charge {s.nextPaymentDate}.
              </p>
            ))
          ) : status === 'paid' ? (
            <p className="muted">
              Waiting for the webhook to create it — this happens server-side, so it will complete even if
              you leave this page.
            </p>
          ) : (
            <p className="muted">
              Will be created once this payment is paid. Nothing is scheduled while the payment is{' '}
              <span className="mono">{status}</span>.
            </p>
          )}
        </div>
      )}

      <Link href="/pay">← back to payments</Link>
    </>
  );
}
