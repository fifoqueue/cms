import { z } from 'zod';
import { Errors } from '#sdk/errors';

export const SMTP_SECURITY = ['tls', 'starttls', 'none'] as const;

export const pluginMailIdSchema = z
  .string()
  .regex(/^plugin:[a-z0-9-]+:[a-z0-9-]+$/);
export const mailFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1).max(100),
  type: z.enum(['text', 'number', 'boolean', 'secret']),
  required: z.boolean().default(false),
});
export type MailField = z.output<typeof mailFieldSchema>;
export type MailValues = Record<string, string | number | boolean>;
export interface PluginMailTransport {
  label: string;
  fields: MailField[];
  send(input: {
    from: { name: string; email: string };
    to: string;
    subject: string;
    text: string;
    settings: MailValues;
  }): void | Promise<void>;
}
export interface MailTransportRegistrar {
  register(key: string, transport: PluginMailTransport): () => void;
}
const mailValuesSchema = z.record(
  z.string(),
  z.union([z.string().max(10_000), z.number().finite(), z.boolean()]),
);
const pluginMailSchema = z.object({
  id: pluginMailIdSchema,
  values: mailValuesSchema.default({}),
  secretsConfigured: z.array(z.string()).default([]),
});

/** How messages leave the CMS: an SMTP server or a mail provider's HTTP API. */
export const EMAIL_TRANSPORTS = ['smtp', 'http'] as const;
export type EmailTransport = (typeof EMAIL_TRANSPORTS)[number];

/** HTTP mail APIs; `custom` posts a JSON template to any HTTPS endpoint. */
export const EMAIL_PROVIDERS = [
  'sendgrid',
  'mailgun',
  'ses',
  'postmark',
  'resend',
  'brevo',
  'sparkpost',
  'mailjet',
  'mailersend',
  'custom',
] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

/** HTTP settings field a provider uses besides its secret (`secret` is always required). */
export type EmailProviderField =
  'region' | 'domain' | 'keyId' | 'url' | 'authHeader' | 'bodyTemplate';

/**
 * What each provider needs. `regions` lists fixed choices; `regionPattern` accepts free
 * input (AWS region names). `secret` is the API key, server token or secret access key.
 */
export const EMAIL_PROVIDER_FIELDS: Record<
  EmailProvider,
  {
    required: readonly EmailProviderField[];
    optional: readonly EmailProviderField[];
    regions?: readonly string[];
    regionPattern?: RegExp;
  }
> = {
  sendgrid: { required: [], optional: ['region'], regions: ['us', 'eu'] },
  mailgun: {
    required: ['domain'],
    optional: ['region'],
    regions: ['us', 'eu'],
  },
  ses: {
    required: ['region', 'keyId'],
    optional: [],
    regionPattern: /^[a-z]{2}(?:-[a-z]+)+-\d{1,2}$/,
  },
  postmark: { required: [], optional: [] },
  resend: { required: [], optional: [] },
  brevo: { required: [], optional: [] },
  sparkpost: { required: [], optional: ['region'], regions: ['us', 'eu'] },
  mailjet: { required: ['keyId'], optional: [] },
  mailersend: { required: [], optional: [] },
  custom: { required: ['url', 'bodyTemplate'], optional: ['authHeader'] },
};

/**
 * Placeholders a custom body template may use. Each stands alone as a JSON value
 * (`"to": {{to}}`) and is replaced by a JSON string, so values are always escaped.
 */
export const EMAIL_TEMPLATE_PLACEHOLDERS = [
  'to',
  'subject',
  'text',
  'fromName',
  'fromEmail',
] as const;

const smtpSettingsSchema = z.object({
  host: z.string(),
  port: z.number().int(),
  security: z.enum(SMTP_SECURITY),
  username: z.string(),
  passwordConfigured: z.boolean(),
});

const httpSettingsSchema = z.object({
  provider: z.enum(EMAIL_PROVIDERS),
  /** `us`/`eu` for SendGrid, Mailgun and SparkPost; an AWS region for SES. */
  region: z.string(),
  /** Mailgun sending domain. */
  domain: z.string(),
  /** SES access key ID or Mailjet public API key. */
  keyId: z.string(),
  /** Custom endpoint (HTTPS). */
  url: z.string(),
  /** Custom header carrying the secret, such as `Authorization`; empty sends none. */
  authHeader: z.string(),
  /** Custom JSON body with `{{placeholder}}` values. */
  bodyTemplate: z.string(),
  secretConfigured: z.boolean(),
});

/**
 * Outgoing mail settings as administrators see them; secrets are never returned. The sender
 * is shared by both transports, and each transport keeps its own settings while unused.
 */
export const adminEmailSettingsSchema = z.object({
  pluginTransport: pluginMailSchema.nullable().optional(),
  availableTransports: z
    .array(
      z.object({
        id: pluginMailIdSchema,
        label: z.string(),
        fields: z.array(mailFieldSchema),
      }),
    )
    .optional(),
  enabled: z.boolean(),
  fromName: z.string(),
  fromEmail: z.string(),
  transport: z.enum(EMAIL_TRANSPORTS),
  smtp: smtpSettingsSchema,
  http: httpSettingsSchema,
});

