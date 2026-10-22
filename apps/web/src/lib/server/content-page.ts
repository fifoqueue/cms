import type { PublicContent, PublicContentType, SlotMap } from '@cms/sdk';
import type { ContentClient } from '@cms/sdk/client';
import { loadComments } from '#lib/server/comments.js';
import { contentView } from '#lib/server/public-view.js';

/**
 * Page data of a single entry with its comments. `path` replaces the permalink when the entry
 * is shown at another address (the static front page lives at `/`, its canonical URL then).
 */
export const entryPage = async (
  api: ContentClient,
  url: URL,
  content: PublicContent,
  types: Promise<PublicContentType[]>,
  slots: Promise<SlotMap>,
  path = content.path,
) => {
  const captcha = api.captcha().catch(() => null);
  const comments = loadComments(api, content.id, url, captcha);
  return {
    kind: 'content' as const,
    content: { ...contentView(content), path },
    /** Labels of the entry's public fields, in their defined order. */
    fieldLabels: (
      (await types).find((type) => type.key === content.type)?.fields ?? []
    ).map(({ key, label, type }) => ({ key, label, type })),
    comments: await comments,
    unlockCaptcha: content.protected ? await captcha : null,
    /** Set after a held comment was sent. */
    moderation: url.searchParams.has('moderation'),
    slots: await slots,
  };
};
