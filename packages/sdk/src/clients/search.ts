import {
  adminSearchSettingsSchema,
  searchStatusSchema,
  searchTestResultSchema,
} from '#sdk/search';
import type {
  AdminSearchSettings,
  SearchSettingsInput,
  SearchStatus,
} from '#sdk/search';
import type { Request } from '#sdk/transport';

/** Meilisearch connection and index status; needs `settings.manage`. */
export const searchAdminClient = (request: Request) => ({
  search: {
    settings: () =>
      request<AdminSearchSettings>('GET', '/api/v1/admin/search', {
        response: adminSearchSettingsSchema,
      }),
    update: (input: SearchSettingsInput) =>
      request<AdminSearchSettings>('PUT', '/api/v1/admin/search', {
        json: input,
        response: adminSearchSettingsSchema,
      }),
    status: () =>
      request<SearchStatus>('GET', '/api/v1/admin/search/status', {
        response: searchStatusSchema,
      }),
    test: () =>
      request<{ version: string }>('POST', '/api/v1/admin/search/test', {
        response: searchTestResultSchema,
      }),
    reindex: () => request<void>('POST', '/api/v1/admin/search/reindex'),
  },
});
