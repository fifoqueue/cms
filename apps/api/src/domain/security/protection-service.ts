import type { ProtectedAction, RateRule, RateRuleName } from '@cms/sdk';
import type { Clock } from '#api/domain/ports';
import type {
  CaptchaVerifier,
  RateLimitStore,
} from '#api/domain/security/ports';
import type { SecuritySettingsService } from '#api/domain/security/security-settings';
import { captchaRequired, rateLimited, Errors } from '#api/shared/errors';

/** One attempt at a protected action. */
export interface Attempt {
  action: ProtectedAction;
  /** `ip:<network>` when proved; otherwise unproved visitors share one bucket. */
  client: string | null;
  address: string | null;
  /** The targeted account (normalized email), for per-account limits. */
  account?: string;
  captchaToken: string | null;
}

const RULES: Record<
  ProtectedAction,
  /** `visitor`: the proven client, or one bucket shared by every unproven client. */
  { name: RateRuleName; scope: 'client' | 'account' | 'visitor' }[]
> = {
  login: [
    { name: 'loginClient', scope: 'visitor' },
    { name: 'loginAccount', scope: 'account' },
  ],
  passwordReset: [
    { name: 'passwordResetClient', scope: 'visitor' },
    { name: 'passwordResetAccount', scope: 'account' },
  ],
  // Anyone can comment, so unproven clients (direct API calls) share one limit instead of none.
  comment: [{ name: 'commentClient', scope: 'visitor' }],
  contentUnlock: [{ name: 'contentUnlockClient', scope: 'visitor' }],
  privacy: [{ name: 'privacyClient', scope: 'visitor' }],
};

/**
 * Rate limits and captcha for public writes. Proven visitors get individual buckets; direct or
 * otherwise unproven callers share one, so omitting the proof never bypasses protection.
 */
export class ProtectionService {
  constructor(
    private readonly deps: {
      settings: SecuritySettingsService;
      store: RateLimitStore;
      captcha: CaptchaVerifier;
      clock: Clock;
    },
  ) {}

  /** Atomically counts the attempt, then enforces its rate limit and captcha policy. */
  async check(attempt: Attempt): Promise<void> {
    const policy = await this.deps.settings.policy();
    const { captcha } = policy;
    const captchaOn =
      captcha.provider !== 'none' &&
      !!captcha.siteKey &&
      !!captcha.secretKey &&
      captcha.modes[attempt.action] !== 'never';
    const now = this.deps.clock.now();

    let limited = false;
    for (const { rule, key } of this.applicable(attempt, policy.rules)) {
      if (!(await this.deps.store.hit(key, rule, now))) continue;
      if (rule.enforcement === 'block' || !captchaOn)
        throw rateLimited(Errors.TooManyAttempts);
      limited = true;
    }

    if (!captchaOn) return;
    if (captcha.modes[attempt.action] === 'limited' && !limited) return;
    if (!attempt.captchaToken) throw captchaRequired();
    const solved = await this.deps.captcha.verify({
      provider: captcha.provider as Exclude<typeof captcha.provider, 'none'>,
      secret: captcha.secretKey!,
      token: attempt.captchaToken,
      address: attempt.address,
      minimumScore: captcha.minimumScore,
    });
    if (!solved) throw captchaRequired(Errors.CaptchaInvalid);
  }

  private applicable(attempt: Attempt, rules: Record<RateRuleName, RateRule>) {
    return RULES[attempt.action].flatMap(({ name, scope }) => {
      const subject =
        scope === 'account'
          ? attempt.account
          : scope === 'visitor'
            ? (attempt.client ?? 'unproven')
            : attempt.client;
      const rule = rules[name];
      return rule.enabled && subject
        ? [{ rule, key: `${name}:${subject}` }]
        : [];
    });
  }
}
