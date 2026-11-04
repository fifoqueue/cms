import { z } from 'zod';
import {
  adminScreenSchema,
  pageAssetSchema,
  pluginCapabilitySchema,
  adminNoticesResponseSchema,
  can,
  adminIdsSchema,
  adminActionInputSchema,
  adminActionResponseSchema,
} from '@cms/sdk';
import type {
  AdminScreen,
  AdminBlock,
  PageAsset,
  AdminScreenResponse,
  AdminActionResponse,
} from '@cms/sdk';
import type { HookDispatcher } from '#api/domain/ports';
import { objectAllowed } from '#api/domain/auth/object-authorization';
import { authorize } from '#api/domain/auth/authorization';
import { notFound, Errors } from '#api/shared/errors';
import type {
  AdminUiRegistrar,
  AdminNoticeDefinition,
  AdminColumnDefinition,
  AdminRowActionDefinition,
  AdminBulkActionDefinition,
  AdminFilterDefinition,
  AdminAssetDefinition,
} from '@cms/sdk/plugin';
import { parseInput } from '#api/shared/validation';
import type { Actor } from '#api/domain/auth/authorization';
import { isolate } from '#api/shared/isolate';
import type { AdminUiAccess } from '#api/plugin-runtime/admin-ui-access';
import { screenListCapability } from '#api/plugin-runtime/admin-ui-access';

interface Definitions {
  notice: AdminNoticeDefinition;
  column: AdminColumnDefinition;
  rowAction: AdminRowActionDefinition;
  bulkAction: AdminBulkActionDefinition;
  filter: AdminFilterDefinition;
  assets: AdminAssetDefinition;
}

type Entry = {
  [K in keyof Definitions]: {
    kind: K;
    owner: string;
    key: string;
    screen?: AdminScreen;
    definition: Definitions[K];
  };
}[keyof Definitions];

const keySchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(64);
const labelSchema = z.string().min(1).max(200);
const callbackSchema = z.custom<(...args: never[]) => unknown>(
  (value) => typeof value === 'function',
);
const accessSchema = z.object({
  capability: pluginCapabilitySchema,
  screens: z.array(z.string().min(1).max(100)).max(100).optional(),
});

export class AdminUiRegistry {
  private entries: Entry[] = [];

  constructor(
    private readonly timeoutMs = 3000,
    private access: AdminUiAccess = async () => null,
  ) {}

  setAccess(access: AdminUiAccess) {
    this.access = access;
  }

  get empty() {
    return this.entries.length === 0;
  }

  list() {
    return this.entries.map((entry) => ({
      ...entry,
      definition: { ...entry.definition },
    }));
  }

  async notices(actor: Actor, screen: string): Promise<AdminBlock[]> {
    if (this.empty) return [];
    const notices: AdminBlock[] = [];

    for (const entry of this.entries.slice()) {
      if (entry.kind !== 'notice' || !this.visible(entry, actor, screen))
        continue;
      const result = await isolate(
        async () =>
          adminNoticesResponseSchema.safeParse({
            notices: await entry.definition.render(),
          }),
        this.timeoutMs,
      );

      if (result.ok && result.value.success && this.entries.includes(entry))
        notices.push(
          ...result.value.data.notices.slice(0, 100 - notices.length),
        );

      if (notices.length === 100) break;
    }

    return notices;
  }

  assets(actor: Actor, screen: string): PageAsset[] {
    if (this.empty) return [];

    return this.entries
      .filter(
        (entry) =>
          entry.kind === 'assets' && this.visible(entry, actor, screen),
      )
      .slice(0, 100)
      .map((entry) =>
        pageAssetSchema.parse({
          ...entry.definition,
          key: `${entry.owner}:${entry.key}`,
        }),
      );
  }

