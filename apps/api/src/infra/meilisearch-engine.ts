import { Meilisearch } from 'meilisearch';
import type { EnqueuedTaskPromise } from 'meilisearch';
import type {
  SearchConnection,
  SearchDocument,
  SearchEngine,
  SearchQuery,
} from '#api/domain/search/ports';
import { publicFetch } from '#api/infra/egress-policy';
import { Errors } from '#api/shared/errors';

const TASK_TIMEOUT_MS = 120_000;

const SETTINGS = {
  searchableAttributes: ['title', 'excerpt', 'text'],
  filterableAttributes: ['type', 'categories', 'tags', 'publishedAt', 'sticky'],
  sortableAttributes: ['publishedAt'],
  // Totals stay exact for the page counts the site shows.
  pagination: { maxTotalHits: 10_000 },
};

type HttpFetch = typeof publicFetch;

const requestWith =
  (fetcher: HttpFetch) =>
  async (...args: Parameters<HttpFetch>) => {
    const response = await fetcher(...args);
    const text = await response.text();
    if (!response.ok)
      throw new Error(Errors.SearchRequestFailed, {
        cause: response.status,
      });
    return text ? (JSON.parse(text) as unknown) : undefined;
  };

const client = (
  { host, apiKey }: SearchConnection,
  request: ReturnType<typeof requestWith>,
) =>
  new Meilisearch({
    host,
    apiKey: apiKey || undefined,
    timeout: 10_000,
    httpClient: request,
  });

/** Waits for the task; a failed or canceled task throws. */
const done = async (
  task: EnqueuedTaskPromise,
  allow: readonly string[] = [],
) => {
  const result = await task.waitTask({ timeout: TASK_TIMEOUT_MS });
  if (
    result.status !== 'succeeded' &&
    !allow.includes(result.error?.code ?? '')
  )
    throw new Error(Errors.SearchTaskFailed, {
      cause: result.error?.message ?? result.status,
    });
};

/** A Meilisearch filter string value, quoted. */
const quote = (value: string) => `"${value.replace(/["\\]/g, '\\$&')}"`;

const filters = ({
  types,
  category,
  tag,
  year,
  month,
  sticky,
}: SearchQuery) => {
  const parts: string[] = [];
  if (types) parts.push(`type IN [${types.map(quote).join(', ')}]`);
  if (category) parts.push(`categories = ${quote(category)}`);
  if (tag) parts.push(`tags = ${quote(tag)}`);
  if (sticky) parts.push(`sticky = ${sticky === 'only'}`);
  if (year) {
    const from = Date.UTC(year, month ? month - 1 : 0, 1) / 1000;
    const to = Date.UTC(month ? year : year + 1, month ?? 0, 1) / 1000;
    parts.push(`publishedAt >= ${from} AND publishedAt < ${to}`);
  }
  return parts;
};

export const createMeilisearchEngine = (
  fetcher: HttpFetch = publicFetch,
): SearchEngine => {
  const request = requestWith(fetcher);
  const connect = (connection: SearchConnection) => client(connection, request);

  return {
    async version(connection) {
      return (await connect(connection).getVersion()).pkgVersion;
    },

    async rebuild(connection, batches) {
      const meili = connect(connection);
      const next = `${connection.index}_next`;
      await done(meili.deleteIndex(next), ['index_not_found']);
      await done(meili.createIndex(next, { primaryKey: 'id' }));
      await done(meili.index(next).updateSettings(SETTINGS));
      for await (const documents of batches)
        await done(meili.index(next).addDocuments(documents));
      // Swapping needs both indexes; the first build starts from an empty one.
      await done(meili.createIndex(connection.index, { primaryKey: 'id' }), [
        'index_already_exists',
      ]);
      await done(
        meili.swapIndexes([
          { indexes: [connection.index, next], rename: false },
        ]),
      );
      await done(meili.deleteIndex(next), ['index_not_found']);
    },

    async upsert(connection, documents) {
      await done(
        connect(connection)
          .index(connection.index)
          .addDocuments([...documents] as SearchDocument[]),
      );
    },

    async remove(connection, ids) {
      await done(
        connect(connection)
          .index(connection.index)
          .deleteDocuments([...ids]),
      );
    },

    async search(connection, query) {
      const result = await connect(connection)
        .index(connection.index)
        .search(query.text, {
          filter: filters(query),
          page: query.page,
          hitsPerPage: query.pageSize,
          attributesToRetrieve: ['id'],
        });
      return {
        ids: result.hits.map((hit) => String(hit.id)),
        total: result.totalHits ?? 0,
      };
    },

    async count(connection) {
      return (await connect(connection).index(connection.index).getStats())
        .numberOfDocuments;
    },
  };
};
