import { NextResponse } from 'next/server';
import { asMerchant, merchantProfileId } from '@/lib/mollie';

export const dynamic = 'force-dynamic';

/**
 * Which payment methods the connected merchant's profile actually has enabled.
 * `/v2/methods/all` reports every method with its activation status, which is
 * what you need when a payment fails with "method is not enabled".
 */
export async function GET() {
  try {
    const profileId = await merchantProfileId();
    const [enabled, all] = await Promise.all([
      asMerchant('/v2/methods', { testmode: true, query: { profileId } }),
      asMerchant('/v2/methods/all', { testmode: true, query: { profileId } }),
    ]);
    return NextResponse.json({
      profileId,
      enabled: (enabled._embedded?.methods ?? []).map((m: any) => m.id),
      all: (all._embedded?.methods ?? []).map((m: any) => ({ id: m.id, status: m.status })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, detail: e.detail ?? null }, { status: 400 });
  }
}
