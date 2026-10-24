import { expect, test } from 'bun:test';
import { CmsApiError } from '@cms/sdk/client';
import { submitAction } from '#lib/server/form-action.js';
import { secretInput } from '#lib/admin/settings/input.server.js';

test('settings mutations wait for completion and expose only the notice', async () => {
  let calls = 0;
  const update = async () => {
    calls++;
    return { password: 'must not reach action data' };
  };
  expect(await submitAction(update)).toEqual({ notice: 'saved' });
  expect(calls).toBe(1);
  for (const notice of ['emailTestSent', 'searchReindexQueued'])
    expect(await submitAction(update, notice)).toEqual({ notice });
  expect(calls).toBe(3);
});

test('settings actions retain API failures and rethrow server errors', async () => {
  const failure = await submitAction(async () => {
    throw new CmsApiError(400, 'invalid_input', 'Invalid settings', [
      { path: 'host', message: 'Invalid host' },
    ]);
  });
  expect(failure).toEqual({
    status: 400,
    data: {
      message: 'Invalid settings',
      code: 'invalid_input',
      issues: [{ path: 'host', message: 'Invalid host' }],
    },
  });
  for (const error of [
    new CmsApiError(503, 'unavailable', 'Unavailable'),
    new Error('Unexpected'),
  ])
    await expect(
      submitAction(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
});

test('secret fields keep, replace, and remove without changing submitted values', () => {
  for (const [name, remove] of [
    ['password', 'removePassword'],
    ['apiKey', 'removeApiKey'],
    ['clientSecret', 'removeSecret'],
    ['secretKey', 'removeSecret'],
  ] as const) {
    const form = new FormData();
    expect(secretInput(form, name, remove)).toBeUndefined();
    form.set(name, '');
    expect(secretInput(form, name, remove)).toBeUndefined();
    form.set(name, ' secret with spaces ');
    expect(secretInput(form, name, remove)).toBe(' secret with spaces ');
    form.set(remove, 'on');
    expect(secretInput(form, name, remove)).toBe('');
    form.set(name, '');
    expect(secretInput(form, name, remove)).toBe('');
  }
});
