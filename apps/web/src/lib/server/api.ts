// The only way this app reaches the CMS: the SDK clients (see AGENTS.md, "Frontend contract").
import { API_PORT, CMS_API_URL } from '$app/env/private';
import {
  createAdminClient,
  createAvatarClient,
  createAuthClient,
  createContentClient,
  createInstallationClient,
  createMediaClient,
} from '@cms/sdk/client';

type Fetch = typeof fetch;
import type { ClientProof } from '@cms/sdk/client';

/** The API listens on this machine by default, so follow its port unless an address is given. */
export const apiUrl = CMS_API_URL || `http://127.0.0.1:${API_PORT}`;

export const contentApi = (fetch: Fetch, token?: string | null) =>
  createContentClient({ baseUrl: apiUrl, fetch }, token ?? undefined);

export const authApi = (fetch: Fetch, token?: string | null) =>
  createAuthClient({ baseUrl: apiUrl, fetch }, token ?? undefined);

export const adminApi = (fetch: Fetch, token: string, proof?: ClientProof) =>
  createAdminClient({ baseUrl: apiUrl, fetch }, token, proof);

export const installationApi = (fetch: Fetch) =>
  createInstallationClient({ baseUrl: apiUrl, fetch });

export const mediaFiles = (fetch: Fetch) =>
  createMediaClient({ baseUrl: apiUrl, fetch });

export const avatarFiles = (fetch: Fetch) =>
  createAvatarClient({ baseUrl: apiUrl, fetch });
