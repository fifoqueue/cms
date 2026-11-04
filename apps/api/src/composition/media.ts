import { MediaProcessors } from '#api/domain/media/media-processors';
import { ImageSizes } from '#api/domain/media/image-sizes';
import { sharpImages } from '#api/infra/sharp-images';
import type { Logger } from '#api/shared/logger';
import type { AppConfig } from '#api/config';
import type { createRepositories } from '#api/composition/repositories';
import type { createRegistries } from '#api/composition/registries';
import type { createPersistence } from '#api/composition/persistence';
import type { createSecurity } from '#api/composition/security';
import type { JobRunner } from '#api/domain/jobs/job-runner';
import { MediaService } from '#api/domain/media/media-service';
import { StorageSettings } from '#api/domain/media/storage-settings';
import {
  MediaCleanup,
  MEDIA_CLEANUP_JOB,
} from '#api/domain/media/media-cleanup';
import {
  StorageResync,
  MEDIA_RESYNC_JOB,
} from '#api/domain/media/storage-resync';
import { FsMediaStorage } from '#api/infra/fs-media-storage';
import { S3MediaStorage } from '#api/infra/s3-media-storage';
import { MediaReconciler } from '#api/infra/media-reconciler';
import { systemClock, uuidV7 } from '#api/infra/system';
import { Errors, invalidInput } from '#api/shared/errors';

export const createImages = (
  timeoutMs: number,
  logger: Logger,
): { mediaProcessors: MediaProcessors; imageSizes: ImageSizes } => {
  const mediaProcessors = new MediaProcessors(timeoutMs);
  mediaProcessors.registerCore({
    process: ({ bytes, mime }) => sharpImages.clean(bytes, mime),
  });
  const imageSizes = new ImageSizes(logger);
  return { mediaProcessors, imageSizes };
};

type Input = Pick<
  Awaited<ReturnType<typeof createRepositories>>,
  | 'mediaRepository'
  | 'settingsRepository'
  | 'storageTransactions'
  | 'cleanupCatalog'
  | 'cleanupTransactions'
  | 'resyncTransactions'
  | 'jobQueue'
  | 'taskLeases'
  | 'rateLimits'
> &
  Pick<
    ReturnType<typeof createRegistries>,
    'storageDrivers' | 'mediaProcessors' | 'imageSizes' | 'hooks'
  > &
  Pick<ReturnType<typeof createPersistence>, 'db' | 'wrap'> & {
    config: Pick<AppConfig, 'MEDIA_DIR' | 'MEDIA_MAX_MB'>;
    logger: Logger;
    secrets: ConstructorParameters<typeof StorageSettings>[0]['secrets'];
    egressFetch: ReturnType<typeof createSecurity>['egressFetch'];
    jobs: Pick<JobRunner, 'handle'>;
    limits: ConstructorParameters<typeof MediaService>[0]['limits'];
    finalize: ConstructorParameters<typeof MediaCleanup>[0]['finalize'];
  };

