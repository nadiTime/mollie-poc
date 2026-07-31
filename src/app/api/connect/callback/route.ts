import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { exchangeCode, mollieFetch } from '@/lib/mollie';
import { readDb, updateDb } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const back = (msg: string) => NextResponse.redirect(`${config.publicUrl}/?msg=${encodeURIComponent(msg)}`);

  if (error) return back(`Mollie returned: ${error} — ${url.searchParams.get('error_description') || ''}`);
  if (!code) return back('No authorization code in callback.');

  const db = await readDb();
  if (!state || state !== db.oauthState) return back('State mismatch — possible CSRF, aborted.');

  try {
    const token = await exchangeCode(code);

    // Identify the merchant we just connected to.
    const org = await mollieFetch<{ id: string; name?: string }>('/v2/organizations/me', {
      token: token.access_token,
    });

    // The profile id is needed client-side to initialise Mollie Components.
    let profileId: string | undefined;
    try {
      const profiles = await mollieFetch<{ _embedded?: { profiles: { id: string }[] } }>(
        '/v2/profiles',
        { token: token.access_token, query: { limit: 1 } },
      );
      profileId = profiles._embedded?.profiles?.[0]?.id;
    } catch {
      // non-fatal; the UI surfaces the missing profile
    }

    await updateDb((d) => {
      d.oauthState = null;
      d.connection = {
        organizationId: org.id,
        organizationName: org.name,
        profileId,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: Date.now() + token.expires_in * 1000,
        connectedAt: new Date().toISOString(),
      };
    });

    return back(`Connected to ${org.name || org.id}`);
  } catch (e: any) {
    return back(`Token exchange failed: ${e.message}`);
  }
}
