import { DATE_FORMATS } from '@cms/sdk';
import { failFrom, text } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

/** A chosen image as the settings screen shows it: id and a small preview. */
const preview = (
  id: string | null,
  image: { url: string; sizes: { url: string }[] } | null,
) => (id && image ? { id, url: image.sizes[0]?.url ?? image.url } : null);

export const load: PageServerLoad = async (event) => {
  const [site, reading] = await Promise.all([
    adminFor(event).site.get(),
    adminFor(event).reading.get(),
  ]);
  return {
    dates: {
      timeZone: reading.timeZone,
      dateFormat: reading.dateFormat,
      weekStartsOn: reading.weekStartsOn,
    },
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
  site: async (event) => {
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
  /** Time zone and date presentation, stored with the reading settings as before. */
  dates: async (event) => {
    const [form, current] = await Promise.all([
      event.request.formData(),
      adminFor(event).reading.get(),
    ]);
    const dateFormat = DATE_FORMATS.find(
      (format) => format === text(form, 'dateFormat'),
    );
    try {
      await adminFor(event).reading.update({
        ...current,
        timeZone: text(form, 'timeZone') || 'UTC',
        dateFormat: dateFormat ?? current.dateFormat,
        weekStartsOn: Math.trunc(Number(text(form, 'weekStartsOn'))) || 0,
      });
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'saved' };
  },
};
