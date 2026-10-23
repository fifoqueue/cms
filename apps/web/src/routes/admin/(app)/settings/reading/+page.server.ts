import type { ReadingSettingsInput } from '@cms/sdk';
import { failFrom, text } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const admin = adminFor(event);
  const [reading, pages] = await Promise.all([
    admin.reading.get(),
    admin.content.list({ type: 'page', status: 'published', pageSize: 100 }),
  ]);
  return {
    reading,
    pages: pages.items.map(({ id, title }) => ({ id, title })),
  };
};

const count = (form: FormData, key: string, fallback: number) =>
  Math.trunc(Number(text(form, key))) || fallback;

export const actions: Actions = {
  save: async (event) => {
    const [form, current] = await Promise.all([
      event.request.formData(),
      adminFor(event).reading.get(),
    ]);
    // Dates and the time zone are edited in General settings and kept here.
    const input: ReadingSettingsInput = {
      ...current,
      frontPage: text(form, 'frontPage') === 'page' ? 'page' : 'posts',
      frontPageId: text(form, 'frontPageId') || null,
      postsPageId: text(form, 'postsPageId') || null,
      postsPerPage: count(form, 'postsPerPage', 10),
      feedItems: count(form, 'feedItems', 20),
      feedContent: text(form, 'feedContent') === 'excerpt' ? 'excerpt' : 'full',
      cacheSeconds: Math.max(
        0,
        Math.trunc(Number(text(form, 'cacheSeconds'))) || 0,
      ),
    };
    try {
      await adminFor(event).reading.update(input);
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'saved' };
  },
};
