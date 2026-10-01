# Mollie Connect PoC — description & walkthrough

A local-only Next.js app that demonstrates the full Mollie Connect surface: a **platform** app that
onboards and authorizes a **merchant** account over OAuth, then creates card and SEPA payments —
one-time and recurring — on that merchant's behalf, with every incoming webhook logged and inspectable.

Nothing is deployed, nothing is persisted beyond a local JSON file. It exists to be clicked through.

---

## 1. What this PoC proves

| Question | Where it's answered |
| --- | --- |
| Can we authorize an existing Mollie merchant into our platform? | Connect tab → *Connect a Mollie account* |
| Can we see whether a merchant finished KYC? | Connect tab → *Check onboarding status* |
| Can we render our own card form instead of redirecting? | Pay tab → Mollie Components fields |
| Can we take SEPA the way Stripe does (name + IBAN, no redirect)? | Pay tab → *Register mandate* |
| Can we charge a saved payment method with nobody present? | Every SEPA charge and every subscription payment — `sequenceType: recurring`, no shopper, no redirect |
| Can Mollie run the recurring schedule for us? | Subscriptions tab |
| Do all of the above bill through the connected merchant, not us? | Every call uses their OAuth token + `profileId` |
| Can we take a platform cut? | `APPLICATION_FEE_AMOUNT` in `.env` |
| What do the webhooks actually look like? | Webhooks tab |

---

## 2. What exists

### Pages

| Route | Contents |
| --- | --- |
| `/` — **Connect** | Setup checklist (env vars, public URL, redirect URI, webhook URL, test mode, app fee), connected-merchant panel with org/profile/token expiry, re-authorize & disconnect, onboarding-status button |
| `/pay` — **Pay** | One-time vs subscription × card vs SEPA, one submit button · a fresh customer created per submit · card through Mollie Components · SEPA name+IBAN · read-only mandate table · last raw API response, with the test-mode *set status* link when present |
| `/pay/return` — **Return** | Where Mollie sends the shopper back after a card redirect; polls the payment for 20s and shows its final state |
| `/subscriptions` — **Subscriptions** | Read-only list (per customer or org-wide, polled every 5s) with amount, schedule, next payment date, status — plus cancel. Creation lives on `/pay` |
| `/webhooks` — **Webhooks** | Auto-refreshing (2s) log of every ping: raw body, all headers, and the resource fetched back from Mollie. Pause / clear |

### API routes

| Route | Method | Mollie call behind it |
| --- | --- | --- |
| `/api/connect/authorize` | GET | Redirect to `my.mollie.com/oauth2/authorize` |
| `/api/connect/callback` | GET | `POST /oauth2/tokens` + `GET /v2/organizations/me` + `GET /v2/profiles` |
| `/api/connect/status` | GET | — (local state + env diagnostics) |
| `/api/connect/disconnect` | POST | — (drops stored tokens) |
| `/api/onboarding` | GET | `GET /v2/onboarding/me` |
| `/api/customers` | GET | `GET /v2/customers` — listing only |
| `/api/mandates` | GET | `GET /v2/customers/{id}/mandates` — listing only |
| `/api/payments` | GET | `GET /v2/payments` — listing only |
| `/api/payments/[id]` | GET | `GET /v2/payments/{id}` |
| `/api/subscriptions` | GET / POST / DELETE | `/v2/customers/{id}/subscriptions` |
| `/api/checkout` | POST | One entry point for the Pay screen — decides the mandate/payment/subscription choreography from `mode` × `method` |
| `/api/webhooks/mollie` | POST | Receives Mollie's ping, fetches the payment back, logs it, and auto-creates the subscription for a paid `first` payment |
| `/api/webhooks` | GET / DELETE | Read/clear the local log |

### Source layout

