import { applicationFee, SUBSCRIPTION_PLAN, webhookUrl } from './config';
import { asMerchant, merchantProfileId } from './mollie';

/**
 * Creates the PoC's plan on an existing valid mandate.
 *
 * Mollie charges a subscription immediately on creation when `startDate` is
 * omitted — which is what we want here, since neither path has collected money
 * before this point (SEPA registers a mandate, card does a €0.00 verification).
 * `times`/`startDate` stay overridable for callers that did charge up front.
 */
export async function createSubscription(opts: {
  customerId: string;
  amount: string;
  description: string;
  mandateId?: string;
  times?: number;
  startDate?: string;
  /** Defaults to the app-wide switch; the webhook passes the payment's own mode. */
  testmode?: boolean;
}) {
  const body: Record<string, unknown> = {
    amount: { currency: 'EUR', value: Number(opts.amount).toFixed(2) },
    interval: SUBSCRIPTION_PLAN.interval,
    times: opts.times ?? SUBSCRIPTION_PLAN.times,
    // Mollie requires the description to be unique per customer.
    description: opts.description,
    webhookUrl: webhookUrl(),
    // Required with an OAuth access token, same as payments and customers —
    // otherwise Mollie answers "A website profile is required for payments".
    profileId: await merchantProfileId(),
    metadata: { source: 'mollie-connect-poc' },
  };
  if (opts.mandateId) body.mandateId = opts.mandateId;
  if (opts.startDate) body.startDate = opts.startDate;

  const fee = applicationFee(Number(opts.amount));
  if (fee) body.applicationFee = fee;

  return asMerchant(`/v2/customers/${opts.customerId}/subscriptions`, {
    method: 'POST',
    testmode: opts.testmode,
    body,
  });
}
