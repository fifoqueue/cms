import {
  searchHookQuerySchema,
  searchHookResultsSchema,
  sitemapPageSchema,
  themeContributionSchema,
} from '@cms/sdk/plugin';
import type {
  SearchRequest,
  SearchHits,
  SitemapRequest,
  SitemapPage,
  ThemeContributionRequest,
  ThemeContribution,
} from '@cms/sdk/plugin';
import type { SearchService } from '#api/domain/search/search-service';
import type { SeoDiscoveryRepository } from '#api/domain/seo/seo-discovery-repository';
import { ProviderRegistry } from '#api/plugin-runtime/provider-registry';
import type { Logger } from '#api/shared/logger';

type Options = { timeoutMs: number; logger: Logger };

/** Production composition shared with integration tests, not a second test-only wiring. */
export const createSearchProviders = (
  search: Pick<SearchService, 'find'>,
  options: Options,
) => {
  const registry = new ProviderRegistry<SearchRequest, SearchHits>(
    searchHookResultsSchema,
    options,
  );
  // Null selects the direct database path, avoiding a second hydration.
  registry.register('core', 'database', () => null, true);
  registry.register('core', 'meilisearch', (query) => search.find(query), true);
  const lookup: Pick<SearchService, 'find'> = {
    find: async (query) => {
      const args = searchHookQuerySchema.parse(query);
      const hits = await registry.resolve(args);
      return hits && { ...hits, ids: hits.ids.slice(0, args.pageSize) };
    },
  };
  return { registry, lookup };
};

export const createSitemapProviders = (
  repository: SeoDiscoveryRepository,
  options: Options,
) => {
  const registry = new ProviderRegistry<SitemapRequest, SitemapPage>(
    sitemapPageSchema,
    options,
  );
  for (const kind of [
    'content',
    'category',
    'tag',
    'author',
    'taxonomy',
  ] as const)
    registry.register(
      'core',
      kind,
      async (query) => {
        const result = await repository.list({ ...query, kind });
        return {
          total: result.total,
          items: result.items.map((item) => ({
            path: item.path,
            title: item.title,
            description: item.description,
            updatedAt: item.updatedAt.toISOString(),
          })),
        };
      },
      true,
    );
  return registry;
};

export const createThemeContributions = (options: Options) => {
  const registry = new ProviderRegistry<
    ThemeContributionRequest,
    ThemeContribution
  >(themeContributionSchema, options);
  registry.register('core', 'core', (query) => query.base, true);
  return registry;
};
