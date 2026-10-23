import { describe, expect, test } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import {
  LEGACY_SESSION_COOKIE,
  SESSION_COOKIE,
  endSession,
  sessionToken,
  startSession,
  markSignedOut,
  takeSignedOut,
} from '#lib/server/session-cookie.js';
import {
  consumeSsoTransaction,
  setSsoTransaction,
} from '#lib/server/sso-cookie.js';

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
  test('logout markers are host-bound on HTTPS and usable on ordinary HTTP', () => {
    const https = new URL('https://cms.example.test/members/sign-in');
    const secure = cookies({ cms_signed_out: '1' });
    expect(takeSignedOut(secure.api, https)).toBe(false);
    markSignedOut(secure.api, https);
    expect(secure.options.get('__Host-cms_signed_out')).toMatchObject({
      secure: true,
      path: '/',
      httpOnly: true,
      maxAge: 60,
    });
    expect(takeSignedOut(secure.api, https)).toBe(true);
    expect(takeSignedOut(secure.api, https)).toBe(false);

    const http = new URL('http://cms.internal/members/sign-in');
    const plain = cookies();
    markSignedOut(plain.api, http);
    expect(plain.options.get('cms_signed_out')?.secure).toBe(false);
    expect(takeSignedOut(plain.api, http)).toBe(true);
  });
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

  test('HTTPS ignores a legacy cookie and logout clears both names', () => {
    const state = cookies({ [LEGACY_SESSION_COOKIE]: 'old-token' });
    expect(
      sessionToken(state.api, new URL('https://cms.example/admin')),
    ).toBeNull();
    expect(
      sessionToken(state.api, new URL('http://localhost:5173/admin')),
    ).toBe('old-token');

    endSession(state.api);
    expect(
      sessionToken(state.api, new URL('http://localhost:5173/admin')),
    ).toBeNull();
  });

  test('HTTPS SSO uses only its host-bound transaction cookie', () => {
    const state = cookies({ cms_sso: 'planted' });
    const url = new URL('https://cms.example/login');
    setSsoTransaction(
      state.api,
      {
        transaction: 'real',
        expiresAt: '2030-01-01T00:00:00.000Z',
      } as never,
      url,
      '/admin/sso/callback',
      '/blog?ref=sso',
    );

    expect(state.values.get('__Host-cms_sso')).not.toContain('/blog');
    expect(state.options.get('__Host-cms_sso')).toMatchObject({
      path: '/',
      secure: true,
    });
    expect(
      consumeSsoTransaction(state.api, url, '/admin/sso/callback'),
    ).toEqual({ transaction: 'real', back: '/blog?ref=sso' });
    expect(
      consumeSsoTransaction(state.api, url, '/admin/sso/callback'),
    ).toBeNull();
  });
});
