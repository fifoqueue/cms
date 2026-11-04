import { mediaStorageInputSchema, mediaStorageSettingsSchema } from '@cms/sdk';
import type { MediaStorageSettings } from '@cms/sdk';
import type { SecretBox } from '#api/domain/ports';
import type { SettingsRepository } from '#api/domain/site/site-service';
import type { SettingsTransactions } from '#api/domain/site/settings-transactions';
import { DomainError, Errors, invalidInput } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';
import type { StorageResync } from '#api/domain/media/storage-resync';
import type { StorageDrivers } from '#api/domain/media/storage-drivers';
import type { MailValues } from '@cms/sdk';
import type { HookDispatcher } from '#api/domain/ports';
import {
  filterSettings,
  settingsUpdated,
} from '#api/domain/site/settings-hooks';
import { z } from 'zod';

const storedSchema = z.object({
  settings: mediaStorageSettingsSchema,
  secret: z.string(),
  plugins: z
    .record(
      z.string(),
      z.object({
        values: z.record(
          z.string(),
          z.union([z.string(), z.number(), z.boolean()]),
        ),
        secrets: z.record(z.string(), z.string()),
      }),
    )
    .optional(),
});

type Configuration = {
  driver: string;
  pluginSettings?: MailValues;
  s3:
    | (NonNullable<MediaStorageSettings['s3']> & { secretAccessKey: string })
    | null;
};
type Stored = {
  settings: MediaStorageSettings;
  secret: string;
  plugins?: Record<
    string,
    { values: MailValues; secrets: Record<string, string> }
  >;
};
const KEY = 'media.storage';

/** Secrets are decrypted only for storage operations, never DTO projection. */
export class StorageSettings {
  resync?: StorageResync;
  constructor(
    private readonly deps: {
      settings: SettingsRepository;
      transactions: SettingsTransactions;
      secrets: SecretBox;
      test: (configuration: Configuration) => Promise<void>;
      drivers?: StorageDrivers;
      hooks?: HookDispatcher;
    },
  ) {}

  private async stored(store = this.deps.settings): Promise<Stored> {
    const value = (await store.get(KEY)) as Stored | undefined;

    return value ?? { settings: { driver: 'local', s3: null }, secret: '' };
  }

  async get(): Promise<MediaStorageSettings> {
    return this.dto(await this.stored());
  }

  private dto(value: Stored) {
    const plugin = value.plugins?.[value.settings.driver];

    return mediaStorageSettingsSchema.parse({
      ...value.settings,
      availableDrivers: this.deps.drivers?.available(),
      pluginSettings: plugin?.values,
      pluginSecretsConfigured: plugin ? Object.keys(plugin.secrets) : undefined,
    });
  }

  async configuration(driver?: string): Promise<Configuration> {
    const value = await this.stored();

    if (driver) value.settings = { ...value.settings, driver };

    return this.open(value);
  }

  private open(value: Stored): Configuration {
    const s3 = value.settings.s3;
    const secret = value.secret ? this.deps.secrets.open(value.secret) : null;

    if (s3 && !secret) throw invalidInput(Errors.MediaStorageSecret);
    const plugin = value.plugins?.[value.settings.driver];
    const pluginSettings = plugin ? { ...plugin.values } : undefined;

    if (plugin && pluginSettings)
      for (const [key, sealed] of Object.entries(plugin.secrets)) {
        const plain = this.deps.secrets.open(sealed);

        if (plain === null) throw invalidInput(Errors.MediaStorageSecret);
        pluginSettings[key] = plain;
      }

    return {
      driver: value.settings.driver,
      pluginSettings,
      s3: s3 ? { ...s3, secretAccessKey: secret! } : null,
    };
  }

