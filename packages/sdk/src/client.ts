import { archivePathsStateSchema } from '#sdk/archive-paths';
import type { ArchiveBases, ArchivePathsState } from '#sdk/archive-paths';
import { taxonomyDefinitionSchema } from '#sdk/taxonomy';
import type { TaxonomyDefinition } from '#sdk/taxonomy';
import { membershipSchema, roleDefinitionSchema } from '#sdk/roles';
import type { RoleDefinition } from '#sdk/roles';
// HTTP clients for the API. Frontends must talk to the API through these only.
import { z } from 'zod';
import { publicPrivacyClient, privacyAdminClient } from '#sdk/clients/privacy';
import { createTransport, pageSchema } from '#sdk/transport';
import { profileClient, usersClient } from '#sdk/clients/users';
import { mediaAdminClient } from '#sdk/clients/media';
import { searchAdminClient } from '#sdk/clients/search';
import { toolsAdminClient } from '#sdk/clients/tools';
import {
  commentsAdminClient,
  publicCommentsClient,
} from '#sdk/clients/comments';
import {
  appearanceAdminClient,
  publicAppearanceClient,
} from '#sdk/clients/appearance';
import {
  contentModelClient,
  publicTypesClient,
} from '#sdk/clients/content-types';
import {
  contentWorkflowClient,
  publicEntriesClient,
  unlockHeaders,
} from '#sdk/clients/content';
import {
  captchaClient,
  credentialsClient,
  passwordRecoveryClient,
  securityAdminClient,
  ssoAdminClient,
  visitorHeaders,
} from '#sdk/clients/security';
import type { ClientProof, Visitor } from '#sdk/clients/security';
import type { ClientOptions, Query } from '#sdk/transport';
import type {
  SessionGrant,
  SessionInfo,
  SetupStatus,
  LoginInput,
  SsoCallbackInput,
  SsoCallbackResult,
  SsoIdentityStatus,
  SsoInfo,
  SsoStart,
  SsoStartInput,
  UserProfile,
} from '#sdk/auth';
import {
  SSO_CLIENT_ADDRESS_HEADER,
  SSO_FRONTEND_SECRET_HEADER,
  adminUserSchema,
  sessionGrantSchema,
  sessionInfoSchema,
  setupStatusSchema,
  ssoInfoSchema,
  ssoStartResultSchema,
  ssoCallbackResultSchema,
  ssoIdentityStatusSchema,
} from '#sdk/auth';
import type { Paginated } from '#sdk/common';
import type {
  InstallationStatus,
  InstallDatabaseInput,
  InstallCompleteInput,
} from '#sdk/installation';
import { installationStatusSchema } from '#sdk/installation';
import type {
  AdminContentSummary,
  ContentCounts,
  ContentEntry,
  ContentInput,
  ContentListQuery,
  PublicContent,
  PublicContentListQuery,
  PublicContentSummary,
} from '#sdk/content';
import {
  contentCountsSchema,
  adminContentSchema,
  adminContentSummarySchema,
  publicContentSchema,
  publicContentSummarySchema,
} from '#sdk/content';
import type {
  PluginBlockInfo,
  PluginInfo,
  PluginPage,
  PluginPageSummary,
  DashboardWidget,
  PluginUpdate,
  SettingValues,
} from '#sdk/plugins';
import {
  adminPluginSchema,
  pluginBlockInfoSchema,
  pluginPageResultSchema,
  pluginPageSchema,
  pluginPageSummarySchema,
  dashboardWidgetSchema,
  pluginUpdateSchema,
} from '#sdk/plugins';
import type {
  AdminSiteDto,
  PublicSiteDto,
  SiteSettings,
  SiteSettingsInput,
} from '#sdk/site';
import {
  adminSiteSchema,
  publicSiteSchema,
  siteSettingsSchema,
} from '#sdk/site';
import type { SlotMap, SlotQuery } from '#sdk/slots';
import { slotMapSchema } from '#sdk/slots';
import type {
  AdminTaxonomyTerm,
  PublicTaxonomyTerm,
  TaxonomyInput,
  TaxonomyType,
} from '#sdk/taxonomy';
import {
  adminTaxonomyTermSchema,
  publicTaxonomyTermSchema,
} from '#sdk/taxonomy';
import type { BlockInput } from '#sdk/blocks';
import type {
  AdminTheme,
  PublicTheme,
  ThemeEditor,
  ThemeStylesInput,
} from '#sdk/themes';
import {
  adminThemeSchema,
  publicThemeSchema,
  themeEditorSchema,
  themePreviewSchema,
} from '#sdk/themes';
import {
  publicSeoSettingsSchema,
  seoSettingsSchema,
  seoSitemapEntrySchema,
} from '#sdk/seo';
import type {
  AdminSeoSettings,
  PublicSeoSettings,
  SeoSettingsInput,
  SeoSitemapEntry,
  SeoSitemapQuery,
} from '#sdk/seo';
import { permalinkSettingsSchema } from '#sdk/permalinks';
import type { PermalinkSettings } from '#sdk/permalinks';

