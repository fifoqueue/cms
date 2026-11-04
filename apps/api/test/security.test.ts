import { describe, expect, test } from 'bun:test';
import { DEFAULT_SECURITY_SETTINGS } from '@cms/sdk';
import { ApiTokenService } from '#api/domain/auth/api-tokens';
import type {
  ApiTokenRecord,
  ApiTokenRepository,
} from '#api/domain/auth/api-tokens';
import { SignInService } from '#api/domain/auth/sign-in-service';
import { createPasswordMethod } from '#api/domain/auth/password-method';
import { SignInRegistry } from '#api/plugin-runtime/sign-in-registry';
import { MemorySignInTransactions } from '#test/support/memory-sign-in';
import { toProfile } from '#api/domain/users/user-mapper';
import type { Clock } from '#api/domain/ports';
import type { SetupTokens } from '#api/domain/auth/setup-tokens';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { PasswordService } from '#api/domain/auth/password-service';
import { EmailService } from '#api/domain/email/email-service';
import { SealedJobs } from '#api/domain/jobs/sealed-jobs';
import { openJob } from '#api/domain/jobs/payload';
import { ProtectionService } from '#api/domain/security/protection-service';
import { SecuritySettingsService } from '#api/domain/security/security-settings';
import { aesSecretBox } from '#api/infra/secret-box';
import type { DomainError } from '#api/shared/errors';
import {
  MemorySettings,
  fixedClock,
  sequentialIds,
  userRecord,
  recordingLogger,
} from '#test/support/memory';
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

const signInFor = (
  users: MemoryUsers,
  clock: Clock,
  protection: Pick<ProtectionService, 'check'>,
  passwords: Pick<PasswordService, 'commitReset'>,
  setupTokens?: SetupTokens,
  hooks = new HookBus({ logger: recordingLogger().logger, timeoutMs: 100 }),
) => {
  const profiles = {
    findById: async (id: string) => {
      const user = await users.findById(id);

      return user ? toProfile(user) : null;
    },
    findByEmail: async (email: string) => {
      const user = await users.findByEmail(email);

      return user ? toProfile(user) : null;
    },
  };
  const registry = new SignInRegistry({
    logger: recordingLogger().logger,
    timeoutMs: 100,
  });

  registry.core(profiles).signInMethod(
    'password',
    createPasswordMethod({
      users,
      passwords,
      hasher: { hash: async (value) => value, verify: async (a, b) => a === b },
    }),
  );

  return new SignInService({
    registry,
    users: profiles,
    hooks,
    setupTokens,
    factorChanges: new MemorySettings(),
    settings: {
      effective: async () => ({
        methods: ['password'],
        secondFactors: [],
        requireSecondFactor: [],
      }),
    },
    transactions: new MemorySignInTransactions(),
    tokens,
    clock,
    limits: { total: 100, perClient: 100 },
    protection,
    siteUrl: async () => 'https://example.com',
    session: async (user) => ({
      user,
      token: 'session',
      expiresAt: new Date(clock.now().getTime() + 60_000).toISOString(),
    }),
  });
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
    new MemorySettings(),
    plainSecretBox,
  );
  const protection = new ProtectionService({
    settings,
    store: new MemoryRateLimitStore(),
    captcha: { verify: async () => true },
    clock,
  });
  const signIn = signInFor(users, clock, protection, {
    commitReset: async () => false,
  });
  const login = (
    password: string,
    captchaToken: string | null = null,
    client: string | null = 'ip:203.0.113.1',
  ) =>
    codeOf(
      signIn.start(
        'password',
        { values: { email: 'admin@example.com', password } },
        { client, address: null, captchaToken },
      ),
    );

  return { settings, login, clock };
};

const captcha = {
  provider: 'turnstile' as const,
  siteKey: 'site',
  secretKey: 'secret',
  minimumScore: 0.5,
  modes: DEFAULT_SECURITY_SETTINGS.captcha.modes,
};

