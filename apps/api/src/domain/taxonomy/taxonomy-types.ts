import {
  taxonomyDefinitionSchema,
  taxonomyDefinitionInputSchema,
} from '@cms/sdk';
import type { TaxonomyDefinition } from '@cms/sdk';
import { authorize } from '#api/domain/auth/authorization';
import type { Actor } from '#api/domain/auth/authorization';
import type { SettingsRepository } from '#api/domain/site/site-service';
import type { TaxonomyRepository } from '#api/domain/taxonomy/taxonomy-repository';
import { conflict, invalidInput, notFound, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';
import { DefinitionRegistry } from '#api/domain/content/definition-registry';

const PREFIX = 'taxonomy.definition.';
export const BUILTIN_TAXONOMIES: readonly TaxonomyDefinition[] = [
  { key: 'category', name: 'Categories', hierarchical: true },
  { key: 'tag', name: 'Tags', hierarchical: false },
];

export class TaxonomyTypeService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly repository: TaxonomyRepository,
    private readonly registry = new DefinitionRegistry(
      taxonomyDefinitionSchema,
      BUILTIN_TAXONOMIES,
    ),
  ) {}

  async list(): Promise<TaxonomyDefinition[]> {
    const definitions = this.registry.list();

    for (const [key, value] of Object.entries(
      await this.settings.list(PREFIX),
    )) {
      const parsed = taxonomyDefinitionSchema.safeParse(value);

      if (
        parsed.success &&
        key === `${PREFIX}${parsed.data.key}` &&
        !definitions.some((definition) => definition.key === parsed.data.key)
      )
        definitions.push(parsed.data);
    }

    return definitions;
  }

  async require(key: string): Promise<TaxonomyDefinition> {
    const definition = (await this.list()).find((item) => item.key === key);

    if (!definition) throw notFound(Errors.TaxonomyNotFound);

    return definition;
  }

  async save(input: unknown, actor: Actor): Promise<TaxonomyDefinition> {
    authorize(actor, 'taxonomy.manage');
    const definition = parseInput(taxonomyDefinitionInputSchema, input);

    if (BUILTIN_TAXONOMIES.some((item) => item.key === definition.key))
      throw invalidInput(Errors.ContentTypeReserved);

    const current = (await this.list()).find(
      (item) => item.key === definition.key,
    );

    if (
      current &&
      current.hierarchical !== definition.hierarchical &&
      (await this.repository.list(definition.key, 'all')).length
    )
      throw conflict(Errors.UnknownTerms);

    await this.settings.set(`${PREFIX}${definition.key}`, definition);

    return definition;
  }

  async remove(key: string, actor: Actor): Promise<void> {
    authorize(actor, 'taxonomy.manage');
    await this.require(key);

    if (this.registry.list().some((item) => item.key === key))
      throw invalidInput(Errors.ContentTypeReserved);
    if ((await this.repository.list(key, 'all')).length)
      throw conflict(Errors.UnknownTerms);

    await this.settings.set(`${PREFIX}${key}`, null);
  }
}
