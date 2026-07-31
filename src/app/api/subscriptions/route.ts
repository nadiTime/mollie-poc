import { NextRequest, NextResponse } from 'next/server';
import { applicationFee, webhookUrl } from '@/lib/config';
import { asMerchant, merchantProfileId } from '@/lib/mollie';

export const dynamic = 'force-dynamic';

/** Subscriptions of one customer, or of the whole organization. */
export async function GET(req: NextRequest) {
  const customerId = new URL(req.url).searchParams.get('customerId');
  const path = customerId ? `/v2/customers/${customerId}/subscriptions` : '/v2/subscriptions';
  try {
    const res = await asMerchant(path, { testmode: true, query: { limit: 50 } });
    return NextResponse.json(res._embedded?.subscriptions ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message, detail: e.detail ?? null }, { status: 400 });
  }
}

/**
 * Mollie charges these itself on the given interval and calls our webhook for
 * every generated payment. Requires the customer to have a valid mandate
 * (SEPA registered directly, or created by a `first` card payment).
 */
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const body: Record<string, unknown> = {
      amount: { currency: 'EUR', value: Number(b.amount).toFixed(2) },
      interval: b.interval || '1 months',
      description: b.description || `PoC subscription ${Date.now()}`,
      webhookUrl: webhookUrl(),
      profileId: await merchantProfileId(),
      metadata: { source: 'mollie-connect-poc' },
    };
    if (b.times) body.times = Number(b.times);
    if (b.startDate) body.startDate = b.startDate;
    if (b.mandateId) body.mandateId = b.mandateId;

    const fee = applicationFee();
    if (fee) body.applicationFee = fee;

    const sub = await asMerchant(`/v2/customers/${b.customerId}/subscriptions`, {
      method: 'POST',
      testmode: true,
      body,
    });
    return NextResponse.json(sub);
  } catch (e: any) {
    return NextResponse.json({ error: e.message, detail: e.detail ?? null }, { status: 400 });
  }
}

/** Cancel a subscription. */
export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const customerId = url.searchParams.get('customerId');
  const id = url.searchParams.get('id');
  try {
    const res = await asMerchant(`/v2/customers/${customerId}/subscriptions/${id}`, {
      method: 'DELETE',
      testmode: true,
    });
    return NextResponse.json(res);
  } catch (e: any) {
    return NextResponse.json({ error: e.message, detail: e.detail ?? null }, { status: 400 });
  }
}
