import { webPageDataSchemas } from '@cms/sdk/functions';
import type { ThemePage } from '#lib/theme/template.js';
import { renderRequest } from '#lib/server/render-request.js';

/** Only the route's public DTO is filterable; slots, session and form state stay untouched. */
export const filterPageData = async <P extends ThemePage>(
  page: P,
  path: string,
): Promise<P> => {
  const bus = renderRequest.getStore()?.bus;

  if (!bus?.has('page.data') || page.kind === 'error') return page;
  const schema = webPageDataSchemas[page.kind];
  const initial = schema.parse(page);
  const value = await bus.apply(
    'page.data',
    initial,
    { kind: page.kind, path },
    (input) => schema.strict().parse(input),
  );

  return { ...page, ...value } as P;
};
