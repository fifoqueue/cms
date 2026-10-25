import { EMAIL_TEMPLATE_PLACEHOLDERS } from '@cms/sdk';
import type { AdminEmailSettings } from '@cms/sdk';
import type { EmailMessage, MailTransport } from '#api/domain/email/ports';
import { PermanentJobError } from '#api/domain/jobs/job-runner';
import { Errors } from '#api/shared/errors';
import { signAws } from '#api/infra/aws-signature';

type HttpTransport = Extract<MailTransport, { kind: 'http' }>;
type HttpSettings = Omit<AdminEmailSettings['http'], 'secretConfigured'>;
type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export function emailEndpoint(settings: HttpSettings): string {
  const eu = settings.region === 'eu' ? '.eu' : '';
  switch (settings.provider) {
    case 'sendgrid':
      return `https://api${eu}.sendgrid.com/v3/mail/send`;
    case 'mailgun':
      return `https://api${eu}.mailgun.net/v3/${encodeURIComponent(settings.domain)}/messages`;
    case 'ses':
      return `https://email.${settings.region}.amazonaws.com/v2/email/outbound-emails`;
    case 'postmark':
      return 'https://api.postmarkapp.com/email';
    case 'resend':
      return 'https://api.resend.com/emails';
    case 'brevo':
      return 'https://api.brevo.com/v3/smtp/email';
    case 'sparkpost':
      return `https://api${eu}.sparkpost.com/api/v1/transmissions`;
    case 'mailjet':
      return 'https://api.mailjet.com/v3.1/send';
    case 'mailersend':
      return 'https://api.mailersend.com/v1/email';
    case 'custom':
      return settings.url;
  }
}

const basic = (user: string, secret: string) =>
  `Basic ${Buffer.from(`${user}:${secret}`).toString('base64')}`;
const sender = (from: HttpTransport['from']) =>
  from.name ? `${JSON.stringify(from.name)} <${from.email}>` : from.email;
const address = (from: HttpTransport['from']) => ({
  email: from.email,
  ...(from.name && { name: from.name }),
});
const sesSender = (from: HttpTransport['from']) =>
  /[\u0080-\uffff]/.test(from.name)
    ? `${Array.from(from.name)
        .reduce<string[]>((parts, char) => {
          const last = parts.length - 1;
          if (last < 0 || Buffer.byteLength(parts[last]! + char) > 42)
            parts.push(char);
          else parts[last] += char;
          return parts;
        }, [])
        .map((part) => `=?UTF-8?B?${Buffer.from(part).toString('base64')}?=`)
        .join(' ')} <${from.email}>`
    : sender(from);