describe('sign-in protection', () => {
  test('failed sign-ins lock the account until the block ends, without a captcha', async () => {
    const { login, clock } = await setup();
    const { max } = DEFAULT_SECURITY_SETTINGS.rules.loginAccount;

    for (let attempt = 0; attempt < max; attempt++)
      expect(await login('wrong')).toBe('unauthorized');
    // Even the right password is refused while blocked, so guessing gains nothing.
    expect(await login('right')).toBe('rate_limited');
    // Unproven clients remain subject to the per-account limit.
    expect(await login('right', null, null)).toBe('rate_limited');

    clock.set('2026-01-01T00:30:00.000Z');
    expect(await login('right')).toBe('ok');
  });

  test('the captcha secret is stored sealed and never returned', async () => {
    const { settings } = await setup();
    const admin = await settings.update({
      captcha,
      rules: DEFAULT_SECURITY_SETTINGS.rules,
    });

    expect(JSON.stringify(admin)).not.toContain('secret"');
    expect(admin.captcha.secretConfigured).toBe(true);
    const visitor = await settings.getPublic();
    expect(visitor).toMatchObject({ provider: 'turnstile', siteKey: 'site' });
    expect(JSON.stringify(visitor)).not.toContain('secret');
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
      createdAt: new Date('2026-01-01'),
      expiresAt: new Date('2030-01-01'),
    });
    const settings = new MemorySettings();
    const queue = new MemoryJobQueue();
    const sealedJobs = new SealedJobs(
      queue,
      aesSecretBox('test-email-job-secret'),
    );
    const sent: string[] = [];
    const secrets = aesSecretBox('test-email-job-secret');
    const email = new EmailService({
      settings,
      secrets,
      mailer: {
        send: async (_transport, message) => void sent.push(message.text),
      },
      sealedJobs,
    });
    await email.update({
      enabled: true,
      transport: 'smtp',
      http: {
        provider: 'sendgrid',
        region: '',
        domain: '',
        keyId: '',
        url: '',
        authHeader: '',
        bodyTemplate: '',
      },
      smtp: {
        host: 'smtp.example.com',
        port: 587,
        security: 'starttls',
        username: '',
      },
      fromName: 'Site',
      fromEmail: 'site@example.com',
    });
    const passwordTokens = new MemoryPasswordTokens();
    let apiTokensRevoked = false;
    let hashes = 0;
    let issued = '';
    let passwordLogin = true;
    const hooks = new HookBus({
      logger: recordingLogger().logger,
      timeoutMs: 100,
    });
    const events: { name: string; payload: unknown }[] = [];
    const registrar = hooks.registrar('password-policy');
    for (const name of [
      'user.passwordResetRequested',
      'user.passwordReset',
      'user.passwordChanged',
    ] as const)
      registrar.on(name, (payload) => {
        events.push({ name, payload });
      });
    const passwords = new PasswordService({
      hooks,
      passwordLogin: async () => passwordLogin,
      users,
      tokens: passwordTokens,
      credentials: new MemoryCredentials(
        users,
        sessions,
        passwordTokens,
        () => (apiTokensRevoked = true),
      ),
      issuer: {
        issue: () => (issued = 'reset-token-0123456789abcdef'),
        digest: (token) => `digest:${token}`,
      },
      hasher: {
        hash: async (value) => {
          hashes += 1;
          return `hash:${value}`;
        },
        verify: async () => true,
      },
      email,
      sealedJobs,
      protection: new ProtectionService({
        settings: new SecuritySettingsService(settings, plainSecretBox),
        store: new MemoryRateLimitStore(),
        captcha: { verify: async () => true },
        clock,
      }),
      limits: new MemoryRateLimitStore(),
      clock,
      site: async () => ({
        siteUrl: 'https://example.com',
        title: 'Site',
        locale: 'en',
      }),
    });
    const visitor = { client: null, address: null, captchaToken: null };

    await passwords.requestReset({ email: 'nobody@example.com' }, visitor);
    const unknown = [...queue.rows.values()].at(-1)!;
    expect(JSON.stringify(unknown.payload)).not.toContain('nobody@example.com');
    await passwords.deliverResetRequest(unknown.payload);
    await passwords.requestReset({ email: 'Admin@Example.com' }, visitor);
    const request = [...queue.rows.values()].at(-1)!;
    expect(JSON.stringify(request.payload)).not.toContain('admin@example.com');
    const deny = registrar.filter('user.passwordResetAllowed', (value) => ({
      ...value,
      allowed: false,
    }));
    const invalid = hooks
      .registrar('functions:site', { trusted: true })
      .filter('user.passwordResetAllowed', (value) => {
        value.user.id = 'another-user';
        value.allowed = true;
        return value;
      });
    const beforeDenied = queue.rows.size;
    await passwords.deliverResetRequest(request.payload);
    expect(queue.rows.size).toBe(beforeDenied);
    expect(passwordTokens.rows.size).toBe(0);
    const allow = registrar.filter('user.passwordResetAllowed', (value) => ({
      ...value,
      allowed: true,
    }));
    await passwords.deliverResetRequest(request.payload);
    const job = [...queue.rows.values()].at(-1)!;
    const token = passwordTokens.rows.get(`digest:${issued}`)!;
    expect(job.expiresAt).toEqual(token.expiresAt);
    expect(
      (
        openJob(job.payload, secrets) as {
          subjects: string[];
        }
      ).subjects,
    ).toEqual(['admin', 'admin@example.com']);
    expect(JSON.stringify(job.payload)).not.toContain(issued);
    expect(hashes).toBe(0);
    await email.deliver(job.payload);
    expect(sent[0]).toContain(issued);

    passwordLogin = false;
    await passwords.reset({ token: issued, password: 'new-password' });
    passwordLogin = true;
    expect(users.rows.get('admin')!.passwordHash).toBe('hash:new-password');
    expect(sessions.rows.size).toBe(0);
    expect(apiTokensRevoked).toBe(true);
    expect(
      await codeOf(
        passwords.reset({ token: issued, password: 'other-password' }),
      ),
    ).toBe('invalid_input');
    await passwords.change(
      { current: 'new-password', password: 'changed-password' },
      { id: 'admin', role: 'administrator' },
      'own-session',
    );
    expect(events.map((event) => event.name)).toEqual([
      'user.passwordResetRequested',
      'user.passwordResetRequested',
      'user.passwordReset',
      'user.passwordChanged',
    ]);
    for (const event of events) {
      expect(event.payload).toEqual({
        user: {
          id: 'admin',
          email: 'admin@example.com',
          name: users.rows.get('admin')!.name,
          role: 'administrator',
          slug: users.rows.get('admin')!.slug,
          bio: '',
          locale: '',
        },
      });
    }
    deny();
    allow();
    invalid();

    // Administrators send resets without captcha or visitor limits, but only so many an hour.
    expect(
      await codeOf(
        passwords.sendReset('admin', { id: 'editor', role: 'editor' }),
      ),
    ).toBe('forbidden');
    const queued = queue.rows.size;
    await passwords.sendReset('admin', { id: 'boss', role: 'administrator' });
    expect(queue.rows.size).toBe(queued + 1);
    const signIn = signInFor(
      users,
      clock,
      { check: async () => {} },
      passwords,
      {
        find: async (hash, now) => {
          const row = passwordTokens.rows.get(hash);

          return row && row.expiresAt > now ? row : null;
        },
        consume: async () => false,
      },
      hooks,
    );
    const refuse = registrar.filter('user.passwordResetAllowed', (value) => ({
      ...value,
      allowed: false,
    }));
    const beforeSetup = events.filter(
      (event) => event.name === 'user.passwordReset',
    ).length;
    const setupPassword = () =>
      signIn.setup(
        'password',
        { token: issued, values: { password: 'setup-password' } },
        visitor,
      );

    await expect(setupPassword()).rejects.toMatchObject({ code: 'forbidden' });
    expect(passwordTokens.rows.has(`digest:${issued}`)).toBe(true);
    expect(users.rows.get('admin')?.passwordHash).toBe('hash:changed-password');
    expect(
      events.filter((event) => event.name === 'user.passwordReset'),
    ).toHaveLength(beforeSetup);
    refuse();
    passwordLogin = false;
    const permit = registrar.filter('user.passwordResetAllowed', (value) => ({
      ...value,
      allowed: true,
    }));

    expect((await setupPassword()).kind).toBe('session');
    expect(users.rows.get('admin')?.passwordHash).toBe('hash:setup-password');
    expect(
      events.filter((event) => event.name === 'user.passwordReset'),
    ).toHaveLength(beforeSetup + 1);
    await expect(setupPassword()).rejects.toMatchObject({
      code: 'unauthorized',
    });
    permit();
    passwordLogin = true;
    for (let sent = 1; sent < 20; sent++)
      await passwords.sendReset('admin', { id: 'boss', role: 'administrator' });
    expect(
      await codeOf(
        passwords.sendReset('admin', { id: 'boss', role: 'administrator' }),
      ),
    ).toBe('rate_limited');
    passwordLogin = false;
    await expect(
      passwords.requestReset({ email: 'admin@example.com' }, visitor),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      passwords.reset({ token: issued, password: 'new-password' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});
