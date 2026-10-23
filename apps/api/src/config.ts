import { z } from 'zod';
import { egressRuleSchema } from '@cms/sdk';
import { Errors } from '#api/shared/errors';
import { parseRange } from '#api/shared/ip-address';

export const databaseUrlSchema = z.url({ protocol: /^(mysql|mariadb)$/ });

/** `{"<provider subject>": "<email of an existing local user>"}` */
const subjectAllowlistSchema = z
  .string()
  .transform((value, ctx) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      ctx.issues.push({
        code: 'custom',
        message: Errors.ConfigNotJsonObject,
        input: value,
      });
      return z.NEVER;
    }
  })
  .pipe(
    z.record(
      z.string().min(1).max(255),
      z
        .email()
        .max(191)
        .transform((email) => email.toLowerCase()),
    ),
  );

/** JSON array of the same scoped rules shown in Settings → Outbound access. */
const egressAllowlistSchema = z
  .string()
  .transform((value, ctx) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      ctx.issues.push({
        code: 'custom',
        message: Errors.ConfigNotJsonArray,
        input: value,
      });
      return z.NEVER;
    }
  })
  .pipe(z.array(egressRuleSchema).max(64))
  .superRefine((rules, ctx) => {
    for (const [ruleIndex, rule] of rules.entries())
      for (const [addressIndex, address] of rule.addresses.entries())
        if (!parseRange(address))
          ctx.addIssue({
            code: 'custom',
            path: [ruleIndex, 'addresses', addressIndex],
            message: Errors.EgressAddressInvalid,
          });
  });

const urlWithoutQuery = (protocol: RegExp) =>
  z
    .url({ protocol })
    .refine(
      (value) => !new URL(value).search && !new URL(value).hash,
      'must not contain a query or fragment',
    );

