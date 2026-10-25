import { expect, test } from 'bun:test';
import { DEFAULT_SECURITY_SETTINGS, pluginManifestSchema } from '@cms/sdk';
import { privacyErasureReportSchema } from '@cms/sdk';
import { EraserRegistry } from '#api/domain/privacy/eraser-registry';
import { CaptchaRegistry } from '#api/domain/security/captcha-registry';
import { SecuritySettingsService } from '#api/domain/security/security-settings';
import { MemorySettings, recordingLogger } from '#test/support/memory';
import { plainSecretBox } from '#test/support/memory-security';

test('reserved plugin id is rejected with a clear manifest issue', () => {
  const parsed = pluginManifestSchema.safeParse({
    id: 'core',
    name: 'Core',
    version: '1.0.0',
  });
  expect(parsed.success).toBe(false);
  if (!parsed.success)
    expect(parsed.error.issues).toContainEqual(
      expect.objectContaining({
        path: ['id'],
        message: 'The plugin id "core" is reserved for the CMS',
      }),
    );
});

test('core-prefixed erasers remain isolated and bounded messages survive reports', async () => {
  const registry = new EraserRegistry({
    timeoutMs: 5,
    logger: recordingLogger().logger,
  });
  registry.registerCore('subject', {
    erase: async () => ({ erased: 1, retained: 0 }),
  });
  registry.register('core', 'hostile', { erase: () => new Promise(() => {}) });
  registry.register('records', 'retention', {
    erase: async () => ({
      erased: 2,
      retained: 1,
      messages: ['Retained for accounting'],
    }),
  });
  registry.register('records', 'oversized', {
    erase: async () => ({
      erased: 0,
      retained: 0,
      messages: ['x'.repeat(501)],
    }),
  });
  registry.register('records', 'too-many', {
    erase: async () => ({
      erased: 0,
      retained: 0,
      messages: Array(21).fill('message'),
    }),
  });
  const result = await registry.erase({
    id: 'r',
    email: 'subject@example.com',
    action: 'erase',
    status: 'confirmed',
    createdAt: '',
    expiresAt: '',
    confirmedAt: '',
    completedAt: null,
  });
  expect(result.failed).toEqual([
    'core:hostile',
    'records:oversized',
    'records:too-many',
  ]);
  expect(
    privacyErasureReportSchema.parse(result).results['records:retention']
      ?.messages,
  ).toEqual(['Retained for accounting']);
});

test('core captcha has its own deadline rather than the plugin deadline', async () => {
  const registry = new CaptchaRegistry({
    timeoutMs: 1,
    logger: recordingLogger().logger,
  });
  registry.registerCore('turnstile', {
    label: 'Core',
    verify: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return true;
    },
  });
  expect(
    await registry.verify({
      provider: 'turnstile',
      secret: 's',
      token: 't',
      address: null,
      minimumScore: 0.5,
    }),
  ).toBe(true);
});

test('provider changes cannot reuse secrets and unknown providers cannot be saved', async () => {
  const service = new SecuritySettingsService(
    new MemorySettings(),
    plainSecretBox,
    undefined,
    () => [
      { id: 'turnstile', label: 'Turnstile' },
      { id: 'plugin:example:challenge', label: 'Custom' },
    ],
  );
  const captcha = {
    ...DEFAULT_SECURITY_SETTINGS.captcha,
    provider: 'turnstile',
    secretKey: 'old-secret',
  };
  await service.update({ ...DEFAULT_SECURITY_SETTINGS, captcha });
  await service.update({
    ...DEFAULT_SECURITY_SETTINGS,
    captcha: { ...captcha, secretKey: undefined },
  });
  expect((await service.policy()).captcha.secretKey).toBe('old-secret');
  await service.update({
    ...DEFAULT_SECURITY_SETTINGS,
    captcha: {
      ...captcha,
      provider: 'plugin:example:challenge',
      secretKey: undefined,
    },
  });
  expect((await service.policy()).captcha.secretKey).toBeNull();
  await service.update({
    ...DEFAULT_SECURITY_SETTINGS,
    captcha: {
      ...captcha,
      provider: 'plugin:example:challenge',
      secretKey: 'new-secret',
    },
  });
  expect((await service.policy()).captcha.secretKey).toBe('new-secret');
  await expect(
    service.update({
      ...DEFAULT_SECURITY_SETTINGS,
      captcha: { ...captcha, provider: 'plugin:missing:challenge' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});