```
src/
  lib/
    config.ts     env, scopes, redirect/webhook URLs, application-fee helper
    mollie.ts     fetch wrapper, OAuth exchange/refresh, merchantToken(), merchantProfileId()
    store.ts      .data/db.json — tokens, webhook log, subscription idempotency
    subscription.ts  the single SUBSCRIPTION_PLAN, created from mandate
    client.ts     tiny browser fetch helper
  app/
    page.tsx  pay/  subscriptions/  webhooks/  api/
```

### Scope of the PoC — what it deliberately is not

- No database, no auth, no multi-tenancy — one connected merchant at a time, stored in `.data/db.json`
- No webhook signature verification (Mollie doesn't sign; the id is fetched back instead)
- No refunds, chargebacks, payment links, or order API
- Test mode only

---

## 3. Prerequisites

- Node 20+ (built and tested on Node 25)
- `ngrok` installed and authenticated
- Two Mollie accounts: the **platform** account (owns the OAuth app) and a **merchant** account
  (the one that will be connected). Both can stay in test mode.

---

## 4. Walkthrough

### Step 1 — Start ngrok

Mollie refuses `localhost` for both `webhookUrl` and `redirectUrl`, so the app must be publicly
reachable before anything else.

```bash
ngrok http 3000
```

Copy the forwarding URL, e.g. `https://a1b2c3d4.ngrok-free.dev`. **Keep this terminal open** — a free
ngrok URL changes every restart, and if it does you must update both `.env` and the Mollie app's
redirect URL.

### Step 2 — Create the OAuth app in the PLATFORM account

Log into the **platform** Mollie account → **Developers → Your apps → Create app**.

> Create a **new, dedicated app** for this PoC. Do not reuse an app that serves production
> merchants: changing its redirect URL breaks the live integration, and `approval_prompt=force`
> revokes existing merchant authorizations for that app. (This PoC defaults to `auto` for that
> reason — `MOLLIE_APPROVAL_PROMPT=force` is opt-in.)

- **Redirect URL**: `https://a1b2c3d4.ngrok-free.dev/api/connect/callback` (your ngrok URL + that path — it must match exactly)
- Save, then copy the **Client ID** (`app_…`) and **Client secret** (shown once)

### Step 3 — Configure `.env`

```bash
cd /Users/nadico/Dev/lunda/mollie-connect-poc
cp .env.example .env
```

Edit `.env`:

```bash
MOLLIE_CLIENT_ID=app_xxxxxxxxxxxx
MOLLIE_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxx
PUBLIC_URL=https://a1b2c3d4.ngrok-free.dev   # no trailing slash
MOLLIE_TESTMODE=true

# optional
APPLICATION_FEE_AMOUNT=
```

### Step 4 — Install & run

```bash
npm install
npm run dev
```

### Step 5 — Open the app through ngrok

Go to **`https://a1b2c3d4.ngrok-free.dev`** — not `localhost:3000`. Opening it via localhost will
break the OAuth round-trip, because Mollie redirects back to the ngrok host.

On the **Connect** tab, the *Setup* table should show:

- Client ID / secret → `set`
- Public URL → your ngrok URL, with **no** red "localhost" warning
- Test mode → `true`

If anything is red, fix `.env` and restart `npm run dev` (env changes are not hot-reloaded).

### Step 6 — Connect the merchant account

1. Click **Connect a Mollie account**.
2. Mollie's consent screen opens. **Log in with the merchant account**, not the platform one — if
   you're already logged in as the platform, use a private window or log out first.
3. Approve the requested scopes.
4. You return to the Connect tab with a banner and a filled-in *Connected merchant* panel showing the
   organization name, `org_…` id, `pfl_…` profile id, and token expiry.

Click **Check onboarding status** to see the merchant's KYC state and whether they can receive
payments.

### Step 7 — Fill in the customer

Go to the **Pay** tab and fill *Name* / *Email*. There is no picker: a **fresh Mollie customer is
created server-side on every submit**, so each run of the flow is isolated. The Mandates table below
follows whichever customer your last submit created.

### Step 8 — Pick what you're selling

The top panel drives everything: **Type** (one-time or subscription) × **Method** (card or SEPA),
plus amount and description. There is one submit button and the server works out the choreography.

The subscription plan is fixed for this PoC: **daily, 2 payments total** (`interval: 1 days`,
`times: 2`), defined once as `SUBSCRIPTION_PLAN` in `src/lib/config.ts`.

| Type | Method | What happens |
| --- | --- | --- |
| One-time | Card | `oneoff` payment → redirect for 3DS → back here |
| One-time | SEPA | Register mandate from the IBAN, then charge it once. **No redirect** |
| Subscription | Card | `first` payment now (redirect for 3DS) to obtain a mandate → **the webhook creates the subscription** once that payment is paid |
| Subscription | SEPA | Register mandate, then create the subscription immediately. **No redirect, nothing charged now** |

### Step 9 — One-time card payment

Type *One-time*, Method *Credit card*. Fill the card fields — Mollie Components, rendered by Mollie
inside our page:

- Card holder: any name
- Card number: `4111 1111 1111 1111`
- Expiry: any future date, e.g. `12/30`
- CVC: any 3 digits

Submit. The card is tokenized in the browser (the number never touches our server), the payment is
created server-side as the merchant, and you're redirected to Mollie's test status-picker. Choose
**paid**. You land on the return page; then check the **Webhooks** tab.

### Step 10 — SEPA subscription (the fast one)

> **Requires activation first.** SEPA Direct Debit is off by default. In the *merchant* account:
> **Settings → Website profiles → [profile] → Payment methods → SEPA Direct Debit**, which Mollie
> reviews (they aim to answer within 3 business days) and which generally depends on completed KYC.
> Without it every SEPA call fails with *"The payment method is not enabled in your website profile"*.
>
> Also note that in test mode a SEPA payment is created as `pending` and **never advances on its
> own**. Mollie doesn't simulate the bank round-trip. Instead, payments with no checkout screen carry
> a **`_links.changePaymentState`** URL — the Pay and Webhooks tabs surface it as *"Set this test
> payment's status"*. Open it, pick `paid`, and the webhook fires. Without that click SEPA sits at
> `pending` indefinitely.

Type *Subscription*, Method *SEPA Direct Debit*, IBAN `NL55INGB0000000000`. Submit.

No redirect at all: the mandate is registered and the subscription is created in the same request.
The banner reports the subscription id, status, and the real `nextPaymentDate` returned by Mollie.

### Step 11 — Card subscription (the asynchronous one)

Type *Subscription*, Method *Credit card*. Fill the card fields, submit, choose **paid** on Mollie's
screen.

The subscription is **not** created by the browser coming back — it's created by
`/api/webhooks/mollie` when the `first` payment is confirmed paid. The payment carries
`metadata.intent = 'subscription'`, which is how the webhook knows. This is the correct production
shape: it works even if the shopper closes the tab, and it's idempotent against Mollie's webhook
retries (`subscribedPaymentIds` in the store).

The return page polls and shows the subscription once it appears; the Webhooks tab tags that ping
with a green **subscription created** pill.

The `first` payment here is **€0.00** — a zero-amount card verification that stores the mandate
without charging. Nothing is collected by it, so the subscription takes payment 1 of 2 immediately,
exactly like the SEPA path. Both paths therefore cost exactly 2 charges: payment 1 today, payment 2
tomorrow.

This whole extra step exists only because a Mollie subscription cannot create its own payment
method — see §8.1, which is the sharpest difference from Stripe in this PoC.

### Step 12 — Resolve a test payment

Payments with no checkout screen — SEPA, and any `sequenceType: recurring` charge — are created
`pending` and stay there until you say otherwise. Both the Pay tab (under *Last API response*) and
each Webhooks entry show a **Set this test payment's status →** link when Mollie provides one.

Open it, pick `paid`, and the webhook fires with the new status.

### Step 13 — Manage subscriptions

The **Subscriptions** tab is read-only plus cancel: it polls every 5s and lists them per customer or
across the whole organization, with amount, schedule, `nextPaymentDate` and status.

### Step 14 — Inspect webhooks

The **Webhooks** tab auto-refreshes every 2 seconds. Each entry shows:

- Timestamp and the resource id Mollie sent
- Status pill, plus `sequenceType` / `method` / `subscription` tags
- **Details** → the raw request body (`id=tr_…`, form-encoded), all HTTP headers, and the full
  payment object fetched back from the API

Mollie's webhook payload never contains the status — the id is all you get, and you must fetch the
resource. This tab makes that explicit.

You can also confirm delivery from ngrok's own inspector at <http://127.0.0.1:4040>.

---

## 5. What the paying customer sees

The shopper's experience differs sharply by method, and it's the main thing to weigh when choosing
between them.

### Card — one-time

1. **Our page.** Amount, description, their name and email, and four card fields. Those fields are
   Mollie-hosted iframes but styled by us, so the page looks like ours throughout.
2. **Submit.** Brief pause while the card is tokenized and the payment created.
3. **Full-page navigation to Mollie.** This is the visible hand-off — the browser leaves our domain.
   - *Test mode*: Mollie's status-picker, listing `paid` / `failed` / `expired` / `canceled` for you
     to choose. Nothing resembling a real checkout.
   - *Live*: either nothing at all (frictionless 3DS, the common case) or the issuer's own challenge
     — bank app confirmation, SMS code, or similar. That screen belongs to the bank, not Mollie.
   - The Mollie page carries the **connected merchant's** profile name, not the platform's.
4. **Back to our return page**, which polls and shows the outcome.

### Card — subscription

Identical to the above with one important difference: the amount shown during the 3DS step is
**€0.00**, because that payment is a card verification (§8.2). The real charge is taken off-session
moments later, once our webhook creates the subscription.

So the customer authenticates a zero-amount transaction and is then charged the real amount without
further interaction. Two consequences worth deciding on deliberately:

- **Our own page must state the amount and terms clearly**, since Mollie's screen won't.
- Some issuers surface a €0.00 authorization oddly, or not at all. Worth confirming with Mollie how
  this presents across issuers before relying on it in production.

### SEPA — one-time and subscription

**No redirect at any point.** The customer enters their name and IBAN on our page, submits, and sees
a confirmation. The entire flow stays on our domain, which is the strongest argument for SEPA here.

What follows is invisible to them in-session:

- The debit appears on their bank statement days later, not instantly
- SEPA gives them a **return window** — 8 weeks unconditionally for an authorized debit, 13 months if
  they claim it was unauthorized. Cards are far less generous. This is a real financial-risk
  difference, not just a UX one.

### Not verified

Whether Mollie sends the shopper any email of its own — receipts, or the **pre-notification** SEPA
rules require before a debit — was not tested here, and this PoC sends nothing itself. Confirm with
Mollie who is responsible for pre-notification before going live with direct debit.

---

## 6. Test credentials

| Purpose | Value |
| --- | --- |
| Credit card (success) | `4111 1111 1111 1111`, any future expiry, any CVC |
| SEPA IBAN | `NL55INGB0000000000` |
| Payment outcome | Chosen on Mollie's test status-picker screen (`paid`, `failed`, `expired`, …) |

---

## 7. Resetting

```bash
rm -rf .data          # forget tokens and webhook log
```

Then reconnect from the Connect tab. Or just click **Disconnect**.

---

## 8. Mollie vs Stripe

Differences found while building this PoC, for anyone coming from a Stripe codebase. Ordered roughly
by how much they change your design.

### 8.1 A subscription cannot create its own payment method

**The single biggest structural difference.**

In Stripe you create a Subscription and you're done: its first invoice charges the card *and* attaches
the payment method to the customer, in one object, in one charge. There is no preceding step.

In Mollie a subscription can only run on a **mandate that already exists**, and a card mandate can
only be produced by a separate `sequenceType: first` payment. So every card subscription is two
payment objects where Stripe has one — and because Mollie also charges a subscription immediately on
creation (§8.3), those two collide unless you intervene.

Two ways out, both workarounds for the same gap:

| Approach | First payment | Subscription | Total charges |
| --- | --- | --- | --- |
| **Used here** | `€0.00` verification | full `times`, charges today | 2 |
| Alternative | real amount, counts as #1 | `times - 1`, `startDate` tomorrow | 2 |

Stripe needs neither.

### 8.2 Saving a card without charging

Stripe: a `SetupIntent` — a first-class object for exactly this.

Mollie: no such object, but a `sequenceType: first` payment may be **`€0.00`** on credit card and
PayPal, which verifies the card and stores a mandate without charging. Functionally equivalent, and
what this PoC uses — but it is still a *payment*, so it still takes the 3DS redirect (§8.4).

### 8.3 Subscriptions charge immediately on creation

Mollie collects the first payment the moment the subscription is created, unless you pass a future
`startDate`. Stripe's behaviour is the same in spirit (invoice #1 is due at once) — the difference is
that in Mollie this collides with the separate mandate-creating payment, which is what caused the
double charge during this build.

Other Mollie-specific subscription constraints with no Stripe equivalent:

- `description` must be **unique per customer**, or creation fails
- minimum interval is **1 day** — no per-minute testing
- test-mode subscriptions auto-cancel after 10 payments
- no equivalent of Stripe **Test Clocks**, so you cannot fast-forward a schedule; you wait a real day

### 8.4 3-D Secure is a redirect, not a modal

Stripe's Payment Element renders the SCA challenge in an in-page iframe modal; with
`redirect: 'if_required'` cards never navigate away. Many payments are frictionless and show no UI
at all.

Mollie Components (`mollie.js` v1, used here) **only captures and tokenizes card data**. The
challenge happens after payment creation, by sending the shopper to `_links.checkout`.

Mollie's in-page equivalent is **Custom checkout with Components** (`mollie.js` v2, Checkout Sessions
API), which does embed 3DS. As of 2026-07-31 it is still **private beta** — *"If you are interested in
early access you can reach out to us."* Its docs also say nothing about whether OAuth/Connect access
tokens are supported, and nothing about mandates, `sequenceType` or subscriptions.

