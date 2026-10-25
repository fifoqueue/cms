import { describe, expect, test } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import { Buffer } from 'node:buffer';

// SvelteKit provides these at build time (same values as `page-data.test.ts`).
Bun.plugin({
  name: 'sveltekit-env',
  setup(build) {
    build.module('$app/env/private', () => ({
      exports: {
        CMS_API_URL: 'http://cms.test',
        API_PORT: '4000',
        CMS_FRONTEND_SECRET: '',
        OIDC_FRONTEND_SECRET: '',
      },
      loader: 'object',
    }));
    build.module('$app/paths', () => ({
      exports: { resolve: (path: string) => path, match: async () => null },
      loader: 'object',
    }));
  },
});

const { readPending, setPending, takePending } =
  await import('#lib/server/sso-cookie.js');
const { ownsPending, pendingEnrollment } =
  await import('#lib/server/sign-in.js');
const { signInCallback } = await import('#lib/server/sign-in-callback.js');
const { POST: logout } = await import('#web/routes/admin/logout/+server.js');

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

const secure = new URL('https://cms.example/login');
const plain = new URL('http://localhost:5173/admin/sign-in');

const totp = {
  kind: 'fields' as const,
  fields: [
    { name: 'code', label: 'Code', type: 'code' as const, required: true },
  ],
  display: [{ kind: 'code' as const, text: 'TOTP-SECRET-JBSWY3DP' }],
  transaction: 'step-1',
};

const asUser = (id: string | null) =>
  ({ user: id ? { id } : null }) as unknown as App.Locals;

/** Thrown SvelteKit redirects carry their location. */
const locationOf = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (thrown) {
    return (thrown as { location?: string }).location ?? thrown;
  }
  return null;
};

describe('pending sign-in cookie', () => {
  test('is host-bound on HTTPS, encrypted, and taken once', () => {
    const state = cookies({ cms_sso: 'planted' });
    setPending(
      state.api,
      secure,
      {
        transaction: 'real-handle',
        flow: 'enroll',
        user: 'u1',
        back: null,
        step: totp,
        owner: 'totp',
      },
      '2030-01-01T00:00:00.000Z',
    );
    const value = state.values.get('__Host-cms_sso')!;
    expect(value.startsWith('v3.')).toBe(true);
    // Neither readable as is nor after decoding: the secret is sealed.
    const bytes = Buffer.from(value.slice(3), 'base64url').toString('latin1');
    for (const secret of ['real-handle', 'TOTP-SECRET', 'enroll'])
      expect(value + bytes).not.toContain(secret);
    expect(state.options.get('__Host-cms_sso')).toMatchObject({
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
    });
    expect(takePending(state.api, secure)).toEqual({
      transaction: 'real-handle',
      flow: 'enroll',
      user: 'u1',
      back: null,
      step: totp,
      owner: 'totp',
    });
    expect(takePending(state.api, secure)).toBeNull();
  });

  test('forged, moved, legacy or oversized values are no pending step', () => {
    const state = cookies();
    setPending(state.api, secure, {
      transaction: 't',
      flow: 'login',
      user: null,
      back: '/blog',
      step: null,
    });
    const value = state.values.get('__Host-cms_sso')!;
    expect(readPending(state.api, secure)?.back).toBe('/blog');

    const flipped = `${value.slice(0, -2)}${value.endsWith('AA') ? 'BB' : 'AA'}`;
    expect(
      readPending(cookies({ '__Host-cms_sso': flipped }).api, secure),
    ).toBeNull();
    // The cookie name is authenticated: an HTTPS value does not work under the HTTP name.
    expect(readPending(cookies({ cms_sso: value }).api, plain)).toBeNull();
    expect(
      readPending(cookies({ cms_sso: 'v2.bm90LWRlZmxhdGVk' }).api, plain),
    ).toBeNull();
    expect(
      readPending(
        cookies({ '__Host-cms_sso': `v3.${'A'.repeat(4000)}` }).api,
        secure,
      ),
    ).toBeNull();
  });
});

describe('pending steps belong to who started them', () => {
  const enrolled = () => {
    const state = cookies();
    setPending(state.api, plain, {
      transaction: 'step-1',
      flow: 'enroll',
      user: 'u1',
      back: null,
      step: totp,
    });
    return state;
  };

  test('only the starting user sees or answers an enrollment', () => {
    const state = enrolled();
    const event = (id: string | null) => ({
      cookies: state.api,
      url: plain,
      locals: asUser(id),
    });
    expect(pendingEnrollment(event('u1'))).toEqual({
      step: totp,
      owner: null,
    });
    expect(pendingEnrollment(event('u2'))).toBeNull();
    expect(pendingEnrollment(event(null))).toBeNull();
    expect(
      ownsPending({ locals: asUser('u2') }, { flow: 'enroll', user: 'u1' }),
    ).toBe(false);
    expect(
      ownsPending({ locals: asUser(null) }, { flow: 'login', user: null }),
    ).toBe(true);
  });

  const signOut = (state: ReturnType<typeof cookies>, back?: string) =>
    locationOf(() =>
      logout({
        fetch: (() => Promise.reject(new Error('offline'))) as never,
        locals: { token: null, user: null },
        cookies: state.api,
        url: plain,
        request: new Request('http://localhost:5173/admin/logout', {
          method: 'POST',
          body: new URLSearchParams(back ? { redirect_to: back } : {}),
        }),
      } as never),
    );

  test('“sign in again” returns to its page, only on this site', async () => {
    expect(await signOut(cookies(), '/admin/account')).toBe(
      '/login?redirect_to=%2Fadmin%2Faccount',
    );
    expect(await signOut(cookies(), 'https://evil.example/')).toBe('/login');
    expect(await signOut(cookies(), '/admin/sign-in')).toBe('/login');
  });

  test('a callback visit leaves a shown step untouched', async () => {
    const state = enrolled();
    const location = await locationOf(() =>
      signInCallback({
        fetch: (() => Promise.reject(new Error('unused'))) as never,
        cookies: state.api,
        url: new URL('http://localhost:5173/admin/sign-in/callback?code=x'),
        locals: asUser('u1'),
        getClientAddress: () => '127.0.0.1',
        setHeaders: () => {},
      } as never),
    );
    expect(location).toBe('/admin/(app)/account#two-step');
    expect(readPending(state.api, plain)?.step).toEqual(totp);
  });
});
