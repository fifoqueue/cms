import { notFoundFrom } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const content = adminFor(event).content;
  const [entry, revision] = await Promise.all([
    content.get(event.params.id).catch(notFoundFrom),
    content
      .revision(event.params.id, event.params.revisionId)
      .catch(notFoundFrom),
  ]);
  return { entry, revision };
};
