import { createTransport } from 'nodemailer';
import type { Mailer, MailTransport } from '#api/domain/email/ports';

const TIMEOUT_MS = 15_000;

/** SMTP through nodemailer; one connection per message, so settings changes apply at once. */
export const smtpMailer: Mailer = {
  async send(transport: MailTransport, message) {
    const client = createTransport({
      host: transport.host,
      port: transport.port,
      secure: transport.security === 'tls',
      requireTLS: transport.security === 'starttls',
      ignoreTLS: transport.security === 'none',
      auth: transport.username
        ? { user: transport.username, pass: transport.password }
        : undefined,
      connectionTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });
    try {
      await client.sendMail({
        from: { name: transport.from.name, address: transport.from.email },
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    } finally {
      client.close();
    }
  },
};
