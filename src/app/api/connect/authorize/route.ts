import { NextResponse } from 'next/server';
import { config, redirectUri, SCOPES } from '@/lib/config';
import { updateDb } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!config.clientId || !config.clientSecret) {
    return NextResponse.json(
      { error: 'MOLLIE_CLIENT_ID / MOLLIE_CLIENT_SECRET are not set in .env' },
      { status: 500 },
    );
  }

  const state = crypto.randomUUID();
  await updateDb((db) => {
    db.oauthState = state;
  });

  const url = new URL('https://my.mollie.com/oauth2/authorize');
  url.searchParams.set('client_id', config.clientId);
  // Optional per Mollie: when omitted, Mollie uses the URL registered on the app.
  if (!config.omitRedirectUri) url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('state', state);
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('approval_prompt', config.approvalPrompt);

  return NextResponse.redirect(url.toString());
}