  async screen(
    actor: Actor,
    input: unknown,
    inputIds: unknown,
  ): Promise<AdminScreenResponse> {
    const screen = parseInput(adminScreenSchema, input);
    const ids = [...new Set(parseInput(adminIdsSchema, inputIds))];
    const output: AdminScreenResponse = {
      columns: [],
      values: Object.create(null),
      rowActions: [],
      bulkActions: [],
      filters: [],
    };

    if (this.empty) return output;

    for (const entry of this.entries.slice()) {
      if (entry.screen !== screen || !this.visible(entry, actor, screen))
        continue;
      const key = `${entry.owner}:${entry.key}`;

      if (entry.kind === 'column' && output.columns.length < 100) {
        const definition = entry.definition;
        const allowed: string[] = [];

        for (const id of ids) {
          if (await this.access(actor, screen, id, false)) allowed.push(id);
        }

        const result = await isolate(async () => {
          const values = allowed.length
            ? await definition.values([...allowed])
            : {};

          return z.record(z.string(), z.string().max(10000)).safeParse(values);
        }, this.timeoutMs);

        if (
          !result.ok ||
          !result.value.success ||
          !this.entries.includes(entry)
        )
          continue;
        output.columns.push({ key, label: definition.label });

        for (const id of allowed) {
          if (!Object.hasOwn(result.value.data, id)) continue;
          output.values[id] ??= Object.create(null);
          output.values[id]![key] = result.value.data[id]!;
        }
      }

      if (entry.kind === 'rowAction' && output.rowActions.length < 100)
        output.rowActions.push({ key, label: entry.definition.label });

      if (entry.kind === 'bulkAction' && output.bulkActions.length < 100)
        output.bulkActions.push({ key, label: entry.definition.label });

      if (entry.kind === 'filter' && output.filters.length < 100)
        output.filters.push({
          key,
          label: entry.definition.label,
          options: structuredClone(entry.definition.options),
        });
    }

    return output;
  }

  async action(
    actor: Actor,
    input: unknown,
    key: string,
    body: unknown,
    hooks?: HookDispatcher,
  ): Promise<AdminActionResponse> {
    const screen = parseInput(adminScreenSchema, input);
    const { ids: inputIds } = parseInput(adminActionInputSchema, body);
    const ids = [...new Set(inputIds)];
    const entry = this.entries.find(
      (candidate) =>
        candidate.screen === screen &&
        `${candidate.owner}:${candidate.key}` === key &&
        (candidate.kind === 'rowAction' || candidate.kind === 'bulkAction'),
    );

    if (!entry || (entry.kind !== 'rowAction' && entry.kind !== 'bulkAction'))
      throw notFound(Errors.PluginPageNotFound);
    authorize(actor, entry.definition.capability);
    const failed: string[] = [];

    let notice: AdminActionResponse['notice'];
    const batches = entry.kind === 'rowAction' ? ids.map((id) => [id]) : [ids];

    for (const candidates of batches) {
      const batch: string[] = [];

      for (const id of candidates) {
        const object = await this.access(actor, screen, id, true);
        const permitted =
          object &&
          (await objectAllowed(
            hooks,
            actor,
            entry.definition.capability,
            () => object,
          ));

        if (permitted && can(actor, entry.definition.capability))
          batch.push(id);
        else failed.push(id);
      }

      if (batch.length === 0) continue;

      if (
        !this.entries.includes(entry) ||
        !can(actor, entry.definition.capability)
      ) {
        failed.push(...batch);
        continue;
      }

      const result = await isolate(async () => {
        const value =
          entry.kind === 'rowAction'
            ? await entry.definition.run(batch[0]!)
            : await entry.definition.run([...batch]);

        return adminActionResponseSchema.safeParse({
          ...value,
          failed: 'failed' in value ? (value.failed ?? []) : [],
        });
      }, this.timeoutMs);

      if (!result.ok || !result.value.success) {
        failed.push(...batch);
        continue;
      }

      failed.push(
        ...result.value.data.failed.filter((id) => batch.includes(id)),
      );
      notice = result.value.data.notice ?? notice;
    }

    return { ...(notice ? { notice } : {}), failed: [...new Set(failed)] };
  }

