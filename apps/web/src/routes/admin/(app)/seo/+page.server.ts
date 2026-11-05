import { contentApi } from '#lib/server/api.js';
import { failFrom } from '#lib/server/errors.js';
import { readSeoSettingsForm } from '#lib/server/seo-admin.js';
import { llmsEnabled } from '#lib/server/seo-discovery.js';
import { adminFor } from '#lib/server/session.js';
import { seoSettingsFormValues } from '#lib/admin/seo.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const admin = adminFor(event);
  const api = contentApi(event.fetch);
  const [settings, site, reading] = await Promise.all([
    admin.seo.settings(),
    api.site(),
    api.reading(),
  ]);
  const front = reading.frontPagePath
    ? (await api.resolvePath(reading.frontPagePath)).content
    : null;

  return {
    settings: seoSettingsFormValues(settings),
    // The same conditions the discovery routes publish under.
    published: {
      sitemap: settings.indexingEnabled && Boolean(settings.siteUrl),
      llms: llmsEnabled(settings) && Boolean(settings.siteUrl),
    },
    siteTitle: site.title,
    homeTitleFallback: front ? front.seo.title || front.title : site.title,
    homeDescriptionFallback: front
      ? front.passwordProtected || front.protected
        ? ''
        : front.seo.description ||
          front.metaDescription ||
          front.excerpt ||
          site.description
      : site.description,
  };
};

export const actions: Actions = {
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
};
