import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { removeApiSecrets } from '#web-env';

removeApiSecrets();

// One .env at the repository root serves both the API and the web app.
const envDir = '../..';

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
      }),
    ],
  };
});
