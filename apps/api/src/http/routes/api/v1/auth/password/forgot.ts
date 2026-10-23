import { readJson, SMALL_BODY_BYTES } from '#api/http/request';
import { noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { obscureAccountLookup } from '#api/http/account-response';

/** Emails a reset link when the address has an account; the answer is the same either way. */
export const routes = (app: ApiApp) =>
  app.post('', async ({ passwords, clients, request }) =>
    obscureAccountLookup(async () => {
      await passwords.requestReset(
        await readJson(request, SMALL_BODY_BYTES),
        clients.attempt(request),
      );
      return noContent();
    }),
  );