If in-page 3DS matters for the real integration, that's a three-part question for Mollie, not one:
**(1)** beta access, **(2)** does it work with Connect access tokens, **(3)** can it create a mandate
for recurring. A yes on 1 and 2 with a no on 3 still leaves subscriptions on the redirect flow.

The redirect is card-only. SEPA mandate registration and `recurring` charges never redirect.

### 8.5 Webhooks are unsigned and carry no data

| | Stripe | Mollie |
| --- | --- | --- |
| Payload | full event object | `id=tr_…`, form-encoded, nothing else |
| Status included | yes | **no** — you must fetch the resource back |
| Authenticity | `Stripe-Signature` HMAC + endpoint secret | none; the URL's secrecy is the only control |
| Retries | exponential, days | ~26 hours on any non-2xx |

Practical effect: every Mollie webhook handler is a fetch-back handler, and you cannot trust the
caller. This PoC fetches the payment in `/api/webhooks/mollie` and shows both halves in the UI.

### 8.6 Multi-tenancy: access tokens vs a header

Stripe Connect: one platform secret key plus a `Stripe-Account` header per request.

Mollie Connect: a **per-merchant OAuth access token** (with refresh token, ~1h expiry) that you store
and rotate yourself. On top of that, creation calls need an explicit **`profileId`** — payments,
customers *and* subscriptions all fail without it, the subscription error being the unhelpful
*"A website profile is required for payments"*.

