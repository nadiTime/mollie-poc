import { NextRequest, NextResponse } from 'next/server';
import { asMerchant } from '@/lib/mollie';

export const dynamic = 'force-dynamic';

/** List mandates of a customer. Mandates are created by /api/checkout. */
export async function GET(req: NextRequest) {
  const customerId = new URL(req.url).searchParams.get('customerId');
  if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 });
  try {
    const res = await asMerchant(`/v2/customers/${customerId}/mandates`);
    return NextResponse.json(res._embedded?.mandates ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message, detail: e.detail ?? null }, { status: 400 });
  }
}
