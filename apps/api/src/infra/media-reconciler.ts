import { Glob } from 'bun';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Database } from '#api/infra/prisma/client';
import type { StorageSettings } from '#api/domain/media/storage-settings';
import { S3MediaStorage } from '#api/infra/s3-media-storage';
import { parseVariants } from '#api/domain/media/media-mapper';
import { Errors } from '#api/shared/errors';

/** Inventory must finish within its budget before any missing markers are written. */
export class MediaReconciler {
  constructor(
    private readonly db: Database,
    private readonly settings: StorageSettings,
    private readonly root: string,
    private readonly transport: (
      input: string | URL | Request,
      init?: RequestInit,
    ) => Promise<Response>,
  ) {}

  async run(
    driver: 'local' | 's3',
    startedAt: Date,
    signal = AbortSignal.timeout(60_000),
  ) {
    const inventory = new Map<string, { size: number; etag: string | null }>();
    const configuration = await this.settings.configuration();
    const s3 = configuration.s3;
    const deadline = Date.now() + 60_000;
    const budget = () => {
      signal.throwIfAborted();
      if (inventory.size > 5000 || Date.now() > deadline)
        throw new Error(Errors.MediaResyncFailed);
    };
    if (driver === 's3') {
      if (!s3) throw new Error(Errors.MediaStorageSecret);
      const storage = new S3MediaStorage(s3, this.transport);
      let cursor: string | undefined;
      for (let page = 0; ; page++) {
        if (page >= 50) throw new Error(Errors.MediaResyncFailed);
        const result = await storage.list(cursor, signal);
        for (const object of result.contents ?? []) {
          if (object.size === undefined)
            throw new Error(Errors.MediaResyncFailed);
          inventory.set(object.key.slice(s3.prefix.length), {
            size: object.size,
            etag: object.eTag ?? null,
          });
        }
        budget();
        if (!result.isTruncated) break;
        cursor = result.nextContinuationToken;
        if (!cursor) throw new Error(Errors.MediaResyncFailed);
      }
    } else {
      for await (const key of new Glob('**/*').scan({
        cwd: this.root,
        onlyFiles: true,
      })) {
        const file = await stat(join(this.root, key));
        inventory.set(key.replaceAll('\\', '/'), {
          size: file.size,
          etag: null,
        });
        budget();
      }
    }
    const counts = {
      scanned: inventory.size,
      refreshed: 0,
      missing: 0,
      untracked: 0,
    };
    // Bounds both the JSON work and database writes; variants are already bounded on upload.
    const rows = await this.db.$transaction(
      async (tx) => {
        budget();
        const result = await tx.media.findMany({
          where: { storageDriver: driver, createdAt: { lte: startedAt } },
          take: 5001,
          orderBy: { id: 'asc' },
        });
        budget();
        return result;
      },
      { timeout: Math.max(1, deadline - Date.now()), maxWait: 1000 },
    );
    if (rows.length > 5000) throw new Error(Errors.MediaResyncFailed);
    const url = (key: string) =>
      driver === 's3' && s3?.publicBaseUrl
        ? `${s3.publicBaseUrl.replace(/\/$/, '')}/${s3.prefix}${key}`
        : `/media/${key}`;
    for (const row of rows) {
      budget();
      const variants = parseVariants(row.variants);
      for (const variant of Object.values(variants)) {
        if (!variant) continue;
        if ((variant.storageDriver ?? row.storageDriver) !== driver) continue;
        const found = inventory.get(variant.key);
        variant.missingAt = found
          ? null
          : (variant.missingAt ?? startedAt.toISOString());
        if (found) {
          variant.byteSize = found.size;
          variant.etag = found.etag;
          variant.publicUrl = url(variant.key);
          inventory.delete(variant.key);
          counts.refreshed++;
        } else counts.missing++;
      }
      const found = inventory.get(row.storageKey);
      if (found) {
        counts.refreshed++;
        inventory.delete(row.storageKey);
      } else counts.missing++;
      await this.db.$transaction(
        async (tx) => {
          budget();
          await tx.media.updateMany({
            // Compare every storage field read above. A concurrent writer wins, never a stale snapshot.
            where: {
              id: row.id,
              variants: row.variants,
              storageDriver: row.storageDriver,
              storageKey: row.storageKey,
              publicUrl: row.publicUrl,
              byteSize: row.byteSize,
              size: row.size,
              etag: row.etag,
              missingAt: row.missingAt,
            },
            data: {
              missingAt: found ? null : (row.missingAt ?? startedAt),
              ...(found && {
                size: found.size,
                byteSize: found.size,
                etag: found.etag,
                publicUrl: url(row.storageKey),
              }),
              variants: JSON.stringify(variants),
            },
          });
          budget();
        },
        { timeout: Math.max(1, deadline - Date.now()), maxWait: 1000 },
      );
    }
    counts.untracked = inventory.size;
    return counts;
  }
}
