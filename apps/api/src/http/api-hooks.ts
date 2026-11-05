import { Elysia } from 'elysia';
import { acceptsResponseHeaders, CONTENT_UNLOCK_HEADER } from '@cms/sdk';
import type { ApiServices } from '#api/http/services';
import { currentUser } from '#api/http/request';
import { forbidden, Errors } from '#api/shared/errors';
import { errorResponse } from '#api/http/respond';

const excluded = (path: string) =>
  /^\/api\/v1\/(?:install|auth)(?:\/|$)/.test(path) ||
  /^\/api\/health\/?$/.test(path);

export const apiHooks = (services: ApiServices) =>
  new Elysia()
    .onRequest(async (context) => {
      let { request } = context;

      if (
        ['GET', 'HEAD'].includes(request.method) &&
        (request.headers.has(CONTENT_UNLOCK_HEADER) ||
          request.headers.has('authorization'))
      ) {
        const headers = new Headers(request.headers);

        headers.delete('if-none-match');
        headers.delete('if-modified-since');
        request = new Request(request, { headers });
        context.request = request;
      }

      const hooks = services.renderHooks;

      if (!hooks?.has('api.requestAllowed')) return;
      const path = new URL(request.url).pathname;

      if (excluded(path)) return;
      const user = await currentUser(services.auth, request);
      const client = services.clients.resolve(request);
      const value = {
        method: request.method,
        path,
        userId: user?.id ?? null,
        client: client === 'unverified' ? null : client,
        allowed: true,
      };
      const result = await hooks.applyFilter(
        'api.requestAllowed',
        { ...value },
        (candidate) => {
          if (!candidate || typeof candidate !== 'object') return false;
          const next = candidate as typeof value;

          return (
            next.method === value.method &&
            next.path === path &&
            next.userId === value.userId &&
            next.client === value.client &&
            typeof next.allowed === 'boolean'
          );
        },
      );

      if (!result.allowed) throw forbidden();
    })
    .mapResponse({ as: 'global' }, async ({ request, responseValue, set }) => {
      const path = new URL(request.url).pathname;
      const hooks = excluded(path) ? undefined : services.renderHooks;
      const proof = request.headers.has(CONTENT_UNLOCK_HEADER);
      const original = responseValue instanceof Response ? responseValue : null;
      const merged = new Headers(original?.headers);

      for (const [key, value] of Object.entries(set.headers))
        if (value !== undefined) merged.set(key, String(value));
      const privateResponse =
        proof ||
        request.headers.has('authorization') ||
        merged.has('set-cookie') ||
        /\b(?:private|no-store)\b/i.test(merged.get('cache-control') ?? '');

      if (!hooks?.has('api.responseHeaders') && !privateResponse) return;
      const response =
        original ??
        (set.status === 304 || set.status === 'Not Modified'
          ? new Response(null, { status: 304 })
          : Response.json(responseValue ?? null, {
              status: typeof set.status === 'number' ? set.status : 200,
            }));

      if (privateResponse) {
        merged.set('cache-control', 'private, no-store');
        const vary = (merged.get('vary') ?? '')
          .toLowerCase()
          .split(',')
          .map((value) => value.trim());

        if (!vary.includes('*'))
          for (const name of [CONTENT_UNLOCK_HEADER, 'authorization'])
            if (request.headers.has(name) && !vary.includes(name))
              merged.append('vary', name);
      }

      let headers = Object.fromEntries(merged);
      const status = response.status;
      const method = request.method;
      const result = hooks?.has('api.responseHeaders')
        ? await hooks.applyFilter(
            'api.responseHeaders',
            { method, path, status, headers: { ...headers } },
            (candidate) => {
              if (!candidate || typeof candidate !== 'object') return false;
              const next = candidate as {
                method: string;
                path: string;
                status: number;
                headers: unknown;
              };

              return (
                next.method === method &&
                next.path === path &&
                next.status === status &&
                acceptsResponseHeaders(next.headers, headers, privateResponse)
              );
            },
            (_owner, _previous, next) => {
              headers = { ...next.headers };
            },
          )
        : { headers };

      for (const [key, value] of Object.entries(result.headers))
        if (!merged.has(key)) merged.set(key, value);
      let finalResponse = response;

      if (
        privateResponse ||
        merged.has('set-cookie') ||
        /\b(?:private|no-store)\b/i.test(merged.get('cache-control') ?? '')
      ) {
        const invalid304 =
          response.status === 304 ||
          set.status === 304 ||
          set.status === 'Not Modified';

        merged.set('cache-control', 'private, no-store');
        merged.delete('etag');
        merged.delete('last-modified');
        // Elysia merges `set.headers` again after response mapping.
        for (const key of Object.keys(set.headers))
          if (
            [
              'etag',
              'last-modified',
              'cache-control',
              ...(invalid304 ? ['content-length', 'content-type'] : []),
            ].includes(key.toLowerCase())
          )
            delete set.headers[key];
        set.headers['cache-control'] = 'private, no-store';

        if (invalid304) {
          finalResponse = errorResponse(500, 'internal', Errors.Internal);
          set.status = 500;
          merged.delete('content-length');
          merged.set(
            'content-type',
            finalResponse.headers.get('content-type')!,
          );
        }
      }

      return new Response(finalResponse.body, {
        status: finalResponse.status,
        statusText: finalResponse.statusText,
        headers: merged,
      });
    });
