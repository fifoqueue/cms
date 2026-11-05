import { Errors } from '#api/shared/errors';
import type { Scheduler } from '#api/domain/jobs/scheduler';
import type { WritingService } from '#api/domain/site/writing-service';
import type { SiteService } from '#api/domain/site/site-service';
import type { FunctionsHost } from '#api/functions-runtime/functions-host';
import type { SignInSettingsService } from '#api/domain/auth/sign-in-settings';
import type { MediaService } from '#api/domain/media/media-service';
import type { CommentService } from '#api/domain/comments/comment-service';
import type { ContentService } from '#api/domain/content/content-service';
import type { SsoEndSession } from '#api/domain/auth/sso-end-session';

export interface Late<T> {
  get(): T;
  set(value: T): void;
}

export const createLate = <T>(): Late<T> => {
  let current: T | undefined;

  return {
    get: () => {
      if (current === undefined) throw new Error(Errors.InvalidInput);

      return current;
    },
    set: (value) => {
      current = value;
    },
  };
};

export const createLatePorts = () => {
  const scheduler = createLate<Pick<Scheduler, 'runNow'>>();
  const writing = createLate<Pick<WritingService, 'get'>>();
  const site = createLate<Pick<SiteService, 'get'>>();
  const functions = createLate<Pick<FunctionsHost, 'reconcile'>>();
  const signIn =
    createLate<Pick<SignInSettingsService, 'effective' | 'otherUsable'>>();
  const media = createLate<Pick<MediaService, 'finalizeDeletion'>>();
  const comments =
    createLate<Pick<CommentService, 'avatar' | 'discussion' | 'remove'>>();
  const content = createLate<Pick<ContentService, 'remove'>>();
  const types = createLate<() => Promise<string[]>>();
  const endSession = createLate<Pick<SsoEndSession, 'url'>>();

  return {
    scheduler,
    writing,
    site,
    functions,
    signIn,
    media,
    comments,
    content,
    types,
    endSession,
    repositories: {
      regeneratePermalinks: () =>
        void scheduler.get().runNow('core:permalink-regeneration'),
      activeContentTypes: () => types.get()(),
      cleanup: {
        content: (
          id: Parameters<ContentService['remove']>[0],
          actor: Parameters<ContentService['remove']>[1],
        ) => content.get().remove(id, actor, true),
        comment: (
          id: Parameters<CommentService['remove']>[0],
          status: Parameters<CommentService['remove']>[2],
          actor: Parameters<CommentService['remove']>[1],
        ) => comments.get().remove(id, actor, status),
      },
    },
    reading: {
      writing: () => writing.get().get(),
      site: () => site.get().get(),
    },
    reconcileFunctions: () => functions.get().reconcile(),
    users: {
      endSession: {
        url: (binding: Parameters<SsoEndSession['url']>[0]) =>
          endSession.get().url(binding),
      },
      passwordLogin: async () =>
        (await signIn.get().effective()).methods.includes('password'),
      avatar: (key: Parameters<CommentService['avatar']>[0]) =>
        comments.get().avatar(key),
    },
    finalize: async (id: Parameters<MediaService['finalizeDeletion']>[0]) => {
      await media.get().finalizeDeletion(id);
    },
    discussion: () => comments.get().discussion(),
    otherMethod: (...args: Parameters<SignInSettingsService['otherUsable']>) =>
      signIn.get().otherUsable(...args),
  };
};