  async apply<T extends Record<string, unknown>>(
    actor: Actor,
    screen: AdminScreen,
    query: Record<string, unknown>,
    schema: z.ZodType<T>,
  ): Promise<T> {
    authorize(actor, screenListCapability[screen]);
    const selections = Object.entries(query).filter(([key]) =>
      key.startsWith('filter.'),
    );

    if (this.empty && selections.length === 0) return query as T;
    const filters = this.entries.filter(
      (entry) =>
        entry.kind === 'filter' &&
        entry.screen === screen &&
        this.visible(entry, actor, screen),
    );
    const selected: Record<string, string> = Object.create(null);

    parseInput(z.number().max(100), selections.length);

    for (const [key, value] of selections) {
      parseInput(z.string().max(198), key);
      const entry = filters.find(
        (candidate) => key === `filter.${candidate.owner}:${candidate.key}`,
      );

      parseInput(
        z.literal(true),
        entry?.kind === 'filter' &&
          typeof value === 'string' &&
          value.length <= 200 &&
          entry.definition.options.some((option) => option.value === value),
      );
      selected[key] = value as string;
    }

    let current = parseInput(
      schema,
      Object.fromEntries(
        Object.entries(query).filter(([key]) => !key.startsWith('filter.')),
      ),
    );

    for (const entry of this.entries.slice()) {
      if (
        entry.kind !== 'filter' ||
        entry.screen !== screen ||
        !this.visible(entry, actor, screen)
      )
        continue;
      const result = await isolate(
        async () =>
          schema.safeParse(
            Object.fromEntries(
              Object.entries(
                await entry.definition.apply({
                  ...structuredClone(current),
                  ...selected,
                }),
              ).filter(([key]) => !key.startsWith('filter.')),
            ),
          ),
        this.timeoutMs,
      );

      if (result.ok && result.value.success && this.entries.includes(entry))
        current = result.value.data;
    }

    return current;
  }

  private visible(entry: Entry, actor: Actor, screen: string) {
    const definition = entry.definition;

    return (
      can(
        actor,
        'capability' in definition
          ? (definition.capability ??
              (entry.screen
                ? screenListCapability[entry.screen]
                : 'plugins.manage'))
          : entry.screen
            ? screenListCapability[entry.screen]
            : 'plugins.manage',
      ) &&
      (!('screens' in definition) ||
        !definition.screens ||
        definition.screens.includes(screen)) &&
      this.entries.includes(entry)
    );
  }

  registrar(owner: string): AdminUiRegistrar {
    return {
      notice: (key, definition) =>
        this.register({ kind: 'notice', owner, key, definition }),
      column: (screen, key, definition) =>
        this.register({ kind: 'column', owner, key, screen, definition }),
      rowAction: (screen, key, definition) =>
        this.register({ kind: 'rowAction', owner, key, screen, definition }),
      bulkAction: (screen, key, definition) =>
        this.register({ kind: 'bulkAction', owner, key, screen, definition }),
      filter: (screen, key, definition) =>
        this.register({ kind: 'filter', owner, key, screen, definition }),
      assets: (key, definition) =>
        this.register({ kind: 'assets', owner, key, definition }),
    };
  }

  private register(input: Entry) {
    parseInput(z.number().max(499), this.entries.length);
    parseInput(keySchema, input.key);

    if (input.screen !== undefined) parseInput(adminScreenSchema, input.screen);
    const definition = input.definition;

    if ('label' in definition) parseInput(labelSchema, definition.label);

    parseInput(accessSchema, definition);

    if (input.kind === 'rowAction' || input.kind === 'bulkAction') {
      parseInput(z.string().min(1).max(191), input.definition.capability);
      parseInput(callbackSchema, input.definition.run);
    }

    if (input.kind === 'notice')
      parseInput(callbackSchema, input.definition.render);

    if (input.kind === 'column')
      parseInput(callbackSchema, input.definition.values);

    if (input.kind === 'filter') {
      parseInput(callbackSchema, input.definition.apply);
      parseInput(
        z
          .array(z.object({ value: z.string().max(200), label: labelSchema }))
          .max(100),
        input.definition.options,
      );
    }

    if (input.kind === 'assets')
      parseInput(pageAssetSchema, { ...definition, key: input.key });
    const snapshot = Object.fromEntries(
      Object.entries(definition).map(([key, value]) => [
        key,
        typeof value === 'function' ? value : structuredClone(value),
      ]),
    );
    const entry = { ...input, definition: snapshot } as Entry;

    this.entries.push(entry);

    return () => {
      this.entries = this.entries.filter((candidate) => candidate !== entry);
    };
  }
}
