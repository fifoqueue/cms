import { describe, expect, test } from 'bun:test';
import { can } from '@cms/sdk';
import { AuthService } from '#api/domain/auth/auth-service';
import { RoleService } from '#api/domain/users/role-service';
import { UserService } from '#api/domain/users/user-service';
import type { UserServiceDeps } from '#api/domain/users/user-service';
import { SealedJobs } from '#api/domain/jobs/sealed-jobs';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { MemoryPublicCache } from '#api/infra/public-cache';
import { Errors, rateLimited } from '#api/shared/errors';
import type { DomainError } from '#api/shared/errors';
import {
  MemoryContentRepository,
  MemorySettings,
  fixedClock,
  recordingLogger,
  sequentialIds,
  userRecord,
} from '#test/support/memory';
import { MemoryUserDirectory } from '#test/support/memory-users';
import { MemoryJobQueue } from '#test/support/memory-jobs';
import { aesSecretBox } from '#api/infra/secret-box';
import {
  MemorySessions,
  MemoryUsers,
  plainHasher,
} from '#test/support/sso-memory';

const codeOf = async (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (error: DomainError) => error.code,
  );

const setup = async (overrides: Partial<UserServiceDeps> = {}) => {
  const users = new MemoryUsers();
  const content = new MemoryContentRepository();
  const jobs = new MemoryJobQueue();
  const settings = overrides.settings ?? new MemorySettings();
  const directory = new MemoryUserDirectory(users, content, settings);
  const service = new UserService({
    users,
    directory,
    settings,
    hasher: {
      hash: async (value) => `hash:${value}`,
      verify: async () => true,
    },
    tokens: { issue: () => 'token' },
    ids: sequentialIds(),
    clock: fixedClock(),
    sealedJobs: new SealedJobs(jobs, aesSecretBox('test-registration-key')),
    invitations: { available: async () => false, send: async () => {} },
    ...overrides,
  });
  await users.insert(userRecord({ id: 'admin' }));
  await users.insert(userRecord({ id: 'writer', role: 'author' }));
  return { content, directory, jobs, service, settings, users };
};

const admin = { id: 'admin', role: 'administrator' };

