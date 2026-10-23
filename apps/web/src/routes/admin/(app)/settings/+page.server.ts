import { failFrom, text } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

/** A chosen image as the settings screen shows it: id and a small preview. */
const preview = (
  id: string | null,
  image: { url: string; sizes: { url: string }[] } | null,
) => (id && image ? { id, url: image.sizes[0]?.url ?? image.url } : null);

export const load: PageServerLoad = async (event) => {
  const site = await adminFor(event).site.get();
  return {
    site: {
      title: site.title,
      description: site.description,
      locale: site.locale,
      icon: preview(site.iconId, site.icon),
      logo: preview(site.logoId, site.logo),
    },
  };
};

export const actions: Actions = {
  default: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).site.update({
        title: text(form, 'title'),
        description: text(form, 'description'),
        locale: text(form, 'locale'),
        iconId: text(form, 'iconId') || null,
        logoId: text(form, 'logoId') || null,
      });
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'saved' };
  },
};
