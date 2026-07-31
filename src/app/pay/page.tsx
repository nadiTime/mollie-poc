'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';

type Customer = { id: string; name: string; email: string };
type Mandate = { id: string; status: string; method: string; details: any };
type Mode = 'onetime' | 'subscription';
type Method = 'creditcard' | 'directdebit';

/** Mirrors SUBSCRIPTION_PLAN on the server. */
const PLAN_LABEL = 'daily, 2 payments total';

/**
 * Test-mode payments with no checkout screen (recurring / direct debit) get a
 * `changePaymentState` link instead — open it to force paid/failed by hand.
 * Without it SEPA test payments sit at `pending` forever.
 */
function ChangeStateLink({ payment }: { payment: any }) {
  const href = payment?._links?.changePaymentState?.href;
  if (!href) return null;
  return (
    <p className="small">
      <a href={href} target="_blank" rel="noreferrer">
        Set this test payment&apos;s status →
      </a>{' '}
      <span className="muted">
        no checkout screen for this payment, so Mollie leaves the outcome to you
      </span>
    </p>
  );
}

const FIELD_STYLE = {
  base: {
    color: '#e6e8ee',
    fontSize: '14px',
    fontFamily: 'ui-sans-serif, -apple-system, sans-serif',
    '::placeholder': { color: '#99a0b0' },
  },
  valid: { color: '#37c98a' },
};

