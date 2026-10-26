import { t } from 'elysia';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

/** Global public data for one page, without repeated server-to-server round trips. */
export const routes = (app: ApiApp) =>
  app.get(
    '',
    async ({
      site,
      privacy,
      seo,
      themes,
      themePreviews,
      reading,
      menus,
      widgets,
      archivePaths,
      query,
      publicCache,
    }) => {
      const load = async () => {
        const [siteData, seoData, theme, readingData] = await Promise.all([
          site.getPublic(),
          seo.getCore(),
          themes.getCore(),
          reading.getPublic(),
        ]);
        return {
          archives: await archivePaths.get(),
          privacy: await privacy.publicSettings(),
          site: siteData,
          seo: seoData,
          theme,
          reading: readingData,
        };
      };
      const cache = query.preview === undefined ? publicCache : undefined;
      const data = !cache ? await load() : await cache.get('layout', load);
      const [seoData, menuData, widgetData, theme] = await Promise.all([
        seo.present(data.seo),
        menus.publicLocations(),
        widgets.getPublic(cache),
        themePreviews
          .resolve(query.preview)
          .then((preview) => preview ?? themes.present(data.theme)),
      ]);
      return json({
        ...data,
        theme,
        seo: seoData,
        menus: menuData,
        widgets: widgetData,
      });
    },
    {
      query: t.Object(
        { preview: t.Optional(t.String({ maxLength: 300 })) },
        { additionalProperties: true },
      ),
    },
  );
