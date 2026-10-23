import type { PublicContent, PublicContentType, SlotMap } from '@cms/sdk';
import type { ContentClient } from '@cms/sdk/client';
import { loadComments } from '#lib/server/comments.js';
import { contentView } from '#lib/server/public-view.js';
import type { ThemeView } from '#lib/server/public-view.js';
import { loadTemplateData } from '#lib/server/theme-queries.js';

/**
 * Page data of a single entry with its comments and the data of its template's blocks. `path`
 * replaces the permalink when the entry is shown at another address (the static front page
 * lives at `/`, its canonical URL then).
 */
export const entryPage = async (
  api: ContentClient,
  url: URL,
  content: PublicContent,
  types: Promise<PublicContentType[]>,
  slots: Promise<SlotMap>,
  theme: Promise<ThemeView>,
  path = content.path,
) => {
  const view = { ...contentView(content), path };
  const captcha = api.captcha().catch(() => null);
  const [definitions, comments, unlockCaptcha, blocks, loadedSlots] =
    await Promise.all([
      types,
      loadComments(api, content.id, url, captcha),
      content.protected ? captcha : null,
      theme.then((loaded) =>
        loadTemplateData(api, loaded, { kind: 'content', content: view }),
      ),
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
    moderation: url.searchParams.has('moderation'),
    slots: loadedSlots,
    ...blocks,
  };
};
