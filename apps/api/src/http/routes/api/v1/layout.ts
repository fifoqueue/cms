import { t } from 'elysia';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

/** Global public data for one page, without repeated server-to-server round trips. */
export const routes = (app: ApiApp) =>
  app.get(
    '',
    async ({
      site,
      seo,
      themes,
      themePreviews,
      reading,
      menus,
      widgets,
      archivePaths,
      query,
    }) => {
      const [siteData, seoData, theme, readingData, menuData, widgetData] =
        await Promise.all([
          site.get(),
          seo.getPublic(),
          themePreviews
            .resolve(query.preview)
            .then((preview) => preview ?? themes.getPublic()),
          reading.getPublic(),
          menus.publicLocations(),
          widgets.getPublic(),
        ]);
      return json({
        archives: await archivePaths.get(),
        site: siteData,
        seo: seoData,
        theme,
        reading: readingData,
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
