'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client';

type Event = {
  id: string;
  receivedAt: string;
  body: string;
  parsed: Record<string, any> | null;
  headers: Record<string, string>;
  resourceKind?: string;
  resource?: any;
  fetchError?: string;
  subscriptionCreated?: any;
  subscriptionError?: string;
};

export default function WebhooksPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [url, setUrl] = useState('');

  useEffect(() => {
    api('/api/connect/status').then((s) => setUrl(s.env.webhookUrl)).catch(() => {});
  }, []);

  useEffect(() => {
    const tick = () => api<Event[]>('/api/webhooks').then(setEvents).catch(() => {});
    tick();
    if (!auto) return;
    const t = setInterval(tick, 2000);
    return () => clearInterval(t);
  }, [auto]);

  return (
    <>
      <h1>Incoming webhooks</h1>
      <p className="muted small">
        Endpoint: <span className="mono">{url}</span> — Mollie POSTs only <span className="mono">id=…</span>,
        so each entry also shows the resource fetched back from the API.
      </p>

      <div className="row" style={{ marginBottom: 16 }}>
        <button className="secondary" onClick={() => setAuto(!auto)}>
          {auto ? 'Pause auto-refresh' : 'Resume auto-refresh'}
        </button>
        <button className="danger" onClick={() => api('/api/webhooks', { method: 'DELETE' }).then(() => setEvents([]))}>
          Clear log
        </button>
        <span className="muted small" style={{ alignSelf: 'center' }}>{events.length} event(s)</span>
      </div>

      {events.length === 0 && (
        <div className="card muted">
          Nothing yet. Make a payment on the Pay tab — with ngrok running and{' '}
          <span className="mono">PUBLIC_URL</span> pointing at it.
        </div>
      )}

      {events.map((e) => {
        const status = e.resource?.status;
        const tone = status === 'paid' ? 'ok' : status === 'open' || status === 'pending' ? 'warn' : status ? 'err' : '';
        return (
          <div className="card" key={e.id}>
            <div className="row" style={{ alignItems: 'center' }}>
              <span className="small muted">{new Date(e.receivedAt).toLocaleTimeString()}</span>
              <span className="mono">{e.parsed?.id || '(no id)'}</span>
              {status && <span className={`pill ${tone}`}>{status}</span>}
              {e.resource?.sequenceType && <span className="pill">{e.resource.sequenceType}</span>}
              {e.resource?.method && <span className="pill">{e.resource.method}</span>}
              {e.resource?.subscriptionId && <span className="pill">subscription</span>}
              {e.subscriptionCreated && <span className="pill ok">subscription created</span>}
              {e.subscriptionError && <span className="pill err">subscription failed</span>}
              {e.fetchError && <span className="pill err">fetch failed</span>}
              <span style={{ flex: 1 }} />
              <button className="secondary" onClick={() => setOpen(open === e.id ? null : e.id)}>
                {open === e.id ? 'Hide' : 'Details'}
              </button>
            </div>
            {e.resource?._links?.changePaymentState?.href && (
              <p className="small">
                <a href={e.resource._links.changePaymentState.href} target="_blank" rel="noreferrer">
                  Set this test payment&apos;s status →
                </a>{' '}
                <span className="muted">forces paid/failed on a payment that has no checkout screen</span>
              </p>
            )}
            {e.fetchError && <p className="small" style={{ color: 'var(--err)' }}>{e.fetchError}</p>}
            {e.subscriptionError && <p className="small" style={{ color: 'var(--err)' }}>{e.subscriptionError}</p>}
            {e.subscriptionCreated && (
              <p className="small">
                Auto-created subscription <span className="mono">{e.subscriptionCreated.id}</span> — next
                charge {e.subscriptionCreated.nextPaymentDate}
              </p>
            )}
            {open === e.id && (
              <>
                <h3>Raw body</h3>
                <pre>{e.body || '(empty)'}</pre>
                <h3>Headers</h3>
                <pre>{JSON.stringify(e.headers, null, 2)}</pre>
                <h3>Resource fetched back</h3>
                <pre>{e.resource ? JSON.stringify(e.resource, null, 2) : '(not fetched)'}</pre>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}
