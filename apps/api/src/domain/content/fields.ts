import { fieldDefinitionSchema } from '@cms/sdk';
import type { FieldDefinition, FieldValues, PublicImage } from '@cms/sdk';
import { z } from 'zod';
import type { Actor } from '#api/domain/auth/authorization';
import type { HookDispatcher } from '#api/domain/ports';
import { authorize } from '#api/domain/auth/authorization';
import type { SettingsRepository } from '#api/domain/site/site-service';
import { conflict, invalidInput, notFound, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';
import type { DefinitionRegistry } from '#api/domain/content/definition-registry';

const KEY = 'contentFields';

/** The value schema of one field; optional unless required (required text must not be empty). */
const valueSchema = (field: FieldDefinition): z.ZodType => {
  const text = (max: number) =>
    field.required
      ? z.string().trim().min(1, Errors.FieldRequired).max(max)
      : z.string().trim().max(max);
  const base: z.ZodType = (() => {
    switch (field.type) {
      case 'text':
        return text(1000);
      case 'textarea':
        return text(20_000);
      case 'number':
        return z.number().finite();
      case 'boolean':
        return z.boolean();
      case 'date':
        return z.iso.date();
      case 'url':
        return z.url({ protocol: /^https?$/ }).max(2048);
      case 'select':
        return z.enum(field.options as [string, ...string[]]);
      case 'image':
        return z.string().min(1).max(36);
    }
  })();
  return field.required ? base : base.nullable().optional();
};

/** Media ids that image fields point at. */
export const fieldMediaIds = (
  definitions: readonly FieldDefinition[],
  values: FieldValues,
) =>
  definitions.flatMap((field) =>
    field.type === 'image' && typeof values[field.key] === 'string'
      ? [values[field.key] as string]
      : [],
  );

/** Custom fields: definitions in core settings, values on each entry. */
export class FieldService {
  constructor(
    private readonly deps: {
      settings: SettingsRepository;
      hooks?: HookDispatcher;
      registry?: DefinitionRegistry<FieldDefinition>;
      /** Public projections of library images by id. */
      images: (ids: readonly string[]) => Promise<Map<string, PublicImage>>;
    },
  ) {}

  async list(): Promise<FieldDefinition[]> {
    return [...(this.deps.registry?.list() ?? []), ...(await this.stored())];
  }

  private async stored(): Promise<FieldDefinition[]> {
    const stored = await this.deps.settings.get(KEY);
    const fields: FieldDefinition[] = [];
    for (const entry of Array.isArray(stored) ? stored : []) {
      const result = fieldDefinitionSchema.safeParse(entry);
      if (
        result.success &&
        !fields.some((field) => field.key === result.data.key)
      )
        fields.push(result.data);
    }
    return fields;
  }

  async forType(type: string): Promise<FieldDefinition[]> {
    return (await this.list()).filter((field) =>
      field.contentTypes.includes(type),
    );
  }

  async create(input: unknown, actor: Actor): Promise<FieldDefinition> {
    authorize(actor, 'fields.manage');
    const field = await this.prepare(input);
    const fields = await this.stored();
    if (fields.some((existing) => existing.key === field.key))
      throw conflict(Errors.FieldExists);
    await this.deps.settings.set(KEY, [...fields, field]);
    void this.deps.hooks?.emit('field.created', field);
    return field;
  }

  /** Replaces a definition; values already stored stay and are re-validated on the next save. */
  async update(
    key: string,
    input: unknown,
    actor: Actor,
  ): Promise<FieldDefinition> {
    authorize(actor, 'fields.manage');
    const fields = await this.stored();
    const index = fields.findIndex((field) => field.key === key);
    if (index === -1) throw notFound(Errors.FieldNotFound);
    const field = { ...(await this.prepare(input)), key };
    fields[index] = field;
    await this.deps.settings.set(KEY, fields);
    void this.deps.hooks?.emit('field.updated', field);
    return field;
  }

  /** Removes a definition; stored values are no longer shown or served. */
  async remove(key: string, actor: Actor): Promise<void> {
    authorize(actor, 'fields.manage');
    const fields = await this.stored();
    const removed = fields.find((field) => field.key === key);
    if (!removed) throw notFound(Errors.FieldNotFound);
    await this.deps.settings.set(
      KEY,
      fields.filter((field) => field.key !== key),
    );
    void this.deps.hooks?.emit('field.deleted', removed);
  }

  private async prepare(input: unknown) {
    const data = parseInput(fieldDefinitionSchema, input);
    if (data.key.startsWith('plugin:')) throw invalidInput(Errors.FieldExists);
    const filtered = await this.deps.hooks?.applyFilter(
      'field.beforeSave',
      data,
      (value) => fieldDefinitionSchema.safeParse(value).success,
    );
    const result = fieldDefinitionSchema.parse(filtered ?? data);
    if (result.key.startsWith('plugin:'))
      throw invalidInput(Errors.FieldExists);
    return result;
  }

  /**
   * Validates the values of a `type` entry: undeclared keys are dropped, each declared field
   * must match its type, and required fields must be present.
   */
  async validate(type: string, values: FieldValues): Promise<FieldValues> {
    const fields = await this.forType(type);
    const result = z
      .object(
        Object.fromEntries(
          fields.map((field) => [field.key, valueSchema(field)]),
        ),
      )
      .safeParse(values);
    if (!result.success)
      throw invalidInput(
        Errors.InvalidInput,
        result.error.issues.map(({ path, message }) => ({
          path: ['fields', ...path].join('.'),
          message,
        })),
      );
    return Object.fromEntries([
      ...Object.entries(values).filter(
        ([key]) =>
          key.startsWith('plugin:') &&
          !fields.some((field) => field.key === key),
      ),
      ...Object.entries(result.data).filter(
        ([, value]) => value !== undefined && value !== null,
      ),
    ]);
  }

  /** Public fields of an entry; image fields become public images (missing ones are left out). */
  async present(
    type: string,
    values: FieldValues,
  ): Promise<Record<string, unknown>> {
    if (Object.keys(values).length === 0) return {};
    const fields = (await this.forType(type)).filter((field) => field.public);
    const images = await this.deps.images(fieldMediaIds(fields, values));
    return Object.fromEntries(
      fields.flatMap((field) => {
        const value = values[field.key];
        if (value === undefined || value === null) return [];
        if (field.type !== 'image') return [[field.key, value]];
        const image = images.get(value as string);
        return image ? [[field.key, image]] : [];
      }),
    );
  }
}