export const createMedia = ({
  mediaRepository,
  settingsRepository,
  storageTransactions,
  cleanupCatalog,
  cleanupTransactions,
  resyncTransactions,
  jobQueue,
  taskLeases,
  rateLimits,
  storageDrivers,
  mediaProcessors,
  imageSizes,
  hooks,
  db,
  wrap,
  config,
  logger,
  secrets,
  egressFetch,
  jobs,
  limits,
  finalize,
}: Input) => {
  const localMediaStorage = new FsMediaStorage(config.MEDIA_DIR);
  const mediaStorageSettings = new StorageSettings({
    drivers: storageDrivers,
    settings: settingsRepository,
    transactions: storageTransactions,
    secrets,
    test: async ({ driver, s3, pluginSettings }) => {
      if (driver === 's3' && s3)
        await new S3MediaStorage(s3, egressFetch('media-storage')).test();
      else if (driver.startsWith('plugin:')) {
        const storage = storageDrivers.get(driver, pluginSettings);
        if (!storage) throw new Error(Errors.MediaDriverInvalid);
        const key = '.cms-probe';
        if (
          (await storage.commit([{ key, bytes: new Uint8Array([0]) }], 0)) !==
          'stored'
        )
          throw invalidInput(Errors.MediaStorageBusy);
        try {
          await storage.remove([key]);
        } catch {
          throw invalidInput(Errors.MediaStorageProbeCleanup, [
            {
              path: 'probe',
              message: Errors.MediaStorageProbeCleanup,
              params: { bucket: driver, key },
            },
          ]);
        }
      }
    },
  });
  const remoteStorage = async () => {
    const { s3 } = await mediaStorageSettings.configuration();
    if (!s3) throw new Error(Errors.MediaStorageSecret);
    return new S3MediaStorage(s3, egressFetch('media-storage'));
  };
  const reconciler = wrap(
    new MediaReconciler(
      db,
      mediaStorageSettings,
      config.MEDIA_DIR,
      egressFetch('media-storage'),
    ),
    ['run'],
  );
  const mediaCleanup = new MediaCleanup({
    catalog: cleanupCatalog,
    settings: settingsRepository,
    transactions: cleanupTransactions,
    queue: jobQueue,
    logger,
    storage: async (driver) => {
      const storage = storageDrivers.get(
        driver,
        driver.startsWith('plugin:')
          ? (await mediaStorageSettings.configuration(driver)).pluginSettings
          : undefined,
      );
      if (!storage) throw new Error(Errors.MediaDriverInvalid);
      return storage;
    },
    finalize,
  });
  storageDrivers.onRegistered = (driver) => mediaCleanup.recover(driver);
  const storageResync = new StorageResync({
    settings: settingsRepository,
    transactions: resyncTransactions,
    queue: jobQueue,
    leases: taskLeases,
    clock: systemClock,
    ids: uuidV7,
    driver: async () => (await mediaStorageSettings.get()).driver,
    recoverCleanup: () => mediaCleanup.recover(),
    cleanupAttention: () => mediaCleanup.attention(),
    reconcile: (driver, startedAt, signal) =>
      reconciler.run(driver, startedAt, signal),
  });
  mediaStorageSettings.resync = storageResync;
  jobs.handle(MEDIA_RESYNC_JOB, (payload) => storageResync.run(payload));
  storageDrivers.registerCore('local', localMediaStorage);
  storageDrivers.registerCore('s3', {
    commit: async (files) => (await remoteStorage()).commit(files),
    read: async (key, range) => (await remoteStorage()).read(key, range),
    remove: async (keys) => (await remoteStorage()).remove(keys),
  });
  const media = new MediaService({
    cleanup: mediaCleanup,
    storageSettings: mediaStorageSettings,
    sizes: imageSizes,
    processors: mediaProcessors,
    repository: mediaRepository,
    storage: localMediaStorage,
    selectStorage: async (recordedDriver) => {
      const settings = await mediaStorageSettings.get();
      const driver = recordedDriver ?? settings.driver;
      const storage = storageDrivers.get(
        driver,
        driver.startsWith('plugin:')
          ? (await mediaStorageSettings.configuration(driver)).pluginSettings
          : undefined,
      );
      if (!storage) throw new Error(Errors.MediaDriverInvalid);
      return {
        driver,
        storage,
        url: (key: string) =>
          driver === 's3' && settings.s3?.publicBaseUrl
            ? `${settings.s3.publicBaseUrl.replace(/\/$/, '')}/${settings.s3.prefix}${key}`
            : `/media/${key}`,
      };
    },
    images: sharpImages,
    ids: uuidV7,
    clock: systemClock,
    hooks,
    limiter: rateLimits,
    limits,
    maxBytes: config.MEDIA_MAX_MB * 1024 * 1024,
  });
  jobs.handle('media.delete', async (payload) => {
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('id' in payload) ||
      typeof payload.id !== 'string'
    )
      throw new Error(Errors.InvalidInput);
    await media.cleanup(payload.id);
  });
  jobs.handle(MEDIA_CLEANUP_JOB, async (payload) => {
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('id' in payload) ||
      typeof payload.id !== 'string'
    )
      throw new Error(Errors.InvalidInput);
    await mediaCleanup.run(payload.id);
  });
  return { media };
};
