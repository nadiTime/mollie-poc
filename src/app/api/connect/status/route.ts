import { NextResponse } from 'next/server';
import { config, redirectUri, webhookUrl } from '@/lib/config';
import { readDb } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = await readDb();
  const c = db.connection;
  return NextResponse.json({
    connected: !!c,
    organizationId: c?.organizationId ?? null,
    organizationName: c?.organizationName ?? null,
    profileId: c?.profileId ?? null,
    connectedAt: c?.connectedAt ?? null,
    tokenExpiresAt: c ? new Date(c.expiresAt).toISOString() : null,
    env: {
      publicUrl: config.publicUrl,
      redirectUri: redirectUri(),
      webhookUrl: webhookUrl(),
      testmode: config.testmode,
      hasClientId: !!config.clientId,
      hasClientSecret: !!config.clientSecret,
      applicationFee: config.applicationFeePercent
        ? `${config.applicationFeePercent}%`
        : config.applicationFeeAmount
          ? `EUR ${config.applicationFeeAmount}`
          : null,
      publicUrlIsLocalhost: config.publicUrl.includes('localhost'),
    },
  });
}
