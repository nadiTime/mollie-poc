import { config, redirectUri } from './config';
import { getConnection, getTestmode, updateDb, type Connection } from './store';

const API = 'https://api.mollie.com';

export class MollieError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    const d = detail as { detail?: string; title?: string };
    super(d?.detail || d?.title || `Mollie API error ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

type FetchOpts = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: Record<string, unknown>;
  query?: Record<string, string | number | undefined>;
  token: string;
  /** Add testmode=true (query for GET/DELETE, body for POST/PATCH). Omit or false = live. */
  testmode?: boolean;
};

export async function mollieFetch<T = any>(path: string, opts: FetchOpts): Promise<T> {
  const method = opts.method || 'GET';
  const url = new URL(path.startsWith('http') ? path : `${API}${path}`);
  for (const [k, v] of Object.entries(opts.query || {})) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }

  let body = opts.body;
  if (opts.testmode) {
    if (method === 'GET' || method === 'DELETE') url.searchParams.set('testmode', 'true');
    else body = { ...(body || {}), testmode: true };
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${opts.token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new MollieError(res.status, json);
  return json as T;
}

/* ── OAuth ─────────────────────────────────────────────────────────────── */

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
};

async function exchange(params: Record<string, string>): Promise<TokenResponse> {
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const res = await fetch(`${API}/oauth2/tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new MollieError(res.status, json);
  return json as TokenResponse;
}

export function exchangeCode(code: string) {
  return exchange({
    grant_type: 'authorization_code',
    code,
    // Must mirror the authorize call: send it only if we sent it there.
    ...(config.omitRedirectUri ? {} : { redirect_uri: redirectUri() }),
  });
}

export function refreshToken(token: string) {
  return exchange({ grant_type: 'refresh_token', refresh_token: token });
}

/**
 * Returns the connected merchant's access token, refreshing it when it is
 * within 60s of expiry. Throws when no merchant is connected.
 */
export async function merchantToken(): Promise<string> {
  const conn = await getConnection();
  if (!conn) throw new Error('No Mollie account connected. Go to / and connect one first.');
  if (Date.now() < conn.expiresAt - 60_000) return conn.accessToken;

  const t = await refreshToken(conn.refreshToken);
  const updated: Connection = {
    ...conn,
    accessToken: t.access_token,
    refreshToken: t.refresh_token || conn.refreshToken,
    expiresAt: Date.now() + t.expires_in * 1000,
  };
  await updateDb((db) => {
    db.connection = updated;
  });
  return updated.accessToken;
}

/**
 * When you call Mollie with an OAuth access token the organization context is
 * ambiguous, so `profileId` is required on creation calls (payments, customers).
 */
export async function merchantProfileId(): Promise<string> {
  const conn = await getConnection();
  if (!conn) throw new Error('No Mollie account connected.');
  if (conn.profileId) return conn.profileId;

  const profiles = await mollieFetch<{ _embedded?: { profiles: { id: string }[] } }>('/v2/profiles', {
    token: await merchantToken(),
    query: { limit: 1 },
  });
  const id = profiles._embedded?.profiles?.[0]?.id;
  if (!id) throw new Error('Connected merchant has no payment profile.');
  await updateDb((db) => {
    if (db.connection) db.connection.profileId = id;
  });
  return id;
}

/**
 * A payment id doesn't say whether it's test or live, and with an OAuth token
 * Mollie 404s when you ask in the wrong mode. Webhooks for a payment can arrive
 * after the app switch has been flipped, so try the current mode, then the other.
 */
export async function fetchPayment<T = any>(id: string): Promise<T> {
  const testmode = await getTestmode();
  try {
    return await asMerchant<T>(`/v2/payments/${id}`, { testmode });
  } catch (e) {
    if (!(e instanceof MollieError) || e.status !== 404) throw e;
    return asMerchant<T>(`/v2/payments/${id}`, { testmode: !testmode });
  }
}

/**
 * Call the Mollie API as the connected merchant, in the mode of the app-wide
 * switch. Pass `testmode` only to override it for a resource whose mode is
 * already known, or `false` for org-level calls that aren't test/live scoped.
 */
export async function asMerchant<T = any>(
  path: string,
  opts: Omit<FetchOpts, 'token'> = {},
): Promise<T> {
  return mollieFetch<T>(path, {
    ...opts,
    testmode: opts.testmode ?? (await getTestmode()),
    token: await merchantToken(),
  });
}
