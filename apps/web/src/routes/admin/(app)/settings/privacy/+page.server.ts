import { contentApi } from '#lib/server/api.js';
import { adminFor } from '#lib/server/session.js';
import { text } from '#lib/server/errors.js';
import { submitAction } from '#lib/server/form-action.js';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async (event) => {
  const privacy = await adminFor(event).privacy.settings();
  const api = contentApi(event.fetch);
  const pages = await api.list({ type: 'page', pageSize: 100 });
  if (
    privacy.policyPageId &&
    !pages.items.some((page) => page.id === privacy.policyPageId)
  )
    pages.items.push(
      ...(await api.list({ type: 'page', include: [privacy.policyPageId] }))
        .items,
    );
  return {
    privacy,
    pages: pages.items
      .filter((page) => !page.protected)
      .map(({ id, title }) => ({ id, title })),
  };
};
export const actions: Actions = {
  save: async (event) => {
    const form = await event.request.formData();
    return submitAction(() =>
      adminFor(event).privacy.update({
        policyPageId: text(form, 'policyPageId') || null,
        commentCookies: form.has('commentCookies'),
      }),
    );
  },
};