  private prepare(input: unknown, current: Stored): Stored {
    const parsed = parseInput(mediaStorageInputSchema, input);
    const { s3, driver } = parsed;

    if (driver.startsWith('plugin:')) {
      if (!this.deps.drivers) throw invalidInput(Errors.MediaDriverInvalid);
      const fields = this.deps.drivers.fields(driver);
      const prior = current.plugins?.[driver];
      const values = { ...(parsed.pluginSettings ?? prior?.values ?? {}) };
      const secrets: Record<string, string> = {};

      for (const field of fields.filter((field) => field.type === 'secret')) {
        const input = values[field.key];
        const retained = prior?.secrets[field.key];

        if (input !== undefined) {
          if (typeof input !== 'string')
            throw invalidInput(Errors.InvalidInput);
          if (input) secrets[field.key] = this.deps.secrets.seal(input);
        } else if (retained) secrets[field.key] = retained;
        delete values[field.key];
      }

      const next = {
        ...current,
        settings: { ...current.settings, driver },
        plugins: { ...current.plugins, [driver]: { values, secrets } },
      };

      this.deps.drivers.validate(driver, this.open(next).pluginSettings ?? {});

      return next;
    }

    if (!s3)
      return {
        ...current,
        settings: { ...current.settings, driver },
        secret: current.secret,
      };
    const previous = current.settings.s3;

    if (
      previous &&
      (previous.endpoint !== s3.endpoint ||
        previous.bucket !== s3.bucket ||
        previous.prefix !== s3.prefix)
    )
      throw invalidInput(Errors.MediaStorageLocation);
    const { secretAccessKey, ...configuration } = s3;
    // Never send a retained credential to a newly supplied destination or account.
    const same =
      current.settings.s3?.endpoint === s3.endpoint &&
      current.settings.s3?.accessKeyId === s3.accessKeyId;
    const secret =
      secretAccessKey === undefined
        ? same
          ? current.secret
          : ''
        : this.deps.secrets.seal(secretAccessKey);

    if (!secret) throw invalidInput(Errors.MediaStorageSecret);

    return {
      ...current,
      settings: {
        driver,
        s3: { ...configuration, secretAccessKeyConfigured: true },
      },
      secret,
    };
  }

  async test(input: unknown): Promise<void> {
    await this.check(this.open(this.prepare(input, await this.stored())));
  }

  private async check(configuration: Configuration) {
    try {
      await this.deps.test(configuration);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw invalidInput(Errors.MediaStorageProbeRejected);
    }
  }

  async update(input: unknown): Promise<MediaStorageSettings> {
    const projection = {
      parseSettings: (value: unknown) =>
        mediaStorageSettingsSchema.safeParse(value),
      boundFields: [
        'driver',
        's3.endpoint',
        's3.bucket',
        's3.region',
        's3.prefix',
        's3.accessKeyId',
        's3.forcePathStyle',
      ],
      redact: (value: Stored) => ({
        section: 'storage' as const,
        settings: this.dto(value),
      }),
      restore: (
        value: { settings: MediaStorageSettings },
        original: Stored,
      ): Stored => {
        const settings = mediaStorageSettingsSchema.parse(value.settings);
        const driver = original.settings.driver;
        const plugin = original.plugins?.[driver];
        const values = { ...settings.pluginSettings };

        if (plugin)
          for (const field of this.deps.drivers?.fields(driver) ?? [])
            if (field.type === 'secret') delete values[field.key];

        return {
          ...original,
          settings,
          plugins: plugin
            ? {
                ...original.plugins,
                [driver]: { values, secrets: plugin.secrets },
              }
            : original.plugins,
        };
      },
      parse: (value: unknown) => storedSchema.safeParse(value),
    };

    const saved = await this.deps.transactions.run(
      `${KEY}.lock`,
      async (store) => {
        const filtering = this.deps.hooks?.has('settings.beforeSave') ?? false;
        const value = await filterSettings(
          this.deps.hooks,
          this.prepare(input, await this.stored(store)),
          projection,
        );

        if (filtering && value.settings.driver.startsWith('plugin:'))
          this.deps.drivers?.validate(
            value.settings.driver,
            this.open(value).pluginSettings ?? {},
          );
        await this.check(this.open(value));
        await store.set(KEY, value);

        return value;
      },
    );

    settingsUpdated(this.deps.hooks, saved, projection);

    return this.dto(saved);
  }
}
