import { json } from '@sveltejs/kit';
import { taxonomyInputSchema } from '@cms/sdk';
import { CmsApiError } from '@cms/sdk/client';
import { adminFor, requireCapability } from '#lib/server/session.js';
import type { RequestHandler } from './$types';

const termInputSchema = taxonomyInputSchema.pick({
  name: true,
  parentId: true,
});

/** Adds a category or tag from the content editor; answers with the fields the editor shows. */
export const POST: RequestHandler = async (event) => {
  requireCapability(event.locals, 'taxonomy.manage');
  const body = (await event.request.json().catch(() => null)) as {
    taxonomy?: unknown;
  } | null;
  const taxonomy =
    body?.taxonomy === 'category' || body?.taxonomy === 'tag'
      ? body.taxonomy
      : null;
  const input = termInputSchema.safeParse(body);
  if (!taxonomy || !input.success) return json({ ok: false }, { status: 400 });
  try {
    const { id, name, parentId } = await adminFor(event).taxonomy.create(
      taxonomy,
      input.data,
    );
    return json({ id, name, parentId }, { status: 201 });
  } catch (caught) {
    if (caught instanceof CmsApiError && caught.status < 500)
      return json({ message: caught.message }, { status: caught.status });
    throw caught;
  }
};