export { CmsApiError } from '#sdk/transport';
export type { ClientOptions, Request } from '#sdk/transport';

/** Read-only access to published content. Needs no credentials. */
export const createContentClient = (options: ClientOptions, token?: string) => {
  const request = createTransport(options, token);
  return {
    ...captchaClient(request),
    ...publicPrivacyClient(request),
    ...publicTypesClient(request),
    ...publicAppearanceClient(request),
    ...publicCommentsClient(request),
    ...publicEntriesClient(request),
    /** `proofs` unlock password-protected entries the visitor opened. */
    resolvePath: (path: string, proofs?: readonly string[]) =>
      request<{ content: PublicContent; redirect: boolean }>(
        'GET',
        '/api/v1/resolve',
        {
          query: { path },
          headers: unlockHeaders(proofs),
          response: z.strictObject({
            content: publicContentSchema,
            redirect: z.boolean(),
          }),
        },
      ),
    archivePaths: {
      get: () =>
        request<ArchivePathsState>('GET', '/api/v1/permalinks/archives', {
          response: archivePathsStateSchema,
        }),
    },
    permalinks: {
      settings: () =>
        request<PermalinkSettings>('GET', '/api/v1/permalinks', {
          response: permalinkSettingsSchema,
        }),
    },
    seo: {
      settings: () =>
        request<PublicSeoSettings>('GET', '/api/v1/seo', {
          response: publicSeoSettingsSchema,
        }),
      sitemap: (query: SeoSitemapQuery = {}) =>
        request<Paginated<SeoSitemapEntry>>('GET', '/api/v1/seo/sitemap', {
          query: query as Query,
          response: pageSchema(seoSitemapEntrySchema),
        }),
    },
    site: () =>
      request<PublicSiteDto>('GET', '/api/v1/site', {
        response: publicSiteSchema,
      }),
    /** `preview` is a token from `themes.preview`; invalid or expired ones show the active theme. */
    theme: (preview?: string) =>
      request<PublicTheme>('GET', '/api/v1/theme', {
        query: { preview },
        response: publicThemeSchema,
      }),
    taxonomy: {
      list: (taxonomy: TaxonomyType) =>
        request<PublicTaxonomyTerm[]>(
          'GET',
          `/api/v1/taxonomies/${encodeURIComponent(taxonomy)}`,
          { response: z.array(publicTaxonomyTermSchema) },
        ),
      getBySlug: (taxonomy: TaxonomyType, slug: string) =>
        request<PublicTaxonomyTerm>(
          'GET',
          `/api/v1/taxonomies/${encodeURIComponent(taxonomy)}/${encodeURIComponent(slug)}`,
          { response: publicTaxonomyTermSchema },
        ),
    },
    list: (query: PublicContentListQuery = {}) =>
      request<Paginated<PublicContentSummary>>('GET', '/api/v1/content', {
        query: {
          ...query,
          include: Array.isArray(query.include)
            ? query.include.join(',')
            : query.include,
          exclude: Array.isArray(query.exclude)
            ? query.exclude.join(',')
            : query.exclude,
          parent: query.parent === null ? '0' : query.parent,
        } as Query,
        response: pageSchema(publicContentSummarySchema),
      }),
    getBySlug: (slug: string, proofs?: readonly string[]) =>
      request<PublicContent>(
        'GET',
        `/api/v1/content/${encodeURIComponent(slug)}`,
        { response: publicContentSchema, headers: unlockHeaders(proofs) },
      ),
    slots: (query: SlotQuery = {}) =>
      request<SlotMap>('GET', '/api/v1/slots', {
        query,
        response: slotMapSchema,
      }),
  };
};

