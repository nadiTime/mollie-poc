import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ModeProvider, ModeToggle } from '@/lib/mode';
import { getTestmode } from '@/lib/store';

export const metadata: Metadata = {
  title: 'Mollie Connect PoC',
};

// The mode lives in .data/db.json, so this can't be prerendered at build time.
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const testmode = await getTestmode();
  return (
    <html lang="en">
      {/* data-mode lets CSS paint the chrome red while live. */}
      <body data-mode={testmode ? 'test' : 'live'}>
        <ModeProvider testmode={testmode}>
          <nav>
            <span className="brand">Mollie Connect PoC</span>
            <Link href="/">Connect</Link>
            <Link href="/pay">Pay</Link>
            <Link href="/subscriptions">Subscriptions</Link>
            <Link href="/webhooks">Webhooks</Link>
            <ModeToggle />
          </nav>
          <main>{children}</main>
        </ModeProvider>
      </body>
    </html>
  );
}