### 8.7 Test mode is a per-call flag, not a separate key

Stripe: separate test and live API keys, separate dashboards, separate data.

Mollie: the same OAuth token serves both. You send `testmode: true` on **every** call — query param
on GET/DELETE, body field on POST. Forget it once and that call hits live data.

### 8.8 One redirect URL per app

Stripe Connect lets you register multiple OAuth redirect URIs on one application.

Mollie allows **one** per app, so environments need separate apps (local / staging / production),
each with its own `client_id` and secret. See §4 step 2.

### 8.9 Local development needs a public URL

Stripe: `stripe listen --forward-to localhost:3000/...` — no tunnel, and the CLI provides the signing
secret.

Mollie: rejects `localhost` for both `webhookUrl` and `redirectUrl`. You need ngrok or equivalent
before you can test anything, which is why it's step 1 of this walkthrough.

### 8.10 Smaller differences

- **Off-session charges**: Stripe = PaymentIntent with `off_session: true`. Mollie = payment with
  `sequenceType: 'recurring'` + `mandateId`, and it must **not** carry a `redirectUrl` — there's
  nobody to redirect, and Mollie rejects it.
- **SEPA**: the *shape* is comparable — both let you collect name + IBAN in your own UI and register a
  mandate without a redirect. Getting there differs: Mollie requires SEPA Direct Debit to be
  **activated per website profile**, reviewed in ~3 business days and generally gated on completed
  KYC. Stripe enables it per account. Expect SEPA to be the slower half of a Mollie integration.
