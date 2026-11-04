import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SSO_FRONTEND_SECRET_HEADER } from '@cms/sdk';
import type { ApiApp } from '#api/http/services';
import { forbidden } from '#api/shared/errors';

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Code is available only to the paired frontend, including conditional requests. */
export const routes = (app: ApiApp) =>
  app.get(
    '',
    async ({ request, frontendSecret, functionsDirectory, themes }) => {
      const proof = request.headers.get(SSO_FRONTEND_SECRET_HEADER);

      if (
        !frontendSecret ||
        !proof ||
        !timingSafeEqual(digest(proof), digest(frontendSecret))
      )
        throw forbidden();

      const sources: { owner: string; hash: string; code: string }[] = [];
      const theme = await themes.activeFunctions();

      if (theme)
        sources.push({
          owner: theme.owner,
          hash: digest(theme.text).toString('hex'),
          code: theme.text,
        });

      if (functionsDirectory) {
        let code: string | undefined;

        try {
          code = await readFile(join(functionsDirectory, 'site.ts'), 'utf8');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }

        if (code !== undefined)
          sources.push({
            owner: 'functions:site',
            hash: digest(code).toString('hex'),
            code,
          });
      }

      const version = digest(
        JSON.stringify(sources.map(({ owner, hash }) => ({ owner, hash }))),
      ).toString('hex');
      const etag = `"${version}"`;
      const headers = {
        'cache-control': 'private, no-store',
        etag,
        vary: SSO_FRONTEND_SECRET_HEADER,
      };

      if (request.headers.get('if-none-match') === etag)
        return new Response(null, { status: 304, headers });

      return Response.json({ version, sources }, { headers });
    },
  );
