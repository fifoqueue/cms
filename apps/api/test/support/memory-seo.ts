import { archivePath } from '@cms/sdk';
import type {
  SeoDiscoveryCriteria,
  SeoDiscoveryRecord,
  SeoDiscoveryRepository,
} from '#api/domain/seo/seo-discovery-repository';
import { withDescendants } from '#api/domain/taxonomy/hierarchy';
import type { MemoryContentRepository } from '#test/support/memory';

export class MemorySeoDiscoveryRepository implements SeoDiscoveryRepository {
  constructor(private readonly content: MemoryContentRepository) {}

  async list({ kind, page, pageSize, siteUrl }: SeoDiscoveryCriteria) {
    const published = [...this.content.rows.values()].filter(
      (row) => row.status === 'published' && !this.content.trashed.has(row.id),
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
    } else if (kind === 'author') {
      const authors = new Map<string, SeoDiscoveryRecord>();
      for (const row of published.filter(
        (item) => !item.seo.noIndex && !item.passwordHash,
      )) {
        const path = `/author/${encodeURIComponent(row.authorId)}`;
        const current = authors.get(path);
        if (!current || current.updatedAt < row.updatedAt)
          authors.set(path, {
            path,
            title: row.authorId,
            description: '',
            updatedAt: row.updatedAt,
          });
      }
      items = [...authors.values()].sort((a, b) =>
        a.path.localeCompare(b.path),
      );
    } else {
      const terms = [...this.content.terms.values()];
      const bases = { category: '/category', tag: '/tag' };
      const pathOf = (taxonomy: string, slug: string) =>
        taxonomy === 'category' || taxonomy === 'tag'
          ? archivePath(bases, taxonomy, slug)
          : `/taxonomy/${encodeURIComponent(taxonomy)}/${encodeURIComponent(slug)}`;
      items = terms
        .filter((term) => {
          if (
            (kind === 'taxonomy'
              ? ['category', 'tag'].includes(term.taxonomy)
              : term.taxonomy !== kind) ||
            term.seo.noIndex ||
            (term.seo.canonicalUrl &&
              term.seo.canonicalUrl !==
                `${siteUrl}${pathOf(term.taxonomy, term.slug)}`)
          )
            return false;
          const ids =
            kind === 'category' || kind === 'taxonomy'
              ? withDescendants(terms, term.id)
              : [term.id];
          return published.some((row) =>
            (kind === 'category'
              ? row.categoryIds
              : kind === 'tag'
                ? row.tagIds
                : (row.extraTermIds ?? [])
            ).some((id) => ids.includes(id)),
          );
        })
        .map((term) => ({
          path: pathOf(term.taxonomy, term.slug),
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
