import { fail, redirect } from '@sveltejs/kit';
import { autosaveInputSchema, can } from '@cms/sdk';
import { CmsApiError } from '@cms/sdk/client';
import { fieldImages, readContentForm } from '#lib/server/content-form.js';
import {
  Errors,
  failFrom,
  jsonField,
  notFoundFrom,
  text,
} from '#lib/server/errors.js';
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
    fieldImages: await fieldImages(admin, model.fields, entry.fields),
    ...terms,
    seo,
    revisions,
    autosave,
    // `?autosave` starts the form from the newer autosave instead of the saved text.
    useAutosave: event.url.searchParams.has('autosave') && autosave !== null,
    authors,
    canPublish: can(user, 'content.publish'),
    canManageTerms: can(user, 'taxonomy.manage'),
  };
};

/** Whether a refused save lost to someone else's newer save (not, say, a taken slug). */
const isStale = async (
  event: Parameters<typeof adminFor>[0] & { params: { id: string } },
  caught: unknown,
  expected: string | undefined,
) =>
  caught instanceof CmsApiError &&
  caught.status === 409 &&
  !!expected &&
  (await adminFor(event)
    .content.get(event.params.id)
    .then(
      (entry) =>
        new Date(entry.updatedAt).getTime() !== new Date(expected).getTime(),
      () => false,
    ));

export const actions: Actions = {
  save: async (event) => {
    const [formData, model] = await Promise.all([
      event.request.formData(),
      adminFor(event).contentModel.model(),
    ]);
    const { input, values, failure } = readContentForm(formData, model.fields);
    if (failure) return failure;
    let saved;
    try {
      saved = await adminFor(event).content.update(event.params.id, input);
    } catch (caught) {
      return failFrom(caught, {
        values,
        ...((await isStale(event, caught, input.expectedUpdatedAt)) && {
          stale: true,
        }),
      });
    }
    // The editor shows what the save did and adopts this version (and only this one).
    return { saved: true, version: saved.updatedAt, status: saved.status };
  },
  trash: async (event) => {
    try {
      await adminFor(event).content.trash(event.params.id);
    } catch (caught) {
      return failFrom(caught);
    }
    // The list says so and offers Undo (restore from the Trash).
    redirect(
      303,
      `/admin/content?notice=entryTrashed&undo=${encodeURIComponent(event.params.id)}`,
    );
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
  /** Opens the site's rendering of the editor's current text (the form targets a new tab). */
  preview: async (event) => {
    const form = await event.request.formData();
    // Without the editor's fields the saved text is previewed; sent text must be valid.
    const sent = form.has('document')
      ? autosaveInputSchema.safeParse({
          title: text(form, 'title'),
          excerpt: text(form, 'excerpt'),
          document: jsonField(form, 'document'),
        })
      : null;
    if (sent && !sent.success)
      return fail(400, {
        message: Errors.FormInvalid,
        issues: sent.error.issues.map(({ path, message }) => ({
          path: path.map(String).join('.'),
          message,
        })),
      });
    let token: string;
    try {
      // Kept as an autosave first: the preview renders the newest autosave.
      if (sent?.success)
        await adminFor(event).content.autosave(event.params.id, sent.data);
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
