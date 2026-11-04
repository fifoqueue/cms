import { expect, test } from 'bun:test';
import {
  adminActionInputSchema,
  adminBarResponseSchema,
  adminNoticesResponseSchema,
} from '#sdk/admin-ui';

test('admin UI rejects unbounded actions and unsafe navigation', () => {
  expect(adminActionInputSchema.safeParse({ ids: [] }).success).toBe(false);
  expect(
    adminActionInputSchema.safeParse({ ids: Array(101).fill('id') }).success,
  ).toBe(false);
  expect(adminActionInputSchema.parse({ ids: ['id'] })).toEqual({
    ids: ['id'],
  });

  for (const href of ['//evil.test', '/\\evil.test', 'https://evil.test']) {
    expect(
      adminBarResponseSchema.safeParse({
        items: [{ key: 'link', label: 'Link', href }],
      }).success,
    ).toBe(false);
  }

  expect(
    adminNoticesResponseSchema.safeParse({
      notices: [{ kind: 'text', text: 'not a notice' }],
    }).success,
  ).toBe(false);
});
