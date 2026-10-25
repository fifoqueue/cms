import { readJson, SMALL_BODY_BYTES } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { loginSchema } from '@cms/sdk';
import { Errors } from '@cms/sdk/errors';
import { conflict } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';
import { signInRoutes } from '#api/http/sign-in-routes';

export const routes = (app: ApiApp) =>
  signInRoutes(app).post(
    '',
    async ({ signIn, clients, request }) => {
      const values = parseInput(
        loginSchema,
        await readJson(request, SMALL_BODY_BYTES),
      );
      const step = await signIn.start(
        'password',
        { values },
        clients.attempt(request),
      );
      if (step.kind !== 'session') throw conflict(Errors.SignInStepRequired);
      return json(step.session);
    },
    { parse: 'none' },
  );
