import { expect, test } from 'bun:test';
import { DEFAULT_EMAIL_SETTINGS } from '@cms/sdk';
import { templates, translateEmail } from '#api/domain/email/templates';
import { EmailService } from '#api/domain/email/email-service';
import type { EmailMessage } from '#api/domain/email/ports';
import type { SealedJobs } from '#api/domain/jobs/sealed-jobs';
import { Translations } from '#api/domain/i18n/translations';
import { I18nService } from '#api/domain/i18n/service';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { MemorySettings, recordingLogger } from '#test/support/memory';
import { aesSecretBox } from '#api/infra/secret-box';

const link = 'https://site.example/reset?token=SECRET';
const system = {
  kind: 'reset',
  actionUrl: link,
  context: {
    user: { id: 'recipient', name: 'Reader', email: 'reader@example.com' },
    site: { title: 'Site', url: 'https://site.example', locale: 'en' },
  },
};
const message = () => ({
  to: 'reader@example.com',
  system,
  ...templates('en').reset('Site', link, true),
});
const fixture = () => {
  const translations = new Translations();
  const hooks = new HookBus({
    timeoutMs: 100,
    logger: recordingLogger().logger,
  });

  return { translations, hooks, i18n: new I18nService(translations, hooks) };
};

test('active translations preserve later notification filter edits', async () => {
  const { translations, hooks, i18n } = fixture();
  const input = {
    to: 'reader@example.com',
    ...templates('en').commentApproved(
      'Site',
      'Post',
      { authorName: 'Writer', authorEmail: '', body: 'Comment' },
      link,
    ),
  };

  hooks.registrar('notification').filter('comment.notification', (value) => ({
    ...value,
    subject: 'Notification subject',
    text: 'Notification text',
  }));
  const output = await hooks.applyFilter(
    'comment.notification',
    { to: input.to, subject: input.subject, text: input.text },
    () => true,
  );
  const filtered = { ...input, ...output };
  const release = translations.register('en', {
    site: { commentCount: '{count} replies' },
  });

  expect(await translateEmail(filtered, i18n)).toMatchObject(output);
  release();
  translations.register('en', { email: { 'test.text': '{site} mail' } });
  expect(await translateEmail(filtered, i18n)).toMatchObject(output);
  hooks.registrar('locale').filter('i18n.locale', (value) => ({
    ...value,
    locale: 'ko',
  }));
  expect(await translateEmail(filtered, i18n)).toMatchObject(output);
});

test('queued system mail uses recipient locale and plain translation before protected filters', async () => {
  const { translations, hooks, i18n } = fixture();
  const queued: EmailMessage[] = [];
  const email = new EmailService({
    i18n,
    hooks,
    settings: new MemorySettings(),
    secrets: aesSecretBox('i18n-email'),
    sealedJobs: {
      enqueue: async (_kind: string, value: EmailMessage) => {
        queued.push(value);
      },
    } as unknown as SealedJobs,
    mailer: { send: async () => {} },
  });

  await email.update({
    ...DEFAULT_EMAIL_SETTINGS,
    enabled: true,
    fromEmail: 'site@example.com',
    smtp: { ...DEFAULT_EMAIL_SETTINGS.smtp, host: 'smtp.example.com' },
  });
  translations.register('ko', {
    email: { 'reset.text': '{site} 로그인 설정 ({claim}):\n{link}\n\n안내' },
  });
  hooks.registrar('locale').filter('i18n.locale', (value) => {
    expect(value).toEqual({
      locale: 'en',
      scope: 'email',
      userId: 'recipient',
    });

    return { ...value, locale: 'ko' };
  });
  hooks.registrar('system').filter('email.system', (value) => {
    expect(value.text).toContain('로그인 설정');
    expect(value.text).not.toContain('SECRET');

    return value;
  });
  await email.queue(message());
  expect(queued[0]?.text).toBe(`Site 로그인 설정 (true):\n${link}\n\n안내`);
  expect(queued[0]?.subject).toBe('[Site] 로그인 방법 설정');
});

test('email overrides reject mismatched placeholders and protect action line placement', async () => {
  const { translations, i18n } = fixture();
  const core = message();

  expect(() =>
    translations.register('en', { email: { 'reset.text': '{site}' } }),
  ).toThrow();

  for (const text of [
    '{site} {claim}\n{link}\n{link}',
    '{link}\n{site} {claim}',
    '{site} {claim}\nhttps://evil.example/?next={link}',
  ]) {
    const release = translations.register('en', {
      email: { 'reset.text': text },
    });
    const result = await translateEmail(message(), i18n);

    expect(result.subject).toBe(core.subject);
    expect(result.text).toBe(core.text);
    release();
  }
});
