import { NextRequest, NextResponse } from 'next/server';
import { asMerchant } from '@/lib/mollie';
import { addWebhook, readDb, updateDb, type WebhookEvent } from '@/lib/store';
import { createSubscription } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

/**
 * Mollie posts `id=<resource id>` as application/x-www-form-urlencoded and
 * expects a 2xx quickly. The payload never contains the status — you always
 * fetch the resource back, which is what we do here so the log shows the
 * actual state at the time of the ping.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k] = v;
  });

  let id: string | null = null;
  let parsed: Record<string, unknown> | null = null;
  try {
    if (headers['content-type']?.includes('json')) {
      parsed = JSON.parse(raw);
      id = (parsed as any)?.id ?? null;
    } else {
      const params = new URLSearchParams(raw);
      parsed = Object.fromEntries(params.entries());
      id = params.get('id');
    }
  } catch {
    /* keep raw only */
  }

  const event: WebhookEvent = {
    id: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    body: raw,
    parsed,
    headers,
  };

  if (id) {
    event.resourceKind = id.split('_')[0];
    // Payments are the only resource we can fetch from the id alone;
    // mandates/subscriptions need the customer id too.
    if (id.startsWith('tr_')) {
      try {
        const payment = await asMerchant(`/v2/payments/${id}`, { testmode: true });
        event.resource = payment;
        await maybeStartSubscription(payment, event);
      } catch (e: any) {
        event.fetchError = e.message;
      }
    }
  }

  await addWebhook(event);

  // Always 200 — a non-2xx makes Mollie retry for ~26 hours.
  return new NextResponse('ok', { status: 200 });
}

/**
 * A card subscription can only be created after its `first` payment succeeds,
 * and the reliable signal for that is this webhook — not the browser coming
 * back, which may never happen. The payment carries `metadata.intent` so we
 * know it was meant to start a subscription.
 */
async function maybeStartSubscription(payment: any, event: WebhookEvent) {
  if (payment?.metadata?.intent !== 'subscription') return;
  if (payment.status !== 'paid') return;
  if (!payment.customerId) {
    event.subscriptionError = 'Payment has no customerId — cannot subscribe.';
    return;
  }


  // Mollie retries webhooks; only ever act once per payment.
  const db = await readDb();
  if (db.subscribedPaymentIds.includes(payment.id)) return;
  await updateDb((d) => {
    if (!d.subscribedPaymentIds.includes(payment.id)) d.subscribedPaymentIds.push(payment.id);
  });

  try {
    event.subscriptionCreated = await createSubscription({
      customerId: payment.customerId,
      amount: payment.metadata.planAmount || payment.amount.value,
      description: `${payment.metadata.planDescription || payment.description} (${payment.id})`,
      mandateId: payment.mandateId,
      // The first payment was a €0.00 verification, so the full plan is still
      // owed and Mollie collects payment 1 right away.
    });
  } catch (e: any) {
    event.subscriptionError = e.message;
    // Let a retry try again.
    await updateDb((d) => {
      d.subscribedPaymentIds = d.subscribedPaymentIds.filter((p) => p !== payment.id);
    });
  }
}

/** Mollie pings the URL with GET when you save it in the dashboard. */
export async function GET() {
  return new NextResponse('Mollie webhook endpoint is up', { status: 200 });
}
