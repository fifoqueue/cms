import { z } from 'zod';
import type { Awaitable } from '#sdk/common';
import type { Unsubscribe } from '#sdk/plugin';
import { seoSitemapEntrySchema } from '#sdk/seo';
import type {
  searchHookQuerySchema,
  searchHookResultsSchema,
} from '#sdk/hooks/search';

export const providerKeySchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export const sitemapPageSchema = z.object({
  items: z.array(seoSitemapEntrySchema).max(1000),
  total: z.number().int().nonnegative(),
});
export interface SitemapRequest {
  page: number;
  pageSize: number;
  siteUrl: string;
}
export type SitemapPage = z.output<typeof sitemapPageSchema>;
export type SitemapProvider = (query: SitemapRequest) => Awaitable<SitemapPage>;
export interface SitemapRegistrar {
  register(key: string, provider: SitemapProvider): Unsubscribe;
}
export type SearchRequest = z.output<typeof searchHookQuerySchema>;
export type SearchHits = z.output<typeof searchHookResultsSchema>;
/** Null declines a query; exceptions, invalid results and timeouts try the next engine. */
export type SearchProvider = (
  query: SearchRequest,
) => Awaitable<SearchHits | null>;
export interface SearchEngineRegistrar {
  register(key: string, engine: SearchProvider): Unsubscribe;
}
