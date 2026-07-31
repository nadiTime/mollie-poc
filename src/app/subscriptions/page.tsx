'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, money } from '@/lib/client';

type Customer = { id: string; name: string; email: string };

export default function SubscriptionsPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [subs, setSubs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api<Customer[]>('/api/customers')
      .then((c) => { setCustomers(c); setCustomerId((p) => p || c[0]?.id || ''); })
      .catch((e) => setError(e.message));
  }, []);

  const load = useCallback(() => {
    // No customer selected → list the whole organization's subscriptions.
    const url = customerId ? `/api/subscriptions?customerId=${customerId}` : '/api/subscriptions';
    api(url).then(setSubs).catch((e) => setError(e.message));
  }, [customerId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const cancel = async (s: any) => {
    setError(null);
    try {
      await api(`/api/subscriptions?customerId=${s.customerId}&id=${s.id}`, { method: 'DELETE' });
      setNotice(`Subscription ${s.id} cancelled`);
      load();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <>
      <h1>Subscriptions</h1>
      <p className="muted small">
        Created from the <Link href="/pay">Pay</Link> tab — pick &ldquo;Subscription&rdquo; there. Mollie runs
        the schedule and calls our webhook for every payment it generates.
      </p>

      {error && <div className="banner err">{error}</div>}
      {notice && <div className="banner ok">{notice}</div>}

      <div className="card">
        <h2>Customer</h2>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">— all customers —</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name} · {c.email} · {c.id}</option>
          ))}
        </select>
      </div>

      <div className="card">
        <h2>Active &amp; past subscriptions</h2>
        {subs.length === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>ID</th><th>Amount</th><th>Schedule</th><th>Next</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id}>
                  <td className="mono small">{s.id}<br /><span className="muted">{s.description}</span></td>
                  <td>{money(s.amount)}</td>
                  <td>every {s.interval}{s.times ? ` × ${s.times}` : ''}</td>
                  <td className="small">{s.nextPaymentDate || '—'}</td>
                  <td>
                    <span className={`pill ${s.status === 'active' ? 'ok' : s.status === 'pending' ? 'warn' : ''}`}>
                      {s.status}
                    </span>
                  </td>
                  <td>
                    {s.status === 'active' && <button className="danger" onClick={() => cancel(s)}>Cancel</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
