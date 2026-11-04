import { Elysia } from 'elysia';
import { acceptsResponseHeaders } from '@cms/sdk';
import type { ApiServices } from '#api/http/services';
import { currentUser } from '#api/http/request';
import { forbidden } from '#api/shared/errors';

const excluded = (path: string) =>
  /^\/api\/v1\/(?:install|auth)(?:\/|$)/.test(path) ||
  /^\/api\/health\/?$/.test(path);

export const apiHooks = (services: ApiServices) =>
  new Elysia()
    .onRequest(async ({ request }) => {
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
      const hooks = services.renderHooks;

      if (!hooks?.has('api.responseHeaders')) return;
      const path = new URL(request.url).pathname;

      if (excluded(path)) return;
      const response =
        responseValue instanceof Response
          ? responseValue
          : Response.json(responseValue ?? null, {
              status: typeof set.status === 'number' ? set.status : 200,
            });
      const merged = new Headers(response.headers);

      for (const [key, value] of Object.entries(set.headers))
        if (value !== undefined) merged.set(key, String(value));
      let headers = Object.fromEntries(merged);
      const status = response.status;
      const method = request.method;
      const privateResponse =
        request.headers.has('authorization') ||
        merged.has('set-cookie') ||
        /\b(?:private|no-store)\b/i.test(merged.get('cache-control') ?? '');
      const result = await hooks.applyFilter(
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
      );

      for (const [key, value] of Object.entries(result.headers))
        if (!merged.has(key)) merged.set(key, value);

      return new Response(response.body, {
        status,
        statusText: response.statusText,
        headers: merged,
      });
    });
