import { expect, test } from 'bun:test';
import { DEFAULT_EMAIL_SETTINGS, DEFAULT_SECURITY_SETTINGS } from '@cms/sdk';
import { SearchService } from '#api/domain/search/search-service';
import { SecuritySettingsService } from '#api/domain/security/security-settings';
import { EmailService } from '#api/domain/email/email-service';
import { StorageSettings } from '#api/domain/media/storage-settings';
import { SsoSettingsService } from '#api/domain/auth/sso-settings';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { SealedJobs } from '#api/domain/jobs/sealed-jobs';
import { MemoryJobQueue } from '#test/support/memory-jobs';
import {
  MemorySettings,
  fixedClock,
  profile,
  recordingLogger,
} from '#test/support/memory';
import { plainSecretBox } from '#test/support/memory-security';
import {
  createMemoryAuthStore,
  MemorySsoAccessTransactions,
} from '#test/support/sso-memory';

const attempts = {
  search: [
    ['host', 'https://evil.example'],
    ['host', 'http://search.example'],
    ['host', 'https://search.example:444'],
  ],
  security: [['captcha.provider', 'hcaptcha']],
  email: [
    ['transport', 'http'],
    ['smtp.host', 'evil.example'],
    ['smtp.port', 2525],
    ['smtp.security', 'none'],
    ['http.url', 'https://evil.example/mail'],
    ['http.provider', 'sendgrid'],
    ['http.region', 'eu'],
  ],
  storage: [
    ['driver', 'local'],
    ['s3.endpoint', 'https://evil.example'],
    ['s3.bucket', 'other'],
    ['s3.region', 'other'],
    ['s3.accessKeyId', 'other'],
  ],
  sso: [
    ['providers.0.issuer', 'https://evil.example'],
    ['providers.0.clientId', 'other'],
    ['providers.0.id', 'other'],
  ],
} satisfies Record<string, [string, string | number][]>;

for (const section of [
  'search',
  'security',
  'email',
  'storage',
  'sso',
] as const) {
  test(`${section} rejects credential destination changes and logs each rejected result`, async () => {
    const settings = new MemorySettings();
    const { logger, lines } = recordingLogger();
    const hooks = new HookBus({ timeoutMs: 100, logger });
    let save: () => Promise<unknown>;

    if (section === 'search') {
      const service = new SearchService({
        settings,
        hooks,
        logger,
        clock: fixedClock(),
        secrets: plainSecretBox,
        engine: {} as never,
        source: {} as never,
      });

      save = () =>
        service.update({
          enabled: false,
          host: 'https://search.example',
          apiKey: 'private',
        });
    } else if (section === 'security') {
      const service = new SecuritySettingsService(
        settings,
        plainSecretBox,
        hooks,
      );

      save = () =>
        service.update({
          ...DEFAULT_SECURITY_SETTINGS,
          captcha: {
            ...DEFAULT_SECURITY_SETTINGS.captcha,
            provider: 'turnstile',
            secretKey: 'private',
          },
        });
    } else if (section === 'email') {
      const service = new EmailService({
        settings,
        hooks,
        secrets: plainSecretBox,
        sealedJobs: new SealedJobs(new MemoryJobQueue(), plainSecretBox),
        mailer: { send: async () => {} },
      });

      save = () =>
        service.update({
          ...DEFAULT_EMAIL_SETTINGS,
          smtp: {
            ...DEFAULT_EMAIL_SETTINGS.smtp,
            host: 'smtp.example',
            security: 'tls',
            password: 'private',
          },
          http: {
            ...DEFAULT_EMAIL_SETTINGS.http,
            provider: 'custom',
            url: 'https://mail.example/send',
            secret: 'private',
          },
        });
    } else if (section === 'storage') {
      const service = new StorageSettings({
        settings,
        hooks,
        transactions: settings,
        secrets: plainSecretBox,
        test: async () => {},
      });

      save = () =>
        service.update({
          driver: 's3',
          s3: {
            endpoint: 'https://storage.example',
            bucket: 'media',
            region: 'original',
            accessKeyId: 'key',
            secretAccessKey: 'private',
          },
        });
    } else {
      const { identities } = createMemoryAuthStore();
      const service = new SsoSettingsService({
        settings,
        hooks,
        secrets: plainSecretBox,
        access: new MemorySsoAccessTransactions({ settings, identities }),
        siteUrl: async () => 'https://site.example',
        otherMethod: async () => true,
        environment: null,
        connect: () => {
          throw new Error('Unexpected discovery');
        },
      });

      save = () =>
        service.update(
          {
            providers: [
              {
                id: 'example',
                issuer: 'https://issuer.example',
                clientId: 'client',
                clientSecret: 'private',
              },
            ],
          },
          profile({ id: 'admin' }),
        );
    }

    await save();
    const key = section === 'storage' ? 'media.storage' : section;
    const original = await settings.get(key);

    for (const [path, replacement] of attempts[section]) {
      const release = hooks
        .registrar('functions:site', { trusted: true })
        .filter('settings.beforeSave', (payload) => {
          const segments = path.split('.');
          let target = payload.settings as unknown as Record<string, unknown>;

          for (const segment of segments.slice(0, -1))
            target = target[segment] as Record<string, unknown>;
          target[segments.at(-1)!] = replacement;

          return payload;
        });
      const warnings = lines.length;

      await save();
      release();
      expect(await settings.get(key)).toEqual(original);
      expect(
        lines
          .slice(warnings)
          .some(
            (line) =>
              line.startsWith('warn ') && line.includes('settings.beforeSave'),
          ),
      ).toBe(true);
    }
  });
}
