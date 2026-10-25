import { describe, expect, test } from 'bun:test';
import { DEFAULT_EMAIL_SETTINGS } from '@cms/sdk';
import type { EmailProvider } from '@cms/sdk';
import type { MailTransport } from '#api/domain/email/ports';
import { createHttpMailer } from '#api/infra/http-mailer';
import { signAws } from '#api/infra/aws-signature';
import { PermanentJobError } from '#api/domain/jobs/job-runner';

const transport = (
  provider: EmailProvider,
): Extract<MailTransport, { kind: 'http' }> => ({
  ...DEFAULT_EMAIL_SETTINGS.http,
  kind: 'http',
  provider,
  region: 'us-east-1',
  domain: 'mail.example.com',
  keyId: 'public-key',
  secret: 'private-secret',
  url: 'https://custom.example.com/send',
  authHeader: 'X-Token',
  bodyTemplate:
    '{"to": {{to}}, "subject": {{subject}}, "text": {{text}}, "name": {{fromName}}, "email": {{fromEmail}}}',
  from: { name: 'Site', email: 'site@example.com' },
});
const message = {
  to: 'reader@example.com',
  subject: 'Hello',
  text: 'Plain text',
};
const from = '"Site" <site@example.com>';
test('SparkPost 420 retries', async () => {
  try {
    await createHttpMailer(async () => new Response('', { status: 420 })).send(
      transport('sparkpost'),
      message,
    );
    throw new Error('expected failure');
  } catch (error) {
    expect(error).not.toBeInstanceOf(PermanentJobError);
    expect((error as Error).message).toContain('420');
  }
});

test('SES encodes Unicode sender and permits empty name', async () => {
  for (const name of ['한국', '']) {
    await createHttpMailer(async (_url, init) => {
      expect(JSON.parse(String(init.body)).FromEmailAddress).toBe(
        name ? '=?UTF-8?B?7ZWc6rWt?= <site@example.com>' : 'site@example.com',
      );
      return new Response(null, { status: 204 });
    }).send(
      { ...transport('ses'), from: { name, email: 'site@example.com' } },
      message,
    );
  }
});

