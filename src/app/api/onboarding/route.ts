import { NextResponse } from 'next/server';
import { asMerchant } from '@/lib/mollie';

export const dynamic = 'force-dynamic';

/** Onboarding / KYC status of the connected merchant. */
export async function GET() {
  try {
    const onboarding = await asMerchant('/v2/onboarding/me', { testmode: false });
    return NextResponse.json(onboarding);
  } catch (e: any) {
    return NextResponse.json({ error: e.message, detail: e.detail ?? null }, { status: 400 });
  }
}
