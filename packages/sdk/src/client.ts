// HTTP clients for the API. Frontends must talk to the API through these only.
import type {
  SessionGrant,
  SetupStatus,
  LoginInput,
  SsoCallbackInput,
  SsoCallbackResult,
  SsoIdentityStatus,
  SsoInfo,
  SsoStart,
  SsoStartInput,
  UserProfile,
} from './auth';
import { SSO_CLIENT_ADDRESS_HEADER, SSO_FRONTEND_SECRET_HEADER } from './auth';
import type { ApiErrorBody, Paginated } from './common';
import type {
  InstallationStatus,
  InstallDatabaseInput,
  InstallCompleteInput,
} from './installation';
import type {
  ContentEntry,
  ContentInput,
  ContentListQuery,
  ContentType,
  PublicContent,
} from './content';
import type { PluginInfo, SettingValues } from './plugins';
import type { SiteSettings } from './site';
import type { SlotMap, SlotQuery } from './slots';

export class CmsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues?: unknown,
  ) {
    super(message);
    this.name = 'CmsApiError';
  }
}

export interface ClientOptions {
  /** Origin of the API, e.g. `http://localhost:4000`. */
  baseUrl: string;
  fetch?: typeof fetch;
}

type Query = Record<string, string | number | undefined>;

interface RequestOptions {
  query?: Query;
  json?: unknown;
  body?: BodyInit;
  contentType?: string;
  headers?: Record<string, string>;
}

const toSearch = (query: Query = {}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, String(value));
  const search = params.toString();
  return search ? `?${search}` : '';
};

const createTransport = (
  { baseUrl, fetch: fetcher = fetch }: ClientOptions,
  token?: string,
) => {
  return async <T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> => {
    const headers = new Headers({
      ...options.headers,
      accept: 'application/json',
    });
    if (token) headers.set('authorization', `Bearer ${token}`);
    let body = options.body;
    if (options.json !== undefined) {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(options.json);
    } else if (options.contentType) {
      headers.set('content-type', options.contentType);
    }

    const response = await fetcher(
      `${baseUrl}${path}${toSearch(options.query)}`,
      { method, headers, body },
    );
    if (response.status === 204) return undefined as T;
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = (payload as ApiErrorBody | null)?.error;
      throw new CmsApiError(
        response.status,
        error?.code ?? 'http_error',
        error?.message ?? response.statusText,
        error?.issues,
      );
    }
    return payload as T;
  };
};

/** Read-only access to published content. Needs no credentials. */
export const createContentClient = (options: ClientOptions) => {
  const request = createTransport(options);
  return {
    site: () => request<SiteSettings>('GET', '/api/v1/site'),
    list: (
      query: { type?: ContentType; page?: number; pageSize?: number } = {},
    ) => request<Paginated<PublicContent>>('GET', '/api/v1/content', { query }),
    getBySlug: (slug: string) =>
      request<PublicContent>(
        'GET',
        `/api/v1/content/${encodeURIComponent(slug)}`,
      ),
    slots: (query: SlotQuery = {}) =>
      request<SlotMap>('GET', '/api/v1/slots', { query }),
  };
};

/** Session handling. `token` is required for `logout` and `me`. */
export const createAuthClient = (options: ClientOptions, token?: string) => {
  const request = createTransport(options, token);
  return {
    status: () => request<SetupStatus>('GET', '/api/v1/auth/status'),
    login: (input: LoginInput) =>
      request<SessionGrant>('POST', '/api/v1/auth/login', { json: input }),
    logout: () => request<void>('POST', '/api/v1/auth/logout'),
    me: () => request<UserProfile>('GET', '/api/v1/auth/me'),
  };
};

/**
 * How a frontend server vouches for the browser it acts for. `secret` is the frontend secret
 * shared with the API (server-side only); `address` is the browser's IP address.
 */
export interface SsoClientProof {
  address: string;
  secret: string;
}

