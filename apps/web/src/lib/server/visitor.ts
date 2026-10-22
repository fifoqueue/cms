import type { RequestEvent } from '@sveltejs/kit';
import type { ClientProof, Visitor } from '@cms/sdk/client';
import { frontendSecret } from '#lib/server/frontend-secret.js';

/**
 * Vouches for the visitor's address (`getClientAddress()`, which honours the adapter's proxy
 * settings) so the API rate-limits each visitor separately. Without the shared secret the API
 * treats every visitor as unproven.
 */
export const clientProof = (address: string): ClientProof | undefined => {
  const secret = frontendSecret();
  return secret ? { address, secret } : undefined;
};

/** Form fields in which the captcha widgets submit their token. */
const CAPTCHA_FIELDS = [
  'cf-turnstile-response',
  'h-captcha-response',
  'g-recaptcha-response',
];

/** The visitor of a form submission: proven address and any solved captcha. */
export const visitorOf = (
  event: Pick<RequestEvent, 'getClientAddress'>,
  form?: FormData,
): Visitor => {
  const token = CAPTCHA_FIELDS.map((field) => form?.get(field)).find(
    (value): value is string => typeof value === 'string' && value !== '',
  );
  return { proof: clientProof(event.getClientAddress()), captchaToken: token };
};
