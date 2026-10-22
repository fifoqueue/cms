import type { TaxonomyType } from '@cms/sdk';
import type { ContentWrite } from '#api/domain/content/content-repository';
import { invalidInput, Errors } from '#api/shared/errors';

/**
 * Relation integrity shared by every `ContentRepository`: throws `invalid_input` unless every
 * `categoryIds` entry is a category and every `tagIds` entry is a tag. `kinds` maps the stored
 * term ids among them to their taxonomy.
 */
export const checkTermKinds = (
  {
    categoryIds,
    tagIds,
    extraTermIds = [],
  }: Pick<ContentWrite, 'categoryIds' | 'tagIds' | 'extraTermIds'>,
  kinds: ReadonlyMap<string, TaxonomyType>,
): void => {
  const issues = [
    ...extraTermIds
      .filter(
        (id) => !kinds.has(id) || ['category', 'tag'].includes(kinds.get(id)!),
      )
      .map(() => ({ path: 'extraTermIds', message: Errors.UnknownTerms })),
    ...categoryIds
      .filter((id) => kinds.get(id) !== 'category')
      .map(() => ({ path: 'categoryIds', message: Errors.UnknownCategory })),
    ...tagIds
      .filter((id) => kinds.get(id) !== 'tag')
      .map(() => ({ path: 'tagIds', message: Errors.UnknownTag })),
  ];
  if (issues.length) throw invalidInput(Errors.UnknownTerms, issues);
};
