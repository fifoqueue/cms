import type { CaptchaCheck, CaptchaVerifier } from '#api/domain/security/ports';
import type { Logger } from '#api/shared/logger';
import { messageOf } from '#api/shared/errors';

const ENDPOINTS: Record<CaptchaCheck['provider'], string> = {
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  hcaptcha: 'https://api.hcaptcha.com/siteverify',
  recaptcha: 'https://www.google.com/recaptcha/api/siteverify',
};

const TIMEOUT_MS = 5000;

/** Verifies tokens with the provider's `siteverify` endpoint (same protocol for all three). */
export const httpCaptchaVerifier = (
  logger: Logger,
  fetcher: typeof fetch = fetch,
): CaptchaVerifier => ({
  async verify({ provider, secret, token, address, minimumScore }) {
    const body = new URLSearchParams({ secret, response: token });
    if (address) body.set('remoteip', address);
    try {
      const response = await fetcher(ENDPOINTS[provider], {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return false;
      const result = (await response.json()) as {
        success?: unknown;
        score?: unknown;
      };
      if (result.success !== true) return false;
      // Score-based checks (reCAPTCHA v3) also have to clear the threshold.
      return typeof result.score !== 'number' || result.score >= minimumScore;
    } catch (error) {
      logger.warn(`Captcha verification failed: ${messageOf(error)}`);
      return false;
    }
  },
});
