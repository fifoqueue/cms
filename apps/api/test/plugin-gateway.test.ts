import { describe, expect, test } from 'bun:test';
import { definePlugin } from '@cms/sdk/plugin';
import { createApiApp } from '../src/http/app';
import { PluginGateway } from '../src/http/plugin-gateway';
import type { PluginGatewayDeps } from '../src/http/plugin-gateway';
import type { ApiServices } from '../src/http/services';
import { createRuntime } from './support/runtime';

const ADMIN_TOKEN = 'admin-token';

const gatewayApp = (
  auth: PluginGatewayDeps['auth'],
  routes: PluginGatewayDeps['routes'],
) =>
  createApiApp({
    services: {
      pluginGateway: new PluginGateway({
        auth,
        routes,
        timeoutMs: 50,
        logger: console,
      }),
    } as unknown as ApiServices,
    logger: console,
  });

const setup = async () => {
  const runtime = createRuntime({ timeoutMs: 50 });
  const auth = {
    authenticate: async (token: string) =>
      token === ADMIN_TOKEN
        ? { id: 'u', email: 'a@example.com', name: 'Admin' }
        : null,
  };
  const app = await gatewayApp(auth, runtime.routes);

  await runtime.host.install(
    runtime.bundles.register(
      'echo',
      definePlugin({
        manifest: { id: 'echo', name: 'Echo', version: '1.0.0' },
        activate({ routes }) {
          routes.add({
            method: 'GET',
            path: '/items/:id',
            access: 'public',
            handler: ({ params }) => Response.json({ id: params.id }),
          });
          routes.add({
            method: 'GET',
            path: '/me',
            access: 'admin',
            handler: ({ user }) => Response.json(user),
          });
          routes.add({
            method: 'GET',
            path: '/crash',
            access: 'public',
            handler: () => {
              throw new Error('boom');
            },
          });
        },
      }),
    ),
  );
  const call = (path: string, token?: string) =>
    app.fetch(
      new Request(`http://localhost${path}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    );
  return { runtime, call };
};

describe('plugin gateway', () => {
  test('routes exist only while the plugin is active', async () => {
    const { runtime, call } = await setup();
    expect((await call('/api/plugins/echo/items/7')).status).toBe(404);

    await runtime.host.enable('echo');
    const response = await call('/api/plugins/echo/items/7');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: '7' });

    await runtime.host.disable('echo');
    expect((await call('/api/plugins/echo/items/7')).status).toBe(404);
  });

  test('admin routes require a session and failures are contained', async () => {
    const { runtime, call } = await setup();
    await runtime.host.enable('echo');
    expect((await call('/api/plugins/echo/me')).status).toBe(401);
    expect(
      await (await call('/api/plugins/echo/me', ADMIN_TOKEN)).json(),
    ).toMatchObject({ id: 'u' });
    expect((await call('/api/plugins/echo/crash')).status).toBe(502);
    expect((await call('/api/plugins/unknown/anything')).status).toBe(404);
  });

  test('plugin paths support root, wildcard, encoded params and any body', async () => {
    const runtime = createRuntime({ timeoutMs: 50 });
    const app = await gatewayApp(
      { authenticate: async () => null },
      runtime.routes,
    );

    const route = (
      method: 'GET' | 'POST',
      path: string,
      handler: (request: {
        request: Request;
        params: Record<string, string>;
      }) => Response | Promise<Response>,
    ) => ({ method, path, access: 'public' as const, handler });
    await runtime.host.install(
      runtime.bundles.register(
        'paths',
        definePlugin({
          manifest: { id: 'paths', name: 'Paths', version: '1.0.0' },
          activate({ routes }) {
            routes.add(route('GET', '/', () => Response.json('root')));
            routes.add(
              route('GET', '/files/*', ({ params }) =>
                Response.json(params['*']),
              ),
            );
            routes.add(
              route('GET', '/items/:id', ({ params }) =>
                Response.json(params.id),
              ),
            );
            routes.add(route('GET', '/items/:id', () => Response.json('dup')));
            routes.add(
              route('POST', '/echo', async ({ request }) =>
                Response.json(await request.json()),
              ),
            );
            const off = routes.add(
              route('GET', '/gone', () => Response.json('gone')),
            );
            off();
          },
        }),
      ),
    );
    await runtime.host.enable('paths');
    const call = (method: string, path: string, body?: string) =>
      app.fetch(
        new Request(`http://localhost/api/plugins/paths${path}`, {
          method,
          body,
          headers: body ? { 'content-type': 'application/json' } : {},
        }),
      );

    expect(await (await call('GET', '')).json()).toBe('root');
    expect(await (await call('GET', '/')).json()).toBe('root');
    expect(await (await call('GET', '/files/a/b.txt')).json()).toBe('a/b.txt');
    expect(await (await call('GET', '/items/caf%C3%A9')).json()).toBe('café');
    expect(
      await (await call('POST', '/echo', '{"hello":"world"}')).json(),
    ).toEqual({ hello: 'world' });
    for (const [method, path] of [
      ['POST', '/items/1'],
      ['GET', '/echo'],
      ['GET', '/gone'],
      ['GET', '/items'],
    ] as const) {
      const response = await call(method, path);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: { code: 'not_found' },
      });
    }
  });
});
