import { resolve } from 'node:path';
import { apiUrl } from '#lib/server/api.js';
import { frontendSecret } from '#lib/server/frontend-secret.js';
import { WebFunctionsLoader } from '#lib/server/functions-loader.js';
import { WebHookBus } from '#lib/server/web-hooks.js';

export const webHooks = new WebHookBus(console);

export const webFunctions = new WebFunctionsLoader({
  url: new URL('/api/v1/internal/functions', apiUrl).href,
  directory: resolve('data/functions/.versions'),
  secret: frontendSecret,
  scope: (owner) => webHooks.scope(owner),
  logger: console,
});

export const startWebFunctions = () => webFunctions.start();
