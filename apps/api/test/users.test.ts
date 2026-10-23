import { describe, expect, test } from 'bun:test';
import { can } from '@cms/sdk';
import { AuthService } from '#api/domain/auth/auth-service';
import { RoleService } from '#api/domain/users/role-service';
import { UserService } from '#api/domain/users/user-service';
import type { UserServiceDeps } from '#api/domain/users/user-service';
import type { DomainError } from '#api/shared/errors';
import {
  MemoryContentRepository,
  fixedClock,
  sequentialIds,
  userRecord,
} from '#test/support/memory';
import { MemoryUserDirectory } from '#test/support/memory-users';
import { MemorySeoSettingsRepository } from '#test/support/memory-seo';
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
  const service = new UserService({
    users,
    directory: new MemoryUserDirectory(users, content),
    hasher: {
      hash: async (value) => `hash:${value}`,
      verify: async () => true,
    },
    tokens: { issue: () => 'token' },
    ids: sequentialIds(),
    clock: fixedClock(),
    invitations: { available: async () => false, send: async () => {} },
    ...overrides,
  });
  await users.insert(userRecord({ id: 'admin' }));
  await users.insert(userRecord({ id: 'writer', role: 'author' }));
  return { service, users };
};

const admin = { id: 'admin', role: 'administrator' };

describe('user administration', () => {
  test('existing sessions lose custom permissions when their role changes', async () => {
    const roles = new RoleService(new MemorySeoSettingsRepository());
    const { service, users } = await setup({ roles });
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

  test('public registration requires membership and invites only subscribers', async () => {
    const settings = new MemorySeoSettingsRepository();
    const invitations: string[] = [];
    let hashes = 0;
    const { service, users } = await setup({
      settings,
      roles: new RoleService(settings),
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
    const reader = await users.findByEmail('reader@example.com');
    expect(reader?.role).toBe('subscriber');
    expect(reader?.passwordHash).toBe('hash:token');
    expect(invitations).toEqual(['reader@example.com']);

    await service.register(input, attempt);
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

    await service.updateProfile(
      {
        email: 'writer@example.com',
        name: 'Writer',
        slug: 'writer',
        role: 'administrator',
      },
      writer,
    );
    expect(users.rows.get('writer')!.role).toBe('author');
  });
});
