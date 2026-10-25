import { expect, test } from 'bun:test';
import { createSignInUsers } from '#api/domain/auth/sign-in-users';
import { MemoryUsers } from '#test/support/sso-memory';
import { userRecord } from '#test/support/memory';

test('method user-directory lookups never resolve per-user grants or expose credentials', async () => {
  const users = new MemoryUsers();
  const user = userRecord({ id: 'user', email: 'user@example.com' });
  await users.insert(user);
  const calls: unknown[] = [];
  const directory = createSignInUsers(users, {
    capabilities: async (...args: [string, string?]) => {
      calls.push(args);
      return ['content.create'];
    },
  });
  const byId = await directory.findById(user.id);
  const byEmail = await directory.findByEmail(user.email);
  expect(byId).toEqual(byEmail);
  expect(byId?.capabilities).toEqual(['content.create']);
  expect(byId).not.toHaveProperty('passwordHash');
  expect(calls).toEqual([[user.role], [user.role]]);
  expect(await directory.findById('missing')).toBeNull();
  expect(calls).toHaveLength(2);
});