const configSchema = z
  .object({
    DATABASE_URL: databaseUrlSchema.optional(),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    /** Only the web server talks to the API, so it listens on this machine unless told otherwise. */
    API_HOST: z.string().trim().min(1).default('127.0.0.1'),
    PLUGINS_DIR: z.string().min(1).default('data/plugins'),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).default(336),
    PLUGIN_TIMEOUT_MS: z.coerce.number().int().min(10).default(3000),
    /** Uploaded media files. Share it between API instances. */
    MEDIA_DIR: z.string().min(1).default('data/media'),
    /** Largest media upload in megabytes. The web server's BODY_SIZE_LIMIT must allow it too. */
    MEDIA_MAX_MB: z.coerce.number().int().min(1).max(64).default(20),
    /** How often each API process checks for due recurring tasks and jobs. */
    SCHEDULER_INTERVAL_MS: z.coerce.number().int().min(250).default(5000),
    /**
     * Optional: the web server fetches a secret derived from the secret key once an administrator
     * signs in. Set it on both servers to skip that. Only requests carrying it may state which
     * browser address they act for, so rate limits count visitors separately.
     */
    CMS_FRONTEND_SECRET: z.string().min(32).optional(),
    /**
     * Key for secrets stored in the database (captcha, mail, search). Defaults to a key file
     * created in `data/` on first use; keep it with your database backups.
     */
    CMS_SECRET_KEY: z.string().min(32).optional(),
    /** Previous key used only to drain or reseal data during deliberate rotation. */
    CMS_SECRET_KEY_PREVIOUS: z.string().min(32).optional(),
    /** Optional administrator-equivalent outbound exceptions, visible but read-only in Settings. */
    CMS_EGRESS_ALLOWLIST: egressAllowlistSchema.default([]),

    // OpenID Connect single sign-on. Off unless issuer, client id and redirect URI are all set.
    OIDC_ISSUER: urlWithoutQuery(/^https$/)
      .refine((value) => value.length <= 255, 'must be at most 255 characters')
      .optional(),
    OIDC_CLIENT_ID: z.string().min(1).optional(),
    OIDC_CLIENT_SECRET: z.string().min(1).optional(),
    OIDC_CLIENT_AUTH_METHOD: z
      .enum(['client_secret_basic', 'client_secret_post', 'none'])
      .optional(),
    /** The web app's `/admin/sso/callback` URL, registered at the provider. */
    OIDC_REDIRECT_URI: urlWithoutQuery(/^https?$/).optional(),
    OIDC_SCOPES: z
      .string()
      .default('openid')
      .transform((value) => value.trim().split(/\s+/).join(' '))
      .refine(
        (value) => value.split(' ').includes('openid'),
        'must include openid',
      ),
    OIDC_NAME: z.string().trim().min(1).max(64).default('SSO'),
    /** Pending sign-in requests kept at once; new ones are refused until some finish or expire. */
    OIDC_MAX_PENDING_REQUESTS: z.coerce
      .number()
      .int()
      .min(1)
      .max(100_000)
      .default(1000),
    /** Pending sign-in requests one client (browser network, or signed-in user) may hold. */
    OIDC_MAX_PENDING_PER_CLIENT: z.coerce
      .number()
      .int()
      .min(1)
      .max(100_000)
      .default(10),
    /** Sign-in starts per minute overall, per API process. Refused starts do no further work. */
    OIDC_STARTS_PER_MINUTE: z.coerce
      .number()
      .int()
      .min(1)
      .max(100_000)
      .default(300),
    /** Sign-in starts per minute for one client, per API process. */
    OIDC_STARTS_PER_MINUTE_PER_CLIENT: z.coerce
      .number()
      .int()
      .min(1)
      .max(100_000)
      .default(10),
    /** Older name of `CMS_FRONTEND_SECRET`. */
    OIDC_FRONTEND_SECRET: z.string().min(32).optional(),
    OIDC_ALLOWED_SUBJECTS: subjectAllowlistSchema.default({}),
  })
  .superRefine((config, ctx) => {
    const required = [
      'OIDC_ISSUER',
      'OIDC_CLIENT_ID',
      'OIDC_REDIRECT_URI',
    ] as const;

    if (
      required.some((key) => config[key]) &&
      !required.every((key) => config[key])
    )
      ctx.addIssue({
        code: 'custom',
        path: ['OIDC_ISSUER'],
        message: Errors.ConfigSetTogether(required),
      });

    if (config.OIDC_MAX_PENDING_PER_CLIENT > config.OIDC_MAX_PENDING_REQUESTS)
      ctx.addIssue({
        code: 'custom',
        path: ['OIDC_MAX_PENDING_PER_CLIENT'],
        message: Errors.ConfigPendingLimitTooHigh,
      });

    if (
      config.OIDC_STARTS_PER_MINUTE_PER_CLIENT > config.OIDC_STARTS_PER_MINUTE
    )
      ctx.addIssue({
        code: 'custom',
        path: ['OIDC_STARTS_PER_MINUTE_PER_CLIENT'],
        message: Errors.ConfigStartLimitTooHigh,
      });

    if (
      config.OIDC_CLIENT_AUTH_METHOD &&
      config.OIDC_CLIENT_AUTH_METHOD !== 'none' &&
      !config.OIDC_CLIENT_SECRET
    )
      ctx.addIssue({
        code: 'custom',
        path: ['OIDC_CLIENT_SECRET'],
        message: Errors.ConfigClientSecretRequired(
          config.OIDC_CLIENT_AUTH_METHOD,
        ),
      });
  });

export type AppConfig = z.output<typeof configSchema>;

export const loadConfig = (
  env: Record<string, string | undefined> = process.env,
): AppConfig => {
  const result = configSchema.safeParse(env);
  if (result.success) return result.data;
  const problems = result.error.issues.map(
    ({ path, message }) => `${path.join('.')}: ${message}`,
  );
  throw new Error(Errors.ConfigInvalid(problems));
};
