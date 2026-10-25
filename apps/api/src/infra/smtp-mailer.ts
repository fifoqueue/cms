import { createTransport } from 'nodemailer';
import type { EmailMessage, MailTransport } from '#api/domain/email/ports';
import { outbound } from '#api/infra/egress-policy';
import type { Address } from '#api/infra/egress-policy';

const TIMEOUT_MS = 15_000;

type Target = Address & { serverName?: string };
type Resolve = (
  host: string,
  port: number,
  signal: AbortSignal,
) => Promise<Target[]>;

const connectionFailure = (error: unknown) =>
  error instanceof Error &&
  'command' in error &&
  (error as Error & { command?: string }).command === 'CONN';

/** SMTP through nodemailer; fallback occurs only before an SMTP connection succeeds. */
export const createSmtpMailer = (resolve: Resolve) => ({
  async send(
    transport: Extract<MailTransport, { kind: 'smtp' }>,
    message: EmailMessage,
  ) {
    const started = Date.now();
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const targets = await resolve(transport.host, transport.port, signal);
    for (const [index, target] of targets.entries()) {
      const remaining = Math.max(1, TIMEOUT_MS - (Date.now() - started));
      const client = createTransport({
        host: target.address,
        port: transport.port,
        secure: transport.security === 'tls',
        requireTLS: transport.security === 'starttls',
        ignoreTLS: transport.security === 'none',
        auth: transport.username
          ? { user: transport.username, pass: transport.password }
          : undefined,
        ...(target.serverName && { tls: { servername: target.serverName } }),
        connectionTimeout: remaining,
        socketTimeout: remaining,
      });
      try {
        await client.sendMail({
          from: { name: transport.from.name, address: transport.from.email },
          to: message.to,
          subject: message.subject,
          text: message.text,
        });
        return;
      } catch (error) {
        if (index === targets.length - 1 || !connectionFailure(error))
          throw error;
      } finally {
        client.close();
      }
    }
  },
});

export const smtpMailer = createSmtpMailer((host, port, signal) =>
  outbound.resolveHost(host, port, { signal }),
);
