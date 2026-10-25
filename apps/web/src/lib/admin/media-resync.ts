import type { MediaResync } from '@cms/sdk';
import { catalogMessage } from '#lib/admin/form-errors.js';
import type { Messages } from '#lib/i18n/index.js';

/** How often the media library checks on a resync that is still waiting or running. */
export const RESYNC_POLL_MS = 3000;

/** Whether the job is still waiting or running, so the screen keeps checking on it. */
export const resyncActive = (job: MediaResync | null | undefined) =>
  job?.status === 'queued' || job?.status === 'running';

export interface ResyncSummary {
  tone: 'progress' | 'done' | 'failed';
  title: string;
  /** Object counts of a finished resync. */
  counts: { label: string; value: number }[];
  /** The API's reason for a failure: catalog text, else the API's own text for English readers. */
  detail?: string;
  /** Files the resync could not clean up, which the admin should check. */
  attention?: string;
}

/** The note on files a finished resync could not clean up, when there are any. */
const attention = (m: Messages, job: MediaResync) =>
  job.cleanupNeedsAttention > 0
    ? { attention: m.mediaResyncCleanupAttention(job.cleanupNeedsAttention) }
    : {};

/** The latest resync as the media library shows it; `when` formats its timestamps. */
export const resyncSummary = (
  m: Messages,
  language: string,
  job: MediaResync | null | undefined,
  when: (iso: string) => string,
): ResyncSummary | null => {
  if (!job) return null;
  const finished = when(job.finishedAt ?? job.startedAt);
  switch (job.status) {
    case 'queued':
      return { tone: 'progress', title: m.mediaResyncQueued, counts: [] };
    case 'running':
      return { tone: 'progress', title: m.mediaResyncRunning, counts: [] };
    case 'completed':
      return {
        tone: 'done',
        title: m.mediaResyncCompleted(finished),
        counts: [
          { label: m.mediaResyncScanned, value: job.scanned },
          { label: m.mediaResyncRefreshed, value: job.refreshed },
          { label: m.mediaResyncMissing, value: job.missing },
          { label: m.mediaResyncUntracked, value: job.untracked },
        ],
        ...attention(m, job),
      };
    case 'failed':
      return {
        tone: 'failed',
        title: m.mediaResyncFailed(finished),
        counts: [],
        detail: job.error
          ? (catalogMessage(m, job.error) ??
            (language === 'en' ? job.error : undefined))
          : undefined,
        ...attention(m, job),
      };
  }
};
