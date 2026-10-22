import type { CaptchaProvider, RateRule } from '@cms/sdk';

/** Fixed-window counters shared by every API process. Keys are opaque strings. */
export interface RateLimitStore {
  /** Whether `key` is blocked or at its limit now. Counts nothing. */
  exceeded(key: string, rule: RateRule, now: Date): Promise<boolean>;
  /**
   * Counts one attempt. Past `rule.max` in the window the key is blocked for
   * `rule.blockSeconds` (or until the window ends when 0). True when over the limit.
   */
  hit(key: string, rule: RateRule, now: Date): Promise<boolean>;
  /** Forgets counters that no longer matter. */
  purge(now: Date): Promise<void>;
}

export interface CaptchaCheck {
  provider: Exclude<CaptchaProvider, 'none'>;
  secret: string;
  token: string;
  /** The visitor's address when the frontend proved it. */
  address: string | null;
  /** Lowest accepted score for providers that score (reCAPTCHA v3). */
  minimumScore: number;
}

/** Asks the captcha provider whether a token was solved. Failures and timeouts count as no. */
export interface CaptchaVerifier {
  verify(check: CaptchaCheck): Promise<boolean>;
}
