import { SLOT_NAMES } from '@cms/sdk';
import type { PageRender, PageRenderQuery, SlotMap } from '@cms/sdk';
import type { ContentClient } from '@cms/sdk/client';
import { renderRequest } from '#lib/server/render-request.js';
import type { RenderRequest } from '#lib/server/render-request.js';
import { applyWebPresentation } from '#lib/server/web-render.js';
import type { PageSlots } from '#lib/theme/presentation.js';
import { assetHtml, headTagHtml } from '#lib/server/render-security.js';

export const emptySlots = () =>
  Object.fromEntries(
    SLOT_NAMES.map((name) => [name, []]),
  ) as unknown as SlotMap;

export const emptyPageRender = (): PageRender => ({
  slots: Object.fromEntries(
    SLOT_NAMES.map((name) => [name, '']),
  ) as PageRender['slots'],
  bodyClasses: [],
  assets: [],
  headers: {},
  templateCandidates: [],
});

/** A failed presentation RPC never makes a public page unavailable. */
export const loadPageRender = (
  api: ContentClient,
  query: PageRenderQuery,
): Promise<PageRender> => api.pageRender(query).catch(() => emptyPageRender());

/** Slot HTML for a page. Plugins are optional, so a failure here never breaks the page. */
export const loadSlots = (
  api: ContentClient,
  query: PageRenderQuery,
): Promise<PageSlots> => {
  const request = renderRequest.getStore();

  if (request?.pending) return slotPresentation(request.pending, true);
  const pending = loadPageRender(api, query).then((payload) =>
    request
      ? applyWebPresentation(
          request.bus,
          {
            path: query.path ?? '/',
            kind: query.kind ?? 'content',
            type: query.type,
            slug: query.slug,
            contentId: query.contentId,
            status:
              query.status === undefined ? undefined : Number(query.status),
          },
          payload,
        )
      : { render: payload, head: [] },
  );

  if (request) request.pending ??= pending;

  return slotPresentation(request?.pending ?? pending, Boolean(request));
};

const slotPresentation = (
  pending: NonNullable<RenderRequest['pending']>,
  expose: boolean,
): Promise<PageSlots> =>
  pending.then((presentation) => ({
    ...(Object.fromEntries(
      SLOT_NAMES.map((name) => [
        name,
        presentation.render.slots[name]
          ? [presentation.render.slots[name]]
          : [],
      ]),
    ) as SlotMap),
    ...(expose
      ? {
          presentation: {
            ...presentation,
            headHtml:
              presentation.head.map(headTagHtml).join('') +
              presentation.render.assets
                .filter((asset) => asset.placement === 'head')
                .map(assetHtml)
                .join(''),
            footerHtml: presentation.render.assets
              .filter((asset) => asset.placement === 'footer')
              .map(assetHtml)
              .join(''),
          },
        }
      : {}),
  }));
