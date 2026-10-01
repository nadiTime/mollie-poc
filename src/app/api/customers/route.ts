import { NextResponse } from 'next/server';
import { asMerchant } from '@/lib/mollie';

export const dynamic = 'force-dynamic';

/** Customers are created by /api/checkout — this is the listing for the UI. */
export async function GET() {
  try {
    const res = await asMerchant('/v2/customers', { query: { limit: 50 } });
    return NextResponse.json(res._embedded?.customers ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message, detail: e.detail ?? null }, { status: 400 });
  }
}
