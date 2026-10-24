import { readdirSync } from 'node:fs';
import { sep } from 'node:path';

// SvelteKit's route files (default `extensions` and `moduleExtensions`).
const page = /^\+page(?:@.*)?(?:\.server)?\.(?:svelte|js|ts)$/;
const endpoint = /^\+server\.(?:js|ts)$/;
const ignored = /\.(?:test|spec|stories)\.|\.d\.ts$/;

/**
 * The route ID of a file under `src/routes` (posix, relative), as SvelteKit derives it:
 * the directory path verbatim — groups, params, rest, matchers and optional params included.
 */
export const routeId = (file: string) =>
  `/${file.split('/').slice(0, -1).join('/')}`;

/** Route IDs with a `+server` but no `+page`: only a document request reaches them. */
export const documentRoutes = (files: readonly string[]) => {
  const pages = new Set<string>();
  const endpoints = new Set<string>();
  for (const file of files) {
    const name = file.slice(file.lastIndexOf('/') + 1);
    if (ignored.test(name)) continue;
    if (page.test(name)) pages.add(routeId(file));
    else if (endpoint.test(name)) endpoints.add(routeId(file));
  }
  return [...endpoints].filter((id) => !pages.has(id)).sort();
};

/** Scan a routes directory for its document routes. */
export const scanDocumentRoutes = (dir: string) =>
  documentRoutes(
    readdirSync(dir, { recursive: true, encoding: 'utf8' }).map((file) =>
      file.split(sep).join('/'),
    ),
  );
