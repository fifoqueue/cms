import { imageEditSchema } from '@cms/sdk';
import { fail, redirect } from '@sveltejs/kit';
import { failFrom, notFoundFrom, text } from '#lib/server/errors.js';
import { adminFor, requireCapability } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  requireCapability(event.locals, 'media.upload');
  return {
    media: await adminFor(event).media.get(event.params.id).catch(notFoundFrom),
  };
};

export const actions: Actions = {
  edit: async (event) => {
    const form = await event.request.formData();
    const parsed = imageEditSchema.safeParse({
      rotate: Number(text(form, 'rotate')),
      flip: form.has('flip'),
      flop: form.has('flop'),
      ...(form.has('crop')
        ? {
            crop: Object.fromEntries(
              ['left', 'top', 'width', 'height'].map((key) => [
                key,
                Number(text(form, key)),
              ]),
            ),
          }
        : {}),
    });
    if (!parsed.success)
      return fail(400, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    let copy;
    try {
      copy = await adminFor(event).media.edit(event.params.id, parsed.data);
    } catch (caught) {
      return failFrom(caught);
    }
    redirect(303, `/admin/media/${copy.id}`);
  },
  save: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).media.update(event.params.id, {
        alt: text(form, 'alt'),
        caption: text(form, 'caption'),
      });
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'saved' };
  },
  delete: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).media.remove(event.params.id, form.has('force'));
    } catch (caught) {
      return failFrom(caught);
    }
    redirect(303, '/admin/media');
  },
};
