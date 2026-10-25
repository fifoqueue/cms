import { expect, test } from 'bun:test';
import { SsoSettingsService } from '#api/domain/auth/sso-settings';
import type { OidcClient } from '#api/domain/auth/sso-settings';
import { MemorySettings, profile } from '#test/support/memory';
import {
  createMemoryAuthStore,
  MemorySsoAccessTransactions,
} from '#test/support/sso-memory';
import { plainSecretBox } from '#test/support/memory-security';

test('admin settings never return the client secret, which reaches only the provider client', async () => {
  const clients: OidcClient[] = [];
  const settings = new MemorySettings();
  const { identities } = createMemoryAuthStore();
  const service = new SsoSettingsService({
    otherMethod: async () => true,
    settings,
    access: new MemorySsoAccessTransactions({ settings, identities }),
    secrets: plainSecretBox,
    siteUrl: async () => 'https://site.example',
    connect: (client) => {
      clients.push(client);
      return {
        authorize: async () => ({
          url: 'https://id.example.com/authorize',
          state: 'state',
          nonce: 'nonce',
          codeVerifier: 'verifier',
        }),
        verify: async () => ({ issuer: client.issuer, subject: 'subject' }),
      };
    },
    environment: null,
  });
  const saved = await service.update(
    {
      passwordLogin: true,
      providers: [
        {
          id: 'default',
          enabled: true,
          issuer: 'https://id.example.com',
          clientId: 'cms',
          clientSecret: 'top-secret',
          allowedSubjects: { 'sub-1': 'Admin@Example.com' },
        },
      ],
    },
    profile({ id: 'admin', email: 'admin@example.com' }),
  );
  expect(saved).toMatchObject({
    providers: [{ clientSecretConfigured: true }],
  });
  expect(JSON.stringify(await service.getAdmin())).not.toContain('top-secret');
  await service.setup();
  expect(clients).toHaveLength(1);
  expect(clients[0]!.clientSecret).toBe('top-secret');
});
