import { json } from '@sveltejs/kit';
import { adminFor, requireCapability } from '#lib/server/session.js';
import type { RequestHandler } from './$types';

/** Blocks of active plugins, for the editor's inserter and block settings. */
export const GET: RequestHandler = async (event) => {
  requireCapability(event.locals, 'content.create');
  const blocks = await adminFor(event).pluginBlocks();
  return json(
    blocks.map(({ block, title, description, attributes }) => ({
      block,
      title,
      description,
      attributes,
    })),
  );
};