- **Driving the sandbox**: Stripe's test mode resolves on its own — magic IBANs and cards settle or
  fail without intervention, and Test Clocks fast-forward subscription schedules. Mollie's waits for
  you: a status-picker on redirect flows, a `changePaymentState` link on flows without one, and no
  way to skip a subscription interval. Same outcomes reachable, more manual steps to reach them.
- **Platform fees**: Stripe `application_fee_amount`; Mollie an `applicationFee` object
  (`amount` + `description`). Both require the connected account to be eligible; Mollie fails the
  whole payment if it isn't.
- **Card fields**: comparable. Both are provider-hosted iframes that tokenize client-side and keep
  you out of PCI scope.

---

## 9. Friction — what's annoying about Mollie

Everything here was hit while building this PoC, not collected from opinion pieces. Some are fair
trade-offs; the ones that cost real time are marked.

### A card subscription takes three round-trips instead of one — **cost real time**

In Stripe this is one call: create the Subscription, and its first invoice charges the card and
attaches it to the customer. Done, synchronously, with one thing that can fail.

In Mollie (§8.1) the same outcome needs:

1. a `first` payment to obtain a mandate — a **payment object**, with a 3DS redirect, even at `€0.00`
2. the shopper coming back, or not
3. a **webhook** confirming that payment, at which point you create the subscription