test('SigV4 AWS PUT payload vector', () => {
  const headers = signAws({
    url: 'https://examplebucket.s3.amazonaws.com/test%24file.text',
    method: 'PUT',
    body: 'Welcome to Amazon S3.',
    headers: {
      date: 'Fri, 24 May 2013 00:00:00 GMT',
      'x-amz-storage-class': 'REDUCED_REDUNDANCY',
    },
    region: 'us-east-1',
    service: 's3',
    keyId: 'AKIAIOSFODNN7EXAMPLE',
    secret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    date: new Date('2013-05-24T00:00:00Z'),
  });
  expect(headers.authorization).toEndWith(
    'Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd',
  );
});
const cases: [EmailProvider, string, string, string, unknown][] = [
  [
    'sendgrid',
    'https://api.sendgrid.com/v3/mail/send',
    'authorization',
    'Bearer private-secret',
    {
      from: transport('sendgrid').from,
      personalizations: [{ to: [{ email: message.to }] }],
      subject: message.subject,
      content: [{ type: 'text/plain', value: message.text }],
    },
  ],
  [
    'mailgun',
    'https://api.mailgun.net/v3/mail.example.com/messages',
    'authorization',
    `Basic ${Buffer.from('api:private-secret').toString('base64')}`,
    { from, to: message.to, subject: message.subject, text: message.text },
  ],
  [
    'ses',
    'https://email.us-east-1.amazonaws.com/v2/email/outbound-emails',
    'x-amz-date',
    '20260101T000000Z',
    {
      FromEmailAddress: from,
      Destination: { ToAddresses: [message.to] },
      Content: {
        Simple: {
          Subject: { Data: message.subject, Charset: 'UTF-8' },
          Body: { Text: { Data: message.text, Charset: 'UTF-8' } },
        },
      },
    },
  ],
  [
    'postmark',
    'https://api.postmarkapp.com/email',
    'X-Postmark-Server-Token',
    'private-secret',
    {
      From: from,
      To: message.to,
      Subject: message.subject,
      TextBody: message.text,
    },
  ],
  [
    'resend',
    'https://api.resend.com/emails',
    'authorization',
    'Bearer private-secret',
    { from, to: [message.to], subject: message.subject, text: message.text },
  ],
  [
    'brevo',
    'https://api.brevo.com/v3/smtp/email',
    'api-key',
    'private-secret',
    {
      sender: transport('brevo').from,
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
    },
  ],
  [
    'sparkpost',
    'https://api.sparkpost.com/api/v1/transmissions',
    'authorization',
    'private-secret',
    {
      recipients: [{ address: message.to }],
      content: {
        from: transport('sparkpost').from,
        subject: message.subject,
        text: message.text,
      },
    },
  ],
  [
    'mailjet',
    'https://api.mailjet.com/v3.1/send',
    'authorization',
    `Basic ${Buffer.from('public-key:private-secret').toString('base64')}`,
    {
      Messages: [
        {
          From: { Email: 'site@example.com', Name: 'Site' },
          To: [{ Email: message.to }],
          Subject: message.subject,
          TextPart: message.text,
        },
      ],
    },
  ],
  [
    'mailersend',
    'https://api.mailersend.com/v1/email',
    'authorization',
    'Bearer private-secret',
    {
      from: transport('mailersend').from,
      to: [{ email: message.to }],
      subject: message.subject,
      text: message.text,
    },
  ],
  [
    'custom',
    'https://custom.example.com/send',
    'X-Token',
    'private-secret',
    { ...message, name: 'Site', email: 'site@example.com' },
  ],
];
describe('HTTP mail', () => {
  for (const [provider, endpoint, header, auth, expected] of cases)
    test(provider, async () => {
      let calls = 0;
      await createHttpMailer(
        async (url, init) => {
          calls++;
          expect(url).toBe(endpoint);
          expect(init.method).toBe('POST');
          expect(init.redirect).toBe('error');
          expect(init.signal).toBeInstanceOf(AbortSignal);
          const headers = new Headers(init.headers);
          expect(headers.get(header)).toBe(auth);
          const body = String(init.body);
          expect(
            provider === 'mailgun'
              ? Object.fromEntries(init.body as FormData)
              : JSON.parse(body),
          ).toEqual(expected);
          expect(headers.get('content-type')).toBe(
            provider === 'mailgun' ? null : 'application/json',
          );
          if (provider === 'ses')
            expect(headers.get('authorization')).toContain(
              '20260101/us-east-1/ses/aws4_request',
            );
          return new Response(null, { status: 202 });
        },
        () => new Date('2026-01-01T00:00:00Z'),
      ).send(transport(provider), message);
      expect(calls).toBe(1);
    });
  for (const provider of ['sendgrid', 'mailgun', 'sparkpost'] as const)
    test(`${provider} EU`, async () => {
      await createHttpMailer(async (url) => {
        expect(new URL(url).hostname).toBe(
          `api.eu.${provider}.${provider === 'mailgun' ? 'net' : 'com'}`,
        );
        return new Response(null, { status: 204 });
      }).send({ ...transport(provider), region: 'eu' }, message);
    });
  test('custom escapes values once and supports no auth header', async () => {
    const escaped = {
      ...message,
      subject: '"quoted"\nsubject',
      text: 'line\n{{subject}}\\end',
    };
    await createHttpMailer(async (_url, init) => {
      expect(JSON.parse(String(init.body))).toEqual({
        ...escaped,
        name: 'Site',
        email: 'site@example.com',
      });
      expect(new Headers(init.headers).has('X-Token')).toBe(false);
      return new Response(null, { status: 200 });
    }).send({ ...transport('custom'), authHeader: '' }, escaped);
  });
  test('invalid custom JSON fails permanently before fetch', async () => {
    await expect(
      createHttpMailer(async () => {
        throw new Error('must not fetch');
      }).send({ ...transport('custom'), bodyTemplate: '{' }, message),
    ).rejects.toBeInstanceOf(PermanentJobError);
  });
  for (const status of [400, 401, 403, 408, 422, 429, 500, 503])
    test(`HTTP ${status} classification and redaction`, async () => {
      try {
        await createHttpMailer(
          async () =>
            new Response(`private-secret ${'x'.repeat(1000)}`, { status }),
        ).send(transport('resend'), message);
        throw new Error('expected rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error instanceof PermanentJobError).toBe(
          status < 500 && ![401, 403, 408, 429].includes(status),
        );
        expect((error as Error).message).toContain(`HTTP ${status}:`);
        expect((error as Error).message).not.toContain('private-secret');
        expect(
          (error as Error).message.split(': ')[1]!.length,
        ).toBeLessThanOrEqual(500);
      }
    });
  test('network errors are retryable and do not echo credentials', async () => {
    await expect(
      createHttpMailer(async () => {
        throw new Error('private-secret');
      }).send(transport('resend'), message),
    ).rejects.toThrow('Email API request failed or timed out');
  });
});

