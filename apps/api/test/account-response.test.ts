import { expect, test } from 'bun:test';
import { obscureAccountLookup } from '#api/http/account-response';

test('public account lookups keep the same minimum response time', async () => {
  let now = 0;
  let waited = 0;
  const result = await obscureAccountLookup(
    async () => {
      now = 125;
      return 'done';
    },
    {
      now: () => now,
      wait: async (milliseconds) => {
        waited = milliseconds;
        now += milliseconds;
      },
    },
  );

  expect(result).toBe('done');
  expect(waited).toBe(375);
  expect(now).toBe(500);
});
