import { json } from '@sveltejs/kit';
import { adminFor, requireCapability } from '#lib/server/session.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
  requireCapability(event.locals, 'content.create');
  const { type, blocks } = await adminFor(
    event,
  ).contentModel.editorConfiguration(
    event.url.searchParams.get('type') ?? 'post',
  );

  return json({ type, blocks });
};
