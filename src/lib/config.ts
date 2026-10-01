export const config = {
  clientId: process.env.MOLLIE_CLIENT_ID || '',
  clientSecret: process.env.MOLLIE_CLIENT_SECRET || '',
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, ''),
  /** Override when the URL registered on the Mollie app isn't PUBLIC_URL + /api/connect/callback. */
  redirectUriOverride: (process.env.MOLLIE_REDIRECT_URI || '').trim(),
  /** redirect_uri is optional — omitting it makes Mollie use the registered URL. */
  omitRedirectUri: process.env.MOLLIE_OMIT_REDIRECT_URI === 'true',
  /**
   * 'force' re-shows the consent screen but REVOKES existing authorizations for
   * this app — never point that at a production app. Default 'auto' is safe.
   */
  approvalPrompt: process.env.MOLLIE_APPROVAL_PROMPT === 'force' ? 'force' : 'auto',
  /** Percentage of the payment taken as platform fee, e.g. "5". Wins over the fixed amount. */
  applicationFeePercent: process.env.APPLICATION_FEE_PERCENT || '',
  /** Fixed platform fee in EUR. Used only when no percentage is set. */
  applicationFeeAmount: process.env.APPLICATION_FEE_AMOUNT || '',
  applicationFeeDescription: process.env.APPLICATION_FEE_DESCRIPTION || 'Platform fee',
};

export const redirectUri = () =>
  config.redirectUriOverride || `${config.publicUrl}/api/connect/callback`;
export const webhookUrl = () => `${config.publicUrl}/api/webhooks/mollie`;
export const paymentReturnUrl = () => `${config.publicUrl}/pay/return`;

/** Scopes we ask the connected merchant for. */
export const SCOPES = [
  'organizations.read',
  'profiles.read',
  'payments.read',
  'payments.write',
  'refunds.read',
  'customers.read',
  'customers.write',
  'mandates.read',
  'mandates.write',
  'subscriptions.read',
  'subscriptions.write',
  'onboarding.read',
].join(' ');

/** The single plan this PoC offers: charged once a day, twice in total. */
export const SUBSCRIPTION_PLAN = { interval: '1 days', times: 2 };

/**
 * Mollie caps the fee at `total - (€0.35 + 6% of total)` and requires at least
 * €0.01, so on small payments no fee is permitted at all.
 */
export function maxApplicationFee(total: number) {
  return Math.floor((total - (0.35 + 0.06 * total)) * 100) / 100;
}

/**
 * Application fee for a payment of `total` EUR, or undefined when disabled or
 * when the amount is too small to carry one. Clamped to Mollie's ceiling so a
 * misconfigured fee doesn't fail the whole payment.
 */
export function applicationFee(total: number) {
  const percent = parseFloat(config.applicationFeePercent);
  const fixed = parseFloat(config.applicationFeeAmount);

  let value = percent > 0 ? (total * percent) / 100 : fixed;
  if (!value || Number.isNaN(value) || value <= 0) return undefined;

  value = Math.min(value, maxApplicationFee(total));
  // Mollie's minimum; below this the payment is simply too small to split.
  if (value < 0.01) return undefined;

  return {
    amount: { currency: 'EUR', value: value.toFixed(2) },
    description: config.applicationFeeDescription,
  };
}
