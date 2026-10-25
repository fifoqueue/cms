import {
  DEFAULT_EMAIL_SETTINGS,
  adminEmailSettingsSchema,
  emailSettingsInputSchema,
  emailTestSchema,
} from '@cms/sdk';
import type { AdminEmailSettings } from '@cms/sdk';
import { z } from 'zod';
import { outgoingEmailSchema } from '@cms/sdk/plugin';
import type {
  EmailMessage,
  MailTransport,
  Mailer,
} from '#api/domain/email/ports';
import type { SealedJobs } from '#api/domain/jobs/sealed-jobs';
import { templates } from '#api/domain/email/templates';
import { PermanentJobError } from '#api/domain/jobs/job-runner';
import type { HookDispatcher, SecretBox } from '#api/domain/ports';
import type { SettingsRepository } from '#api/domain/site/site-service';
import {
  DomainError,
  invalidInput,
  withParams,
  Errors,
} from '#api/shared/errors';
import { failureOf } from '#api/shared/failures';
import { parseInput } from '#api/shared/validation';
import type { Logger } from '#api/shared/logger';
import type { MailTransportRegistry } from '#api/domain/email/transport-registry';

const KEY = 'email';
/** Job kind of queued messages. */
export const EMAIL_JOB = 'email.send';

type Settings = Omit<AdminEmailSettings, 'smtp' | 'http'> & {
  smtp: Omit<AdminEmailSettings['smtp'], 'passwordConfigured'>;
  http: Omit<AdminEmailSettings['http'], 'secretConfigured'>;
};

interface Stored {
  settings: Settings;
  /** Sealed SMTP password; empty when none. */
  password: string;
  secret: string;
  pluginSecrets?: Record<string, string>;
}

const messageSchema = z.object({
  sensitive: z.boolean().optional(),
  to: z.email(),
  subjects: z.array(z.string().max(191)).max(100).optional(),
  subject: z.string(),
  text: z.string(),
});

/**
 * Outgoing mail. Messages are queued and sent by the job runner with retries, so a slow or
 * failing mail server never delays the request that caused the message.
 */
export class EmailService {
  constructor(
    private readonly deps: {
      settings: SettingsRepository;
      secrets: SecretBox;
      mailer: Mailer;
      transports?: MailTransportRegistry;
      sealedJobs: SealedJobs;
      hooks?: HookDispatcher;
      checkDestination?: (settings: Settings) => Promise<void>;
      logger?: Pick<Logger, 'warn'>;
    },
  ) {}

  async getAdmin(): Promise<AdminEmailSettings> {
    const { settings, password, secret, pluginSecrets } = await this.stored();
    return adminEmailSettingsSchema.parse({
      ...settings,
      availableTransports: this.deps.transports?.available() ?? [],
      pluginTransport: settings.pluginTransport
        ? {
            ...settings.pluginTransport,
            secretsConfigured: Object.keys(pluginSecrets ?? {}),
          }
        : null,
      smtp: { ...settings.smtp, passwordConfigured: !!password },
      http: { ...settings.http, secretConfigured: !!secret },
    });
  }

  /** Whether messages can be sent at all. */
  async enabled(): Promise<boolean> {
    return (await this.stored()).settings.enabled;
  }

