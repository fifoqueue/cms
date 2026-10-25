import type { RequestEvent } from '@sveltejs/kit';
import type { ClientProof, Visitor } from '@cms/sdk/client';
import { frontendSecret } from '#lib/server/frontend-secret.js';
import { CAPTCHA_TOKEN_FIELD } from '#lib/security/captcha-widget.js';

/**
 * Vouches for the visitor's address (`getClientAddress()`, which honours the adapter's proxy
 * settings) so the API rate-limits each visitor separately. Without the shared secret the API
 * treats every visitor as unproven.
 */
export const clientProof = (address: string): ClientProof | undefined => {
  const secret = frontendSecret();
  return secret ? { address, secret } : undefined;
};

/** The visitor of a form submission: proven address and any solved captcha. */
export const visitorOf = (
  event: Pick<RequestEvent, 'getClientAddress'>,
  form?: FormData,
): Visitor => {
  // `Captcha.svelte` copies whichever provider's response field into this one.
  const value = form?.get(CAPTCHA_TOKEN_FIELD);
  return {
    proof: clientProof(event.getClientAddress()),
    captchaToken: typeof value === 'string' && value !== '' ? value : undefined,
  };
};
