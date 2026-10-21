import { invalidInput } from '../../../../../../shared/errors';
import { json } from '../../../../../respond';
import type { ApiApp } from '../../../../../services';
import { session } from '../../../../../session';

const MAX_BUNDLE_BYTES = 5 * 1024 * 1024;

export const routes = (app: ApiApp) =>
  session(app)
    .get('', async ({ plugins }) => json(await plugins.list()))
    .post('', async ({ plugins, request }) => {
      const source = await request.text();

      if (!source.trim()) throw invalidInput('Plugin bundle is empty');

      if (new TextEncoder().encode(source).byteLength > MAX_BUNDLE_BYTES)
        throw invalidInput('Plugin bundle is too large');

      return json(await plugins.install(source), 201);
    });
