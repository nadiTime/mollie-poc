'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';
import { useTestmode } from '@/lib/mode';

type Customer = { id: string; name: string; email: string };
type Mandate = { id: string; status: string; method: string; details: any };
type Mode = 'onetime' | 'subscription';
type Method = 'creditcard' | 'directdebit';

/**
 * mollie.js warns when `Mollie(...)` runs more than once and has no destroy API,
 * so keep one instance (and its card fields) per profile + mode for the page's
 * lifetime. Remounts only mount/unmount the existing components.
 */
type MollieSession = { m: any; components: any[] };
const mollieSessions = new Map<string, MollieSession>();

const CARD_FIELDS = [
  ['cardHolder', '#card-holder'],
  ['cardNumber', '#card-number'],
  ['expiryDate', '#card-expiry'],
  ['verificationCode', '#card-cvc'],
] as const;

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
  const testmode = useTestmode();
  // The mode this page loaded in. mollie.js can't switch modes in place: it has
  // no destroy API, and a leftover instance crashes on the next instance's
  // iframe messages ("reading 'isLoaded'"). So the card fields stay in this
  // mode, and a flip of the switch gets a full reload below.
  const loadedTestmode = useRef(testmode).current;
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

  useEffect(() => {
    if (testmode !== loadedTestmode) window.location.reload();
  }, [testmode, loadedTestmode]);

  /* ── Mollie Components ─────────────────────────────────────────────── */

  // A card token only works in the mode its Mollie instance was created in —
  // always `loadedTestmode` here, see above.
  //
  // Layout effect on purpose: its cleanup runs before React removes the field
  // elements, so `unmount()` happens first. In a passive effect the nodes are
  // already gone and mollie.js logs "component was not unmounted correctly".
  useLayoutEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    let mounted: any[] = [];

    const init = () => {
      const Mollie = (window as any).Mollie;
      if (!Mollie || cancelled) return;
      const key = `${profileId}:${loadedTestmode}`;
      let session = mollieSessions.get(key);
      if (!session) {
        const m = Mollie(profileId, { locale: 'en_US', testmode: loadedTestmode });
        session = {
          m,
          components: CARD_FIELDS.map(([name]) => m.createComponent(name, { styles: FIELD_STYLE })),
        };
        mollieSessions.set(key, session);
      }
      mollieRef.current = session.m;
      session.components.forEach((c, i) => c.mount(CARD_FIELDS[i][1]));
      mounted = session.components;
      setComponentsReady(true);
    };

    if ((window as any).Mollie) init();
    else {
      const s = document.createElement('script');
      s.src = 'https://js.mollie.com/v1/mollie.js';
      s.onload = init;
      s.onerror = () => setError('Could not load mollie.js');
      document.body.appendChild(s);
    }

    return () => {
      cancelled = true;
      for (const c of mounted) {
        try { c.unmount(); } catch { /* not mounted */ }
      }
    };
  }, [profileId, loadedTestmode]);

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
        // The mode the card token was made in; checkout refuses if the switch moved.
        testmode: loadedTestmode,
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
          our server.{' '}
          {testmode
            ? <>Test card: <span className="mono">4111 1111 1111 1111</span>, any future expiry, any CVC.</>
            : <strong>Live mode — use a real card; it will be charged.</strong>}
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
            {testmode ? (
              <>
                Test IBAN: <span className="mono">NL55INGB0000000000</span>. In test mode the mandate is valid
                immediately.
              </>
            ) : (
              <strong>Live mode — enter a real IBAN; it will be debited after a few business days.</strong>
            )}
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
          {!testmode && <span className="pill err">LIVE — this charges real money</span>}
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
