import {
  BUILTIN_CONTENT_TYPES,
  contentTypeInputSchema,
  contentTypeSchema,
  isReservedTypeKey,
} from '@cms/sdk';
import type {
  ContentTypeDefinition,
  FieldDefinition,
  PublicContentType,
} from '@cms/sdk';
import type { Actor } from '#api/domain/auth/authorization';
import type { HookDispatcher } from '#api/domain/ports';
import { authorize } from '#api/domain/auth/authorization';
import type { SettingsRepository } from '#api/domain/site/site-service';
import { conflict, invalidInput, notFound, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';
import { ContentTypeRegistry } from '#api/domain/content/content-type-registry';

const KEY = 'contentTypes';

const all = {
  categories: true,
  tags: true,
  comments: true,
  featuredImage: true,
};

/** The types every site has. Pages have no terms and no comments by default (WordPress). */
export const BUILTIN_TYPES: readonly ContentTypeDefinition[] = [
  {
    key: 'post',
    name: 'Post',
    pluralName: 'Posts',
    description: '',
    archive: false,
    searchable: true,
    supports: all,
    builtin: true,
  },
  {
    key: 'article',
    name: 'Article',
    pluralName: 'Articles',
    description: '',
    archive: false,
    searchable: true,
    supports: all,
    builtin: true,
  },
  {
    key: 'page',
    name: 'Page',
    pluralName: 'Pages',
    description: '',
    archive: false,
    searchable: true,
    supports: { ...all, comments: false },
    builtin: true,
  },
];

/** Whether entries of a type exist, so it cannot be removed. */
export type TypeUsage = (key: string) => Promise<boolean>;

/** Built-in and administrator-defined content types, stored in core settings. */
export class ContentTypeService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly inUse: TypeUsage,
    private readonly hooks?: HookDispatcher,
    private readonly registry = new ContentTypeRegistry(BUILTIN_TYPES),
  ) {}

  /** Built-in types first, then custom ones in creation order. */
  async list(): Promise<ContentTypeDefinition[]> {
    return [...this.registry.list(), ...(await this.custom())];
  }

  /** Types with their public fields' labels, so themes can show field values. */
  async publicList(
    fields: readonly FieldDefinition[],
  ): Promise<PublicContentType[]> {
    return (await this.list()).map(
      ({ key, name, pluralName, description, archive, searchable }) => ({
        key,
        name,
        pluralName,
        description,
        archive,
        searchable,
        fields: fields
          .filter((field) => field.public && field.contentTypes.includes(key))
          .map((field) => ({
            key: field.key,
            label: field.label,
            type: field.type,
          })),
      }),
    );
  }

  async get(key: string): Promise<ContentTypeDefinition | null> {
    return (await this.list()).find((type) => type.key === key) ?? null;
  }

  /** The type of an entry being saved; unknown keys are an input error. */
  async require(key: string): Promise<ContentTypeDefinition> {
    const type = await this.get(key);
    if (!type)
      throw invalidInput(Errors.ContentTypeUnknown, [
        { path: 'type', message: Errors.ContentTypeUnknown },
      ]);
    return type;
  }

  async create(input: unknown, actor: Actor): Promise<ContentTypeDefinition> {
    authorize(actor, 'fields.manage');
    const type = await this.prepare(input);
    if (isReservedTypeKey(type.key))
      throw invalidInput(Errors.ContentTypeReserved, [
        { path: 'key', message: Errors.ContentTypeReserved },
      ]);
    const custom = await this.custom();
    if (custom.some((existing) => existing.key === type.key))
      throw conflict(Errors.ContentTypeExists);
    const created = { ...type, builtin: false };
    await this.settings.set(KEY, [...custom, created]);
    void this.hooks?.emit('contentType.created', created);
    return created;
  }

  /** The key never changes; entries keep pointing at it. */
  async update(
    key: string,
    input: unknown,
    actor: Actor,
  ): Promise<ContentTypeDefinition> {
    authorize(actor, 'fields.manage');
    const custom = await this.custom();
    const index = custom.findIndex((type) => type.key === key);
    if (index === -1) throw notFound(Errors.ContentTypeNotFound);
    const updated = {
      ...(await this.prepare(input)),
      key,
      builtin: false,
    };
    custom[index] = updated;
    await this.settings.set(KEY, custom);
    void this.hooks?.emit('contentType.updated', updated);
    return updated;
  }

  /** Removes a custom type that no entry uses. */
  async remove(key: string, actor: Actor): Promise<void> {
    authorize(actor, 'fields.manage');
    const custom = await this.custom();
    const removed = custom.find((type) => type.key === key);
    if (!removed) throw notFound(Errors.ContentTypeNotFound);
    if (await this.inUse(key)) throw conflict(Errors.ContentTypeInUse);
    await this.settings.set(
      KEY,
      custom.filter((type) => type.key !== key),
    );
    void this.hooks?.emit('contentType.deleted', removed);
  }

  private async prepare(input: unknown) {
    const data = parseInput(contentTypeInputSchema, input);
    const filtered = await this.hooks?.applyFilter(
      'contentType.beforeSave',
      data,
      (value) => contentTypeInputSchema.safeParse(value).success,
    );
    return contentTypeInputSchema.parse(filtered ?? data);
  }

  /** Stored custom types, re-validated; damaged or clashing entries are skipped. */
  private async custom(): Promise<ContentTypeDefinition[]> {
    const stored = await this.settings.get(KEY);
    const types: ContentTypeDefinition[] = [];
    for (const entry of Array.isArray(stored) ? stored : []) {
      const result = contentTypeSchema.safeParse(entry);
      if (
        result.success &&
        !(BUILTIN_CONTENT_TYPES as readonly string[]).includes(
          result.data.key,
        ) &&
        !types.some((type) => type.key === result.data.key)
      )
        types.push({ ...result.data, builtin: false });
    }
    return types;
  }
}
