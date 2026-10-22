import { readJson } from '#api/http/request';
import { noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Sends a test message now and reports the mail server's refusal as an input error. */
export const routes = (app: ApiApp) =>
  session(app, 'settings.manage').post('', async ({ email, site, request }) => {
    await email.test(await readJson(request), await site.get());
    return noContent();
  });