type Adapter = (
  transport: HttpTransport,
  message: EmailMessage,
) => { body: unknown; headers: Record<string, string>; form?: boolean };
const bearer = (secret: string) => ({ authorization: `Bearer ${secret}` });
const adapters: Record<HttpTransport['provider'], Adapter> = {
  sendgrid: (t, m) => ({
    headers: bearer(t.secret),
    body: {
      from: address(t.from),
      personalizations: [{ to: [{ email: m.to }] }],
      subject: m.subject,
      content: [{ type: 'text/plain', value: m.text }],
    },
  }),
  mailgun: (t, m) => ({
    headers: { authorization: basic('api', t.secret) },
    form: true,
    body: Object.entries({
      from: sender(t.from),
      to: m.to,
      subject: m.subject,
      text: m.text,
    }).reduce((form, [key, value]) => {
      form.set(key, value);
      return form;
    }, new FormData()),
  }),
  ses: (t, m) => ({
    headers: {},
    body: {
      FromEmailAddress: sesSender(t.from),
      Destination: { ToAddresses: [m.to] },
      Content: {
        Simple: {
          Subject: { Data: m.subject, Charset: 'UTF-8' },
          Body: { Text: { Data: m.text, Charset: 'UTF-8' } },
        },
      },
    },
  }),
  postmark: (t, m) => ({
    headers: { 'X-Postmark-Server-Token': t.secret },
    body: {
      From: sender(t.from),
      To: m.to,
      Subject: m.subject,
      TextBody: m.text,
    },
  }),
  resend: (t, m) => ({
    headers: bearer(t.secret),
    body: {
      from: sender(t.from),
      to: [m.to],
      subject: m.subject,
      text: m.text,
    },
  }),
  brevo: (t, m) => ({
    headers: { 'api-key': t.secret },
    body: {
      sender: address(t.from),
      to: [{ email: m.to }],
      subject: m.subject,
      textContent: m.text,
    },
  }),
  sparkpost: (t, m) => ({
    headers: { authorization: t.secret },
    body: {
      recipients: [{ address: m.to }],
      content: { from: address(t.from), subject: m.subject, text: m.text },
    },
  }),
  mailjet: (t, m) => ({
    headers: { authorization: basic(t.keyId, t.secret) },
    body: {
      Messages: [
        {
          From: {
            Email: t.from.email,
            ...(t.from.name && { Name: t.from.name }),
          },
          To: [{ Email: m.to }],
          Subject: m.subject,
          TextPart: m.text,
        },
      ],
    },
  }),
  mailersend: (t, m) => ({
    headers: bearer(t.secret),
    body: {
      from: address(t.from),
      to: [{ email: m.to }],
      subject: m.subject,
      text: m.text,
    },
  }),
  custom: (t, m) => {
    const values = {
      to: m.to,
      subject: m.subject,
      text: m.text,
      fromName: t.from.name,
      fromEmail: t.from.email,
    };
    // One pass: message values containing placeholders must not be interpolated again.
    const body = t.bodyTemplate.replace(
      /\{\{\s*(\w+)\s*\}\}/g,
      (match, name: string) =>
        EMAIL_TEMPLATE_PLACEHOLDERS.includes(name as keyof typeof values)
          ? JSON.stringify(values[name as keyof typeof values])
          : match,
    );
    try {
      return {
        headers: t.authHeader ? { [t.authHeader]: t.secret } : {},
        body: JSON.parse(body),
      };
    } catch {
      throw new PermanentJobError(Errors.EmailTemplateInvalid);
    }
  },
};

/** Read a bounded prefix, redact before truncating so partial credentials cannot leak. */
async function excerpt(
  response: Response,
  credentials: string[],
): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  try {
    while (text.length < 32768) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value.subarray(0, 65536), { stream: true });
    }
  } finally {
    await reader.cancel();
  }
  for (const credential of credentials
    .filter(Boolean)
    .sort((a, b) => b.length - a.length))
    for (const value of [
      credential,
      JSON.stringify(credential).slice(1, -1),
      encodeURIComponent(credential),
      Buffer.from(credential).toString('base64'),
    ])
      text = text.replaceAll(value, '[redacted]');
  return text.slice(0, 500);
}

export const createHttpMailer = (fetch: Fetch, now = () => new Date()) => ({
  async send(transport: HttpTransport, message: EmailMessage): Promise<void> {
    const request = adapters[transport.provider](transport, message);
    const url = emailEndpoint(transport);
    const body = request.form
      ? (request.body as FormData)
      : JSON.stringify(request.body);
    let headers: Record<string, string> = {
      accept: 'application/json',
      ...(!request.form && { 'content-type': 'application/json' }),
      ...request.headers,
    };
    if (transport.provider === 'ses')
      headers = signAws({
        url,
        method: 'POST',
        body: body as string,
        headers,
        region: transport.region,
        service: 'ses',
        keyId: transport.keyId,
        secret: transport.secret,
        date: now(),
      });
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });
    } catch {
      // Fetch errors can contain headers or URL credentials; never expose their text.
      throw new Error(Errors.EmailNetworkFailed);
    }
    if (response.ok) {
      await response.body?.cancel();
      return;
    }
    let detail = '';
    try {
      detail = await excerpt(response, [
        transport.secret,
        ...Object.values(request.headers).flatMap((value) => [
          value,
          value.startsWith('Basic ') ? value.slice(6) : '',
        ]),
        headers.authorization ?? '',
      ]);
    } catch {
      /* The status still determines retryability if reading the body fails. */
    }
    const error = Errors.EmailHttpFailed(response.status, detail);
    if (
      response.status >= 400 &&
      response.status < 500 &&
      ![401, 403, 408, 429].includes(response.status) &&
      !(transport.provider === 'sparkpost' && response.status === 420)
    )
      throw new PermanentJobError(error);
    throw new Error(error);
  },
});
