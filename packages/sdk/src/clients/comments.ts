import { unlockHeaders } from '#sdk/clients/content';
import { visitorHeaders } from '#sdk/clients/security';
import type { ClientProof, Visitor } from '#sdk/clients/security';
import {
  COMMENTER_PROOF_HEADER,
  commentFeedSchema,
  COMMENT_PENDING_HEADER,
  adminCommentSchema,
  commentCountsSchema,
  commentSubmittedSchema,
  discussionSettingsSchema,
  publicCommentPageSchema,
  commentUnsubscribedSchema,
  pushAcceptedSchema,
  pushKeySchema,
} from '#sdk/comments';
import type {
  CommentUnsubscribed,
  PushRenewInput,
  PushSubscriptionInput,
  FeedComment,
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
    feed: (contentId?: string, limit = 20) =>
      request<FeedComment[]>('GET', '/api/v1/comments/feed', {
        query: { contentId, limit },
        response: commentFeedSchema.array(),
      }),
    list: (
      contentId: string,
      page = 1,
      proofs: readonly string[] = [],
      pendingProof?: string,
    ) =>
      request<PublicCommentPage>('GET', '/api/v1/comments', {
        query: { contentId, page },
        headers: {
          ...unlockHeaders(proofs),
          ...(pendingProof && { [COMMENT_PENDING_HEADER]: pendingProof }),
        },
        response: publicCommentPageSchema,
      }),
    /** `visitor` lets the API count submissions per visitor and accept a solved captcha. */
    submit: (
      input: CommentInput,
      visitor?: Visitor,
      proofs: readonly string[] = [],
      commenterProof?: string,
    ) =>
      request<CommentSubmitted>('POST', '/api/v1/comments', {
        json: input,
        response: commentSubmittedSchema,
        headers: {
          ...visitorHeaders(visitor),
          ...unlockHeaders(proofs),
          ...(commenterProof && {
            [COMMENTER_PROOF_HEADER]: commenterProof,
          }),
        },
      }),
    /** `token` is `pushToken` from `submit`; push replies to that comment to this browser. */
    subscribePush: (
      token: string,
      subscription: PushSubscriptionInput,
      visitor?: Visitor,
    ) =>
      request<{ ok: true }>('POST', '/api/v1/comments/push', {
        json: { token, subscription },
        headers: visitorHeaders(visitor),
        response: pushAcceptedSchema,
      }),
    /** Stops the notifications an unsubscribe link (email footer) names. */
    unsubscribe: (token: string, visitor?: Visitor) =>
      request<CommentUnsubscribed>('POST', '/api/v1/comments/unsubscribe', {
        json: { token },
        headers: visitorHeaders(visitor),
        response: commentUnsubscribedSchema,
      }),
  },
  push: {
    /**
     * Moves every active registration of `old` (its endpoint and `keys.auth`, proving possession)
     * to `subscription`; also a re-sync. Unknown or mismatched ones answer the same and change nothing.
     */
    renew: (
      old: PushRenewInput['old'],
      subscription: PushSubscriptionInput,
      visitor?: Visitor,
    ) =>
      request<{ ok: true }>('POST', '/api/v1/push/renew', {
        json: { old, subscription },
        headers: visitorHeaders(visitor),
        response: pushAcceptedSchema,
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
      /** `proof` lets the API store the moderator's proven address and user agent. */
      reply: (id: string, body: string, proof?: ClientProof) =>
        request<void>('POST', `${path(id)}/reply`, {
          json: { body },
          headers: visitorHeaders({ proof }),
        }),
      bulk: (input: CommentBulkInput) =>
        request<void>('POST', '/api/v1/admin/comments/bulk', { json: input }),
      remove: (id: string) => request<void>('DELETE', path(id)),
    },
    /** The signed-in user's browsers for new-comment and reply pushes (`content.create`). */
    pushSubscription: {
      /** The VAPID application server key for `pushManager.subscribe`; null while push is off. */
      key: () =>
        request<{ publicKey: string | null }>(
          'GET',
          '/api/v1/admin/push-subscription',
          { response: pushKeySchema },
        ),
      save: (subscription: PushSubscriptionInput) =>
        request<{ ok: true }>('PUT', '/api/v1/admin/push-subscription', {
          json: { subscription },
          response: pushAcceptedSchema,
        }),
      remove: (endpoint: string) =>
        request<void>('DELETE', '/api/v1/admin/push-subscription', {
          json: { endpoint },
        }),
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