export default function PayPage() {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const [mode, setMode] = useState<Mode>('onetime');
  const [method, setMethod] = useState<Method>('creditcard');

  // A fresh Mollie customer is created server-side on every submit.
  const [customer, setCustomer] = useState({ name: 'Jan de Vries', email: 'jan@example.com' });
  const [lastCustomer, setLastCustomer] = useState<Customer | null>(null);
  const [mandates, setMandates] = useState<Mandate[]>([]);

  const [amount, setAmount] = useState('10.00');
  const [description, setDescription] = useState('PoC payment');
  const [sepa, setSepa] = useState({ consumerName: 'Jan de Vries', consumerAccount: 'NL55INGB0000000000' });

  const mollieRef = useRef<any>(null);
  const [componentsReady, setComponentsReady] = useState(false);

  /* ── bootstrap ─────────────────────────────────────────────────────── */

  useEffect(() => {
    api('/api/connect/status').then((s) => {
      setConnected(s.connected);
      setProfileId(s.profileId);
    });
  }, []);

  const loadMandates = useCallback(() => {
    if (!lastCustomer) return setMandates([]);
    api<Mandate[]>(`/api/mandates?customerId=${lastCustomer.id}`)
      .then(setMandates)
      .catch(() => setMandates([]));
  }, [lastCustomer]);

  useEffect(() => { loadMandates(); }, [loadMandates]);

  /* ── Mollie Components ─────────────────────────────────────────────── */

  useEffect(() => {
    if (!profileId || mollieRef.current) return;

    const init = () => {
      const Mollie = (window as any).Mollie;
      if (!Mollie) return;
      const m = Mollie(profileId, { locale: 'en_US', testmode: true });
      mollieRef.current = m;
      for (const [name, el] of [
        ['cardHolder', '#card-holder'],
        ['cardNumber', '#card-number'],
        ['expiryDate', '#card-expiry'],
        ['verificationCode', '#card-cvc'],
      ] as const) {
        m.createComponent(name, { styles: FIELD_STYLE }).mount(el);
      }
      setComponentsReady(true);
    };

    if ((window as any).Mollie) return init();
    const s = document.createElement('script');
    s.src = 'https://js.mollie.com/v1/mollie.js';
    s.onload = init;
    s.onerror = () => setError('Could not load mollie.js');
    document.body.appendChild(s);
  }, [profileId]);

  /* ── actions ───────────────────────────────────────────────────────── */

  /** Single submit for every combination — the server decides the choreography. */
  const submit = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const payload: Record<string, unknown> = {
        mode,
        method,
        amount,
        description,
        customerName: customer.name,
        customerEmail: customer.email,
      };

      if (method === 'creditcard') {
        const { token, error: tokenError } = await mollieRef.current.createToken();
        if (tokenError) throw new Error(tokenError.message || 'Card details are invalid');
        payload.cardToken = token;
      } else {
        payload.consumerName = sepa.consumerName;
        payload.consumerAccount = sepa.consumerAccount;
      }

      const r = await api('/api/checkout', { method: 'POST', body: JSON.stringify(payload) });
      setResult(r);
      setLastCustomer(r.customer);

      if (r.checkoutUrl) {
        sessionStorage.setItem('lastPaymentId', r.payment.id);
        sessionStorage.setItem('lastMode', mode);
        window.location.href = r.checkoutUrl;
        return;
      }

      if (r.subscription) {
        setNotice(
          `Subscription ${r.subscription.id} is ${r.subscription.status} — ${PLAN_LABEL}, ` +
            `first charge ${r.subscription.nextPaymentDate}.`,
        );
      } else if (r.payment) {
        setNotice(`Payment ${r.payment.id} is ${r.payment.status}. Watch the Webhooks tab.`);
      }
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  /* ── render ────────────────────────────────────────────────────────── */

  if (connected === false) {
    return (
      <div className="banner err">
        No Mollie account connected. Go to <Link href="/">Connect</Link> first.
      </div>
    );
  }

  const blocked = !customer.name.trim() || !customer.email.trim();

  const buttonLabel =
    mode === 'onetime'
      ? method === 'creditcard' ? 'Pay once' : 'Register mandate & charge once'
      : method === 'creditcard' ? 'Verify card & start subscription' : 'Start subscription';

  return (
    <>
      <h1>Payments</h1>
      <p className="muted small">
        All calls run as the connected merchant via Connect (OAuth access token + their profile id).
      </p>

      {error && <div className="banner err">{error}</div>}
      {notice && <div className="banner ok">{notice}</div>}

      <div className="card">
        <h2>What are we selling?</h2>
        <div className="row">
          <div className="col">
            <label>Type</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              <option value="onetime">One-time payment</option>
              <option value="subscription">Subscription — {PLAN_LABEL}</option>
            </select>
          </div>
          <div className="col">
            <label>Method</label>
            <select value={method} onChange={(e) => setMethod(e.target.value as Method)}>
              <option value="creditcard">Credit card</option>
              <option value="directdebit">SEPA Direct Debit</option>
            </select>
          </div>
          <div className="col">
            <label>Amount (EUR){mode === 'subscription' ? ' — per charge' : ''}</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="col" style={{ flex: 2 }}>
            <label>Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>

        <p className="muted small" style={{ marginBottom: 0, marginTop: 12 }}>
          {mode === 'onetime' && method === 'creditcard' &&
            'One-off card payment. Redirects to Mollie for the 3DS step, then back here.'}
          {mode === 'onetime' && method === 'directdebit' &&
            'Registers a SEPA mandate from the IBAN below, then charges it once. No redirect.'}
          {mode === 'subscription' && method === 'creditcard' && (
            <>
              Runs a <span className="mono">€0.00</span> <span className="mono">first</span> payment to
              verify the card and store a mandate — Mollie&apos;s equivalent of a Stripe SetupIntent.
              Nothing is charged there; you still take the 3DS redirect. The subscription is created{' '}
              <strong>automatically by the webhook</strong> once verification succeeds, and Mollie
              collects payment 1 of 2 immediately.
            </>
          )}
          {mode === 'subscription' && method === 'directdebit' &&
            'Registers a SEPA mandate and creates the subscription straight away. No redirect. Mollie collects payment 1 of 2 immediately, the second tomorrow.'}
        </p>
      </div>

      <div className="card">
        <h2>Customer</h2>
        <p className="muted small">
          A new Mollie customer is created for every submit — no picker, no reuse.
        </p>
        <div className="row">
          <div className="col">
            <label>Name</label>
            <input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
          </div>
          <div className="col">
            <label>Email</label>
            <input value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
          </div>
        </div>
        {lastCustomer && (
          <p className="small muted" style={{ marginBottom: 0 }}>
            Last created: <span className="mono">{lastCustomer.id}</span> · {lastCustomer.name} ·{' '}
            {lastCustomer.email}
          </p>
        )}
      </div>

      <div className="card" style={{ display: method === 'creditcard' ? 'block' : 'none' }}>
        <h2>Card details</h2>
        <p className="muted small">
          Fields are hosted by Mollie inside this page and tokenised client-side — the number never reaches
          our server. Test card: <span className="mono">4111 1111 1111 1111</span>, any future expiry, any CVC.
        </p>
        <div className="row">
          <div className="col" style={{ flex: 2 }}>
            <label>Card holder</label>
            <div id="card-holder" className="mollie-field" />
          </div>
          <div className="col" style={{ flex: 2 }}>
            <label>Card number</label>
            <div id="card-number" className="mollie-field" />
          </div>
          <div className="col">
            <label>Expiry</label>
            <div id="card-expiry" className="mollie-field" />
          </div>
          <div className="col">
            <label>CVC</label>
            <div id="card-cvc" className="mollie-field" />
          </div>
        </div>
      </div>

      {method === 'directdebit' && (
        <div className="card">
          <h2>Bank account</h2>
          <p className="muted small">
            Test IBAN: <span className="mono">NL55INGB0000000000</span>. In test mode the mandate is valid
            immediately.
          </p>
          <div className="row">
            <div className="col">
              <label>Account holder</label>
              <input value={sepa.consumerName} onChange={(e) => setSepa({ ...sepa, consumerName: e.target.value })} />
            </div>
            <div className="col" style={{ flex: 2 }}>
              <label>IBAN</label>
              <input className="mono" value={sepa.consumerAccount} onChange={(e) => setSepa({ ...sepa, consumerAccount: e.target.value })} />
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="row" style={{ alignItems: 'center' }}>
          <button
            disabled={busy || blocked || (method === 'creditcard' && !componentsReady)}
            onClick={submit}
          >
            {busy ? 'Working…' : buttonLabel}
          </button>
          {blocked && <span className="muted small">Customer name and email are required.</span>}
          {method === 'creditcard' && !componentsReady && <span className="muted small">loading mollie.js…</span>}
        </div>
      </div>

      <div className="card">
        <h2>Mandates {lastCustomer && <span className="mono muted small">{lastCustomer.id}</span>}</h2>
        {!lastCustomer ? (
          <p className="muted">Mandates of the customer created by your last submit will show here.</p>
        ) : mandates.length === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>ID</th><th>Method</th><th>Details</th><th>Status</th></tr>
            </thead>
            <tbody>
              {mandates.map((m) => (
                <tr key={m.id}>
                  <td className="mono small">{m.id}</td>
                  <td>{m.method}</td>
                  <td className="small muted">{m.details?.consumerAccount || m.details?.cardNumber || '—'}</td>
                  <td>
                    <span className={`pill ${m.status === 'valid' ? 'ok' : m.status === 'pending' ? 'warn' : 'err'}`}>
                      {m.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {result && (
        <div className="card">
          <h2>Last API response</h2>
          <ChangeStateLink payment={result.payment ?? result} />
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </>
  );
}
