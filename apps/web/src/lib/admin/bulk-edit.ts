import type { ContentStatus } from '@cms/sdk';

/** Statuses Bulk Edit offers (scheduling needs a date per entry, so it is not one of them). */
export const BULK_STATUSES = [
  'published',
  'private',
  'pending',
  'draft',
] as const satisfies readonly ContentStatus[];
