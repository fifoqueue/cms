export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Outgoing mail transport settings with the decrypted password. Never serialize this. */
export interface MailTransport {
  host: string;
  port: number;
  security: 'tls' | 'starttls' | 'none';
  username: string;
  password: string;
  from: { name: string; email: string };
}

/** Delivers one message now. Throws on failure; the job queue retries. */
export interface Mailer {
  send(transport: MailTransport, message: EmailMessage): Promise<void>;
}
