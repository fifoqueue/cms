import type { RequestEvent } from '@sveltejs/kit';
import type { ClientProof, Visitor } from '@cms/sdk/client';
import { frontendSecret } from '#lib/server/frontend-secret.js';
import { CAPTCHA_TOKEN_FIELD } from '#lib/security/captcha-widget.js';

/** The request a visitor is proven for. */
export type ProofEvent = Pick<RequestEvent, 'getClientAddress' | 'request'>;

/**
 * Vouches for the visitor's address (`getClientAddress()`, which honours the adapter's proxy
 * settings) so the API rate-limits each visitor separately, and passes on its `User-Agent`.
 * Without the shared secret the API treats every visitor as unproven.
 */
export const clientProof = (event: ProofEvent): ClientProof | undefined => {
  const secret = frontendSecret();
  return secret
    ? {
        address: event.getClientAddress(),
        secret,
        userAgent: event.request.headers.get('user-agent') || undefined,
      }
    : undefined;
};

/** The visitor of a form submission: proven address and any solved captcha. */
export const visitorOf = (event: ProofEvent, form?: FormData): Visitor => {
  // `Captcha.svelte` copies whichever provider's response field into this one.
  const value = form?.get(CAPTCHA_TOKEN_FIELD);
  return {
    proof: clientProof(event),
    captchaToken: typeof value === 'string' && value !== '' ? value : undefined,
  };
};