That's the difference between one API call and a distributed flow you have to design. Everything
below follows from it and is now real code in this PoC:

- The subscription can't be created in the request the user submitted, so the UI has to explain a
  state that doesn't exist yet ("waiting for the webhook to create it")
- Creation must live in the webhook handler, not the return page, because the shopper may close the
  tab — so subscription creation happens in a code path with no user to show an error to
- Mollie retries webhooks, so it needs its own idempotency guard (`subscribedPaymentIds`)
- New failure modes with no Stripe equivalent: verification paid but subscription creation fails, and
  the customer now has a stored mandate and no subscription
- The intent has to be smuggled through Mollie and back via `metadata.intent`, because nothing in the
  payment itself says "this was meant to become a subscription"

None of this is exotic, but it's a day of work and a class of bugs that simply don't exist on the
other platform. It was also where this PoC's only real bug came from — the double charge in §8.3.

### The generally-available product is the old one

Mollie Components v1 — the only card-embedding option you can actually use — is years old, and its
documentation samples are still written with `var`. The modern rewrite (v2 Checkout Sessions, §8.4)
is private beta. So the choice is "dated but available" or "current but you have to ask nicely".

### Error messages point at the wrong thing — **cost real time**

- Creating a **subscription** without `profileId` returns *"A website profile is required for
  **payments**"*. Wrong noun, and it doesn't name the missing field.
