import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** The whole site as a WordPress export file (WXR). */
export const routes = (app: ApiApp) =>
  session(app).get(
    '',
    async ({ exporter, user }) =>
      new Response(await exporter.streamWxr(user), {
        headers: {
          'content-type': 'application/rss+xml; charset=utf-8',
          'content-disposition': 'attachment; filename="export.xml"',
        },
      }),
  );
