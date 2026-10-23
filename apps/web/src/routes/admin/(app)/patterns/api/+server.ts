import { json } from '@sveltejs/kit';
import { can, patternListQuerySchema } from '@cms/sdk';
import { notFoundFrom } from '#lib/server/errors.js';
import { CmsApiError } from '@cms/sdk/client';
import { adminFor, requireCapability } from '#lib/server/session.js';
import type { RequestHandler } from './$types';

/** The editor's pattern library: what the inserter shows and inserts. */
export const GET: RequestHandler = async (event) => {
  requireCapability(event.locals, 'content.create');
  const id = event.url.searchParams.get('id');
  const headers = { 'cache-control': 'private, no-store' };
  if (id) {
    const {
      id: patternId,
      title,
      synced,
      status,
      document,
    } = await adminFor(event).patterns.get(id).catch(notFoundFrom);
    return json(
      { id: patternId, title, synced, status, document },
      { headers },
    );
  }
  const query = patternListQuerySchema.safeParse(
    Object.fromEntries(event.url.searchParams),
  );
  const patterns = await adminFor(event).patterns.list(
    query.success ? query.data : {},
  );
  return json(
    {
      items: patterns.items.map(
        ({ id, title, synced, status, authorId, updatedAt }) => ({
          id,
          title,
          synced,
          status,
          authorId,
          updatedAt,
        }),
      ),
      total: patterns.total,
      page: patterns.page,
      pageSize: patterns.pageSize,
    },
    { headers },
  );
};

/** "Create pattern" from the editor's selection; drafts for users who may not publish. */
export const POST: RequestHandler = async (event) => {
  requireCapability(event.locals, 'content.create');
  const body = (await event.request.json().catch(() => null)) as {
    title?: unknown;
    synced?: unknown;
    document?: unknown;
  } | null;
  try {
    const { id, title, synced, status, document } = await adminFor(
      event,
    ).patterns.create({
      title: typeof body?.title === 'string' ? body.title : '',
      synced: body?.synced !== false,
      document: body?.document as never,
      status: can(event.locals.user!, 'content.publish')
        ? 'published'
        : 'draft',
    });
    return json({ id, title, synced, status, document }, { status: 201 });
  } catch (caught) {
    if (caught instanceof CmsApiError && caught.status < 500)
      return json({ message: caught.message }, { status: caught.status });
    throw caught;
  }
};
