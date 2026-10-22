import { invalidInput, Errors } from '#api/shared/errors';
import { readText } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

const MAX_BUNDLE_BYTES = 5 * 1024 * 1024;

export const routes = (app: ApiApp) =>
  session(app, 'plugins.manage')
    .get('', async ({ plugins }) => json(await plugins.list()))
    .post('', async ({ plugins, request }) => {
      const source = await readText(request, MAX_BUNDLE_BYTES);

      if (!source.trim()) throw invalidInput(Errors.PluginBundleEmpty);

      return json(await plugins.install(source), 201);
    });