test('Basic auth response echoes are redacted even without their scheme', async () => {
  const token = Buffer.from('public-key:private-secret').toString('base64');
  try {
    await createHttpMailer(
      async () => new Response(token, { status: 401 }),
    ).send(transport('mailjet'), message);
    throw new Error('expected rejection');
  } catch (error) {
    expect(error).not.toBeInstanceOf(PermanentJobError);
    expect((error as Error).message).not.toContain(token);
  }
});

test('SigV4 matches AWS published GET Object vector', () => {
  // https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sig-v4-header-based-auth.html
  const headers = signAws({
    url: 'https://examplebucket.s3.amazonaws.com/test.txt',
    method: 'GET',
    body: '',
    headers: { range: 'bytes=0-9' },
    region: 'us-east-1',
    service: 's3',
    keyId: 'AKIAIOSFODNN7EXAMPLE',
    secret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    date: new Date('2013-05-24T00:00:00Z'),
  });
  expect(headers.authorization).toBe(
    'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
  );
});

test('all credential representations are redacted before the excerpt is clipped', async () => {
  const secret = 'private"key\\:/+é';
  const token = Buffer.from(`public-key:${secret}`).toString('base64');
  const forms = [
    secret,
    JSON.stringify(secret).slice(1, -1),
    encodeURIComponent(secret),
    Buffer.from(secret).toString('base64'),
    token,
    `Basic ${token}`,
  ];
  const excerpt = `${forms.join('|')}|${'x'.repeat(700)}`;
  const expected =
    `${forms.map(() => '[redacted]').join('|')}|${'x'.repeat(700)}`.slice(
      0,
      500,
    );
  await expect(
    createHttpMailer(async () => new Response(excerpt, { status: 503 })).send(
      { ...transport('mailjet'), secret },
      message,
    ),
  ).rejects.toEqual(
    new Error(`Email API returned HTTP 503: ${expected}`, { cause: 503 }),
  );
  expect(expected).toHaveLength(500);
});

test('a credential crossing the excerpt boundary is redacted in full before truncation', async () => {
  const secret = 'credential-that-crosses-the-five-hundred-character-boundary';
  const prefix = 'x'.repeat(490);
  await expect(
    createHttpMailer(
      async () => new Response(`${prefix}${secret} trailing`, { status: 503 }),
    ).send({ ...transport('resend'), secret }, message),
  ).rejects.toEqual(
    new Error(`Email API returned HTTP 503: ${prefix}[redacted]`, {
      cause: 503,
    }),
  );
});