/** Session handling. `token` is required for `logout` and `me`. */
export const createAuthClient = (options: ClientOptions, token?: string) => {
  const request = createTransport(options, token);
  return {
    status: () =>
      request<SetupStatus>('GET', '/api/v1/auth/status', {
        response: setupStatusSchema,
      }),
    /** `visitor` lets the API count failed attempts per visitor and accept a solved captcha. */
    login: (input: LoginInput, visitor?: Visitor) =>
      request<SessionGrant>('POST', '/api/v1/auth/login', {
        json: input,
        response: sessionGrantSchema,
        headers: visitorHeaders(visitor),
      }),
    membership: () =>
      request<{ enabled: boolean }>('GET', '/api/v1/auth/register', {
        response: membershipSchema,
      }),
    register: (input: { name: string; email: string }, visitor?: Visitor) =>
      request<void>('POST', '/api/v1/auth/register', {
        json: input,
        headers: visitorHeaders(visitor),
      }),
    password: passwordRecoveryClient(request),
    ...credentialsClient(request),
    logout: () => request<void>('POST', '/api/v1/auth/logout'),
    me: () =>
      request<UserProfile>('GET', '/api/v1/auth/me', {
        response: adminUserSchema,
      }),
    profile: profileClient(request),
    /** The signed-in user's own sessions. */
    sessions: {
      list: () =>
        request<SessionInfo[]>('GET', '/api/v1/auth/sessions', {
          response: z.array(sessionInfoSchema),
        }),
      revoke: (id: string) =>
        request<void>(
          'DELETE',
          `/api/v1/auth/sessions/${encodeURIComponent(id)}`,
        ),
    },
  };
};

/** OpenID Connect single sign-on. `token` is required to link, unlink or read the link. */
export const createSsoClient = (options: ClientOptions, token?: string) => {
  const request = createTransport(options, token);

  return {
    info: () =>
      request<SsoInfo>('GET', '/api/v1/auth/sso', {
        response: ssoInfoSchema,
      }),
    /** Without `client`, the request counts against a quota shared by all unproven clients. */
    start: (input: SsoStartInput = {}, client?: ClientProof) =>
      request<SsoStart>('POST', '/api/v1/auth/sso/start', {
        json: input,
        response: ssoStartResultSchema,
        headers: client && {
          [SSO_CLIENT_ADDRESS_HEADER]: client.address,
          [SSO_FRONTEND_SECRET_HEADER]: client.secret,
        },
      }),
    callback: (input: SsoCallbackInput) =>
      request<SsoCallbackResult>('POST', '/api/v1/auth/sso/callback', {
        json: input,
        response: ssoCallbackResultSchema,
      }),
    identity: () =>
      request<SsoIdentityStatus>('GET', '/api/v1/auth/sso/identity', {
        response: ssoIdentityStatusSchema,
      }),
    unlink: () => request<void>('DELETE', '/api/v1/auth/sso/identity'),
  };
};

