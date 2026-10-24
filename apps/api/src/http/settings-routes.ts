import type { UserProfile } from '@cms/sdk';
import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp, ApiServices } from '#api/http/services';
import { session } from '#api/http/session';

type SettingsContext = ApiServices & { user: UserProfile };

export const settingsRoutes =
  (
    read: (context: SettingsContext) => Promise<unknown>,
    update: (context: SettingsContext, input: unknown) => Promise<unknown>,
  ) =>
  (app: ApiApp) =>
    session(app, 'settings.manage')
      .get('', async (context) => json(await read(context)))
      // Generic callbacks escape Elysia's body-use analysis; readJson owns parsing.
      .put(
        '',
        async (context) =>
          json(await update(context, await readJson(context.request))),
        { parse: 'none' },
      );
