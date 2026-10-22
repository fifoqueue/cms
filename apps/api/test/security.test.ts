import { describe, expect, test } from 'bun:test';
import { DEFAULT_SECURITY_SETTINGS } from '@cms/sdk';
import { ApiTokenService } from '#api/domain/auth/api-tokens';
import type {
  ApiTokenRecord,
  ApiTokenRepository,
} from '#api/domain/auth/api-tokens';
import { AuthService } from '#api/domain/auth/auth-service';
import { PasswordService } from '#api/domain/auth/password-service';
import { EmailService } from '#api/domain/email/email-service';
import { ProtectionService } from '#api/domain/security/protection-service';
import { SecuritySettingsService } from '#api/domain/security/security-settings';
import type { DomainError } from '#api/shared/errors';
import { fixedClock, sequentialIds, userRecord } from '#test/support/memory';
import { MemorySeoSettingsRepository } from '#test/support/memory-seo';
import { MemoryJobQueue } from '#test/support/memory-jobs';
import {
  MemoryPasswordTokens,
  MemoryCredentials,
  MemoryRateLimitStore,
  plainSecretBox,
} from '#test/support/memory-security';
import { MemorySessions, MemoryUsers } from '#test/support/sso-memory';

const codeOf = async (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (error: DomainError) => error.code,
  );

const tokens = {
  issue: (() => {
    let next = 0;
    return () => `token-${++next}-0123456789abcdef`;
  })(),
  digest: (token: string) => `digest:${token}`,
};

const setup = async () => {
  const clock = fixedClock();
  const users = new MemoryUsers();
  await users.insert(
    userRecord({
      id: 'admin',
      email: 'admin@example.com',
      passwordHash: 'right',
    }),
  );
  const settings = new SecuritySettingsService(
    new MemorySeoSettingsRepository(),
    plainSecretBox,
  );
  let solved = true;
  const protection = new ProtectionService({
    settings,
    store: new MemoryRateLimitStore(),
    captcha: { verify: async ({ token }) => solved && token === 'solved' },
    clock,
  });
  const auth = new AuthService({
    users,
    sessions: new MemorySessions(() => false, users),
    hasher: { hash: async (value) => value, verify: async (a, b) => a === b },
    tokens,
    ids: sequentialIds(),
    clock,
    sessionTtlMs: 60_000,
    protection,
  });
  const login = (
    password: string,
    captchaToken: string | null = null,
    client: string | null = 'ip:203.0.113.1',
  ) =>
    codeOf(
      auth.login(
        { email: 'admin@example.com', password },
        { client, address: null, captchaToken },
      ),
    );
  return {
    settings,
    login,
    clock,
    setSolved: (value: boolean) => (solved = value),
  };
};

const captcha = {
  provider: 'turnstile' as const,
  siteKey: 'site',
  secretKey: 'secret',
  minimumScore: 0.5,
  modes: DEFAULT_SECURITY_SETTINGS.captcha.modes,
};

describe('sign-in protection', () => {
  test('parallel attempts reserve the limit before password work', async () => {
    const { login } = await setup();
    const results = await Promise.all(
      Array.from(
        { length: DEFAULT_SECURITY_SETTINGS.rules.loginAccount.max + 10 },
        () => login('wrong'),
      ),
    );

    expect(results.filter((code) => code === 'unauthorized')).toHaveLength(
      DEFAULT_SECURITY_SETTINGS.rules.loginAccount.max,
    );
    expect(results).toContain('rate_limited');
  });

  test('failed sign-ins lock the account until the block ends, without a captcha', async () => {
    const { login, clock } = await setup();
    const { max } = DEFAULT_SECURITY_SETTINGS.rules.loginAccount;

    for (let attempt = 0; attempt < max; attempt++)
      expect(await login('wrong')).toBe('unauthorized');
    // Even the right password is refused while blocked, so guessing gains nothing.
    expect(await login('right')).toBe('rate_limited');
    // Unproven clients skip per-client limits but still meet the per-account one.
    expect(await login('right', null, null)).toBe('rate_limited');

    clock.set('2026-01-01T00:30:00.000Z');
    expect(await login('right')).toBe('ok');
  });

  test('with a captcha, a limited account asks for it instead of blocking', async () => {
    const { settings, login, setSolved } = await setup();
    await settings.update({ captcha, rules: DEFAULT_SECURITY_SETTINGS.rules });
    const { max } = DEFAULT_SECURITY_SETTINGS.rules.loginAccount;

    for (let attempt = 0; attempt < max; attempt++) await login('wrong');
    expect(await login('right')).toBe('captcha_required');
    setSolved(false);
    expect(await login('right', 'solved')).toBe('captcha_required');
    setSolved(true);
    expect(await login('right', 'solved')).toBe('ok');
  });

  test('the captcha secret is stored sealed and never returned', async () => {
    const { settings } = await setup();
    const admin = await settings.update({
      captcha,
      rules: DEFAULT_SECURITY_SETTINGS.rules,
    });

    expect(JSON.stringify(admin)).not.toContain('secret"');
    expect(admin.captcha.secretConfigured).toBe(true);
    expect(await settings.getPublic()).toEqual({
      provider: 'turnstile',
      siteKey: 'site',
      always: [],
    });
  });
});

