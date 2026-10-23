import { redirect } from '@sveltejs/kit';
import { can } from '@cms/sdk';
import type { PatternInput } from '@cms/sdk';
import { failFrom, jsonField, notFoundFrom, text } from '#lib/server/errors.js';
import { adminFor, requireCapability } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  requireCapability(event.locals, 'content.create');
  const id = event.params.id;
  const pattern =
    id === 'new'
      ? null
      : await adminFor(event).patterns.get(id).catch(notFoundFrom);
  return {
    pattern: pattern && {
      id: pattern.id,
      title: pattern.title,
      synced: pattern.synced,
      status: pattern.status,
      document: pattern.document,
    },
    canPublish: can(event.locals.user!, 'content.publish'),
  };
};

export const actions: Actions = {
  save: async (event) => {
    const form = await event.request.formData();
    // The API validates every field (and the document against the editor schema).
    const input = {
      title: text(form, 'title'),
      synced: form.has('synced'),
      status: text(form, 'status') === 'draft' ? 'draft' : 'published',
      document: jsonField(form, 'document'),
    } as PatternInput;
    const admin = adminFor(event);
    let id = event.params.id;
    try {
      if (id === 'new') ({ id } = await admin.patterns.create(input));
      else await admin.patterns.update(id, input);
    } catch (caught) {
      return failFrom(caught);
    }
    if (event.params.id === 'new')
      redirect(303, `/admin/patterns/${encodeURIComponent(id)}?notice=saved`);
    return { notice: 'saved' };
  },
};