  async update(input: unknown): Promise<AdminEmailSettings> {
    const {
      smtp: { password, ...smtp },
      http: { secret, ...http },
      pluginTransport,
      ...common
    } = parseInput(emailSettingsInputSchema, input);
    const current = await this.stored();
    const selected =
      pluginTransport === undefined
        ? current.settings.pluginTransport
        : pluginTransport;
    const pluginSecrets =
      selected?.id === current.settings.pluginTransport?.id
        ? { ...current.pluginSecrets }
        : {};
    if (pluginTransport) {
      const definition = this.deps.transports
        ?.available()
        .find((entry) => entry.id === pluginTransport.id);
      if (!definition) throw invalidInput(Errors.EmailDisabled);
      for (const [key, value] of Object.entries(pluginTransport.secrets)) {
        if (
          !definition.fields.some(
            (field) => field.key === key && field.type === 'secret',
          )
        )
          throw invalidInput(Errors.InvalidInput);
        if (value) pluginSecrets[key] = this.deps.secrets.seal(value);
        else delete pluginSecrets[key];
      }
      if (
        Object.keys(pluginTransport.values).some((key) =>
          definition.fields.some(
            (field) => field.key === key && field.type === 'secret',
          ),
        )
      )
        throw invalidInput(Errors.InvalidInput);
      const opened = Object.fromEntries(
        Object.entries(pluginSecrets).map(([key, value]) => [
          key,
          this.deps.secrets.open(value) ?? '',
        ]),
      );
      this.deps.transports!.validate(pluginTransport.id, {
        ...pluginTransport.values,
        ...opened,
      });
    }
    const settings = {
      ...common,
      smtp,
      http,
      pluginTransport: selected
        ? {
            id: selected.id,
            values: selected.values,
            secretsConfigured: [],
          }
        : null,
    };
    if (
      current.secret &&
      secret === undefined &&
      (['provider', 'url', 'authHeader', 'keyId'] as const).some(
        (field) => http[field] !== current.settings.http[field],
      )
    )
      throw invalidInput(Errors.InvalidInput, [
        { path: 'http.secret', message: Errors.EmailSecretRequired },
      ]);
    const sealedSecret =
      secret === undefined
        ? current.secret
        : secret
          ? this.deps.secrets.seal(secret)
          : '';
    if (
      settings.enabled &&
      !selected &&
      settings.transport === 'http' &&
      !sealedSecret
    )
      throw invalidInput(Errors.InvalidInput, [
        { path: 'http.secret', message: Errors.EmailSecretRequired },
      ]);
    if (settings.enabled && !selected)
      await this.deps.checkDestination?.(settings);
    await this.deps.settings.set(KEY, {
      settings,
      pluginSecrets,
      secret: sealedSecret,
      password:
        password === undefined
          ? current.password
          : password
            ? this.deps.secrets.seal(password)
            : '',
    } satisfies Stored);
    const result = await this.getAdmin();
    void this.deps.hooks?.emit('email.settingsUpdated', result);
    return result;
  }

  /** Queues `message`; throws `invalid_input` while email is disabled. */
  async queue(message: EmailMessage, expiresAt?: Date): Promise<void> {
    if (!(await this.enabled())) throw invalidInput(Errors.EmailDisabled);
    await this.deps.sealedJobs.enqueue(EMAIL_JOB, message, expiresAt);
  }

  /** Sends a test message now, so the administrator sees the server's answer. */
  async test(input: unknown, site: { title: string; locale: string }) {
    const { to } = parseInput(emailTestSchema, input);
    const transport = await this.transport();
    if (!transport) throw invalidInput(Errors.EmailDisabled);
    await this.send(transport, {
      to,
      ...templates(site.locale).test(site.title),
    }).catch((error: unknown) => {
      if (error instanceof DomainError) throw error;
      // The server's answer may quote credentials or provider bodies; only the log keeps it.
      this.deps.logger?.warn(Errors.EmailSendFailed, error);
      const failure = failureOf(error);
      throw invalidInput(
        Errors.EmailSendFailed,
        failure && withParams(Errors.EmailSendFailed, { ...failure }),
      );
    });
  }

  /** The job handler for `EMAIL_JOB`. */
  async deliver(payload: unknown): Promise<void> {
    await this.sendNow(this.message(payload));
  }

  /**
   * Sends `message` now, for job handlers that own their retries (the job fails and retries
   * when this throws, including while mail is disabled or misconfigured).
   */
  async sendNow(message: EmailMessage): Promise<void> {
    const transport = await this.transport();
    // Disabled or misconfigured mail fails for now; enabling it lets queued messages go out.
    if (!transport) throw new Error(Errors.EmailDisabled);
    await this.send(transport, message);
  }

