import { describe, expect, test } from 'bun:test';
import { loadConfig } from '../src/config';

const sso = {
  OIDC_ISSUER: 'https://id.example.com',
  OIDC_CLIENT_ID: 'cms',
  OIDC_REDIRECT_URI: 'https://cms.example.com/admin/sso/callback',
  OIDC_FRONTEND_SECRET: 'f'.repeat(32),
};

describe('OIDC configuration', () => {
  test('single sign-on is off by default and needs no settings', () => {
    const config = loadConfig({});
    expect(config.OIDC_ISSUER).toBeUndefined();
    expect(config.OIDC_SCOPES).toBe('openid');
    expect(config.OIDC_ALLOWED_SUBJECTS).toEqual({});
    expect(config.OIDC_MAX_PENDING_REQUESTS).toBe(1000);
    expect(config.OIDC_MAX_PENDING_PER_CLIENT).toBe(10);
    expect(config.OIDC_STARTS_PER_MINUTE).toBe(300);
    expect(config.OIDC_STARTS_PER_MINUTE_PER_CLIENT).toBe(10);
    expect(config.OIDC_FRONTEND_SECRET).toBeUndefined();
  });

  test('parses a complete configuration and the subject allowlist', () => {
    const config = loadConfig({
      ...sso,
      OIDC_CLIENT_SECRET: 'secret',
      OIDC_SCOPES: ' openid   profile ',
      OIDC_ALLOWED_SUBJECTS: '{"auth0|123":"Admin@Example.com"}',
    });
    expect(config.OIDC_SCOPES).toBe('openid profile');
    expect(config.OIDC_ALLOWED_SUBJECTS).toEqual({
      'auth0|123': 'admin@example.com',
    });
  });

  test.each([
    [
      'partial settings',
      { OIDC_ISSUER: sso.OIDC_ISSUER, OIDC_FRONTEND_SECRET: 'f'.repeat(32) },
      'OIDC_ISSUER:',
    ],
    [
      'a plain HTTP issuer',
      { ...sso, OIDC_ISSUER: 'http://id.example.com' },
      'OIDC_ISSUER:',
    ],
    [
      'an issuer longer than identities can store',
      { ...sso, OIDC_ISSUER: `https://id.example.com/${'a'.repeat(240)}` },
      'OIDC_ISSUER:',
    ],
    [
      'a redirect URI with a query',
      { ...sso, OIDC_REDIRECT_URI: `${sso.OIDC_REDIRECT_URI}?next=/` },
      'OIDC_REDIRECT_URI:',
    ],
    [
      'scopes without openid',
      { ...sso, OIDC_SCOPES: 'profile email' },
      'OIDC_SCOPES:',
    ],
    [
      'secret authentication without a secret',
      { ...sso, OIDC_CLIENT_AUTH_METHOD: 'client_secret_post' },
      'OIDC_CLIENT_SECRET:',
    ],
    [
      'single sign-on without a frontend secret',
      { ...sso, OIDC_FRONTEND_SECRET: undefined },
      'OIDC_FRONTEND_SECRET:',
    ],
    [
      'a short frontend secret',
      { ...sso, OIDC_FRONTEND_SECRET: 'short' },
      'OIDC_FRONTEND_SECRET:',
    ],
    [
      'no room for pending requests',
      { ...sso, OIDC_MAX_PENDING_REQUESTS: '0' },
      'OIDC_MAX_PENDING_REQUESTS:',
    ],
    [
      'a per-client quota above the total',
      {
        ...sso,
        OIDC_MAX_PENDING_REQUESTS: '5',
        OIDC_MAX_PENDING_PER_CLIENT: '6',
      },
      'OIDC_MAX_PENDING_PER_CLIENT:',
    ],
    [
      'a per-client start rate above the overall rate',
      {
        ...sso,
        OIDC_STARTS_PER_MINUTE: '5',
        OIDC_STARTS_PER_MINUTE_PER_CLIENT: '6',
      },
      'OIDC_STARTS_PER_MINUTE_PER_CLIENT:',
    ],
    [
      'a zero start rate',
      { ...sso, OIDC_STARTS_PER_MINUTE: '0' },
      'OIDC_STARTS_PER_MINUTE:',
    ],
    [
      'a malformed allowlist',
      { ...sso, OIDC_ALLOWED_SUBJECTS: 'sub=admin' },
      'OIDC_ALLOWED_SUBJECTS:',
    ],
    [
      'an allowlist entry that is not an email',
      { ...sso, OIDC_ALLOWED_SUBJECTS: '{"sub":"admin"}' },
      'OIDC_ALLOWED_SUBJECTS',
    ],
  ])('rejects %s', (_name, env, problem) => {
    expect(() => loadConfig(env)).toThrow(problem);
  });
});