- *"The redirect URI provided is missing or does not match"* never tells you what **is** registered,
  so you're guessing. The only way to find out is to omit `redirect_uri` entirely and see where you
  land.

### Undocumented defaults that cost money — **cost real time**

`startDate` on a subscription is documented as optional with **no stated default**. It turns out to
mean "charge immediately". Combined with the mandatory first payment, that silently double-charged
during this build, and we only found out by reading the merchant's transaction list.

### `profileId` is required but not obvious

With an OAuth token every creation call — payments, customers, subscriptions — needs an explicit
`profileId`. It's easy to miss because API-key integrations never need it, and the error (above)
doesn't say so.

### `testmode` is a per-call flag, not a separate credential

Stripe gives you distinct test keys, so a mistake is inert. In Mollie the same token serves both, and
forgetting `testmode: true` on one call silently touches live data. This PoC threads it through every
request by hand for exactly that reason.

### Webhooks carry nothing and prove nothing

The body is `id=tr_…` and that's all — no status, no payload, and **no signature**. You must fetch
the resource back on every ping, and you cannot verify the caller is Mollie. The endpoint's secrecy
is the entire security model. Stripe signs its webhooks and includes the full event.

### The sandbox doesn't run itself — **cost real time**

- Payments with no checkout screen (SEPA, any `recurring` charge) sit at `pending` forever until you
  manually open a `changePaymentState` link, which isn't surfaced anywhere obvious.
- Mollie's own help article says SEPA test payments simply never confirm, without mentioning that
  link — so the documented answer is "it can't be tested", which is wrong.
- No equivalent of Stripe Test Clocks: to see subscription payment 2 you wait a real day.

### You cannot test the platform's revenue model at all

**Test mode never credits the balance.** Mollie is explicit: the application fee is visible in the
payment details but is not added to the balance for test-mode payments. So it will never appear on
the platform account until you go live.

That means the one thing a platform most wants to verify before launch — that its cut is calculated
and lands where expected — is exactly the thing the sandbox won't show you. You can confirm the
`applicationFee` object is accepted on the payment and nothing more.

Compounding it:

- Fees **cannot be charged to the organization that created the OAuth app**, so testing them properly
  needs a *third* organization, not just the usual platform + merchant pair.
- The fee only moves on a payment that actually settles, and SEPA test payments never settle on their
  own (above) — so even the payment-detail view needs manual nudging to reach a realistic state.
- Mollie's own recommendation is to do Settlement/Balances work in the live environment.

### Getting SEPA switched on is a process

Direct Debit isn't self-serve: request it per website profile, wait up to 3 business days for review,
and generally complete KYC first. Until then every SEPA call fails. Card needs none of this.

### OAuth app config is thin

- **One** redirect URL per app, so every environment needs its own app and its own credentials.
- `approval_prompt=force` **revokes existing merchant authorizations** — a genuine footgun, mentioned
  in passing in the docs, and it appears in plenty of example code.
- `localhost` is rejected for both `webhookUrl` and `redirectUrl`, so you cannot do any local
  development without a tunnel.

### Odd API constraints

- A subscription's `description` must be **unique per customer**, which makes a human-readable label
  double as an idempotency key.
- Card mandates can only come from a payment object — there's no dedicated setup/verification
  resource, only the `€0.00` payment trick (§8.2).
- Minimum subscription interval is 1 day.

### Fair trade-offs, not complaints

- The 3DS redirect (§8.4) is a real limitation, but SCA has to happen somewhere and Mollie's hosted
  page is a legitimate place for it.
- Mandate-based SEPA is clean and works exactly as you'd hope once enabled.
- Token refresh, `_links` navigation and the overall REST shape are consistent and predictable.

