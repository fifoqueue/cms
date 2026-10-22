import type { SearchDocument, SearchSource } from '#api/domain/search/ports';
import type { Database } from '#api/infra/prisma/client';
import { PUBLIC_CONTENT } from '#api/infra/prisma/content-criteria';
import type { Prisma } from '#api/infra/prisma/generated/client';

/** Index text stays well below Meilisearch's document limits. */
const MAX_TEXT = 200_000;

const columns = {
  id: true,
  type: true,
  title: true,
  excerpt: true,
  searchText: true,
  publishedAt: true,
  updatedAt: true,
  sticky: true,
  passwordHash: true,
  terms: { select: { term: { select: { id: true, taxonomy: true } } } },
} as const satisfies Prisma.ContentSelect;

type Row = Prisma.ContentGetPayload<{ select: typeof columns }>;

export class PrismaSearchSource implements SearchSource {
  constructor(private readonly db: Database) {}

  async pending(limit: number) {
    const rows = await this.db.searchOutbox.findMany({
      orderBy: { id: 'asc' },
      take: limit,
    });
    return rows.map((row) => ({
      id: Number(row.id),
      contentId: row.contentId,
    }));
  }

  countPending() {
    return this.db.searchOutbox.count();
  }

  async lastId() {
    const row = await this.db.searchOutbox.findFirst({
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    return row ? Number(row.id) : 0;
  }

  async acknowledge(id: number) {
    await this.db.searchOutbox.deleteMany({
      where: { id: { lte: BigInt(id) } },
    });
  }

  async requestRebuild() {
    await this.db.searchOutbox.create({ data: { contentId: null } });
  }

  async documents(ids: readonly string[]) {
    if (!ids.length) return [];
    return this.toDocuments(
      await this.db.content.findMany({
        where: { id: { in: [...ids] }, ...PUBLIC_CONTENT },
        select: columns,
      }),
    );
  }

  async page(afterId: string | null, limit: number) {
    return this.toDocuments(
      await this.db.content.findMany({
        where: { ...PUBLIC_CONTENT, ...(afterId && { id: { gt: afterId } }) },
        select: columns,
        orderBy: { id: 'asc' },
        take: limit,
      }),
    );
  }

  /** Categories carry their ancestors' slugs, so filtering by a category matches its subtree. */
  private async toDocuments(rows: Row[]): Promise<SearchDocument[]> {
    if (!rows.length) return [];
    const terms = await this.db.taxonomyTerm.findMany({
      select: { id: true, slug: true, parentId: true, taxonomy: true },
    });
    const byId = new Map(terms.map((term) => [term.id, term]));
    const withAncestors = (id: string) => {
      const slugs = new Set<string>();
      for (
        let term = byId.get(id);
        term && !slugs.has(term.slug);
        term = term.parentId ? byId.get(term.parentId) : undefined
      )
        slugs.add(term.slug);
      return [...slugs];
    };
    return rows.map((row) => {
      const locked = row.passwordHash !== null;
      const assigned = row.terms.map(({ term }) => term);
      return {
        id: row.id,
        type: row.type,
        title: row.title,
        excerpt: locked ? '' : row.excerpt,
        text: row.searchText.slice(0, MAX_TEXT),
        categories: [
          ...new Set(
            assigned
              .filter((term) => term.taxonomy === 'category')
              .flatMap((term) => withAncestors(term.id)),
          ),
        ],
        tags: assigned
          .filter((term) => term.taxonomy === 'tag')
          .map((term) => byId.get(term.id)?.slug ?? '')
          .filter(Boolean),
        publishedAt: Math.floor(
          (row.publishedAt ?? row.updatedAt).getTime() / 1000,
        ),
        sticky: row.sticky,
      };
    });
  }
}
