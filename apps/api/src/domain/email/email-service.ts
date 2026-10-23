import {
  DEFAULT_EMAIL_SETTINGS,
  adminEmailSettingsSchema,
  emailSettingsInputSchema,
  emailTestSchema,
} from '@cms/sdk';
import type { AdminEmailSettings } from '@cms/sdk';
import { z } from 'zod';
import { sealJob, openJob } from '#api/domain/jobs/payload';
import type {
  EmailMessage,
  MailTransport,
  Mailer,
} from '#api/domain/email/ports';
import type { JobQueue } from '#api/domain/jobs/ports';
import { templates } from '#api/domain/email/templates';
import { PermanentJobError } from '#api/domain/jobs/job-runner';
import type { SecretBox } from '#api/domain/ports';
import type { SettingsRepository } from '#api/domain/site/site-service';
import { invalidInput, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

const KEY = 'email';
/** Job kind of queued messages. */
export const EMAIL_JOB = 'email.send';

type Settings = Omit<AdminEmailSettings, 'passwordConfigured'>;

interface Stored {
  settings: Settings;
  /** Sealed SMTP password; empty when none. */
  password: string;
}

const messageSchema = z.object({
  to: z.email(),
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
      jobs: JobQueue;
    },
  ) {}

  async getAdmin(): Promise<AdminEmailSettings> {
    const { settings, password } = await this.stored();
    return adminEmailSettingsSchema.parse({
      ...settings,
      passwordConfigured: !!password,
    });
  }

  /** Whether messages can be sent at all. */
  async enabled(): Promise<boolean> {
    return (await this.stored()).settings.enabled;
  }

  async update(input: unknown): Promise<AdminEmailSettings> {
    const { password, ...settings } = parseInput(
      emailSettingsInputSchema,
      input,
    );
    const current = await this.stored();
    await this.deps.settings.set(KEY, {
      settings,
      password:
        password === undefined
          ? current.password
          : password
            ? this.deps.secrets.seal(password)
            : '',
    } satisfies Stored);
    return this.getAdmin();
  }

  /** Queues `message`; throws `invalid_input` while email is disabled. */
  async queue(message: EmailMessage, expiresAt?: Date): Promise<void> {
    if (!(await this.enabled())) throw invalidInput(Errors.EmailDisabled);
    await this.deps.jobs.enqueue(
      EMAIL_JOB,
      sealJob(message, this.deps.secrets),
      undefined,
      expiresAt,
    );
  }

  /** Sends a test message now, so the administrator sees the server's answer. */
  async test(input: unknown, site: { title: string; locale: string }) {
    const { to } = parseInput(emailTestSchema, input);
    const transport = await this.transport();
    if (!transport) throw invalidInput(Errors.EmailDisabled);
    await this.deps.mailer
      .send(transport, { to, ...templates(site.locale).test(site.title) })
      .catch((error: unknown) => {
        throw invalidInput(Errors.EmailSendFailed(String(error)));
      });
  }

  /** The job handler for `EMAIL_JOB`. */
  async deliver(payload: unknown): Promise<void> {
    const message = messageSchema.safeParse(
      openJob(payload, this.deps.secrets),
    );
    if (!message.success) throw new PermanentJobError(Errors.EmailInvalidJob);
    const transport = await this.transport();
    // Disabled or misconfigured mail fails for now; enabling it lets queued messages go out.
    if (!transport) throw new Error(Errors.EmailDisabled);
    await this.deps.mailer.send(transport, message.data);
  }

  private async transport(): Promise<MailTransport | null> {
    const { settings, password } = await this.stored();
    if (!settings.enabled || !settings.host || !settings.fromEmail) return null;
    return {
      host: settings.host,
      port: settings.port,
      security: settings.security,
      username: settings.username,
      password: password ? (this.deps.secrets.open(password) ?? '') : '',
      from: { name: settings.fromName, email: settings.fromEmail },
    };
  }

  private async stored(): Promise<Stored> {
    const raw = (await this.deps.settings.get(KEY)) as
      Partial<Stored> | undefined;
    const parsed = adminEmailSettingsSchema
      .omit({ passwordConfigured: true })
      .safeParse(raw?.settings);
    const { passwordConfigured: _configured, ...defaults } =
      DEFAULT_EMAIL_SETTINGS;
    return {
      settings: parsed.success ? parsed.data : defaults,
      password: typeof raw?.password === 'string' ? raw.password : '',
    };
  }
}
