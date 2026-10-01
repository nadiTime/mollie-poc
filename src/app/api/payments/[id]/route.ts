import { NextResponse } from 'next/server';
import { fetchPayment } from '@/lib/mollie';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await fetchPayment(id));
  } catch (e: any) {
    return NextResponse.json({ error: e.message, detail: e.detail ?? null }, { status: 400 });
  }
}
