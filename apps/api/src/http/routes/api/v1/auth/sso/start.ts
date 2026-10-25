import {
  bearerToken,
  requireUser,
  readJson,
  SMALL_BODY_BYTES,
} from '#api/http/request';
import { ssoStartSchema } from '@cms/sdk';
import { Errors } from '@cms/sdk/errors';
import { conflict } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';
import { signInRoutes } from '#api/http/sign-in-routes';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  signInRoutes(app).post(
    '',
    async ({ auth, sso, clients, request }) => {
      const input = parseInput(
        ssoStartSchema,
        await readJson(request, SMALL_BODY_BYTES),
      );
      if (input.intent !== 'link') throw conflict(Errors.SignInStepRequired);
      const user = await requireUser(auth, request);
      await auth.requireRecent(user, bearerToken(request)!);
      return json(await sso.start(input, user, clients.resolve(request)));
    },
    { parse: 'none' },
  );