  private async send(transport: MailTransport, message: EmailMessage) {
    const original = parseInput(outgoingEmailSchema, message);
    // Sensitive mail (reset/invite/recovery/privacy) carries tokens: filters never see it.
    const filtered =
      this.deps.hooks && !message.sensitive
        ? await this.deps.hooks.applyFilter(
            'email.beforeSend',
            original,
            (value) => {
              const parsed = outgoingEmailSchema.safeParse(value);
              return parsed.success && parsed.data.to === original.to;
            },
          )
        : original;
    const outgoing = {
      ...message,
      ...outgoingEmailSchema.parse(filtered),
    };
    let allowed = true;
    await this.deps.hooks?.applyFilter(
      'email.sendAllowed',
      { to: outgoing.to, subject: outgoing.subject, allowed: true },
      (value) => {
        const parsed = z
          .object({
            to: z.literal(outgoing.to),
            subject: z.literal(outgoing.subject),
            allowed: z.boolean(),
          })
          .safeParse(value);
        if (!parsed.success || (!allowed && parsed.data.allowed)) return false;
        allowed = parsed.data.allowed;
        return true;
      },
    );
    try {
      if (!allowed) throw new PermanentJobError(Errors.EmailDisabled);
      await this.deps.mailer.send(transport, outgoing);
    } catch (error) {
      void this.deps.hooks?.emit('email.failed', { to: outgoing.to });
      throw error;
    }
    void this.deps.hooks?.emit('email.sent', { to: outgoing.to });
  }

  /** Opens sealed envelopes and accepts plaintext jobs queued before this upgrade. */
  private message(payload: unknown): EmailMessage {
    const legacy = messageSchema.safeParse(payload);
    if (legacy.success) return legacy.data;
    try {
      return this.deps.sealedJobs.open(payload, messageSchema);
    } catch (error) {
      if (error instanceof PermanentJobError)
        throw new PermanentJobError(Errors.EmailInvalidJob);
      throw error;
    }
  }

  private async transport(): Promise<MailTransport | null> {
    const { settings, password, secret, pluginSecrets } = await this.stored();
    if (!settings.enabled || !settings.fromEmail) return null;
    const from = { name: settings.fromName, email: settings.fromEmail };
    if (settings.pluginTransport) {
      const values = { ...settings.pluginTransport.values };
      for (const [key, sealed] of Object.entries(pluginSecrets ?? {})) {
        const value = this.deps.secrets.open(sealed);
        if (value === null) throw new Error(Errors.EmailSecretRequired);
        values[key] = value;
      }
      return {
        kind: 'plugin',
        id: settings.pluginTransport.id,
        settings: values,
        from,
      };
    }
    if (settings.transport === 'http') {
      const opened = secret ? this.deps.secrets.open(secret) : null;
      if (!opened) throw new Error(Errors.EmailSecretRequired);
      return {
        kind: 'http',
        ...settings.http,
        secret: opened,
        from,
      };
    }
    if (!settings.smtp.host) return null;
    return {
      kind: 'smtp',
      ...settings.smtp,
      password: password ? (this.deps.secrets.open(password) ?? '') : '',
      from,
    };
  }

  private async stored(): Promise<Stored> {
    const raw = (await this.deps.settings.get(KEY)) as
      Partial<Stored> | undefined;
    const old = raw?.settings as
      | (Settings & {
          host?: string;
          port?: number;
          security?: string;
          username?: string;
        })
      | undefined;
    const candidate =
      old && !old.transport
        ? {
            ...DEFAULT_EMAIL_SETTINGS,
            enabled: old.enabled,
            fromName: old.fromName,
            fromEmail: old.fromEmail,
            smtp: {
              host: old.host,
              port: old.port,
              security: old.security,
              username: old.username,
              passwordConfigured: false,
            },
          }
        : old && {
            ...old,
            smtp: { ...old.smtp, passwordConfigured: false },
            http: { ...old.http, secretConfigured: false },
          };
    const parsed = adminEmailSettingsSchema.safeParse(candidate);
    const {
      smtp: { passwordConfigured: _password, ...smtp },
      http: { secretConfigured: _secret, ...http },
      ...common
    } = parsed.success ? parsed.data : DEFAULT_EMAIL_SETTINGS;
    return {
      settings: { ...common, smtp, http },
      password: typeof raw?.password === 'string' ? raw.password : '',
      secret: typeof raw?.secret === 'string' ? raw.secret : '',
      pluginSecrets: raw?.pluginSecrets ?? {},
    };
  }
}
