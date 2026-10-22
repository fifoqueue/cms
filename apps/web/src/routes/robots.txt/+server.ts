import { contentApi } from '#lib/server/api.js';
import { robotsTxt } from '#lib/server/seo-discovery.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ fetch }) =>
  robotsTxt(await contentApi(fetch).seo.settings());
