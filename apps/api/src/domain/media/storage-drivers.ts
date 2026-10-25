import type { MediaStorage } from '#api/domain/media/ports';
import type { Logger } from '#api/shared/logger';
import { Errors, invalidInput } from '#api/shared/errors';
import { mailFieldSchema, pluginMailIdSchema } from '@cms/sdk';
import type { MailValues } from '@cms/sdk';
import type { PluginStorageDriver } from '@cms/sdk/plugin';
import { z } from 'zod';
import { IsolatedStorage } from '#api/domain/media/isolated-storage';

/**
 * Storage ownership is explicit: unavailable drivers never fall back to local.
 * Only the composition root receives this class; plugin contexts receive registrar().
 */
export class StorageDrivers {
  onRegistered?: (id: string) => Promise<void>;
  private readonly definitions = new Map<string, PluginStorageDriver>();

  plugin(owner: string, key: string, definition: PluginStorageDriver) {
    const id = pluginMailIdSchema.max(128).parse(`plugin:${owner}:${key}`);
    if (this.definitions.has(id)) throw new Error(Errors.MediaDriverDuplicate);
    const fields = mailFieldSchema.array().max(32).parse(definition.fields);
    if (new Set(fields.map((field) => field.key)).size !== fields.length)
      throw new Error(Errors.MediaDriverInvalid);
    const entry = {
      label: z.string().min(1).max(100).parse(definition.label),
      fields,
      connect: definition.connect,
    };
    this.definitions.set(id, entry);
    void this.onRegistered?.(id).catch((error: unknown) =>
      this.logger?.warn(`Media cleanup recovery for ${id} failed`, error),
    );
    return () => {
      if (this.definitions.get(id) === entry) this.definitions.delete(id);
    };
  }

  available() {
    return [
      { id: 'local', label: 'Local filesystem', fields: [] },
      { id: 's3', label: 'S3-compatible', fields: [] },
      ...[...this.definitions].map(([id, { label, fields }]) => ({
        id,
        label,
        fields: structuredClone(fields),
      })),
    ];
  }

  fields(id: string) {
    const entry = this.definitions.get(id);
    if (!entry) throw invalidInput(Errors.MediaDriverInvalid);
    return entry.fields;
  }

  validate(id: string, values: MailValues) {
    const fields = this.fields(id);
    for (const key of Object.keys(values))
      if (!fields.some((field) => field.key === key))
        throw invalidInput(Errors.InvalidInput, [
          { path: `pluginSettings.${key}`, message: Errors.InvalidInput },
        ]);
    for (const field of fields) {
      const value = values[field.key];
      if (value === undefined || value === '') {
        if (field.required)
          throw invalidInput(Errors.InvalidInput, [
            {
              path: `pluginSettings.${field.key}`,
              message: Errors.MediaStorageFieldRequired,
            },
          ]);
      } else if (
        typeof value !==
        (field.type === 'secret'
          ? 'string'
          : field.type === 'text'
            ? 'string'
            : field.type)
      )
        throw invalidInput(Errors.InvalidInput, [
          { path: `pluginSettings.${field.key}`, message: Errors.InvalidInput },
        ]);
    }
  }
  private readonly core = new Map<string, MediaStorage>();
  private readonly plugins = new Map<
    object,
    { id: string; driver: MediaStorage }
  >();

  constructor(
    private readonly logger?: Pick<Logger, 'warn'>,
    private readonly timeoutMs = 3000,
  ) {}

  registerCore(id: 'local' | 's3', driver: MediaStorage) {
    if (this.core.has(id)) throw new Error(Errors.MediaDriverDuplicate);
    this.core.set(id, driver);
  }

  /** A scoped facade deliberately excludes core registration and lookup. */
  registrar(owner: string) {
    return {
      register: (key: string, driver: MediaStorage) => {
        if (!/^[a-z][a-z0-9-]{0,63}$/.test(key))
          throw new Error(Errors.MediaDriverInvalid);
        const id = `plugin:${owner}:${key}`;
        const token = {};
        this.plugins.set(token, { id, driver });
        return () => {
          this.plugins.delete(token);
        };
      },
    };
  }

  get(id: string, values: MailValues = {}): MediaStorage | null {
    const definition = this.definitions.get(id);
    if (definition) {
      this.validate(id, values);
      return new IsolatedStorage(
        id,
        () => definition.connect(structuredClone(values)),
        () => this.definitions.get(id) === definition,
        this.timeoutMs,
        this.logger,
      );
    }
    const core = this.core.get(id);
    if (core) return core;
    let selected: object | undefined;
    for (const [token, entry] of this.plugins) {
      if (entry.id === id) selected = token;
    }
    const entry = selected && this.plugins.get(selected);
    if (entry)
      return new IsolatedStorage(
        id,
        () => entry.driver,
        () => this.plugins.get(selected!) === entry,
        this.timeoutMs,
        this.logger,
      );
    this.logger?.warn(`Media storage driver unavailable: ${id}`);
    return null;
  }
}
