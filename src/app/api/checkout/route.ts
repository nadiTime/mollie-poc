import { NextRequest, NextResponse } from 'next/server';
import { applicationFee, paymentReturnUrl, SUBSCRIPTION_PLAN, webhookUrl } from '@/lib/config';
import { asMerchant, merchantProfileId } from '@/lib/mollie';
import { getTestmode } from '@/lib/store';
import { createSubscription } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

/**
 * One entry point for the whole payment screen. The caller says what it wants
 * (one-time or subscription, card or SEPA) and this figures out the Mollie
 * choreography:
 *
 *  card + one-time     → oneoff payment, redirect for 3DS
 *  card + subscription → `first` payment (redirect for 3DS) which leaves a
 *                        mandate; the subscription is created by the webhook
 *                        once that payment is actually paid
 *  SEPA + one-time     → register mandate, then charge it once (no redirect)
 *  SEPA + subscription → register mandate, then create the subscription
 *                        immediately (no redirect, no initial charge)
 */
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const mode: 'onetime' | 'subscription' = b.mode === 'subscription' ? 'subscription' : 'onetime';
    const method: 'creditcard' | 'directdebit' = b.method === 'directdebit' ? 'directdebit' : 'creditcard';
    const amount = Number(b.amount).toFixed(2);
    const description: string = b.description || 'PoC payment';
    // The page states the mode it was showing. If the switch was flipped since
    // (another tab), stop — a test card token can't pay live, and nobody should
    // be charged real money by a form that said "test".
    // Every call below uses this value, not a fresh read of the switch, so a flip
    // mid-request can't split one checkout across test and live.
    const testmode = await getTestmode();
    if (b.testmode !== testmode) {
      throw new Error(`The app is now in ${testmode ? 'test' : 'live'} mode — reload the page and try again.`);
    }

    if (!b.customerName || !b.customerEmail) {
      throw new Error('Customer name and email are required.');
    }

    // Every checkout gets its own fresh Mollie customer.
    const customer = await asMerchant('/v2/customers', {
      method: 'POST',
      testmode,
      body: {
        name: b.customerName,
        email: b.customerEmail,
        profileId: await merchantProfileId(),
      },
    });

    /* ── SEPA ────────────────────────────────────────────────────────── */
    if (method === 'directdebit') {
      const mandate = await asMerchant(`/v2/customers/${customer.id}/mandates`, {
        method: 'POST',
        testmode,
        body: {
          method: 'directdebit',
          consumerName: b.consumerName,
          consumerAccount: String(b.consumerAccount || '').replace(/\s+/g, ''),
          signatureDate: new Date().toISOString().slice(0, 10),
          mandateReference: `POC-${Date.now()}`,
        },
      });

      if (mode === 'subscription') {
        const subscription = await createSubscription({
          customerId: customer.id,
          amount,
          description: `${description} (${mandate.id})`,
          testmode,
        });
        return NextResponse.json({ mode, method, customer, mandate, subscription });
      }

      // One-time SEPA is a `recurring` payment against the fresh mandate.
      const payment = await createPayment({
        amount,
        description,
        customerId: customer.id,
        mandateId: mandate.id,
        sequenceType: 'recurring',
        testmode,
      });
      return NextResponse.json({ mode, method, customer, mandate, payment });
    }

    /* ── Card ────────────────────────────────────────────────────────── */
    if (!b.cardToken) throw new Error('Missing card token.');

    const subscribing = mode === 'subscription';

    // Mollie allows a €0.00 `first` payment on credit card purely to verify the
    // card and store a mandate — Stripe's SetupIntent equivalent. Nothing is
    // charged here, so the subscription itself can collect payment 1 today.
    const payment = await createPayment({
      amount: subscribing ? '0.00' : amount,
      description: subscribing ? `Card verification — ${description}` : description,
      method: 'creditcard',
      cardToken: b.cardToken,
      customerId: customer.id,
      sequenceType: subscribing ? 'first' : 'oneoff',
      // Read back by the webhook to know a subscription should follow.
      metadata: subscribing
        ? { source: 'mollie-connect-poc', intent: 'subscription', planAmount: amount, planDescription: description }
        : { source: 'mollie-connect-poc' },
      testmode,
    });

    return NextResponse.json({
      mode,
      method,
      customer,
      payment,
      checkoutUrl: payment._links?.checkout?.href ?? null,
      plan: mode === 'subscription' ? SUBSCRIPTION_PLAN : null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, detail: e.detail ?? null }, { status: 400 });
  }
}

async function createPayment(opts: {
  amount: string;
  description: string;
  sequenceType: 'oneoff' | 'first' | 'recurring';
  method?: string;
  cardToken?: string;
  customerId?: string;
  mandateId?: string;
  metadata?: Record<string, unknown>;
  testmode: boolean;
}) {
  const body: Record<string, unknown> = {
    amount: { currency: 'EUR', value: opts.amount },
    description: opts.description,
    profileId: await merchantProfileId(),
    webhookUrl: webhookUrl(),
    sequenceType: opts.sequenceType,
    metadata: opts.metadata ?? { source: 'mollie-connect-poc' },
  };
  // Nobody is present on a `recurring` payment, so Mollie rejects a redirectUrl.
  if (opts.sequenceType !== 'recurring') body.redirectUrl = paymentReturnUrl();
  if (opts.method) body.method = opts.method;
  if (opts.cardToken) body.cardToken = opts.cardToken;
  if (opts.customerId) body.customerId = opts.customerId;
  if (opts.mandateId) body.mandateId = opts.mandateId;

  // A €0.00 verification payment can't carry a fee.
  const fee = applicationFee(Number(opts.amount));
  if (fee) body.applicationFee = fee;

  return asMerchant('/v2/payments', { method: 'POST', testmode: opts.testmode, body });
}
