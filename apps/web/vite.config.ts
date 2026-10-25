import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { scanDocumentRoutes } from '#lib/server/route-kinds.js';
import { removeApiSecrets } from '#web-env';

removeApiSecrets();

// One .env at the repository root serves both the API and the web app.
const envDir = '../..';

/**
 * `virtual:cms/route-kinds`: route IDs (strings only) of endpoints without a page, read from
 * `src/routes` because `$app/manifest` is empty in dev whenever `svelte-kit sync` runs.
 */
const routeKinds = (): Plugin => {
  const id = 'virtual:cms/route-kinds';
  const resolved = `\0${id}`;
  const routes = fileURLToPath(new URL('src/routes', import.meta.url));
  const generate = () =>
    `export const documents = ${JSON.stringify(scanDocumentRoutes(routes))};\n`;
  let code = '';
  return {
    name: 'cms:route-kinds',
    resolveId: (source) => (source === id ? resolved : undefined),
    load(source) {
      if (source === resolved) return (code = generate());
    },
    configureServer(server) {
      const refresh = (file: string) => {
        const path = relative(routes, file);
        if (!path || path.startsWith('..') || isAbsolute(path)) return;
        const next = generate();
        if (next === code) return;
        code = next;
        for (const environment of Object.values(server.environments)) {
          const node = environment.moduleGraph.getModuleById(resolved);
          if (node) environment.moduleGraph.invalidateModule(node);
        }
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher
        .on('add', refresh)
        .on('unlink', refresh)
        .on('unlinkDir', refresh);
    },
  };
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, '');
  return {
    server: {
      port: Number(env.WEB_PORT) || undefined,
      host: env.WEB_HOST || undefined,
    },
    // Browser assets: Oxc minifies JS and Lightning CSS minifies CSS in production builds.
    // The server bundle keeps Vite's default (unminified JS) for readable stack traces.
    environments: {
      client: { build: { minify: 'oxc', cssMinify: 'lightningcss' } },
    },
    plugins: [
      routeKinds(),
      tailwindcss(),
      sveltekit({
        compilerOptions: {
          // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
          runes: ({ filename }) =>
            filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
        },
        // The reverse proxy compresses responses; .br/.gz copies would triple every asset.
        adapter: adapter({ precompress: false }),
        env: { dir: envDir },
        // The push worker is registered only when a visitor or editor turns notifications on
        // (`#lib/push-client.js`), never on every page load.
        serviceWorker: { register: false },
      }),
    ],
  };
});
