import { NextResponse } from 'next/server';
import { updateDb } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST() {
  await updateDb((db) => {
    db.connection = null;
    db.oauthState = null;
  });
  return NextResponse.json({ ok: true });
}
