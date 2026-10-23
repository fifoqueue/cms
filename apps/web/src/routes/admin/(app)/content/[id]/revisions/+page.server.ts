import { redirect } from '@sveltejs/kit';
import type { ContentRevision } from '@cms/sdk';
import { failFrom, notFoundFrom, text } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

/** The text fields the compare screen shows. */
const version = ({
  id,
  kind,
  authorName,
  createdAt,
  title,
  excerpt,
  document,
}: ContentRevision) => ({
  id,
  kind,
  authorName,
  createdAt,
  title,
  excerpt,
  document,
});

/** Two versions of an entry side by side: `to` (default newest) against `from` (default the one before). */
export const load: PageServerLoad = async (event) => {
  const content = adminFor(event).content;
  const id = event.params.id;
  // The API allows only users who may edit the entry.
  const [entry, revisions] = await Promise.all([
    content.get(id).catch(notFoundFrom),
    content.revisions(id).catch(notFoundFrom),
  ]);
  const params = event.url.searchParams;
  const position = (key: string) =>
    revisions.findIndex((revision) => revision.id === params.get(key));
  const to = Math.max(0, position('to'));
  const chosen = position('from');
  const from =
    chosen >= 0 && chosen !== to
      ? chosen
      : Math.min(to + 1, revisions.length - 1);
  const [before, after] = revisions.length
    ? await Promise.all(
        [from, to].map((index) =>
          content.revision(id, revisions[index]!.id).catch(notFoundFrom),
        ),
      )
    : [];
  return {
    entry: { id: entry.id, title: entry.title },
    // Newest first, as the API lists them.
    revisions: revisions.map(({ id, kind, authorName, createdAt }) => ({
      id,
      kind,
      authorName,
      createdAt,
    })),
    current: revisions.find((revision) => revision.kind === 'revision')?.id,
    from: before && version(before),
    to: after && version(after),
  };
};

export const actions: Actions = {
  restore: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).content.restoreRevision(
        event.params.id,
        text(form, 'revisionId'),
      );
    } catch (caught) {
      return failFrom(caught);
    }
    redirect(303, `/admin/content/${event.params.id}?restored`);
  },
};
