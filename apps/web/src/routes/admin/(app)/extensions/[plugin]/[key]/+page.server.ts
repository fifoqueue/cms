import { error } from '@sveltejs/kit';
import { CmsApiError } from '@cms/sdk/client';
import { Errors, failFrom, text } from '#lib/server/errors.js';
import { readPluginSettings } from '#lib/server/plugin-settings-form.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  try {
    const page = await adminFor(event).plugins.page(
      event.params.plugin,
      event.params.key,
    );
    return { page: { title: page.title, blocks: page.blocks } };
  } catch (caught) {
    if (caught instanceof CmsApiError && caught.status === 404)
      error(404, Errors.NotFound);
    if (caught instanceof CmsApiError && caught.status === 403)
      error(403, Errors.Forbidden);
    if (caught instanceof CmsApiError && caught.status === 502)
      return { page: null };
    throw caught;
  }
};

export const actions: Actions = {
  /** Runs a form block's action with values read by that form's own fields. */
  run: async (event) => {
    const form = await event.request.formData();
    const action = text(form, 'action');
    const admin = adminFor(event);
    try {
      const page = await admin.plugins.page(
        event.params.plugin,
        event.params.key,
      );
      const block = page.blocks.find(
        (candidate) => candidate.kind === 'form' && candidate.action === action,
      );
      if (block?.kind !== 'form') error(404, Errors.NotFound);
      const result = await admin.plugins.runPage(
        event.params.plugin,
        event.params.key,
        action,
        readPluginSettings(block.fields, form),
      );
      return { notice: result.notice ?? 'saved' };
    } catch (caught) {
      return failFrom(caught);
    }
  },
};
