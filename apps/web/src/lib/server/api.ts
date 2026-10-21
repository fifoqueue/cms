// The only way this app reaches the CMS: the SDK clients (see AGENTS.md, "Frontend contract").
import { CMS_API_URL } from '$app/env/private';
import {
  createAdminClient,
  createAuthClient,
  createContentClient,
  createInstallationClient,
} from '@cms/sdk/client';

type Fetch = typeof fetch;

export const contentApi = (fetch: Fetch) =>
  createContentClient({ baseUrl: CMS_API_URL, fetch });

export const authApi = (fetch: Fetch, token?: string | null) =>
  createAuthClient({ baseUrl: CMS_API_URL, fetch }, token ?? undefined);

export const adminApi = (fetch: Fetch, token: string) =>
  createAdminClient({ baseUrl: CMS_API_URL, fetch }, token);

export const installationApi = (fetch: Fetch) =>
  createInstallationClient({ baseUrl: CMS_API_URL, fetch });
