# Mollie Connect PoC

> Full description and a click-by-click walkthrough: **[POC.md](./POC.md)**

Local-only proof of concept for Mollie Connect:

- **OAuth connect** — platform app authorizes an existing merchant account, tokens auto-refresh
- **Onboarding status** — `GET /v2/onboarding/me` for the connected merchant
- **Credit card via Mollie Components** — card fields embedded in our own page, tokenized client-side
- **SEPA Direct Debit** — name + IBAN collected in our own UI, registered as a mandate directly (the "Stripe way")
- **One-time and recurring** — one-off card payments, `first` card payments that store a mandate, on-demand charges against a mandate, and full Subscriptions API (create / list / cancel)
- **Webhook inspector** — every Mollie ping logged with raw body, headers, and the resource fetched back

Everything runs against the **connected merchant** through Connect: OAuth access token + their `profileId`,
with `testmode: true` on every call.

## Setup

### 1. ngrok

Mollie rejects `localhost` for `webhookUrl` and `redirectUrl`, so the app has to be publicly reachable.

```bash
ngrok http 3000
```

Copy the `https://….ngrok-free.dev` URL.

### 2. Create the OAuth app (in your PLATFORM Mollie account)

Dashboard → **Developers → Your apps → Create app**:

- Redirect URL: `https://<your-ngrok>.ngrok-free.dev/api/connect/callback`
- Copy the **Client ID** (`app_…`) and **Client secret**

### 3. Env

```bash
cp .env.example .env
```

Fill in `MOLLIE_CLIENT_ID`, `MOLLIE_CLIENT_SECRET`, `PUBLIC_URL` (the ngrok URL, no trailing slash).

### 4. Run

```bash
npm install
npm run dev
```

Open the **ngrok URL** (not localhost) so the OAuth redirect and cookies line up.

## Flow

1. **Connect tab** → *Connect a Mollie account* → log in with your **merchant/customer** Mollie account
   (not the platform one) and approve. You land back with the org name and profile id shown.
2. **Pay tab** → pick **Type** (one-time / subscription) × **Method** (card / SEPA), fill in the
   customer and amount, submit. A fresh Mollie customer is created on every submit. What happens:
   - *One-time + card* — `oneoff` payment, 3DS redirect
   - *One-time + SEPA* — register mandate, charge it once, no redirect
   - *Subscription + card* — `€0.00` verification payment (3DS redirect) → the **webhook** creates the
     subscription once it's paid
   - *Subscription + SEPA* — register mandate and create the subscription in one request, no redirect
3. **Subscriptions tab** → watch and cancel. Creation happens on the Pay tab.
4. **Webhooks tab** → auto-refreshing log of every incoming ping.

### Test credentials

| What | Value |
| --- | --- |
| Card | `4111 1111 1111 1111`, any future expiry, any CVC |
| IBAN | `NL55INGB0000000000` |

In test mode Mollie shows a status-picker on the hosted checkout — pick `paid` / `failed` to drive the
webhook. Payments with **no** checkout screen (SEPA, and any `recurring` charge) are created `pending`
and never move on their own; use the **Set this test payment's status →** link the Pay and Webhooks
tabs surface.

## Notes / gotchas hit while building this

See **[POC.md](./POC.md)** §8 for a full Mollie-vs-Stripe comparison and §5 for what the paying
customer actually sees.

- With an **OAuth access token** the org context is ambiguous, so `profileId` is **required** when
  creating payments, customers **and subscriptions**. It's fetched once at connect time and cached.
- `testmode: true` must be sent explicitly on every call — access tokens are not test-scoped like API keys.
- `sequenceType: recurring` payments must **not** carry a `redirectUrl` (nobody is present to redirect).
- Mollie's webhook body is `application/x-www-form-urlencoded` and contains only `id=tr_…`. The status
  is never in the payload — you always fetch the resource back. The webhook route does exactly that.
- Subscription `description` must be unique per customer.
- Subscription minimum interval is **1 day** and Mollie charges one immediately on creation unless you
  pass a future `startDate`.
- **SEPA Direct Debit must be activated** per website profile (Mollie reviews it, ~3 business days,
  generally needs completed KYC) or every SEPA call fails with *"The payment method is not enabled in
  your website profile"*.
- Mollie's one-off `directdebit` checkout method is a separate, usually-not-enabled product. This PoC
  registers mandates directly instead.
- `applicationFee` is off by default (`APPLICATION_FEE_AMOUNT` empty). Enable it to see the platform
  fee split; payment creation fails if the connected org isn't eligible for it.

## Storage

`.data/db.json` — tokens and the webhook log. Delete the file to reset. No locking,
no encryption; local PoC only.
