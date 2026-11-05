export interface SeoDiscoveryCriteria {
  sort?: 'stable' | 'modified' | 'popular';
  kind: 'content' | 'category' | 'tag' | 'author' | 'taxonomy' | 'archive';
  archiveTypes?: readonly {
    key: string;
    pluralName: string;
    description: string;
  }[];
  page: number;
  pageSize: number;
  /** Normalized public origin, used to recognize an explicit self-canonical URL. */
  siteUrl: string;
}

/** Narrow projection: never editor documents, HTML, author IDs or private SEO. */
export interface SeoDiscoveryRecord {
  path: string;
  title: string;
  description: string;
  updatedAt: Date;
  images?: { url: string; title?: string; caption?: string }[];
}

export interface SeoDiscoveryRepository {
  /**
   * Published content, excluding noIndex and canonicals pointing elsewhere. Archives must themselves
   * be indexable and contain published content (including category descendants).
   * Filter before stable pagination: content in UUIDv7 id order (time-ordered, append-only inserts),
   * archives in path order. Total uses exactly the same criteria.
   */
  list(criteria: SeoDiscoveryCriteria): Promise<{
    items: SeoDiscoveryRecord[];
    total: number;
  }>;
}