describe('user administration', () => {
  test('role definition writes cannot escalate self, other roles, or new roles', async () => {
    const { directory, settings } = await setup();
    const roles = new RoleService(settings, directory);
    const manager = {
      id: 'manager',
      role: 'manager',
      capabilities: ['users.manage'] as const,
    };

    for (const key of ['manager', 'other'])
      await roles.save(
        { key, name: key, capabilities: ['users.manage'] },
        admin,
      );

    for (const key of ['manager', 'other', 'new-role']) {
      await expect(
        roles.save(
          {
            key,
            name: key,
            capabilities: ['users.manage', 'settings.manage', 'plugins.manage'],
          },
          manager,
        ),
      ).rejects.toMatchObject({ code: 'forbidden' });
    }

    expect(await roles.capabilities('manager')).toEqual(['users.manage']);
    expect(await roles.capabilities('other')).toEqual(['users.manage']);
    expect((await roles.list()).some((role) => role.key === 'new-role')).toBe(
      false,
    );
    await expect(
      roles.save(
        { key: 'administrator', name: 'Administrator', capabilities: [] },
        manager,
      ),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      roles.save(
        {
          key: 'manager',
          name: 'Manager',
          capabilities: ['users.manage', 'settings.manage'],
        },
        { ...manager, capabilities: ['users.manage', 'settings.manage'] },
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });

    await roles.save(
      { key: 'limited', name: 'Limited', capabilities: ['users.manage'] },
      manager,
    );
    await roles.save(
      { key: 'manager', name: 'Renamed', capabilities: ['users.manage'] },
      manager,
    );
    await roles.save(
      {
        key: 'other',
        name: 'Other',
        capabilities: ['users.manage', 'plugins.manage'],
      },
      admin,
    );
    expect(await roles.capabilities('limited')).toEqual(['users.manage']);
    expect(await roles.capabilities('other')).toContain('plugins.manage');
  });

  test('role changes use the target object capability policy', async () => {
    const hooks = new HookBus({
      timeoutMs: 50,
      logger: recordingLogger().logger,
    });
    const { service, users } = await setup({ hooks });
    const reader = { id: 'reader', role: 'subscriber' };

    hooks.registrar('policy').filter('capability.check', (value) => ({
      ...value,
      allowed: value.userId === reader.id && value.object.id === 'writer',
    }));

    await expect(
      service.setRole('writer', { role: 'subscriber' }, admin),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await service.setRole('writer', { role: 'subscriber' }, reader);
    expect((await users.findById('writer'))?.role).toBe('subscriber');
  });

  test('custom managers cannot promote themselves or create stronger roles without an explicit policy grant', async () => {
    const hooks = new HookBus({
      timeoutMs: 50,
      logger: recordingLogger().logger,
    });
    const { directory, settings } = await setup();
    const roles = new RoleService(settings, directory, hooks);

    await roles.save(
      { key: 'staff', name: 'Staff', capabilities: ['users.manage'] },
      admin,
    );

    const { service, users } = await setup({ roles });

    await users.insert(userRecord({ id: 'manager', role: 'staff' }));

    const manager = {
      id: 'manager',
      role: 'staff',
      capabilities: ['users.manage'] as const,
    };

    expect(
      (await roles.assignable(manager)).map((role) => role.key),
    ).not.toContain('administrator');

    for (const id of ['manager', 'writer'])
      await expect(
        service.setRole(id, { role: 'administrator' }, manager),
      ).rejects.toMatchObject({ code: 'invalid_input' });

    for (const password of [undefined, 'safe-password'])
      await expect(
        service.create(
          { name: 'New', email: 'new@example.com', role: 'author', password },
          manager,
        ),
      ).rejects.toMatchObject({ code: 'invalid_input' });

    hooks.registrar('policy').filter('role.assignable', (value) => ({
      ...value,
      roles: ['author'],
    }));
    await service.setRole('writer', { role: 'author' }, manager);
    expect((await users.findById('manager'))?.role).toBe('staff');
  });

  test('deleting a role cannot reassign its users outside assignable roles', async () => {
    const hooks = new HookBus({
      timeoutMs: 50,
      logger: recordingLogger().logger,
    });
    const { directory, settings, users } = await setup();
    const roles = new RoleService(settings, directory, hooks);

    await roles.save({ key: 'staff', name: 'Staff', capabilities: [] }, admin);
    await users.insert(userRecord({ id: 'staff-user', role: 'staff' }));
    hooks.registrar('policy').filter('role.assignable', (value) => ({
      ...value,
      roles: ['subscriber'],
    }));
    await expect(
      roles.remove('staff', { reassignTo: 'administrator' }, admin),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    expect((await users.findById('staff-user'))?.role).toBe('staff');
    await roles.remove('staff', { reassignTo: 'subscriber' }, admin);
    expect((await users.findById('staff-user'))?.role).toBe('subscriber');
  });

  test('assignable roles restrict options and writes, rejecting invented roles and actor changes', async () => {
    const hooks = new HookBus({
      timeoutMs: 50,
      logger: recordingLogger().logger,
    });
    const { directory, settings } = await setup();
    const roles = new RoleService(settings, directory, hooks);
    const { service } = await setup({ roles });
    const plugin = hooks.registrar('policy');
    const release = plugin.filter('role.assignable', (value) => ({
      ...value,
      roles: ['subscriber'],
    }));
    expect((await roles.assignable(admin)).map((role) => role.key)).toEqual([
      'subscriber',
    ]);
    expect(
      await codeOf(service.setRole('writer', { role: 'editor' }, admin)),
    ).toBe('invalid_input');
    expect(
      await codeOf(service.setRole('writer', { role: 'subscriber' }, admin)),
    ).toBe('ok');
    release();
    plugin.filter('role.assignable', (value) => ({
      ...value,
      roles: ['invented'],
    }));
    const original = await roles.list();
    expect(await roles.assignable(admin)).toEqual(original);
    hooks
      .registrar('functions:site', { trusted: true })
      .filter('role.assignable', (value) => {
        value.actorId = 'other';
        value.roles = [];
        return value;
      });
    expect(await roles.assignable(admin)).toEqual(original);
  });
  test('object capabilities grant user removal without bypassing administrator integrity', async () => {
    const hooks = new HookBus({
      timeoutMs: 50,
      logger: recordingLogger().logger,
    });
    const { service } = await setup({ hooks });
    const reader = { id: 'reader', role: 'subscriber' };
    const release = hooks
      .registrar('object-policy')
      .filter('capability.check', (value) => ({
        ...value,
        allowed: value.userId === reader.id,
      }));
    expect(await codeOf(service.remove('writer', {}, admin))).toBe('forbidden');
    expect(await codeOf(service.remove('admin', {}, reader))).toBe('conflict');
    expect(await codeOf(service.remove('writer', {}, reader))).toBe('ok');
    release();
  });
  test('existing sessions lose custom permissions when their role changes', async () => {
    const { directory, service, settings, users } = await setup();
    const roles = new RoleService(settings, directory);
    await roles.save(
      { key: 'staff', name: 'Staff', capabilities: ['users.manage'] },
      admin,
    );
    const user = userRecord({ id: 'staff', role: 'staff' });
    await users.insert(user);
    const auth = new AuthService({
      roles,
      users,
      sessions: new MemorySessions(() => false, users),
      hasher: plainHasher,
      tokens: { issue: () => 'session-token', digest: (token) => token },
      ids: sequentialIds(),
      clock: fixedClock(),
      sessionTtlMs: 60_000,
    });

    const grant = await auth.startSession(user);
    expect(can(grant.user, 'users.manage')).toBe(true);
    expect(can('constructor', 'users.manage')).toBe(false);
    expect(await codeOf(service.list(grant.user))).toBe('ok');

    await roles.save({ key: 'staff', name: 'Staff', capabilities: [] }, admin);
    const refreshed = await auth.authenticate(grant.token);
    expect(refreshed).not.toBeNull();
    expect(can(refreshed!, 'users.manage')).toBe(false);
    expect(await codeOf(service.list(refreshed!))).toBe('forbidden');
  });

  test('sessions are listed and revoked only by their owner; deleting a role moves its users', async () => {
    const { directory, settings, users } = await setup();
    const deletable = new RoleService(settings, directory);
    await deletable.save(
      { key: 'staff', name: 'Staff', capabilities: [] },
      admin,
    );
    await users.insert(userRecord({ id: 'staff', role: 'staff' }));
    let issued = 0;
    const auth = new AuthService({
      users,
      sessions: new MemorySessions(() => false, users),
      hasher: plainHasher,
      tokens: {
        issue: () => `token-${++issued}`,
        digest: (token) => `#${token}`,
      },
      ids: sequentialIds(),
      clock: fixedClock(),
      sessionTtlMs: 60_000,
    });
    const writer = (await users.findById('writer'))!;
    const first = await auth.startSession(writer);
    await auth.startSession(writer);
    const listed = await auth.sessions(writer, first.token);
    expect(listed.map((session) => session.current).sort()).toEqual([
      false,
      true,
    ]);
    // Ids are opaque: neither the token nor its digest.
    expect(listed.map((session) => session.id)).not.toContain('#token-1');
    const other = listed.find((session) => !session.current)!;
    expect(await codeOf(auth.revokeSession(admin, other.id))).toBe('not_found');
    await auth.revokeSession(writer, other.id);
    expect(await auth.sessions(writer, first.token)).toHaveLength(1);
    expect(await codeOf(auth.signOutEverywhere('writer', writer))).toBe(
      'forbidden',
    );
    await auth.signOutEverywhere('writer', admin);
    expect(await auth.authenticate(first.token)).toBeNull();

    expect(
      await codeOf(deletable.remove('staff', { reassignTo: 'staff' }, admin)),
    ).toBe('invalid_input');
    expect(
      await codeOf(deletable.remove('author', { reassignTo: 'editor' }, admin)),
    ).toBe('invalid_input');
    await deletable.remove('staff', { reassignTo: 'editor' }, admin);
    expect((await users.findById('staff'))?.role).toBe('editor');
    expect((await deletable.list()).some((role) => role.key === 'staff')).toBe(
      false,
    );
  });

  test('public registration requires membership and invites only subscribers', async () => {
    const settings = new MemorySettings();
    const invitations: string[] = [];
    let hashes = 0;
    const { jobs, service, users } = await setup({
      settings,
      hasher: {
        hash: async (value) => {
          hashes += 1;
          return `hash:${value}`;
        },
        verify: async () => true,
      },
      invitations: {
        available: async () => true,
        send: async (user) => {
          invitations.push(user.email);
        },
      },
    });
    const input = {
      name: 'Reader',
      email: 'Reader@example.com',
      role: 'administrator',
      password: 'attacker-password',
    };
    const attempt = { client: null, address: null, captchaToken: null };

    expect(await codeOf(service.register(input, attempt))).toBe(
      'invalid_input',
    );
    expect(await users.findByEmail('reader@example.com')).toBeNull();
    expect(invitations).toEqual([]);

    await service.configureMembership({ enabled: true }, admin);
    await service.register(input, attempt);
    expect(await users.findByEmail('reader@example.com')).toBeNull();
    expect(JSON.stringify([...jobs.rows.values()][0]?.payload)).not.toContain(
      'reader@example.com',
    );
    await service.completeRegistration([...jobs.rows.values()][0]!.payload);
    const reader = await users.findByEmail('reader@example.com');
    expect(reader?.role).toBe('subscriber');
    expect(reader?.passwordHash).toBe('hash:token');
    expect(invitations).toEqual(['reader@example.com']);

    await service.register(input, attempt);
    await service.completeRegistration([...jobs.rows.values()].at(-1)!.payload);
    expect(hashes).toBe(2);
    expect(invitations).toEqual(['reader@example.com']);
  });

  describe('registration filters', () => {
    test('discovery coalesces anonymous requests and refreshes on membership and hook reload', async () => {
      const publicCache = new MemoryPublicCache();
      const hooks = new HookBus({
        timeoutMs: 50,
        logger: recordingLogger().logger,
        publicCache,
      });
      const { service } = await setup({
        hooks,
        publicCache,
        invitations: { available: async () => true, send: async () => {} },
      });
      let calls = 0;
      const plugin = hooks.registrar('policy');
      const release = plugin.filter('user.registrationAllowed', (value) => {
        calls++;
        return { ...value, allowed: true };
      });
      const results = await Promise.all(
        Array.from({ length: 20 }, () => service.registrationStatus()),
      );
      expect(results.every((value) => value.registrationOpen)).toBe(true);
      expect(calls).toBe(1);
      await service.configureMembership({ enabled: true }, admin);
      expect((await service.registrationStatus()).enabled).toBe(true);
      expect(calls).toBe(2);
      release();
      plugin.filter('user.registrationAllowed', (value) => ({
        ...value,
        allowed: false,
      }));
      expect((await service.registrationStatus()).registrationOpen).toBe(false);
    });
    const input = { name: 'Reader', email: 'reader@example.com' };
    const attempt = { client: null, address: null, captchaToken: null };
    const bus = () =>
      new HookBus({ timeoutMs: 50, logger: recordingLogger().logger });
    /** Membership stays closed; `log` records protection checks and handler runs in order. */
    const registration = async (
      hooks: HookBus | undefined,
      limited = false,
    ) => {
      const log: string[] = [];
      const context = await setup({
        hooks,
        invitations: { available: async () => true, send: async () => {} },
        protection: {
          check: async () => {
            log.push('check');
            if (limited) throw rateLimited(Errors.TooManyAttempts);
          },
        },
      });
      return { ...context, log };
    };

    test('rate-limited callers never reach registration handlers', async () => {
      const hooks = bus();
      const { jobs, log, service } = await registration(hooks, true);
      hooks.registrar('grant').filter('user.registrationAllowed', (value) => {
        log.push('grant');
        return { ...value, allowed: true };
      });
      expect(await codeOf(service.register(input, attempt))).toBe(
        'rate_limited',
      );
      expect(await codeOf(service.register(input, attempt))).toBe(
        'rate_limited',
      );
      expect(log).toEqual(['check', 'check']);
      expect(jobs.rows.size).toBe(0);
    });

    test('closed registration with no handlers fails at once without counting an attempt', async () => {
      for (const hooks of [undefined, bus()]) {
        const { log, service } = await registration(hooks);
        expect(await codeOf(service.register(input, attempt))).toBe(
          'invalid_input',
        );
        expect(log).toEqual([]);
      }
    });

    test('a later handler can open closed membership after an earlier refusal', async () => {
      const hooks = bus();
      const { jobs, log, service } = await registration(hooks);
      hooks.registrar('deny').filter('user.registrationAllowed', (value) => {
        log.push('deny');
        return { ...value, allowed: false };
      });
      expect(await codeOf(service.register(input, attempt))).toBe(
        'invalid_input',
      );
      hooks.registrar('grant').filter('user.registrationAllowed', (value) => {
        log.push('grant');
        expect(value).toEqual({ allowed: false, ...input });
        return { ...value, allowed: true };
      });
      await service.register(input, attempt);
      expect(log).toEqual(['check', 'deny', 'check', 'deny', 'grant']);
      expect(jobs.rows.size).toBe(1);
    });

    test('registration discovery has no identity and context rewrites cannot open registration', async () => {
      const hooks = bus();
      const { service, log } = await registration(hooks);
      expect(await service.registrationStatus()).toEqual({
        enabled: false,
        registrationOpen: false,
      });
      const release = hooks
        .registrar('policy')
        .filter('user.registrationAllowed', (value) => {
          expect(value).toEqual({ allowed: false, email: null, name: null });
          return { ...value, allowed: true };
        });
      expect(await service.registrationStatus()).toEqual({
        enabled: false,
        registrationOpen: true,
      });
      expect(log).toEqual([]);
      release();
      hooks
        .registrar('functions:site', { trusted: true })
        .filter('user.registrationAllowed', (value) => {
          value.email = 'other@example.com';
          value.allowed = true;
          return value;
        });
      expect(await codeOf(service.register(input, attempt))).toBe(
        'invalid_input',
      );
    });
  });

  test('only administrators manage users, and one administrator always remains', async () => {
    const { service } = await setup();
    const writer = { id: 'writer', role: 'author' };

    expect(await codeOf(service.list(writer))).toBe('forbidden');
    expect(
      await codeOf(
        service.update(
          'writer',
          {
            email: 'w@example.com',
            name: 'W',
            role: 'administrator',
            slug: 'w',
          },
          writer,
        ),
      ),
    ).toBe('forbidden');

    // The only administrator can neither be demoted nor deleted, nor delete themselves.
    expect(
      await codeOf(
        service.update(
          'admin',
          {
            email: 'admin@example.com',
            name: 'A',
            role: 'editor',
            slug: 'admin',
          },
          admin,
        ),
      ),
    ).toBe('conflict');
    expect(await codeOf(service.remove('admin', {}, admin))).toBe('conflict');

    await service.update(
      'writer',
      {
        email: 'writer@example.com',
        name: 'W',
        role: 'administrator',
        slug: 'writer',
      },
      admin,
    );
    expect(await codeOf(service.remove('writer', {}, admin))).toBe('ok');
  });

  test('a profile update never changes the role', async () => {
    const { service, users } = await setup();
    const writer = { id: 'writer', role: 'author' };
    const findByEmail = users.findByEmail.bind(users);
    users.findByEmail = async (email) => {
      users.rows.get('writer')!.role = 'editor';
      return findByEmail(email);
    };

    await service.updateProfile(
      {
        email: 'writer@example.com',
        name: 'Writer',
        slug: 'writer',
        role: 'administrator',
      },
      writer,
    );
    expect(users.rows.get('writer')!.role).toBe('editor');
  });
});
