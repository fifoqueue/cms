import { createDatabase } from '#api/infra/prisma/client';
import { MemoryPublicCache } from '#api/infra/public-cache';
import { invalidatingStore } from '#api/infra/invalidating-store';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { AppConfig } from '#api/config';
import { EgressSettingsService } from '#api/domain/security/egress-settings';
import { API_DIRECTORY } from '#api/infra/installation/config-store';
import { aesSecretBox, secretKey } from '#api/infra/secret-box';
import { hmacSigner } from '#api/infra/hmac-signer';
import { outbound } from '#api/infra/egress-policy';
import type { EgressService } from '@cms/sdk';

export const CMS_VERSION = (
  JSON.parse(readFileSync(join(API_DIRECTORY, 'package.json'), 'utf8')) as {
    version: string;
  }
).version;

export const createPersistence = (url: string) => {
  const db = createDatabase(url);
  const publicCache = new MemoryPublicCache();
  const wrap = <T extends object>(store: T, writes: readonly (keyof T)[]) =>
    invalidatingStore(store, writes, publicCache);
  const databaseVersion = async () =>
    (await db.$queryRaw<{ version: string }[]>`SELECT VERSION() AS version`)[0]
      ?.version ?? 'unknown';
  return {
    db,
    publicCache,
    wrap,
    databaseVersion,
    invalidate: () => publicCache.invalidate(),
  };
};

export const createSecrets = (
  config: Pick<AppConfig, 'CMS_SECRET_KEY' | 'CMS_SECRET_KEY_PREVIOUS'>,
) => {
  const activeSecret = secretKey(
    config.CMS_SECRET_KEY,
    join(API_DIRECTORY, 'data/secret.key'),
  );
  const signer = hmacSigner(activeSecret);
  const secrets = aesSecretBox(activeSecret, config.CMS_SECRET_KEY_PREVIOUS);
  return { signer, secrets };
};

export const createEgress = (
  settings: ConstructorParameters<typeof EgressSettingsService>[0],
  allowlist: ConstructorParameters<typeof EgressSettingsService>[1],
  hooks: ConstructorParameters<typeof EgressSettingsService>[2],
) => {
  const egress = new EgressSettingsService(settings, allowlist, hooks);
  const access = async (service: EgressService) => ({
    service,
    rules: await egress.rules(service),
  });
  const egressFetch =
    (service: EgressService) =>
    async (input: string | URL | Request, init?: RequestInit) =>
      outbound.fetch(input, init, await access(service));
  const checkUrl = async (service: EgressService, url: string) =>
    outbound.check(url, await access(service));
  return { egress, access, egressFetch, checkUrl };
};
