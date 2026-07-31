import { NextResponse } from 'next/server';
import { readDb, updateDb } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = await readDb();
  return NextResponse.json(db.webhooks);
}

export async function DELETE() {
  await updateDb((db) => {
    db.webhooks = [];
  });
  return NextResponse.json({ ok: true });
}
