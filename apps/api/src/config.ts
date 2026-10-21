import { z } from 'zod';

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
        message: 'must be a JSON object',
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
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    PLUGINS_DIR: z.string().min(1).default('data/plugins'),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).default(336),
    PLUGIN_TIMEOUT_MS: z.coerce.number().int().min(10).default(3000),

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
    /**
     * Shared with the web app (same variable). Only requests carrying it may state which browser
     * address they act for; required while single sign-on is on.
     */
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
        message: `${required.join(', ')} must be set together`,
      });

    if (config.OIDC_ISSUER && !config.OIDC_FRONTEND_SECRET)
      ctx.addIssue({
        code: 'custom',
        path: ['OIDC_FRONTEND_SECRET'],
        message: 'required while single sign-on is on',
      });

    if (config.OIDC_MAX_PENDING_PER_CLIENT > config.OIDC_MAX_PENDING_REQUESTS)
      ctx.addIssue({
        code: 'custom',
        path: ['OIDC_MAX_PENDING_PER_CLIENT'],
        message: 'must not exceed OIDC_MAX_PENDING_REQUESTS',
      });

    if (
      config.OIDC_STARTS_PER_MINUTE_PER_CLIENT > config.OIDC_STARTS_PER_MINUTE
    )
      ctx.addIssue({
        code: 'custom',
        path: ['OIDC_STARTS_PER_MINUTE_PER_CLIENT'],
        message: 'must not exceed OIDC_STARTS_PER_MINUTE',
      });

    if (
      config.OIDC_CLIENT_AUTH_METHOD &&
      config.OIDC_CLIENT_AUTH_METHOD !== 'none' &&
      !config.OIDC_CLIENT_SECRET
    )
      ctx.addIssue({
        code: 'custom',
        path: ['OIDC_CLIENT_SECRET'],
        message: `required for ${config.OIDC_CLIENT_AUTH_METHOD}`,
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
  throw new Error(`Invalid configuration:\n  ${problems.join('\n  ')}`);
};
