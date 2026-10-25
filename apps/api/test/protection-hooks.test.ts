import { expect, test } from 'bun:test';
import { DEFAULT_SECURITY_SETTINGS } from '@cms/sdk';
import type { ActionHookMap } from '@cms/sdk/plugin';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { ProtectionService } from '#api/domain/security/protection-service';
import { SecuritySettingsService } from '#api/domain/security/security-settings';
import {
  fixedClock,
  MemorySettings,
  recordingLogger,
} from '#test/support/memory';
import {
  MemoryRateLimitStore,
  plainSecretBox,
} from '#test/support/memory-security';

test('protection emits each blocked outcome with keyed digests only', async () => {
  const hooks = new HookBus({
    timeoutMs: 100,
    logger: recordingLogger().logger,
  });
  const events: ActionHookMap['protection.blocked'][] = [];
  hooks.registrar('test').on('protection.blocked', (value) => {
    events.push(value);
  });
  const settings = new SecuritySettingsService(
    new MemorySettings(),
    plainSecretBox,
  );
  const signed: string[] = [];
  const service = new ProtectionService({
    hooks,
    settings,
    clock: fixedClock(),
    store: new MemoryRateLimitStore(),
    signer: {
      sign: (value) => {
        signed.push(value);
        return `digest-${signed.length}`;
      },
      verify: () => false,
    },
    captcha: { verify: async () => false },
  });
  const attempt = {
    action: 'login' as const,
    client: null,
    address: '203.0.113.1',
    account: 'subject@example.com',
    captchaToken: null,
  };
  await settings.update({
    ...DEFAULT_SECURITY_SETTINGS,
    rules: {
      ...DEFAULT_SECURITY_SETTINGS.rules,
      loginAccount: { ...DEFAULT_SECURITY_SETTINGS.rules.loginAccount, max: 1 },
    },
  });
  await service.check(attempt);
  expect(events).toEqual([]);
  await expect(service.check(attempt)).rejects.toMatchObject({
    code: 'rate_limited',
  });
  await settings.update({
    ...DEFAULT_SECURITY_SETTINGS,
    captcha: {
      ...DEFAULT_SECURITY_SETTINGS.captcha,
      provider: 'turnstile',
      siteKey: 'site',
      secretKey: 'secret',
      modes: { ...DEFAULT_SECURITY_SETTINGS.captcha.modes, login: 'always' },
    },
  });
  await expect(service.check(attempt)).rejects.toMatchObject({
    code: 'captcha_required',
  });
  await expect(
    service.check({ ...attempt, captchaToken: 'private-token' }),
  ).rejects.toMatchObject({ code: 'captcha_required' });
  expect(events.map((event) => event.reason)).toEqual([
    'rate_limited',
    'captcha_required',
    'captcha_invalid',
  ]);
  expect(events[0]).toEqual({
    action: 'login',
    reason: 'rate_limited',
    accountDigest: 'digest-1',
    addressDigest: 'digest-2',
  });
  expect(signed.slice(0, 2)).toEqual([
    'protection:account:subject@example.com',
    'protection:address:203.0.113.1',
  ]);
  expect(JSON.stringify(events)).not.toContain('subject@example.com');
  expect(JSON.stringify(events)).not.toContain('203.0.113.1');
  expect(JSON.stringify(events)).not.toContain('private-token');
});