export type AdminEmailSettings = z.output<typeof adminEmailSettingsSchema>;

const headerName = /^[!#$%&'*+.^_`|~0-9a-z-]+$/i;
const reservedHeaders = new Set([
  'host',
  'content-type',
  'content-length',
  'transfer-encoding',
  'connection',
  'accept',
]);
const credential = z
  .string()
  .regex(/^[\x20-\x7e\x80-\xff]*$/, Errors.EmailHeaderInvalid)
  .transform((value) => value.trim());

const bodyTemplate = z
  .string()
  .max(10_000)
  .refine((template) => {
    if (!template.trim()) return true;
    for (const match of template.matchAll(/\{\{([^{}]*)\}\}/g))
      if (
        !EMAIL_TEMPLATE_PLACEHOLDERS.some((name) => name === match[1]!.trim())
      )
        return false;
    try {
      // Placeholders stand in for JSON strings; the template must stay valid JSON.
      JSON.parse(template.replaceAll(/\{\{\s*\w+\s*\}\}/g, '""'));
      return true;
    } catch {
      return false;
    }
  }, Errors.EmailTemplateInvalid);

/** Omitted `password`/`secret` keeps the stored one; an empty string removes it. */
export const emailSettingsInputSchema = z
  .object({
    pluginTransport: z
      .object({
        id: pluginMailIdSchema,
        values: mailValuesSchema.default({}),
        secrets: z.record(z.string(), z.string().max(10_000)).default({}),
      })
      .nullable()
      .optional(),
    enabled: z.boolean(),
    fromName: z.string().trim().max(191),
    fromEmail: z.email().max(191).or(z.literal('')),
    transport: z.enum(EMAIL_TRANSPORTS),
    smtp: z.object({
      host: z.string().trim().max(255),
      port: z.number().int().min(1).max(65_535),
      security: z.enum(SMTP_SECURITY),
      username: z.string().trim().max(255),
      password: z.string().max(500).optional(),
    }),
    http: z.object({
      provider: z.enum(EMAIL_PROVIDERS),
      region: z.string().trim().max(40),
      domain: z
        .string()
        .trim()
        .max(253)
        .refine(
          (value) =>
            !value ||
            value
              .split('.')
              .every((label) =>
                /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label),
              ),
          Errors.EmailProviderFieldRequired,
        ),
      keyId: z.string().max(255).pipe(credential),
      url: z
        .string()
        .trim()
        .max(2048)
        .refine((url) => {
          if (!url) return true;
          try {
            return new URL(url).protocol === 'https:';
          } catch {
            return false;
          }
        }, Errors.EmailUrlInvalid),
      authHeader: z
        .string()
        .trim()
        .max(100)
        .refine(
          (name) =>
            !name ||
            (headerName.test(name) && !reservedHeaders.has(name.toLowerCase())),
          Errors.EmailHeaderInvalid,
        ),
      bodyTemplate,
      secret: z.string().max(2000).pipe(credential).optional(),
    }),
  })
  .superRefine((settings, ctx) => {
    if (!settings.enabled) return;
    if (!settings.fromEmail)
      ctx.addIssue({
        code: 'custom',
        message: Errors.EmailSenderRequired,
        path: ['fromEmail'],
      });
    if (settings.pluginTransport) return;
    if (settings.transport === 'smtp') {
      if (!settings.smtp.host)
        ctx.addIssue({
          code: 'custom',
          message: Errors.EmailServerRequired,
          path: ['smtp', 'host'],
        });
      return;
    }
    const { http } = settings;
    const fields = EMAIL_PROVIDER_FIELDS[http.provider];
    for (const field of fields.required)
      if (!http[field].trim())
        ctx.addIssue({
          code: 'custom',
          message: Errors.EmailProviderFieldRequired,
          path: ['http', field],
        });
    if (
      http.region &&
      [...fields.required, ...fields.optional].includes('region') &&
      !(fields.regions
        ? fields.regions.includes(http.region)
        : fields.regionPattern?.test(http.region))
    )
      ctx.addIssue({
        code: 'custom',
        message: Errors.EmailRegionInvalid,
        path: ['http', 'region'],
      });
  });

export type EmailSettingsInput = z.input<typeof emailSettingsInputSchema>;

export const DEFAULT_EMAIL_SETTINGS: AdminEmailSettings = {
  enabled: false,
  fromName: '',
  fromEmail: '',
  transport: 'smtp',
  smtp: {
    host: '',
    port: 587,
    security: 'starttls',
    username: '',
    passwordConfigured: false,
  },
  http: {
    provider: 'sendgrid',
    region: '',
    domain: '',
    keyId: '',
    url: '',
    authHeader: '',
    bodyTemplate: '',
    secretConfigured: false,
  },
};

export const emailTestSchema = z.object({ to: z.email().max(191) });
