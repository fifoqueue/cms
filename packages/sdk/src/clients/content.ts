import { z } from 'zod';
import {
  CONTENT_UNLOCK_HEADER,
  contentRevisionSchema,
  contentRevisionSummarySchema,
  contentUnlockedSchema,
  previewTokenSchema,
  publicAdjacentSchema,
  publicAuthorSchema,
  publicContentSchema,
  publicMonthNeighboursSchema,
  publicMonthSchema,
  publicRecentCommentSchema,
} from '#sdk/content';
import type {
  AutosaveInput,
  ContentEntry,
  ContentRevision,
  ContentRevisionSummary,
  ContentUnlocked,
  PreviewToken,
  PublicAdjacent,
  PublicAuthor,
  PublicContent,
  PublicMonth,
  PublicMonthNeighbours,
  PublicRecentComment,
} from '#sdk/content';
import { adminContentSchema } from '#sdk/content';
import type { Request } from '#sdk/transport';
import { visitorHeaders } from '#sdk/clients/security';
import type { Visitor } from '#sdk/clients/security';

/** Headers carrying a visitor's unlock proofs (`<id>.<token>`). */
export const unlockHeaders = (proofs: readonly string[] = []) =>
  proofs.length
    ? { [CONTENT_UNLOCK_HEADER]: proofs.slice(0, 20).join(',') }
    : undefined;

/** Public reads beyond listing: protected entries, previews and author archives. */
export const publicEntriesClient = (request: Request) => ({
  /** Checks a protected entry's password; keep the proof in a cookie. */
  unlock: (id: string, password: string, visitor?: Visitor) =>
    request<ContentUnlocked>(
      'POST',
      `/api/v1/unlock/${encodeURIComponent(id)}`,
      {
        json: { password },
        headers: visitorHeaders(visitor),
        response: contentUnlockedSchema,
      },
    ),
  preview: (token: string) =>
    request<PublicContent>(
      'GET',
      `/api/v1/preview/${encodeURIComponent(token)}`,
      { response: publicContentSchema },
    ),
  author: (slug: string) =>
    request<PublicAuthor>(
      'GET',
      `/api/v1/authors/${encodeURIComponent(slug)}`,
      {
        response: publicAuthorSchema,
      },
    ),
  /** The previous (older) and next (newer) published entry of the same type. */
  adjacent: (contentId: string) =>
    request<PublicAdjacent>('GET', '/api/v1/adjacent', {
      query: { contentId },
      response: publicAdjacentSchema,
    }),
  /** Newest approved comments on public, unprotected entries. */
  recentComments: (limit = 5) =>
    request<PublicRecentComment[]>('GET', '/api/v1/comments/recent', {
      query: { limit },
      response: z.array(publicRecentCommentSchema),
    }),
  /** The nearest months with published posts before and after one month. */
  monthNeighbours: (year: number, month: number) =>
    request<PublicMonthNeighbours>('GET', '/api/v1/month-neighbours', {
      query: { year, month },
      response: publicMonthNeighboursSchema,
    }),
  /** Months with published posts, newest first. */
  months: (limit = 12) =>
    request<PublicMonth[]>('GET', '/api/v1/months', {
      query: { limit },
      response: z.array(publicMonthSchema),
    }),
});

/** Editing workflow of one entry: trash, revisions, autosave and previews. */
export const contentWorkflowClient = (request: Request) => {
  const path = (id: string) =>
    `/api/v1/admin/content/${encodeURIComponent(id)}`;
  return {
    trash: (id: string) => request<void>('POST', `${path(id)}/trash`),
    restore: (id: string) => request<void>('POST', `${path(id)}/restore`),
    revisions: (id: string) =>
      request<ContentRevisionSummary[]>('GET', `${path(id)}/revisions`, {
        response: z.array(contentRevisionSummarySchema),
      }),
    revision: (id: string, revisionId: string) =>
      request<ContentRevision>(
        'GET',
        `${path(id)}/revisions/${encodeURIComponent(revisionId)}`,
        { response: contentRevisionSchema },
      ),
    restoreRevision: (id: string, revisionId: string) =>
      request<ContentEntry>(
        'POST',
        `${path(id)}/revisions/${encodeURIComponent(revisionId)}/restore`,
        { response: adminContentSchema },
      ),
    /** The user's autosave when newer than the saved entry, else null. */
    // 204 (nothing pending) arrives as a null payload.
    pendingAutosave: (id: string) =>
      request<ContentRevision | null>('GET', `${path(id)}/autosave`, {
        response: contentRevisionSchema.nullable(),
      }),
    autosave: (id: string, input: AutosaveInput) =>
      request<void>('PUT', `${path(id)}/autosave`, { json: input }),
    preview: (id: string) =>
      request<PreviewToken>('POST', `${path(id)}/preview`, {
        response: previewTokenSchema,
      }),
  };
};