class MemoryApiTokens implements ApiTokenRepository {
  readonly rows = new Map<string, ApiTokenRecord & { tokenHash: string }>();
  constructor(private readonly users: MemoryUsers) {}
  async insert(token: ApiTokenRecord & { tokenHash: string }) {
    this.rows.set(token.id, token);
  }
  async list(userId: string) {
    return [...this.rows.values()].filter((row) => row.userId === userId);
  }
  async delete(id: string, userId: string) {
    return this.rows.get(id)?.userId === userId && this.rows.delete(id);
  }
  async authenticate(tokenHash: string, now: Date) {
    const row = [...this.rows.values()].find((r) => r.tokenHash === tokenHash);
    const user = row && this.users.rows.get(row.userId);
    if (!row || !user || (row.expiresAt && row.expiresAt <= now)) return null;
    return { id: row.id, user };
  }
}

describe('application passwords', () => {
  test('a token acts as its user until revoked or expired, and only its owner revokes it', async () => {
    const clock = fixedClock();
    const users = new MemoryUsers();
    await users.insert(userRecord({ id: 'admin' }));
    const service = new ApiTokenService({
      tokens: new MemoryApiTokens(users),
      issuer: tokens,
      ids: sequentialIds(),
      clock,
    });
    const owner = { id: 'admin', role: 'administrator' };

    const created = await service.create(
      { name: 'CI', expiresInDays: 1 },
      owner,
    );
    expect((await service.authenticate(created.token))?.id).toBe('admin');
    expect(await service.authenticate('token-1-0123456789abcdef')).toBeNull();
    expect(JSON.stringify(await service.list(owner))).not.toContain(
      created.token,
    );
    expect(
      await codeOf(
        service.revoke(created.id, { id: 'other', role: 'administrator' }),
      ),
    ).toBe('not_found');

    clock.set('2026-01-03T00:00:00.000Z');
    expect(await service.authenticate(created.token)).toBeNull();
  });
});

describe('password reset', () => {
  test('a reset link works once, signs out everywhere, and unknown addresses look the same', async () => {
    const clock = fixedClock();
    const users = new MemoryUsers();
    await users.insert(userRecord({ id: 'admin', email: 'admin@example.com' }));
    const sessions = new MemorySessions(() => false, users);
    await sessions.insert({
      tokenHash: 'old',
      userId: 'admin',
      identityId: null,
      expiresAt: new Date('2030-01-01'),
    });
    const settings = new MemorySeoSettingsRepository();
    const queue = new MemoryJobQueue();
    const email = new EmailService({
      settings,
      secrets: plainSecretBox,
      mailer: { send: async () => {} },
      jobs: queue,
    });
    await email.update({
      enabled: true,
      host: 'smtp.example.com',
      port: 587,
      security: 'starttls',
      username: '',
      fromName: 'Site',
      fromEmail: 'site@example.com',
    });
    const passwordTokens = new MemoryPasswordTokens();
    let apiTokensRevoked = false;
    const passwords = new PasswordService({
      users,
      tokens: passwordTokens,
      credentials: new MemoryCredentials(
        users,
        sessions,
        passwordTokens,
        () => (apiTokensRevoked = true),
      ),
      issuer: tokens,
      hasher: {
        hash: async (value) => `hash:${value}`,
        verify: async () => true,
      },
      email,
      protection: new ProtectionService({
        settings: new SecuritySettingsService(settings, plainSecretBox),
        store: new MemoryRateLimitStore(),
        captcha: { verify: async () => true },
        clock,
      }),
      clock,
      site: async () => ({
        siteUrl: 'https://example.com',
        title: 'Site',
        locale: 'en',
      }),
    });
    const visitor = { client: null, address: null, captchaToken: null };

    await passwords.requestReset({ email: 'nobody@example.com' }, visitor);
    expect(queue.rows.size).toBe(0);
    await passwords.requestReset({ email: 'Admin@Example.com' }, visitor);
    const [job] = [...queue.rows.values()];
    const token = /token=([^\s]+)/.exec(
      (job!.payload as { text: string }).text,
    )![1]!;

    await passwords.reset({ token, password: 'new-password' });
    expect(users.rows.get('admin')!.passwordHash).toBe('hash:new-password');
    expect(sessions.rows.size).toBe(0);
    expect(apiTokensRevoked).toBe(true);
    expect(
      await codeOf(passwords.reset({ token, password: 'other-password' })),
    ).toBe('invalid_input');
  });
});
