import type { RequestEvent } from '@sveltejs/kit';
import { CmsApiError } from '@cms/sdk/client';
import type {
  AdminMenuItem,
  AdminBlock,
  AdminScreen,
  AdminScreenResponse,
  PageAsset,
} from '@cms/sdk';
import { adminApi } from '#lib/server/api.js';
import { readSelection } from '#lib/server/bulk.js';
import type { BulkFailure } from '#lib/server/bulk.js';
import { Errors, failFrom, text } from '#lib/server/errors.js';

/** Every admin UI extension call, including its response body, ends within this many ms. */
export const ADMIN_UI_TIMEOUT_MS = 1500;

/** Bulk menu values naming an extension action carry this prefix before the action key. */
export const EXTENSION_ACTION = 'ext:';

/** URL and list-query parameters of extension filters: this prefix before the filter key. */
export const FILTER_PREFIX = 'filter.';

type UiEvent = Pick<RequestEvent, 'fetch' | 'locals'>;

/** An extension action call, including its response body, ends within this many ms. */
export const ADMIN_UI_ACTION_TIMEOUT_MS = 3000;

/** The `ui` client for the signed-in user, every request bounded by `timeoutMs`; null when signed out. */
const ui = (event: UiEvent, timeoutMs = ADMIN_UI_TIMEOUT_MS) => {
  const token = event.locals.token;

  if (!token) return null;
  const bounded: typeof fetch = (input, init) =>
    event.fetch(input, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });

  return adminApi(bounded, token).ui;
};

/** Runs one extension call; any failure or timeout yields `fallback`, so the core UI still renders. */
const optional = async <T>(call: () => Promise<T> | undefined, fallback: T) => {
  try {
    return (await call()) ?? fallback;
  } catch {
    return fallback;
  }
};

export const loadMenu = (event: UiEvent): Promise<AdminMenuItem[]> =>
  optional(
    () =>
      ui(event)
        ?.menu()
        .then(({ items }) =>
          items.map(
            ({
              key,
              label,
              href,
              parent,
              position,
              core,
              labelOverridden,
              hidden,
            }) => ({
              key,
              label,
              href,
              parent,
              position,
              core,
              labelOverridden,
              hidden,
            }),
          ),
        ),
    [],
  );

export const loadAdminBar = (event: UiEvent) =>
  optional(
    () =>
      ui(event)
        ?.adminBar()
        .then(({ items }) =>
          items.map(({ key, label, href }) => ({ key, label, href })),
        ),
    [] as { key: string; label: string; href: string }[],
  );

/**
 * The screen name for notices and assets: the route id under `/admin/(app)` without its
 * leading slash (`content`, `content/[id]`, `tools/functions`), `dashboard` for the dashboard.
 */
export const screenName = (routeId: string) =>
  routeId.replace(/^\/admin\/\(app\)\/?/, '') || 'dashboard';

const blockOf = (block: AdminBlock): AdminBlock =>
  block.kind === 'notice'
    ? { kind: 'notice', tone: block.tone, text: block.text }
    : block;

export const loadNotices = (event: UiEvent, screen: string) =>
  optional(
    () =>
      ui(event)
        ?.notices(screen)
        .then(({ notices }) => notices.map(blockOf)),
    [] as AdminBlock[],
  );

export const loadAssets = (event: UiEvent, screen: string) =>
  optional(
    () =>
      ui(event)
        ?.assets(screen)
        .then((assets) =>
          assets.map(({ key, kind, src, placement, attrs }): PageAsset => ({
            key,
            kind,
            src,
            placement,
            attrs: {
              defer: attrs.defer,
              async: attrs.async,
              module: attrs.module,
              integrity: attrs.integrity,
              crossorigin: attrs.crossorigin,
            },
          })),
        ),
    [] as PageAsset[],
  );

export type ScreenExtensions = AdminScreenResponse;

const item = ({ key, label }: { key: string; label: string }) => ({
  key,
  label,
});

/** No extensions: what a list screen shows when none are registered or the call fails. */
export const noExtensions = (): ScreenExtensions => ({
  columns: [],
  values: {},
  rowActions: [],
  bulkActions: [],
  filters: [],
});

