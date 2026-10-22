import { visitorHeaders } from '#sdk/clients/security';
import type { Visitor } from '#sdk/clients/security';
import {
  adminCommentSchema,
  commentCountsSchema,
  commentSubmittedSchema,
  discussionSettingsSchema,
  publicCommentPageSchema,
} from '#sdk/comments';
import type {
  AdminComment,
  CommentBulkInput,
  CommentCounts,
  CommentInput,
  CommentListQuery,
  CommentSubmitted,
  CommentUpdate,
  DiscussionSettings,
  DiscussionSettingsInput,
  PublicCommentPage,
} from '#sdk/comments';
import type { Paginated } from '#sdk/common';
import { pageSchema } from '#sdk/transport';
import type { Query, Request } from '#sdk/transport';

export const publicCommentsClient = (request: Request) => ({
  comments: {
    list: (contentId: string, page = 1) =>
      request<PublicCommentPage>('GET', '/api/v1/comments', {
        query: { contentId, page },
        response: publicCommentPageSchema,
      }),
    /** `visitor` lets the API count submissions per visitor and accept a solved captcha. */
    submit: (input: CommentInput, visitor?: Visitor) =>
      request<CommentSubmitted>('POST', '/api/v1/comments', {
        json: input,
        response: commentSubmittedSchema,
        headers: visitorHeaders(visitor),
      }),
  },
});

/** Moderation needs `comments.moderate`; discussion settings `settings.manage`. */
export const commentsAdminClient = (request: Request) => {
  const path = (id: string) =>
    `/api/v1/admin/comments/${encodeURIComponent(id)}`;
  return {
    comments: {
      list: (query: CommentListQuery = {}) =>
        request<Paginated<AdminComment>>('GET', '/api/v1/admin/comments', {
          query: query as Query,
          response: pageSchema(adminCommentSchema),
        }),
      counts: () =>
        request<CommentCounts>('GET', '/api/v1/admin/comments/counts', {
          response: commentCountsSchema,
        }),
      update: (id: string, input: CommentUpdate) =>
        request<void>('PUT', path(id), { json: input }),
      reply: (id: string, body: string) =>
        request<void>('POST', `${path(id)}/reply`, { json: { body } }),
      bulk: (input: CommentBulkInput) =>
        request<void>('POST', '/api/v1/admin/comments/bulk', { json: input }),
      remove: (id: string) => request<void>('DELETE', path(id)),
    },
    discussion: {
      get: () =>
        request<DiscussionSettings>('GET', '/api/v1/admin/discussion', {
          response: discussionSettingsSchema,
        }),
      update: (input: DiscussionSettingsInput) =>
        request<DiscussionSettings>('PUT', '/api/v1/admin/discussion', {
          json: input,
          response: discussionSettingsSchema,
        }),
    },
  };
};
