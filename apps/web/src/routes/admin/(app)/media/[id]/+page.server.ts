import { imageEditSchema } from '@cms/sdk';
import { fail, redirect } from '@sveltejs/kit';
import { failFrom, notFoundFrom, text } from '#lib/server/errors.js';
import { adminFor, requireCapability } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  requireCapability(event.locals, 'media.upload');
  const admin = adminFor(event);
  const [media, context] = await Promise.all([
    admin.media.get(event.params.id).catch(notFoundFrom),
    admin.media.context(event.params.id).catch(notFoundFrom),
  ]);
  return {
    media,
    context: {
      newerId: context.newerId,
      olderId: context.olderId,
      usedIn: context.usedIn.map(({ id, title, type }) => ({
        id,
        title,
        type,
      })),
    },
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
      // A field the form did not send keeps its stored text.
      await adminFor(event).media.update(event.params.id, {
        alt: form.has('alt') ? text(form, 'alt') : undefined,
        caption: form.has('caption') ? text(form, 'caption') : undefined,
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