/** Content and system management for a signed-in user. */
export const createAdminClient = (options: ClientOptions, token: string) => {
  const request = createTransport(options, token);
  const plugin = (id: string) =>
    `/api/v1/admin/plugins/${encodeURIComponent(id)}`;
  const taxonomyPath = (taxonomy: TaxonomyType) =>
    `/api/v1/admin/taxonomies/${encodeURIComponent(taxonomy)}`;
  const pagePath = (id: string, key: string) =>
    `/api/v1/admin/plugin-pages/${encodeURIComponent(id)}/${encodeURIComponent(key)}`;
  const themePath = (id: string) =>
    `/api/v1/admin/themes/${encodeURIComponent(id)}`;
  return {
    roles: {
      list: () =>
        request<RoleDefinition[]>('GET', '/api/v1/admin/roles', {
          response: roleDefinitionSchema.array(),
        }),
      save: (input: RoleDefinition) =>
        request<RoleDefinition>('PUT', '/api/v1/admin/roles', {
          json: input,
          response: roleDefinitionSchema,
        }),
      /** Deletes a custom role after giving its users `reassignTo`. */
      remove: (key: string, reassignTo: string) =>
        request<void>(
          'DELETE',
          `/api/v1/admin/roles/${encodeURIComponent(key)}`,
          { query: { reassignTo } },
        ),
    },
    membership: (enabled: boolean) =>
      request<{ enabled: boolean }>('PUT', '/api/v1/admin/membership', {
        json: { enabled },
        response: membershipSchema,
      }),
    taxonomyTypes: {
      list: () =>
        request<TaxonomyDefinition[]>('GET', '/api/v1/admin/taxonomy-types', {
          response: taxonomyDefinitionSchema.array(),
        }),
      save: (input: TaxonomyDefinition) =>
        request<TaxonomyDefinition>('PUT', '/api/v1/admin/taxonomy-types', {
          json: input,
          response: taxonomyDefinitionSchema,
        }),
    },
    users: usersClient(request),
    media: mediaAdminClient(request),
    contentModel: contentModelClient(request),
    ...appearanceAdminClient(request),
    ...commentsAdminClient(request),
    ...searchAdminClient(request),
    ...toolsAdminClient(request),
    ...privacyAdminClient(request),
    ...securityAdminClient(request),
    ...ssoAdminClient(request),
    archivePaths: {
      get: () =>
        request<ArchivePathsState>('GET', '/api/v1/permalinks/archives', {
          response: archivePathsStateSchema,
        }),
      update: (input: ArchiveBases) =>
        request<ArchivePathsState>('PUT', '/api/v1/admin/permalinks/archives', {
          json: input,
          response: archivePathsStateSchema,
        }),
    },
    permalinks: {
      settings: () =>
        request<PermalinkSettings>('GET', '/api/v1/admin/permalinks', {
          response: permalinkSettingsSchema,
        }),
      update: (input: PermalinkSettings) =>
        request<PermalinkSettings>('PUT', '/api/v1/admin/permalinks', {
          json: input,
          response: permalinkSettingsSchema,
        }),
    },
    seo: {
      settings: () =>
        request<AdminSeoSettings>('GET', '/api/v1/admin/seo', {
          response: seoSettingsSchema,
        }),
      update: (input: SeoSettingsInput) =>
        request<AdminSeoSettings>('PUT', '/api/v1/admin/seo', {
          json: input,
          response: seoSettingsSchema,
        }),
    },
    content: {
      counts: (type?: string) =>
        request<ContentCounts>('GET', '/api/v1/admin/content/counts', {
          query: { type },
          response: contentCountsSchema,
        }),
      list: (query: ContentListQuery = {}) =>
        request<Paginated<AdminContentSummary>>(
          'GET',
          '/api/v1/admin/content',
          {
            query: query as Query,
            response: pageSchema(adminContentSummarySchema),
          },
        ),
      get: (id: string) =>
        request<ContentEntry>(
          'GET',
          `/api/v1/admin/content/${encodeURIComponent(id)}`,
          { response: adminContentSchema },
        ),
      create: (input: ContentInput) =>
        request<ContentEntry>('POST', '/api/v1/admin/content', {
          json: input,
          response: adminContentSchema,
        }),
      update: (id: string, input: ContentInput) =>
        request<ContentEntry>(
          'PUT',
          `/api/v1/admin/content/${encodeURIComponent(id)}`,
          { json: input, response: adminContentSchema },
        ),
      remove: (id: string) =>
        request<void>(
          'DELETE',
          `/api/v1/admin/content/${encodeURIComponent(id)}`,
        ),
      ...contentWorkflowClient(request),
    },
    site: {
      get: () =>
        request<AdminSiteDto>('GET', '/api/v1/admin/site', {
          response: adminSiteSchema,
        }),
      update: (input: SiteSettingsInput) =>
        request<SiteSettings>('PUT', '/api/v1/admin/site', {
          json: input,
          response: siteSettingsSchema,
        }),
    },
    taxonomy: {
      list: (taxonomy: TaxonomyType) =>
        request<AdminTaxonomyTerm[]>('GET', taxonomyPath(taxonomy), {
          response: z.array(adminTaxonomyTermSchema),
        }),
      create: (taxonomy: TaxonomyType, input: TaxonomyInput) =>
        request<AdminTaxonomyTerm>('POST', taxonomyPath(taxonomy), {
          json: input,
          response: adminTaxonomyTermSchema,
        }),
      update: (taxonomy: TaxonomyType, id: string, input: TaxonomyInput) =>
        request<AdminTaxonomyTerm>(
          'PUT',
          `${taxonomyPath(taxonomy)}/${encodeURIComponent(id)}`,
          { json: input, response: adminTaxonomyTermSchema },
        ),
      remove: (taxonomy: TaxonomyType, id: string) =>
        request<void>(
          'DELETE',
          `${taxonomyPath(taxonomy)}/${encodeURIComponent(id)}`,
        ),
    },
    themes: {
      list: () =>
        request<AdminTheme[]>('GET', '/api/v1/admin/themes', {
          response: z.array(adminThemeSchema),
        }),
      /** A theme archive (.zip with theme.json, templates/, parts/ and style.css). */
      install: (archive: Blob | ArrayBuffer | Uint8Array<ArrayBuffer>) =>
        request<AdminTheme>('POST', '/api/v1/admin/themes', {
          body: archive,
          contentType: 'application/zip',
          response: adminThemeSchema,
        }),
      activate: (id: string) =>
        request<AdminTheme>('POST', `${themePath(id)}/activate`, {
          response: adminThemeSchema,
        }),
      remove: (id: string) => request<void>('DELETE', themePath(id)),
      preview: (id: string) =>
        request<{ token: string }>('POST', `${themePath(id)}/preview`, {
          response: themePreviewSchema,
        }),
      /** Site editor: templates, template parts and global styles with the administrator's changes. */
      editor: (id: string) =>
        request<ThemeEditor>('GET', `${themePath(id)}/editor`, {
          response: themeEditorSchema,
        }),
      saveTemplate: (id: string, name: string, blocks: BlockInput[]) =>
        request<void>(
          'PUT',
          `${themePath(id)}/templates/${encodeURIComponent(name)}`,
          { json: { blocks } },
        ),
      resetTemplate: (id: string, name: string) =>
        request<void>(
          'DELETE',
          `${themePath(id)}/templates/${encodeURIComponent(name)}`,
        ),
      savePart: (id: string, slug: string, blocks: BlockInput[]) =>
        request<void>(
          'PUT',
          `${themePath(id)}/parts/${encodeURIComponent(slug)}`,
          {
            json: { blocks },
          },
        ),
      resetPart: (id: string, slug: string) =>
        request<void>(
          'DELETE',
          `${themePath(id)}/parts/${encodeURIComponent(slug)}`,
        ),
      saveStyles: (id: string, input: ThemeStylesInput) =>
        request<void>('PUT', `${themePath(id)}/styles`, { json: input }),
      resetStyles: (id: string) =>
        request<void>('DELETE', `${themePath(id)}/styles`),
    },
    /** Blocks of active plugins the editor can insert. */
    pluginBlocks: () =>
      request<PluginBlockInfo[]>('GET', '/api/v1/admin/plugin-blocks', {
        response: z.array(pluginBlockInfoSchema),
      }),
    plugins: {
      list: () =>
        request<PluginInfo[]>('GET', '/api/v1/admin/plugins', {
          response: z.array(adminPluginSchema),
        }),
      /** Installs or upgrades a plugin from a bundled ES module (see AGENTS.md, "Plugin bundle"). */
      install: (source: string) =>
        request<PluginInfo>('POST', '/api/v1/admin/plugins', {
          body: source,
          contentType: 'text/javascript',
          response: adminPluginSchema,
        }),
      enable: (id: string) =>
        request<PluginInfo>('POST', `${plugin(id)}/enable`, {
          response: adminPluginSchema,
        }),
      disable: (id: string) =>
        request<PluginInfo>('POST', `${plugin(id)}/disable`, {
          response: adminPluginSchema,
        }),
      remove: (id: string) => request<void>('DELETE', plugin(id)),
      updateSettings: (id: string, values: SettingValues) =>
        request<PluginInfo>('PUT', `${plugin(id)}/settings`, {
          json: values,
          response: adminPluginSchema,
        }),
      /** Asks the plugin's update address; installs nothing. */
      checkUpdate: (id: string) =>
        request<PluginUpdate>('GET', `${plugin(id)}/update`, {
          response: pluginUpdateSchema,
        }),
      /** Admin pages of active plugins the user may open. */
      pages: () =>
        request<PluginPageSummary[]>('GET', '/api/v1/admin/plugin-pages', {
          response: z.array(pluginPageSummarySchema),
        }),
      /** Plugin dashboard widgets the user may see, rendered; failed ones are left out. */
      dashboardWidgets: () =>
        request<DashboardWidget[]>('GET', '/api/v1/admin/dashboard-widgets', {
          response: z.array(dashboardWidgetSchema),
        }),
      page: (id: string, key: string) =>
        request<PluginPage>('GET', pagePath(id, key), {
          response: pluginPageSchema,
        }),
      runPage: (
        id: string,
        key: string,
        action: string,
        values: SettingValues,
      ) =>
        request<{ notice: string | null }>(
          'POST',
          `${pagePath(id, key)}/${encodeURIComponent(action)}`,
          { json: values, response: pluginPageResultSchema },
        ),
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
    status: () =>
      request<InstallationStatus>('GET', '/api/v1/install/status', {
        response: installationStatusSchema,
      }),
    database: (input: InstallDatabaseInput) =>
      request<InstallationStatus>('POST', '/api/v1/install/database', {
        json: input,
        response: installationStatusSchema,
      }),
    complete: (input: InstallCompleteInput) =>
      request<SessionGrant>('POST', '/api/v1/install/complete', {
        json: input,
        response: sessionGrantSchema,
      }),
  };
};

export type { AuthorOption } from '#sdk/clients/users';
export type { ClientProof, Visitor } from '#sdk/clients/security';
export { createMediaClient } from '#sdk/clients/media';
export { createAvatarClient } from '#sdk/clients/media';
