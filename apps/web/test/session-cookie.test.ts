import { describe, expect, test } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import {
  LEGACY_SESSION_COOKIE,
  SESSION_COOKIE,
  endSession,
  migrateSession,
  sessionToken,
  startSession,
} from '#lib/server/session-cookie.js';

const cookies = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  const options = new Map<string, Parameters<Cookies['set']>[2]>();
  return {
    values,
    options,
    api: {
      get: (name: string) => values.get(name),
      getAll: () => [...values].map(([name, value]) => ({ name, value })),
      set: (
        name: string,
        value: string,
        settings: Parameters<Cookies['set']>[2],
      ) => {
        values.set(name, value);
        options.set(name, settings);
      },
      delete: (name: string) => values.delete(name),
    } as Cookies,
  };
};

const grant = {
  token: 'session-token',
  expiresAt: '2030-01-01T00:00:00.000Z',
  user: {},
} as never;

describe('session cookie', () => {
  test('HTTPS uses a host-bound cookie while HTTP localhost keeps the development cookie', () => {
    const secure = cookies();
    startSession(secure.api, grant, new URL('https://cms.example/admin'));
    expect(secure.values.get(SESSION_COOKIE)).toBe('session-token');
    expect(secure.options.get(SESSION_COOKIE)?.secure).toBe(true);

    const local = cookies();
    startSession(local.api, grant, new URL('http://localhost:5173/admin'));
    expect(local.values.get(LEGACY_SESSION_COOKIE)).toBe('session-token');
    expect(local.options.get(LEGACY_SESSION_COOKIE)?.secure).toBe(false);
  });

  test('a valid legacy HTTPS session migrates once and logout clears both names', () => {
    const state = cookies({ [LEGACY_SESSION_COOKIE]: 'old-token' });
    migrateSession(
      state.api,
      'old-token',
      new URL('https://cms.example/admin'),
    );

    expect(sessionToken(state.api)).toBe('old-token');
    expect(state.values.has(LEGACY_SESSION_COOKIE)).toBe(false);
    expect(state.options.get(SESSION_COOKIE)?.secure).toBe(true);

    endSession(state.api);
    expect(sessionToken(state.api)).toBeNull();
  });
});
