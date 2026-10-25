import { expect, test } from 'bun:test';
import { signInStepSchema } from '#sdk/sign-in';

test('redirect steps require an HTTP(S) URL and an ISO datetime', () => {
  const step = {
    kind: 'redirect',
    transaction: 'handle',
    url: 'https://id.example/authorize',
    expiresAt: '2026-01-01T00:10:00.000Z',
  };
  expect(signInStepSchema.safeParse(step).success).toBe(true);
  for (const url of [
    '/relative',
    'javascript:alert(1)',
    'mailto:user@example.com',
    'not a URL',
  ])
    expect(signInStepSchema.safeParse({ ...step, url }).success).toBe(false);
  for (const expiresAt of ['', 'tomorrow', '2026-01-01'])
    expect(signInStepSchema.safeParse({ ...step, expiresAt }).success).toBe(
      false,
    );
});
