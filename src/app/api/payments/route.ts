import { NextResponse } from 'next/server';
import { asMerchant } from '@/lib/mollie';

export const dynamic = 'force-dynamic';

/** Recent payments of the connected merchant. Payments are created by /api/checkout. */
export async function GET() {
  try {
    const res = await asMerchant('/v2/payments', { query: { limit: 25 } });
    return NextResponse.json(res._embedded?.payments ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message, detail: e.detail ?? null }, { status: 400 });
  }
}
