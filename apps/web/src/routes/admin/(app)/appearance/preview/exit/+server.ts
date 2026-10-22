import { redirect } from '@sveltejs/kit';
import { endThemePreview } from '#lib/server/theme-preview.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ cookies }) => {
  endThemePreview(cookies);
  redirect(303, '/admin/appearance');
};