/** Columns (with the values of `ids` only), row and bulk actions and filters of one list screen, in one call. */
export const loadScreen = (
  event: UiEvent,
  screen: AdminScreen,
  ids: readonly string[],
) =>
  optional(
    () =>
      ui(event)
        ?.screen(screen, ids.slice(0, 100))
        .then((response): ScreenExtensions => ({
          columns: response.columns.map(item),
          values: Object.fromEntries(
            ids.map((id) => [id, { ...response.values[id] }]),
          ),
          rowActions: response.rowActions.map(item),
          bulkActions: response.bulkActions.map(item),
          filters: response.filters.map((filter) => ({
            ...item(filter),
            options: filter.options.map(({ value, label }) => ({
              value,
              label,
            })),
          })),
        })),
    noExtensions(),
  );

/** Rows per page on list screens the API returns whole; one screen call covers a page. */
export const SCREEN_PAGE_SIZE = 100;

/**
 * Page `?page=` (clamped to the existing pages) of `items`, `SCREEN_PAGE_SIZE` rows each, and the
 * pager state.
 */
export const pageOf = <T>(items: readonly T[], params: URLSearchParams) => {
  const pageCount = Math.max(1, Math.ceil(items.length / SCREEN_PAGE_SIZE));
  const requested = Math.trunc(Number(params.get('page')));
  const page = Math.min(
    Math.max(1, Number.isFinite(requested) ? requested : 1),
    pageCount,
  );

  return {
    items: items.slice((page - 1) * SCREEN_PAGE_SIZE, page * SCREEN_PAGE_SIZE),
    list: { page, total: items.length, pageSize: SCREEN_PAGE_SIZE },
  };
};

const FILTER_KEY = /^[a-zA-Z0-9:._-]{1,191}$/;

/**
 * Extension filter values from the address (`filter.<key>=<value>`), forwarded unchanged to the
 * list query; the API applies only registered filters with their own options.
 */
export const readFilters = (params: URLSearchParams) =>
  Object.fromEntries(
    [...params]
      .filter(
        ([name, value]) =>
          name.startsWith(FILTER_PREFIX) &&
          FILTER_KEY.test(name.slice(FILTER_PREFIX.length)) &&
          value !== '' &&
          value.length <= 200,
      )
      .slice(0, 20),
  );

/**
 * Runs extension action `key` (bulk menu value `ext:<key>`, or the `action` field of a row
 * action form) for the submitted `ids`, bounded by `ADMIN_UI_ACTION_TIMEOUT_MS`. Reports
 * `{ bulk: { done, failed } }` like the core bulk actions, plus the action's notice block. A
 * refusal (4xx) is a form failure; a server error, malformed answer or timeout reports every id
 * as failed, so the list stays usable.
 */
export const runExtensionAction = async (
  event: UiEvent,
  screen: AdminScreen,
  form: FormData,
  valid?: (id: string) => boolean,
) => {
  const key = text(form, 'action').replace(EXTENSION_ACTION, '');
  const selection = readSelection(form, valid);
  const client = ui(event, ADMIN_UI_ACTION_TIMEOUT_MS);

  if (selection.failure) return selection.failure;
  if (!selection.ids.length || !client) return {};
  const invalid: BulkFailure[] = selection.invalid.map((id) => ({
    id: id.slice(0, 100),
    message: Errors.BulkItemInvalid,
  }));
  let result: Awaited<ReturnType<typeof client.action>>;

  try {
    result = await client.action(screen, key, { ids: [...selection.ids] });
  } catch (caught) {
    if (caught instanceof CmsApiError && caught.status < 500)
      return failFrom(caught);

    return {
      bulk: {
        done: 0,
        failed: [
          ...invalid,
          ...selection.ids.map((id) => ({
            id,
            message: Errors.BulkItemFailed,
          })),
        ],
      },
      extensionNotice: null,
    };
  }

  return {
    bulk: {
      done: selection.ids.length - result.failed.length,
      failed: [
        ...invalid,
        ...result.failed.map((id) => ({ id, message: Errors.BulkItemFailed })),
      ],
    },
    extensionNotice: result.notice ? blockOf(result.notice) : null,
  };
};
