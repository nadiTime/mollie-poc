import { NextResponse } from 'next/server';
import { asMerchant } from '@/lib/mollie';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await asMerchant(`/v2/payments/${id}`, { testmode: true }));
  } catch (e: any) {
    return NextResponse.json({ error: e.message, detail: e.detail ?? null }, { status: 400 });
  }
}
