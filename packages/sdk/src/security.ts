import { z } from 'zod';

/** Actions protected by rate limits and, optionally, a captcha. */
export const PROTECTED_ACTIONS = [
  'login',
  'passwordReset',
  'comment',
  'contentUnlock',
] as const;
export type ProtectedAction = (typeof PROTECTED_ACTIONS)[number];

export const CAPTCHA_PROVIDERS = [
  'none',
  'turnstile',
  'hcaptcha',
  'recaptcha',
] as const;
export type CaptchaProvider = (typeof CAPTCHA_PROVIDERS)[number];

/** `always`: every attempt; `limited`: once a rate limit is reached; `never`. */
export const CAPTCHA_MODES = ['always', 'limited', 'never'] as const;
export type CaptchaMode = (typeof CAPTCHA_MODES)[number];

/**
 * A fixed-window limit. Past `max` attempts in `windowSeconds`, the scope is blocked for
 * `blockSeconds` (`block`), or must solve a captcha (`captcha`, blocking when none is configured).
 */
export const rateRuleSchema = z.object({
  enabled: z.boolean(),
  max: z.number().int().min(1).max(100_000),
  windowSeconds: z.number().int().min(1).max(86_400),
  blockSeconds: z.number().int().min(0).max(86_400),
  enforcement: z.enum(['block', 'captcha']),
});

export type RateRule = z.output<typeof rateRuleSchema>;

/** Rules by scope: per visitor network (`client`) and per targeted account (`account`). */
export const RATE_RULES = [
  'loginClient',
  'loginAccount',
  'passwordResetClient',
  'passwordResetAccount',
  'commentClient',
  'contentUnlockClient',
] as const;
export type RateRuleName = (typeof RATE_RULES)[number];

const rule = (
  max: number,
  windowSeconds: number,
  blockSeconds: number,
  enforcement: RateRule['enforcement'],
): RateRule => ({
  enabled: true,
  max,
  windowSeconds,
  blockSeconds,
  enforcement,
});

export const DEFAULT_RATE_RULES: Record<RateRuleName, RateRule> = {
  loginClient: rule(20, 900, 900, 'captcha'),
  loginAccount: rule(10, 900, 900, 'captcha'),
  passwordResetClient: rule(5, 3600, 3600, 'block'),
  passwordResetAccount: rule(3, 3600, 3600, 'block'),
  commentClient: rule(10, 600, 600, 'captcha'),
  contentUnlockClient: rule(10, 900, 900, 'captcha'),
};

const rulesSchema = z.object(
  Object.fromEntries(
    RATE_RULES.map((name) => [name, rateRuleSchema]),
  ) as Record<RateRuleName, typeof rateRuleSchema>,
);

const captchaModesSchema = z.object(
  Object.fromEntries(
    PROTECTED_ACTIONS.map((action) => [action, z.enum(CAPTCHA_MODES)]),
  ) as Record<ProtectedAction, z.ZodEnum<{ [K in CaptchaMode]: K }>>,
);

export const mediaAdmissionSchema = z.object({
  /** Per-user uploads in a rolling fixed one-hour window; zero disables the limit. */
  uploadsPerHour: z.number().int().min(0).max(100_000),
  /** Free storage retained after every committed upload; zero disables the floor. */
  freeSpaceMb: z.number().int().min(0).max(1_048_576),
});

export type MediaAdmission = z.output<typeof mediaAdmissionSchema>;

export const DEFAULT_MEDIA_ADMISSION: MediaAdmission = {
  uploadsPerHour: 60,
  freeSpaceMb: 256,
};

const siteKey = z.string().trim().max(200);

/** Security settings as administrators see them; the captcha secret is never returned. */
export const adminSecuritySettingsSchema = z.object({
  captcha: z.object({
    provider: z.enum(CAPTCHA_PROVIDERS),
    siteKey,
    /** reCAPTCHA v3 score threshold; ignored by checkbox providers. */
    minimumScore: z.number().min(0).max(1),
    secretConfigured: z.boolean(),
    modes: captchaModesSchema,
  }),
  rules: rulesSchema,
  media: mediaAdmissionSchema.default(DEFAULT_MEDIA_ADMISSION),
});

export type AdminSecuritySettings = z.output<
  typeof adminSecuritySettingsSchema
>;

/** Omitted `secretKey` keeps the stored secret; an empty string removes it. */
export const securitySettingsInputSchema = z.object({
  captcha: z.object({
    provider: z.enum(CAPTCHA_PROVIDERS),
    siteKey,
    minimumScore: z.number().min(0).max(1).default(0.5),
    secretKey: z.string().trim().max(500).optional(),
    modes: captchaModesSchema,
  }),
  rules: rulesSchema,
  media: mediaAdmissionSchema.default(DEFAULT_MEDIA_ADMISSION),
});

export type SecuritySettingsInput = z.input<typeof securitySettingsInputSchema>;

export const DEFAULT_SECURITY_SETTINGS: AdminSecuritySettings = {
  captcha: {
    provider: 'none',
    siteKey: '',
    minimumScore: 0.5,
    secretConfigured: false,
    modes: {
      login: 'limited',
      passwordReset: 'limited',
      comment: 'limited',
      contentUnlock: 'limited',
    },
  },
  rules: DEFAULT_RATE_RULES,
  media: DEFAULT_MEDIA_ADMISSION,
};

/** What a frontend needs to render the widget. `provider` is `none` until a site key and secret exist. */
export const publicCaptchaSchema = z.object({
  provider: z.enum(CAPTCHA_PROVIDERS),
  siteKey: z.string(),
  /** Actions that need a captcha on every attempt; others ask only after `captcha_required`. */
  always: z.array(z.enum(PROTECTED_ACTIONS)),
});

export type PublicCaptcha = z.output<typeof publicCaptchaSchema>;

/** Header carrying the solved captcha token from the frontend to the API. */
export const CAPTCHA_TOKEN_HEADER = 'x-cms-captcha-token';

/** Error code of an attempt that needs a (valid) captcha first. */
export const CAPTCHA_REQUIRED = 'captcha_required';
