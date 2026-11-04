import { expect, test } from 'bun:test';
import { DEFAULT_EMAIL_SETTINGS, DEFAULT_SECURITY_SETTINGS } from '@cms/sdk';
import type { SettingsSection } from '@cms/sdk/plugin';
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

for (const section of [
  'search',
  'security',
  'email',
  'storage',
  'sso',
] as const) {
  test(`${section} filters preserve credentials and announce only committed redacted settings`, async () => {
    const settings = new MemorySettings();
    const logger = recordingLogger().logger;
    const hooks = new HookBus({ timeoutMs: 100, logger });
    const seen: SettingsSection[] = [];
    const announced: SettingsSection[] = [];
    const committed: unknown[] = [];
    const key = section === 'storage' ? 'media.storage' : section;
    const registrar = hooks.registrar('functions:site', { trusted: true });

    registrar.filter('settings.beforeSave', (payload) => {
      seen.push(structuredClone(payload));

      if (payload.section === 'search')
        return {
          ...payload,
          settings: {
            ...payload.settings,
            indexPrefix: 'filtered',
            apiKey: 'injected',
          },
        } as SettingsSection;
      if (payload.section === 'security')
        return {
          ...payload,
          settings: {
            ...payload.settings,
            captcha: {
              ...payload.settings.captcha,
              siteKey: 'filtered',
              secretKey: 'injected',
            },
          },
        } as SettingsSection;
      if (payload.section === 'email')
        return {
          ...payload,
          settings: {
            ...payload.settings,
            fromName: 'filtered',
            smtp: { ...payload.settings.smtp, password: 'injected' },
            http: { ...payload.settings.http, secret: 'injected' },
          },
        } as SettingsSection;
      if (payload.section === 'storage')
        return {
          ...payload,
          settings: {
            ...payload.settings,
            s3: {
              ...payload.settings.s3!,
              forcePathStyle: false,
              secretAccessKey: 'injected',
            },
          },
        } as SettingsSection;
      if (payload.section === 'sso')
        return {
          ...payload,
          settings: {
            providers: payload.settings.providers.map((provider) => ({
              ...provider,
              name: 'filtered',
              clientSecret: 'injected',
            })),
          },
        };

      return payload;
    });
    registrar.on('settings.updated', (payload) => {
      announced.push(structuredClone(payload));
      committed.push(structuredClone(settings.values.get(key)));
    });

    if (section === 'search') {
      const service = new SearchService({
        settings,
        hooks,
        secrets: plainSecretBox,
        logger,
        clock: fixedClock(),
        engine: {} as never,
        source: {} as never,
      });

      await service.update({
        enabled: false,
        host: 'https://search.example',
        indexPrefix: 'original',
        apiKey: 'private-credential',
      });
      expect(await service.getAdmin()).toMatchObject({
        indexPrefix: 'filtered',
      });
    } else if (section === 'security') {
      const service = new SecuritySettingsService(
        settings,
        plainSecretBox,
        hooks,
      );

      await service.update({
        ...DEFAULT_SECURITY_SETTINGS,
        captcha: {
          ...DEFAULT_SECURITY_SETTINGS.captcha,
          provider: 'turnstile',
          siteKey: 'original',
          secretKey: 'private-credential',
        },
      });
      expect(await service.policy()).toMatchObject({
        captcha: { siteKey: 'filtered', secretKey: 'private-credential' },
      });
      expect(announced[0]).toMatchObject({
        settings: { captcha: { secretConfigured: true } },
      });
    } else if (section === 'email') {
      const service = new EmailService({
        settings,
        hooks,
        secrets: plainSecretBox,
        sealedJobs: new SealedJobs(new MemoryJobQueue(), plainSecretBox),
        mailer: { send: async () => {} },
      });

      await service.update({
        ...DEFAULT_EMAIL_SETTINGS,
        fromName: 'original',
        smtp: {
          ...DEFAULT_EMAIL_SETTINGS.smtp,
          password: 'private-credential',
        },
        http: { ...DEFAULT_EMAIL_SETTINGS.http, secret: 'private-credential' },
      });
      expect(await service.getAdmin()).toMatchObject({ fromName: 'filtered' });
      expect(announced[0]).toMatchObject({
        settings: {
          smtp: { passwordConfigured: true },
          http: { secretConfigured: true },
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

      await service.update({
        driver: 's3',
        s3: {
          endpoint: 'https://storage.example',
          region: 'original',
          bucket: 'media',
          accessKeyId: 'id',
          forcePathStyle: true,
          prefix: '',
          secretAccessKey: 'private-credential',
        },
      });
      expect((await service.configuration()).s3).toMatchObject({
        forcePathStyle: true,
        secretAccessKey: 'private-credential',
      });
    } else {
      const { identities } = createMemoryAuthStore();
      const service = new SsoSettingsService({
        settings,
        hooks,
        secrets: plainSecretBox,
        access: new MemorySsoAccessTransactions({ settings, identities }),
        otherMethod: async () => true,
        siteUrl: async () => 'https://site.example',
        environment: null,
        connect: () => {
          throw new Error('No discovery during save');
        },
      });

      await service.update(
        {
          providers: [
            {
              id: 'example',
              enabled: true,
              issuer: 'https://id.example',
              clientId: 'cms',
              name: 'original',
              clientSecret: 'private-credential',
            },
          ],
        },
        profile({ id: 'admin' }),
      );
      expect((await service.getAdmin()).providers[0]?.name).toBe('filtered');
    }

    expect(seen).toHaveLength(1);
    expect(announced).toHaveLength(1);
    expect(committed[0]).toEqual(settings.values.get(key));
    expect(JSON.stringify(committed)).toContain('private-credential');
    expect(JSON.stringify(committed)).not.toContain('injected');
    expect(JSON.stringify(seen)).not.toContain('private-credential');
    expect(JSON.stringify(announced)).not.toContain('private-credential');
    expect(JSON.stringify(announced)).not.toContain('injected');
  });
}
