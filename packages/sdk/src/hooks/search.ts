import { z } from 'zod';
import { PAGINATION_MAX_PAGE } from '#sdk/common';

export const searchHookQuerySchema = z.object({
  text: z.string().max(10000),
  types: z.array(z.string()).readonly().optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  year: z.number().int().optional(),
  month: z.number().int().min(1).max(12).optional(),
  sticky: z.enum(['only', 'exclude']).optional(),
  page: z.number().int().min(1).max(PAGINATION_MAX_PAGE),
  pageSize: z.number().int().min(1).max(100),
});
export const searchHookResultsSchema = z.object({
  ids: z.array(z.string()),
  total: z.number().int().nonnegative(),
});
export const searchHookDocumentSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  excerpt: z.string(),
  text: z.string(),
  categories: z.array(z.string()),
  tags: z.array(z.string()),
  publishedAt: z.number().finite(),
  sticky: z.boolean(),
});

export interface SearchFilterHooks {
  'search.query': z.output<typeof searchHookQuerySchema>;
  'search.results': z.output<typeof searchHookResultsSchema>;
  'search.document': z.output<typeof searchHookDocumentSchema>;
}

export interface SearchActionHooks {
  /** Null IDs means the complete index was rebuilt. No connection secrets are exposed. */
  'search.indexed': {
    operation: 'rebuild' | 'update';
    contentIds: string[] | null;
  };
}
