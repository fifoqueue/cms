import type {
  SeoDiscoveryCriteria,
  SeoDiscoveryRecord,
  SeoDiscoveryRepository,
} from '#api/domain/seo/seo-discovery-repository';
import type { SettingsRepository } from '#api/domain/site/site-service';
import { withDescendants } from '#api/domain/taxonomy/hierarchy';
import type { MemoryContentRepository } from '#test/support/memory';

export class MemorySeoSettingsRepository implements SettingsRepository {
  readonly values = new Map<string, unknown>();

  async list(prefix: string): Promise<Record<string, unknown>> {
    return Object.fromEntries(
      [...this.values]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => [key, structuredClone(value)]),
    );
  }

  async get(key: string) {
    return structuredClone(this.values.get(key));
  }

  async set(key: string, value: unknown) {
    this.values.set(key, structuredClone(value));
  }
}

export class MemorySeoDiscoveryRepository implements SeoDiscoveryRepository {
  constructor(private readonly content: MemoryContentRepository) {}

  async list({ kind, page, pageSize, siteUrl }: SeoDiscoveryCriteria) {
    const published = [...this.content.rows.values()].filter(
      (row) => row.status === 'published',
    );
    let items: SeoDiscoveryRecord[];
    if (kind === 'content') {
      items = published
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .flatMap((row) => {
          const path = this.content.permalinks.current(row.id);
          if (path === null) throw new Error('Content has no current path');
          if (
            row.seo.noIndex ||
            (row.seo.canonicalUrl &&
              row.seo.canonicalUrl !== `${siteUrl}${path}`)
          )
            return [];
          return [
            {
              path,
              title: row.seo.title || row.title,
              description: row.seo.description || row.excerpt,
              updatedAt: new Date(row.updatedAt),
            },
          ];
        });
    } else {
      const terms = [...this.content.terms.values()];
      items = terms
        .filter((term) => {
          if (
            term.taxonomy !== kind ||
            term.seo.noIndex ||
            (term.seo.canonicalUrl &&
              term.seo.canonicalUrl !==
                `${siteUrl}/${term.taxonomy}/${term.slug}`)
          )
            return false;
          const ids =
            kind === 'category' ? withDescendants(terms, term.id) : [term.id];
          return published.some((row) =>
            (kind === 'category' ? row.categoryIds : row.tagIds).some((id) =>
              ids.includes(id),
            ),
          );
        })
        .map((term) => ({
          path: `/${term.taxonomy}/${term.slug}`,
          title: term.seo.title || term.name,
          description: term.seo.description || term.description,
          updatedAt: new Date(term.updatedAt),
        }));
      items.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    }
    return {
      items: items.slice((page - 1) * pageSize, page * pageSize),
      total: items.length,
    };
  }
}
