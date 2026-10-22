import { contentApi } from '#lib/server/api.js';
import { failFrom, text } from '#lib/server/errors.js';
import {
  permalinkView,
  readPermalinkForm,
  readSeoSettingsForm,
} from '#lib/server/seo-admin.js';
import { llmsEnabled } from '#lib/server/seo-discovery.js';
import { adminFor } from '#lib/server/session.js';
import { seoSettingsFormValues } from '#lib/admin/seo.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const admin = adminFor(event);
  const [settings, permalinks, site, model] = await Promise.all([
    admin.seo.settings(),
    admin.permalinks.settings(),
    contentApi(event.fetch).site(),
    admin.contentModel.model(),
  ]);
  return {
    archives: await admin.archivePaths.get(),
    settings: seoSettingsFormValues(settings),
    // The same conditions the discovery routes publish under.
    published: {
      sitemap: settings.indexingEnabled && Boolean(settings.siteUrl),
      llms: llmsEnabled(settings) && Boolean(settings.siteUrl),
    },
    permalinks: permalinkView(permalinks),
    types: model.types.map(({ key, pluralName }) => ({ key, pluralName })),
    siteTitle: site.title,
  };
};

export const actions: Actions = {
  archives: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).archivePaths.update({
        category: text(form, 'category'),
        tag: text(form, 'tag'),
      });
    } catch (caught) {
      return failFrom(caught, { intent: 'archives' as const });
    }
    return { notice: 'saved', intent: 'archives' as const };
  },
  settings: async (event) => {
    const { values, input, failure } = readSeoSettingsForm(
      await event.request.formData(),
    );
    if (failure) return failure;
    try {
      await adminFor(event).seo.update(input);
    } catch (caught) {
      return failFrom(caught, { intent: 'settings' as const, values });
    }
    return { intent: 'settings' as const, notice: 'saved' };
  },
  permalinks: async (event) => {
    const [form, model] = await Promise.all([
      event.request.formData(),
      adminFor(event).contentModel.model(),
    ]);
    const { values, input, failure } = readPermalinkForm(
      form,
      model.types.map((type) => type.key),
    );
    if (failure) return failure;
    try {
      await adminFor(event).permalinks.update(input);
    } catch (caught) {
      // Collisions with existing addresses come back as field issues; nothing was changed.
      return failFrom(caught, {
        intent: 'permalinks' as const,
        permalinks: values,
      });
    }
    return { intent: 'permalinks' as const, notice: 'saved' };
  },
};
