export const config = {
  clientId: process.env.MOLLIE_CLIENT_ID || '',
  clientSecret: process.env.MOLLIE_CLIENT_SECRET || '',
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, ''),
  testmode: (process.env.MOLLIE_TESTMODE ?? 'true') !== 'false',
  /** Override when the URL registered on the Mollie app isn't PUBLIC_URL + /api/connect/callback. */
  redirectUriOverride: (process.env.MOLLIE_REDIRECT_URI || '').trim(),
  /** redirect_uri is optional — omitting it makes Mollie use the registered URL. */
  omitRedirectUri: process.env.MOLLIE_OMIT_REDIRECT_URI === 'true',
  /**
   * 'force' re-shows the consent screen but REVOKES existing authorizations for
   * this app — never point that at a production app. Default 'auto' is safe.
   */
  approvalPrompt: process.env.MOLLIE_APPROVAL_PROMPT === 'force' ? 'force' : 'auto',
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

/** Application fee object for payment creation, or undefined when disabled. */
export function applicationFee() {
  const value = parseFloat(config.applicationFeeAmount);
  if (!value || Number.isNaN(value) || value <= 0) return undefined;
  return {
    amount: { currency: 'EUR', value: value.toFixed(2) },
    description: config.applicationFeeDescription,
  };
}
