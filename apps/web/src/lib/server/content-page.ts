import type { RequestEvent } from '@sveltejs/kit';
import type { PublicContent, PublicContentType, SlotMap } from '@cms/sdk';
import type { ContentClient } from '@cms/sdk/client';
import { allowCaptcha } from '#lib/server/captcha.js';
import { commentAction, loadComments } from '#lib/server/comments.js';
import { moderateCommentAction } from '#lib/server/comment-moderation.js';
import { unlockAction } from '#lib/server/unlock.js';
import { error } from '@sveltejs/kit';
import { PAGE_BREAK_HTML } from '@cms/content/breaks';
import { Errors } from '#lib/server/errors.js';
import { contentView, pageParam } from '#lib/server/public-view.js';
import type { BlockData } from '#lib/server/theme-queries.js';
import type { ThemePage } from '#lib/theme/template.js';
import { withSeoMeta } from '#lib/server/page-meta.js';
import type { HeadLayout } from '#lib/server/page-meta.js';

/** Form actions of every page that can show an entry: unlocking, commenting, moderating. */
export const entryActions = {
  unlock: unlockAction,
  comment: commentAction,
  moderateComment: moderateCommentAction,
};

/**
 * Page data of a single entry with its comments and the data of its template's blocks
 * (`templateData`). `path` replaces the permalink when the entry is shown at another address
 * (the static front page lives at `/`, its canonical URL then).
 */
export const entryPage = async (
  api: ContentClient,
  event: Pick<
    RequestEvent,
    | 'url'
    | 'cookies'
    | 'fetch'
    | 'request'
    | 'setHeaders'
    | 'locals'
    | 'getClientAddress'
  > & { parent: () => Promise<HeadLayout> },
  content: PublicContent,
  types: Promise<PublicContentType[]>,
  slots: Promise<SlotMap>,
  templateData: (page: ThemePage) => Promise<BlockData>,
  path = content.path,
) => {
  // `?page=N` shows the N-th part of an entry split by page breaks; each part is its own page.
  const parts = content.html.split(PAGE_BREAK_HTML);
  const current = pageParam(event.url);
  if (current > parts.length) error(404, Errors.NotFound);
  const view = {
    ...contentView(content),
    path,
    html: parts[current - 1]!,
    pages: { current, total: parts.length },
  };
  const captcha = api.captcha().catch(() => null);
  const page = { kind: 'content' as const, content: view };
  const [definitions, comments, unlockCaptcha, blocks, loadedSlots, meta] =
    await Promise.all([
      types,
      content.protected ? null : loadComments(api, content.id, event, captcha),
      content.protected ? captcha : null,
      templateData(page),
      slots,
      withSeoMeta(event, () => event.parent(), page),
    ]);
  // The comment form or the unlock form may render the captcha widget.
  allowCaptcha(event, comments?.captcha ?? unlockCaptcha);
  return {
    kind: 'content' as const,
    content: view,
    /** Labels of the entry's public fields, in their defined order. */
    fieldLabels: (
      definitions.find((type) => type.key === content.type)?.fields ?? []
    ).map(({ key, label, type }) => ({ key, label, type })),
    comments,
    unlockCaptcha,
    /** Set after a held comment was sent. */
    moderation: event.url.searchParams.has('moderation'),
    slots: loadedSlots,
    seoMeta: meta.seoMeta,
    ...blocks,
  };
};
