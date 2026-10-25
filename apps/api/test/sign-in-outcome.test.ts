import { describe, expect, test } from 'bun:test';
import {
  secondFactorChallengeSchema,
  signInOutcomeSchema,
} from '#api/plugin-runtime/sign-in-outcome';

describe('sign-in outcome boundary', () => {
  test('projects identity without leaking implementation data', () => {
    expect(
      signInOutcomeSchema.parse({
        kind: 'user',
        userId: 'user-1',
        passwordHash: 'private',
      }),
    ).toEqual({ kind: 'user', userId: 'user-1' });
  });

  test('refuses unparsable redirect URLs instead of throwing', () => {
    for (const url of ['', 'not a url', 'https://', 'javascript:alert(1)'])
      expect(
        signInOutcomeSchema.safeParse({ kind: 'redirect', url }).success,
      ).toBe(false);
  });

  test('preserves JSON state and bounds UTF-8 bytes', () => {
    const outcome = {
      kind: 'redirect' as const,
      url: 'https://identity.example/authorize',
      state: { nonce: 'opaque', attempts: 1 },
    };
    expect(signInOutcomeSchema.parse(outcome)).toEqual(outcome);
    expect(
      signInOutcomeSchema.safeParse({
        ...outcome,
        state: '한'.repeat(3000),
      }).success,
    ).toBe(false);
    expect(
      signInOutcomeSchema.safeParse({ ...outcome, state: () => null }).success,
    ).toBe(false);
  });

  test('rejects executable and credential-bearing redirects', () => {
    for (const url of [
      'javascript:alert(1)',
      'https://user:pass@example.com',
    ]) {
      expect(
        signInOutcomeSchema.safeParse({ kind: 'redirect', url }).success,
      ).toBe(false);
    }
  });

  test('factors cannot authenticate a different user or redirect', () => {
    expect(
      secondFactorChallengeSchema.safeParse({ kind: 'user', userId: 'other' })
        .success,
    ).toBe(false);
    expect(
      secondFactorChallengeSchema.safeParse({
        kind: 'fields',
        fields: [{ name: 'code', label: 'Code', type: 'code' }],
        state: { challenge: 'opaque' },
      }).success,
    ).toBe(true);
    expect(
      secondFactorChallengeSchema.safeParse({
        kind: 'webauthn',
        ceremony: 'get',
        options: { challenge: 'opaque' },
      }).success,
    ).toBe(true);
  });
});
