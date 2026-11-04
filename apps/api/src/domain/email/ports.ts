import type { AdminEmailSettings, MailValues } from '@cms/sdk';
import type { SystemMail } from '#api/domain/email/system-mail';

export interface EmailMessage {
  sensitive?: boolean;
  system?: SystemMail;
  to: string;
  /** Subjects whose personal information is included in this message; encrypted with the body. */
  subjects?: string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

/** Outgoing mail transport settings with the decrypted password. Never serialize this. */
export type MailTransport = (
  | { kind: 'plugin'; id: string; settings: MailValues }
  | {
      kind: 'smtp';
      host: string;
      port: number;
      security: 'tls' | 'starttls' | 'none';
      username: string;
      password: string;
    }
  | (Omit<AdminEmailSettings['http'], 'secretConfigured'> & {
      kind: 'http';
      secret: string;
    })
) & { from: { name: string; email: string } };

/** Delivers one message now. Throws on failure; the job queue retries. */
export interface Mailer {
  send(transport: MailTransport, message: EmailMessage): Promise<void>;
}
