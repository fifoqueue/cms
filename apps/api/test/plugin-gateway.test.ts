import { describe, expect, test } from 'bun:test';
import { definePlugin } from '@cms/sdk/plugin';
import { createApiApp } from '#api/http/app';
import { PluginGateway } from '#api/http/plugin-gateway';
import type { PluginGatewayDeps } from '#api/http/plugin-gateway';
import type { ApiServices } from '#api/http/services';
import { profile } from '#test/support/memory';
import { createRuntime } from '#test/support/runtime';

const ADMIN_TOKEN = 'admin-token';
const SUBSCRIBER_TOKEN = 'subscriber-token';

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
    authenticate: async (token: string) => {
      if (token === ADMIN_TOKEN)
        return profile({ id: 'u', email: 'a@example.com', name: 'Admin' });
      if (token === SUBSCRIBER_TOKEN)
        return profile({
          id: 'subscriber',
          role: 'subscriber',
          capabilities: [],
        });
      return null;
    },
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
    expect((await call('/api/plugins/echo/me', SUBSCRIBER_TOKEN)).status).toBe(
      403,
    );
    expect(
      await (await call('/api/plugins/echo/me', ADMIN_TOKEN)).json(),
    ).toMatchObject({ id: 'u' });
    expect((await call('/api/plugins/echo/crash')).status).toBe(502);
    expect((await call('/api/plugins/unknown/anything')).status).toBe(404);
  });
});
