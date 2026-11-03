import type { ArchiveBases } from '#sdk/archive-paths';

/** Archive slugs occupy one encoded segment beneath their configured base. */
export const archivePath = (
  bases: ArchiveBases,
  taxonomy: 'category' | 'tag',
  slug: string,
) => `${bases[taxonomy]}/${encodeURIComponent(slug)}`;
