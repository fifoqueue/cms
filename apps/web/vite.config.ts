import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
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
      adapter: adapter(),
    }),
  ],
});
