import type { PageRender } from '@cms/sdk';
import { acceptsResponseHeaders, SLOT_NAMES } from '@cms/sdk';
import { sanitizeSlot } from '#lib/server/slot-html.js';
import { renderHeaders } from '#lib/server/render-security.js';
import {
  webAssetsSchema,
  webBodyClassesSchema,
  webTemplateCandidatesSchema,
  webHeadSchema,
  webHeadersSchema,
} from '@cms/sdk/functions';
import type { WebPageContext } from '@cms/sdk/functions';
import type { WebHookBus } from '#lib/server/web-hooks.js';

/** Route data must be projected and schema-validated before and after extension filters. */
export const applyWebRender = async <T extends Record<string, unknown>>(
  bus: WebHookBus,
  page: WebPageContext,
  payload: PageRender,
  data: T,
  parseData: (value: unknown) => T,
) => {
  const filtered = await bus.apply('page.data', data, page, parseData);
  const presentation = await applyWebPresentation(bus, page, payload);

  return { data: parseData(filtered), ...presentation };
};

export const applyWebPresentation = async (
  bus: WebHookBus,
  page: WebPageContext,
  payload: PageRender,
) => {
  const templateCandidates = await bus.apply(
    'template.candidates',
    payload.templateCandidates,
    page,
    (value) => webTemplateCandidatesSchema.parse(value),
  );
  const bodyClasses = await bus.apply(
    'page.bodyClasses',
    payload.bodyClasses,
    page,
    (value) => webBodyClassesSchema.parse(value),
  );
  const head = await bus.apply('page.head', [], page, (value) =>
    webHeadSchema.parse(value),
  );
  let previousHeaders = payload.headers;
  const headerSchema = webHeadersSchema.refine((value) =>
    acceptsResponseHeaders(value, previousHeaders, true),
  );
  const headers = await bus.apply(
    'response.headers',
    payload.headers,
    page,
    (value) => {
      previousHeaders = headerSchema.parse(value);

      return previousHeaders;
    },
  );
  const registered = bus.assets((value) =>
    webAssetsSchema.element.parse(value),
  );
  const assets = await bus.apply(
    'assets',
    [
      ...new Map(
        [...payload.assets, ...registered].map((asset) => [asset.key, asset]),
      ).values(),
    ],
    page,
    (value) => webAssetsSchema.parse(value),
  );

  const slots = { ...payload.slots };
  const safeHeaders = new Headers();

  renderHeaders(safeHeaders, headers);

  for (const name of SLOT_NAMES)
    slots[name] += await bus.slot(name, page, sanitizeSlot);

  return {
    head,
    render: {
      ...payload,
      slots,
      templateCandidates,
      bodyClasses,
      headers: Object.fromEntries(safeHeaders),
      assets,
    },
  };
};
