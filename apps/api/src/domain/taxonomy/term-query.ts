import { termQuerySchema } from '@cms/sdk';
import type { TaxonomyType, TermQuery } from '@cms/sdk';
import type { HookDispatcher } from '#api/domain/ports';

/**
 * Term list arguments after `term.query`. Results must match the
 * core schema; another taxonomy must exist (`exists`). Without handlers nothing is validated.
 */
export const termQuery = async (
  hooks: HookDispatcher | undefined,
  taxonomy: TaxonomyType,
  scope: 'admin' | 'public',
  exists: (taxonomy: string) => Promise<boolean>,
): Promise<TermQuery> => {
  const query: TermQuery = { taxonomy };

  if (!hooks?.has('term.query')) return query;
  const filtered = await hooks.applyFilter(
    'term.query',
    query,
    async (value) => {
      const result = termQuerySchema.safeParse(value);

      return (
        result.success &&
        (result.data.taxonomy === taxonomy ||
          (await exists(result.data.taxonomy)))
      );
    },
    undefined,
    [{ scope }],
  );

  return termQuerySchema.parse(filtered);
};