/** OpenID Connect single sign-on. `token` is required to link, unlink or read the link. */
export const createSsoClient = (options: ClientOptions, token?: string) => {
  const request = createTransport(options, token);

  return {
    info: () => request<SsoInfo>('GET', '/api/v1/auth/sso'),
    /** Without `client`, the request counts against a quota shared by all unproven clients. */
    start: (input: SsoStartInput = {}, client?: SsoClientProof) =>
      request<SsoStart>('POST', '/api/v1/auth/sso/start', {
        json: input,
        headers: client && {
          [SSO_CLIENT_ADDRESS_HEADER]: client.address,
          [SSO_FRONTEND_SECRET_HEADER]: client.secret,
        },
      }),
    callback: (input: SsoCallbackInput) =>
      request<SsoCallbackResult>('POST', '/api/v1/auth/sso/callback', {
        json: input,
      }),
    identity: () =>
      request<SsoIdentityStatus>('GET', '/api/v1/auth/sso/identity'),
    unlink: () => request<void>('DELETE', '/api/v1/auth/sso/identity'),
  };
};

/** Content and system management for a signed-in user. */
export const createAdminClient = (options: ClientOptions, token: string) => {
  const request = createTransport(options, token);
  const plugin = (id: string) =>
    `/api/v1/admin/plugins/${encodeURIComponent(id)}`;
  return {
    content: {
      list: (query: ContentListQuery = {}) =>
        request<Paginated<ContentEntry>>('GET', '/api/v1/admin/content', {
          query: query as Query,
        }),
      get: (id: string) =>
        request<ContentEntry>(
          'GET',
          `/api/v1/admin/content/${encodeURIComponent(id)}`,
        ),
      create: (input: ContentInput) =>
        request<ContentEntry>('POST', '/api/v1/admin/content', { json: input }),
      update: (id: string, input: ContentInput) =>
        request<ContentEntry>(
          'PUT',
          `/api/v1/admin/content/${encodeURIComponent(id)}`,
          { json: input },
        ),
      remove: (id: string) =>
        request<void>(
          'DELETE',
          `/api/v1/admin/content/${encodeURIComponent(id)}`,
        ),
    },
    site: {
      update: (input: SiteSettings) =>
        request<SiteSettings>('PUT', '/api/v1/admin/site', { json: input }),
    },
    plugins: {
      list: () => request<PluginInfo[]>('GET', '/api/v1/admin/plugins'),
      /** Installs or upgrades a plugin from a bundled ES module (see AGENTS.md, "Plugin bundle"). */
      install: (source: string) =>
        request<PluginInfo>('POST', '/api/v1/admin/plugins', {
          body: source,
          contentType: 'text/javascript',
        }),
      enable: (id: string) =>
        request<PluginInfo>('POST', `${plugin(id)}/enable`),
      disable: (id: string) =>
        request<PluginInfo>('POST', `${plugin(id)}/disable`),
      remove: (id: string) => request<void>('DELETE', plugin(id)),
      updateSettings: (id: string, values: SettingValues) =>
        request<PluginInfo>('PUT', `${plugin(id)}/settings`, { json: values }),
    },
  };
};

export type ContentClient = ReturnType<typeof createContentClient>;
export type AuthClient = ReturnType<typeof createAuthClient>;
export type SsoClient = ReturnType<typeof createSsoClient>;
export type AdminClient = ReturnType<typeof createAdminClient>;

/** First-run installation. Mutations require the key printed by the API server. */
export const createInstallationClient = (options: ClientOptions) => {
  const request = createTransport(options);
  return {
    status: () => request<InstallationStatus>('GET', '/api/v1/install/status'),
    database: (input: InstallDatabaseInput) =>
      request<InstallationStatus>('POST', '/api/v1/install/database', {
        json: input,
      }),
    complete: (input: InstallCompleteInput) =>
      request<SessionGrant>('POST', '/api/v1/install/complete', {
        json: input,
      }),
  };
};
