import { redirect } from '@sveltejs/kit';
import { can } from '@cms/sdk';
import { readContentForm } from '#lib/server/content-form.js';
import { failFrom, notFoundFrom, text } from '#lib/server/errors.js';
import { loadSeoContext } from '#lib/server/seo-admin.js';
import { adminFor } from '#lib/server/session.js';
import { loadTermChoices } from '#lib/server/taxonomy-admin.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const admin = adminFor(event);
  const id = event.params.id;
  const user = event.locals.user!;
  const [entry, terms, seo, revisions, autosave, authors, model] =
    await Promise.all([
      admin.content.get(id).catch(notFoundFrom),
      loadTermChoices(event),
      loadSeoContext(event),
      admin.content.revisions(id),
      admin.content.pendingAutosave(id),
      can(user, 'content.editOthers') ? admin.users.authors() : null,
      admin.contentModel.model(),
    ]);
  return {
    entry,
    model,
    ...terms,
    seo,
    revisions,
    autosave,
    // `?autosave` starts the form from the newer autosave instead of the saved text.
    useAutosave: event.url.searchParams.has('autosave') && autosave !== null,
    authors,
    canPublish: can(user, 'content.publish'),
  };
};

export const actions: Actions = {
  save: async (event) => {
    const [formData, model] = await Promise.all([
      event.request.formData(),
      adminFor(event).contentModel.model(),
    ]);
    const { input, values, failure } = readContentForm(formData, model.fields);
    if (failure) return failure;
    try {
      await adminFor(event).content.update(event.params.id, input);
    } catch (caught) {
      return failFrom(caught, { values });
    }
    return { notice: 'saved' };
  },
  trash: async (event) => {
    try {
      await adminFor(event).content.trash(event.params.id);
    } catch (caught) {
      return failFrom(caught);
    }
    redirect(303, '/admin/content');
  },
  restore: async (event) => {
    try {
      await adminFor(event).content.restore(event.params.id);
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'restored' };
  },
  delete: async (event) => {
    try {
      await adminFor(event).content.remove(event.params.id);
    } catch (caught) {
      return failFrom(caught);
    }
    redirect(303, '/admin/content?view=trash');
  },
  /** Opens the site's rendering of unsaved changes (the form targets a new tab). */
  preview: async (event) => {
    let token: string;
    try {
      ({ token } = await adminFor(event).content.preview(event.params.id));
    } catch (caught) {
      return failFrom(caught);
    }
    redirect(303, `/preview/${encodeURIComponent(token)}`);
  },
  restoreRevision: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).content.restoreRevision(
        event.params.id,
        text(form, 'revisionId'),
      );
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'revisionRestored' };
  },
};
