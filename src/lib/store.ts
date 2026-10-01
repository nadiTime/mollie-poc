import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Dead-simple JSON file store. Good enough for a local PoC — do not use this
 * for anything real (no locking, whole file rewritten on every mutation).
 */

export type Connection = {
  organizationId: string;
  organizationName?: string;
  profileId?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  connectedAt: string;
};

export type WebhookEvent = {
  id: string;
  receivedAt: string;
  body: string;
  parsed: Record<string, unknown> | null;
  headers: Record<string, string>;
  /** Resource we fetched back from Mollie after the ping. */
  resourceKind?: string;
  resource?: unknown;
  fetchError?: string;
  /** Set when this webhook triggered automatic subscription creation. */
  subscriptionCreated?: unknown;
  subscriptionError?: string;
};

type Db = {
  connection: Connection | null;
  oauthState: string | null;
  webhooks: WebhookEvent[];
  /** Payment ids we already turned into a subscription — webhooks can repeat. */
  subscribedPaymentIds: string[];
  /** App-wide test/live switch, flipped from the nav. Every Mollie call follows it. */
  testmode: boolean;
};

const DB_DIR = path.join(process.cwd(), '.data');
const DB_FILE = path.join(DB_DIR, 'db.json');

const EMPTY: Db = { connection: null, oauthState: null, webhooks: [], subscribedPaymentIds: [], testmode: true };

export async function readDb(): Promise<Db> {
  try {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY };
  }
}

export async function writeDb(db: Db): Promise<void> {
  await fs.mkdir(DB_DIR, { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
}

export async function updateDb(fn: (db: Db) => void | Promise<void>): Promise<Db> {
  const db = await readDb();
  await fn(db);
  await writeDb(db);
  return db;
}

export async function getConnection(): Promise<Connection | null> {
  return (await readDb()).connection;
}

export async function getTestmode(): Promise<boolean> {
  return (await readDb()).testmode;
}

export async function setTestmode(testmode: boolean): Promise<void> {
  await updateDb((db) => {
    db.testmode = testmode;
  });
}

export async function addWebhook(event: WebhookEvent): Promise<void> {
  await updateDb((db) => {
    db.webhooks.unshift(event);
    db.webhooks = db.webhooks.slice(0, 100);
  });
}
