'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/client';

type Status = {
  connected: boolean;
  organizationId: string | null;
  organizationName: string | null;
  profileId: string | null;
  connectedAt: string | null;
  tokenExpiresAt: string | null;
  env: Record<string, any>;
};

function ConnectPage() {
  const params = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [onboarding, setOnboarding] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api<Status>('/api/connect/status').then(setStatus).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const env = status?.env;

  return (
    <>
      <h1>Mollie Connect</h1>
      <p className="muted small">Platform app ↔ connected merchant account, test or live per the switch in the top bar.</p>

      {params.get('msg') && <div className="banner">{params.get('msg')}</div>}
      {error && <div className="banner err">{error}</div>}

      <div className="card">
        <h2>Setup</h2>
        {!env ? (
          <p className="muted">Loading…</p>
        ) : (
          <table>
            <tbody>
              <tr>
                <th>Client ID / secret</th>
                <td>
                  <span className={`pill ${env.hasClientId && env.hasClientSecret ? 'ok' : 'err'}`}>
                    {env.hasClientId && env.hasClientSecret ? 'set' : 'missing in .env'}
                  </span>
                </td>
              </tr>
              <tr>
                <th>Public URL</th>
                <td className="mono">
                  {env.publicUrl}{' '}
                  {env.publicUrlIsLocalhost && (
                    <span className="pill err">localhost — Mollie will reject webhooks</span>
                  )}
                </td>
              </tr>
              <tr>
                <th>Redirect URI</th>
                <td className="mono small">{env.redirectUri}</td>
              </tr>
              <tr>
                <th>Webhook URL</th>
                <td className="mono small">{env.webhookUrl}</td>
              </tr>
              <tr>
                <th>Application fee</th>
                <td>{env.applicationFee ?? <span className="muted">disabled</span>}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Connected merchant</h2>
        {status?.connected ? (
          <>
            <table>
              <tbody>
                <tr><th>Organization</th><td>{status.organizationName} <span className="mono muted">{status.organizationId}</span></td></tr>
                <tr><th>Profile</th><td className="mono">{status.profileId || <span className="pill warn">none</span>}</td></tr>
                <tr><th>Connected at</th><td>{new Date(status.connectedAt!).toLocaleString()}</td></tr>
                <tr><th>Token expires</th><td>{new Date(status.tokenExpiresAt!).toLocaleString()} <span className="muted small">(auto-refreshed)</span></td></tr>
              </tbody>
            </table>
            <div className="row" style={{ marginTop: 14 }}>
              <button onClick={() => api('/api/onboarding').then(setOnboarding).catch((e) => setError(e.message))}>
                Check onboarding status
              </button>
              <button className="secondary" onClick={() => (window.location.href = '/api/connect/authorize')}>
                Re-authorize
              </button>
              <button
                className="danger"
                onClick={() => api('/api/connect/disconnect', { method: 'POST' }).then(load)}
              >
                Disconnect
              </button>
            </div>
            {onboarding && <pre>{JSON.stringify(onboarding, null, 2)}</pre>}
          </>
        ) : (
          <>
            <p className="muted">
              No account connected. This sends you to Mollie&apos;s consent screen — log in there with your{' '}
              <strong>customer/merchant</strong> account, not the platform one.
            </p>
            <button onClick={() => (window.location.href = '/api/connect/authorize')}>
              Connect a Mollie account
            </button>
          </>
        )}
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <ConnectPage />
    </Suspense>
  );
}
