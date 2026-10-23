import type { PatternSummary } from '@cms/sdk';

export interface PatternCriteria {
  page: number;
  pageSize: number;
  search?: string;
  /** Omitted only for actors allowed to read others' drafts. */
  authorId?: string;
}

/** Projects metadata in storage, before documents or HTML are read into application memory. */
export interface PatternCatalog {
  summaries(criteria: PatternCriteria): Promise<{
    items: PatternSummary[];
    total: number;
  }>;
}
