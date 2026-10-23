import type { RequestEvent } from '@sveltejs/kit';
import type { PublicContent, PublicContentType, SlotMap } from '@cms/sdk';
import type { ContentClient } from '@cms/sdk/client';
import { loadComments } from '#lib/server/comments.js';
import { error } from '@sveltejs/kit';
import { PAGE_BREAK_HTML } from '@cms/content/breaks';
import { Errors } from '#lib/server/errors.js';
import { contentView, pageParam } from '#lib/server/public-view.js';
import type { BlockData } from '#lib/server/theme-queries.js';
import type { ThemePage } from '#lib/theme/template.js';

/**
 * Page data of a single entry with its comments and the data of its template's blocks
 * (`templateData`). `path` replaces the permalink when the entry is shown at another address
 * (the static front page lives at `/`, its canonical URL then).
 */
export const entryPage = async (
  api: ContentClient,
  event: Pick<RequestEvent, 'url' | 'cookies'>,
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
  const [definitions, comments, unlockCaptcha, blocks, loadedSlots] =
    await Promise.all([
      types,
      content.protected ? null : loadComments(api, content.id, event, captcha),
      content.protected ? captcha : null,
      templateData({ kind: 'content', content: view }),
      slots,
    ]);
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
    ...blocks,
  };
};