---

## 10. Gotchas discovered while building this

- **OAuth tokens need an explicit `profileId`.** Unlike an API key, an access token doesn't imply a
  profile, so `POST /v2/payments`, `POST /v2/customers` **and `POST /v2/customers/{id}/subscriptions`**
  all fail without it — the subscription error message is the unhelpful *"A website profile is
  required for payments"*. Fetched once at connect time and cached in `.data/db.json`.
- **`testmode: true` must be sent on every call.** Access tokens are not test-scoped the way test API
  keys are — query param on GET/DELETE, body field on POST.
- **`sequenceType: recurring` must not have a `redirectUrl`.** There's no shopper to redirect; Mollie
  rejects the payment if you send one.
- **Webhook bodies are form-encoded and status-free.** Always `id=…`, always fetch the resource back.
- **Return the 200 fast.** A non-2xx makes Mollie retry for roughly 26 hours.
- **Subscription descriptions must be unique per customer**, otherwise creation fails.
- **A subscription charges immediately on creation** unless you pass a future `startDate` — see §8.1
  and §8.3 for why this bites when combined with a mandate-creating payment.
- **One-off `directdebit` is a different product.** Mollie's checkout-based direct debit is a separate
  method from the mandate registration this PoC uses — don't confuse the two.
- **SEPA Direct Debit must be activated per website profile**, is reviewed by Mollie (~3 business
  days), and generally requires completed KYC. Until then every SEPA call returns *"The payment
  method is not enabled in your website profile"*. Credit card needs no such request.
- **Test payments with no checkout screen don't resolve by themselves** — `sequenceType: recurring`
  and direct debit sit at `pending` forever. They carry a **`_links.changePaymentState`** URL instead;
  open it to force `paid` / `failed`. Easy to miss, and it's what makes SEPA appear broken in test.
  Card payments use magic amounts (€1,001–€1,011) to trigger specific failure reasons.
- **Access tokens expire.** Refresh is automatic — `merchantToken()` refreshes when within 60s of
  expiry and rewrites the store.
- **ngrok free URLs rotate.** New URL → update `.env` *and* the redirect URL on the Mollie app, then
  restart the dev server.

---

## 11. Troubleshooting

| Symptom | Cause |
| --- | --- |
| "State mismatch — possible CSRF, aborted" | You opened the app on `localhost` but the callback came back on ngrok (or `.data` was cleared mid-flow). Open the ngrok URL and retry. |
| Mollie: "The redirect URI provided is missing or does not match" | The app's registered Redirect URL ≠ what we send. To find out what's actually registered, set `MOLLIE_OMIT_REDIRECT_URI=true` and retry — `redirect_uri` is optional, so Mollie will use its own registered value and you'll see where it lands. Pin it with `MOLLIE_REDIRECT_URI=` if you can't change the dashboard. Also confirm the `client_id` in the authorize URL is the app you actually edited. |
| Setup table shows a red localhost warning | `PUBLIC_URL` still points at localhost — payments will fail on `webhookUrl`. |
| Card fields never render ("loading mollie.js…") | No `profileId` on the connection, or credit card isn't enabled on the merchant's profile. |
| "The customer has no valid mandates" | Do a card `first` payment or register SEPA before creating a subscription. |
| "The payment method is not enabled in your website profile" | SEPA Direct Debit isn't activated on the merchant's profile. Settings → Website profiles → Payment methods → SEPA Direct Debit; Mollie reviews it (~3 business days) and it generally needs KYC done. Not a code problem. |
| Webhook log stays empty | ngrok not running, `PUBLIC_URL` stale, or the dev server was restarted after the payment. Check <http://127.0.0.1:4040>. |
| Payment creation fails mentioning application fee | The connected org isn't eligible — clear `APPLICATION_FEE_AMOUNT`. |
| Env change had no effect | Next.js doesn't hot-reload `.env`; restart `npm run dev`. |
