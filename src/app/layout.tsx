import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Mollie Connect PoC',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <span className="brand">Mollie Connect PoC</span>
          <Link href="/">Connect</Link>
          <Link href="/pay">Pay</Link>
          <Link href="/subscriptions">Subscriptions</Link>
          <Link href="/webhooks">Webhooks</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
