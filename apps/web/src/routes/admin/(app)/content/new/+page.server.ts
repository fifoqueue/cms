import { redirect } from '@sveltejs/kit';
import { can } from '@cms/sdk';
import { readContentInput } from '#lib/server/content-form.js';
import { failFrom } from '#lib/server/errors.js';
import { loadSeoContext } from '#lib/server/seo-admin.js';
import { adminFor } from '#lib/server/session.js';
import { loadTermChoices } from '#lib/server/taxonomy-admin.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const user = event.locals.user!;
  const [terms, seo, authors, model, writing] = await Promise.all([
    loadTermChoices(event),
    loadSeoContext(event),
    can(user, 'content.editOthers') ? adminFor(event).users.authors() : null,
    adminFor(event).contentModel.model(),
    adminFor(event).writing.get(),
  ]);
  return {
    defaults: {
      categoryId: writing.defaultCategoryId,
      status: writing.defaultStatus,
    },
    ...terms,
    model,
    seo,
    authors,
    canPublish: can(user, 'content.publish'),
    canManageTerms: can(user, 'taxonomy.manage'),
    authorId: event.locals.user!.id,
  };
};

export const actions: Actions = {
  save: async (event) => {
    const { input, values, failure } = await readContentInput(event);
    if (failure) return failure;
    let id: string;
    let status: string;
    try {
      ({ id, status } = await adminFor(event).content.create(input));
    } catch (caught) {
      return failFrom(caught, { values });
    }
    // `saved` lets the editor say what the save did.
    redirect(303, `/admin/content/${id}?saved=${status}`);
  },
};
