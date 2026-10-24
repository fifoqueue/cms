import { describe, expect, test } from 'bun:test';
import { can } from '@cms/sdk';
import { AuthService } from '#api/domain/auth/auth-service';
import { RoleService } from '#api/domain/users/role-service';
import { UserService } from '#api/domain/users/user-service';
import type { UserServiceDeps } from '#api/domain/users/user-service';
import { SealedJobs } from '#api/domain/jobs/sealed-jobs';
import type { DomainError } from '#api/shared/errors';
import {
  MemoryContentRepository,
  MemorySettings,
  fixedClock,
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

  test('role-only changes keep the profile, and concurrent deletions keep one administrator', async () => {
    const { service, users } = await setup();
    const boss = { id: 'boss', role: 'administrator' };
    await users.insert(userRecord({ id: 'second', role: 'administrator' }));
    // A profile edit landing between a bulk list read and the role change survives it.
    const before = (await service.list(boss)).find((u) => u.id === 'writer')!;
    users.rows.set('writer', {
      ...(await users.findById('writer'))!,
      name: 'NEW NAME',
    });
    await service.setRole('writer', { role: 'editor' }, boss);
    const writer = await users.findById('writer');
    expect(writer?.role).toBe('editor');
    expect(writer?.name).toBe('NEW NAME');
    expect(before.name).not.toBe('NEW NAME');

    const results = await Promise.allSettled([
      service.remove('admin', {}, boss),
      service.remove('second', {}, boss),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
  });

  test('role deletion is atomic with assignments and account creation', async () => {
    const { directory, service, settings, users } = await setup();
    const roles = new RoleService(settings, directory);
    await roles.save(
      { key: 'staff', name: 'Staff', capabilities: ['content.create'] },
      admin,
    );
    const outcomes = await Promise.allSettled([
      roles.remove('staff', { reassignTo: 'editor' }, admin),
      service.setRole('writer', { role: 'staff' }, admin),
      service.create(
        {
          email: 'new-staff@example.com',
          name: 'New Staff',
          role: 'staff',
          password: 'password-123',
        },
        admin,
      ),
    ]);

    expect((await roles.list()).some(({ key }) => key === 'staff')).toBe(false);
    expect([...users.rows.values()].some(({ role }) => role === 'staff')).toBe(
      false,
    );
    expect(outcomes.some(({ status }) => status === 'fulfilled')).toBe(true);
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
