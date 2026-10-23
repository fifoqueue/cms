import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { json } from '#api/http/respond';
import { readJson, SMALL_BODY_BYTES } from '#api/http/request';
import { z } from 'zod';
import { parseInput } from '#api/shared/validation';
const querySchema = z.object({
  action: z.enum(['export', 'erase']),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
export const routes = (app: ApiApp) =>
  session(app, 'users.manage')
    .get('', async ({ privacy, user, query, set }) => {
      set.headers['cache-control'] = 'no-store';
      const input = parseInput(querySchema, query);
      return json(await privacy.list(input.action, input.page, user));
    })
    .post('', async ({ privacy, clients, user, request, set }) => {
      set.headers['cache-control'] = 'no-store';
      return json(
        await privacy.create(
          await readJson(request, SMALL_BODY_BYTES),
          user,
          clients.attempt(request),
        ),
      );
    });
