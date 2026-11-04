import type { DiscussionSettings } from '@cms/sdk';
import type { createRepositories } from '#api/composition/repositories';
import type { createRegistries } from '#api/composition/registries';
import type { createContent } from '#api/composition/content';
import type { createSite } from '#api/composition/site';
import type { createSecurity } from '#api/composition/security';
import type { createUsers } from '#api/composition/users';
import type { createJobs } from '#api/composition/jobs';
import type { createEmail } from '#api/composition/email';
import type { Logger } from '#api/shared/logger';
import { CommentService } from '#api/domain/comments/comment-service';
import {
  COMMENT_MAIL_JOB,
  COMMENT_NOTICE_JOB,
  COMMENT_PUSH_JOB,
  COMMENT_SUMMARY_JOB,
  CommentNotifier,
} from '#api/domain/comments/comment-notifier';
import { VapidKeys } from '#api/domain/comments/vapid-keys';
import { WidgetService } from '#api/domain/appearance/widget-service';
import { createWebPushSender, generateVapidKeys } from '#api/infra/web-push';
import { outbound } from '#api/infra/egress-policy';
import { systemClock, uuidV7 } from '#api/infra/system';

type Jobs = ReturnType<typeof createJobs>;
type Input = Pick<
  Awaited<ReturnType<typeof createRepositories>>,
  | 'commentRepository'
  | 'noticeState'
  | 'subscriptions'
  | 'noticeOutbox'
  | 'vapidTransactions'
  | 'rateLimits'
  | 'directory'
  | 'settingsRepository'
  | 'taxonomyRepository'
> &
  Pick<
    ReturnType<typeof createRegistries>,
    'hooks' | 'commentCheckers' | 'widgetRegistry'
  > &
  Pick<
    ReturnType<typeof createContent>,
    'locks' | 'contentTypes' | 'publishedRepository' | 'fields'
  > &
  Pick<ReturnType<typeof createSite>, 'seo' | 'site' | 'menus'> &
  Pick<ReturnType<typeof createSecurity>, 'avatars' | 'protection'> &
  Pick<ReturnType<typeof createUsers>, 'roles'> &
  Pick<Jobs, 'sealedJobs' | 'jobs' | 'scheduler'> & {
    secrets: ConstructorParameters<typeof VapidKeys>[0]['secrets'];
    signer: ConstructorParameters<typeof CommentService>[0]['signer'];
    email: Awaited<ReturnType<typeof createEmail>>['email'];
    logger: Logger;
    discussion: () => Promise<DiscussionSettings>;
  };

export const createComments = ({
  commentRepository,
  noticeState,
  subscriptions,
  noticeOutbox,
  vapidTransactions,
  rateLimits,
  directory,
  settingsRepository,
  taxonomyRepository,
  hooks,
  commentCheckers,
  widgetRegistry,
  locks,
  contentTypes,
  publishedRepository,
  fields,
  seo,
  site,
  menus,
  avatars,
  protection,
  roles,
  sealedJobs,
  jobs,
  scheduler,
  secrets,
  signer,
  email,
  logger,
  discussion,
}: Input) => {
  const commentSite = async () => {
    const [{ siteUrl }, settings, publicSite] = await Promise.all([
      seo.getPublic(),
      site.get(),
      site.getPublic(),
    ]);
    return { siteUrl, ...settings, icon: publicSite.icon?.url ?? null };
  };
  const commentNotifier = new CommentNotifier({
    comments: commentRepository,
    state: noticeState,
    subscriptions,
    outbox: noticeOutbox,
    keys: new VapidKeys({
      transactions: vapidTransactions,
      secrets,
      generate: generateVapidKeys,
    }),
    // Visitor-supplied endpoints stay public-only, with pinned DNS and no followed redirects.
    sender: createWebPushSender((input, init) => outbound.fetch(input, init)),
    email,
    jobs: sealedJobs,
    logger,
    limits: rateLimits,
    hooks,
    signer,
    users: directory,
    roles,
    site: commentSite,
    discussion,
    ids: uuidV7,
    clock: systemClock,
  });
  jobs.handle(COMMENT_NOTICE_JOB, (payload) =>
    commentNotifier.deliverNotice(payload),
  );
  jobs.handle(COMMENT_MAIL_JOB, (payload) =>
    commentNotifier.deliverMail(payload),
  );
  jobs.handle(COMMENT_PUSH_JOB, (payload) =>
    commentNotifier.deliverPush(payload),
  );
  jobs.handle(COMMENT_SUMMARY_JOB, (payload) =>
    commentNotifier.deliverSummary(payload),
  );
  scheduler.add({
    name: 'comments.push-validate',
    intervalMs: 24 * 60 * 60 * 1000,
    run: () => commentNotifier.validate(),
  });
  const comments = new CommentService({
    notifier: commentNotifier,
    checkers: commentCheckers,
    locks,
    signer,
    avatar: avatars,
    roles,
    repository: commentRepository,
    settings: settingsRepository,
    types: contentTypes,
    fields,
    protection,
    hooks,
    email,
    users: directory,
    site: commentSite,
    ids: uuidV7,
    clock: systemClock,
  });
  const schedulePurge = () =>
    scheduler.add({
      name: 'comments.purge',
      intervalMs: 6 * 60 * 60 * 1000,
      run: () => comments.purge(),
    });
  const widgets = new WidgetService({
    hooks,
    settings: settingsRepository,
    published: publishedRepository,
    terms: taxonomyRepository,
    menus,
    comments,
    plugins: widgetRegistry,
  });
  return { comments, commentNotifier, widgets, schedulePurge };
};
