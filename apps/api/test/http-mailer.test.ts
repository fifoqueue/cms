import { expect, test } from 'bun:test';
import { DEFAULT_EMAIL_SETTINGS } from '@cms/sdk';
import { createHttpMailer } from '#api/infra/http-mailer';
import type { MailTransport } from '#api/domain/email/ports';
import { hookFetch } from '#api/shared/http-hooks';
import { HookBus } from '#api/plugin-runtime/hook-bus';

test('HTTP mail preserves plain and HTML alternatives and custom template fields', async () => {
  const bodies: unknown[] = [];
  const mailer = createHttpMailer(async (_url, init) => {
    bodies.push(JSON.parse(String(init.body)));

    return new Response(null, { status: 202 });
  });
  const transport: Extract<MailTransport, { kind: 'http' }> = {
    ...DEFAULT_EMAIL_SETTINGS.http,
    kind: 'http',
    provider: 'sendgrid',
    secret: 'secret',
    from: { name: 'Site', email: 'site@example.com' },
  };
  const message = {
    to: 'reader@example.com',
    subject: 'Notice',
    text: 'Plain',
    html: '<p>Rich</p>',
    replyTo: 'support@example.com',
    headers: { Importance: 'high' },
  };

  await mailer.send(transport, message);
  expect(bodies[0]).toMatchObject({
    content: [
      { type: 'text/plain', value: 'Plain' },
      { type: 'text/html', value: '<p>Rich</p>' },
    ],
    reply_to: { email: 'support@example.com' },
    headers: { Importance: 'high' },
  });
  await mailer.send(
    {
      ...transport,
      provider: 'custom',
      url: 'https://mail.example/send',
      bodyTemplate:
        '{"text":{{text}},"html":{{html}},"replyTo":{{replyTo}},"headers":{{headers}}}',
    },
    message,
  );
  expect(bodies[1]).toEqual({
    text: 'Plain',
    html: '<p>Rich</p>',
    replyTo: 'support@example.com',
    headers: { Importance: 'high' },
  });
});

test('SES signed requests retain all headers and signed request data through filters', async () => {
  const hooks = new HookBus({
    timeoutMs: 100,
    logger: { info() {}, warn() {}, error() {} },
  });
  let signed: { url: string; init: RequestInit; headers: [string, string][] };
  const fetch = hookFetch(hooks, 'email-api', async (url, init) => {
    expect(url).toBe(signed.url);
    expect(init?.method).toBe(signed.init.method);
    expect(init?.body).toBe(signed.init.body);
    expect([...new Headers(init?.headers)]).toEqual(signed.headers);

    return new Response(null, { status: 200 });
  });
  const mailer = createHttpMailer(async (url, init) => {
    signed = { url, init, headers: [...new Headers(init.headers)] };
    expect(new Headers(init.headers).get('authorization')).toContain(
      'SignedHeaders=accept;content-type;host;x-amz-content-sha256;x-amz-date',
    );

    return fetch(url, init);
  });

  hooks.registrar('edit').filter('http.request', (value) => ({
    ...value,
    headers: { ...value.headers, accept: 'text/plain' },
  }));
  hooks
    .registrar('functions:site', { trusted: true })
    .filter('http.request', (value) => {
      value.headers['content-type'] = 'text/plain';

      return value;
    });
  await mailer.send(
    {
      ...DEFAULT_EMAIL_SETTINGS.http,
      kind: 'http',
      provider: 'ses',
      region: 'us-east-1',
      keyId: 'access-key',
      secret: 'secret',
      from: { name: 'Site', email: 'site@example.com' },
    },
    { to: 'reader@example.com', subject: 'Notice', text: 'Body' },
  );
});
