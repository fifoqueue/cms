import type { ArchivePathsService } from '#api/domain/permalinks/archive-paths';
import type { TaxonomyTypeService } from '#api/domain/taxonomy/taxonomy-types';
import type { RoleService } from '#api/domain/users/role-service';
import { Elysia } from 'elysia';
import type { AuthService } from '#api/domain/auth/auth-service';
import type { SsoService } from '#api/domain/auth/sso-service';
import type { ContentService } from '#api/domain/content/content-service';
import type { ReadingService } from '#api/domain/site/reading-service';
import type { WritingService } from '#api/domain/site/writing-service';
import type { MenuService } from '#api/domain/appearance/menu-service';
import type { WidgetService } from '#api/domain/appearance/widget-service';
import type { CommentService } from '#api/domain/comments/comment-service';
import type { SearchService } from '#api/domain/search/search-service';
import type { WebhookService } from '#api/domain/webhooks/webhook-service';
import type { SiteHealthService } from '#api/domain/tools/site-health';
import type { SsoSettingsService } from '#api/domain/auth/sso-settings';
import type { ThemePreviews } from '#api/domain/theme/theme-previews';
import type { ImportService } from '#api/domain/tools/import-service';
import type { ExportService } from '#api/domain/tools/export-service';
import type { AdminPageRegistry } from '#api/plugin-runtime/admin-page-registry';
import type { DashboardWidgetRegistry } from '#api/plugin-runtime/dashboard-widget-registry';
import type { ContentTypeService } from '#api/domain/content/content-types';
import type { FieldService } from '#api/domain/content/fields';
import type { MediaService } from '#api/domain/media/media-service';
import type { RevisionService } from '#api/domain/content/revision-service';
import type { PreviewService } from '#api/domain/content/preview-service';
import type { PublicContentService } from '#api/domain/content/public-content';
import type { InstallationService } from '#api/domain/installation/installation-service';
import type { SiteService } from '#api/domain/site/site-service';
import type { SeoSettingsService } from '#api/domain/seo/seo-settings-service';
import type { SeoDiscoveryService } from '#api/domain/seo/seo-discovery-service';
import type { PermalinkService } from '#api/domain/permalinks/permalink-service';
import type { PermalinkResolver } from '#api/domain/permalinks/permalink-resolver';
import type {
  PublicTaxonomyService,
  TaxonomyService,
} from '#api/domain/taxonomy/taxonomy-service';
import type { ThemeService } from '#api/domain/theme/theme-service';
import type { UserService } from '#api/domain/users/user-service';
import type { PasswordService } from '#api/domain/auth/password-service';
import type { ApiTokenService } from '#api/domain/auth/api-tokens';
import type { SecuritySettingsService } from '#api/domain/security/security-settings';
import type { EmailService } from '#api/domain/email/email-service';
import type { PluginHost } from '#api/plugin-runtime/plugin-host';
import type { SlotService } from '#api/plugin-runtime/slot-service';
import type { PluginGateway } from '#api/http/plugin-gateway';
import type { ClientResolver } from '#api/http/client-identity';

/**
 * Everything the CMS routes may use. `createApiApp` registers each entry as an Elysia decorator,
 * so route files under `routes/api` read them from the handler context (`({ site }) => ...`).
 */
export type ApiServices = {
  auth: AuthService;
  sso: SsoService;
  clients: ClientResolver;
  site: SiteService;
  seo: SeoSettingsService;
  seoDiscovery: SeoDiscoveryService;
  permalinks: PermalinkService;
  archivePaths: ArchivePathsService;
  permalinkResolver: PermalinkResolver;
  adminContent: ContentService;
  reading: ReadingService;
  writing: WritingService;
  menus: MenuService;
  widgets: WidgetService;
  comments: CommentService;
  search: SearchService;
  pluginPages: AdminPageRegistry;
  dashboardWidgets: DashboardWidgetRegistry;
  webhooks: WebhookService;
  siteHealth: SiteHealthService;
  ssoSettings: SsoSettingsService;
  /** Shared with the web server so it can prove visitors' addresses. */
  frontendSecret: string;
  themePreviews: ThemePreviews;
  importer: ImportService;
  exporter: ExportService;
  contentTypes: ContentTypeService;
  fields: FieldService;
  media: MediaService;
  contentRevisions: RevisionService;
  previews: PreviewService;
  users: UserService;
  roles: RoleService;
  taxonomyTypes: TaxonomyTypeService;
  passwords: PasswordService;
  apiTokens: ApiTokenService;
  security: SecuritySettingsService;
  email: EmailService;
  publicContent: PublicContentService;
  adminTaxonomy: TaxonomyService;
  publicTaxonomy: PublicTaxonomyService;
  themes: ThemeService;
  slots: SlotService;
  plugins: PluginHost;
  pluginGateway: PluginGateway;
};

/** Everything the installer routes may use; they run before a database exists. */
export type InstallerServices = {
  installation: InstallationService;
};

// Only the types are derived here. Instances come from `createApiApp` / `createInstallerApp`.
const withApiServices = (services: ApiServices) =>
  new Elysia().decorate(services);

const withInstallerServices = (services: InstallerServices) =>
  new Elysia().decorate(services);

/** The Elysia instance type every file under `routes/api` receives. */
export type ApiApp = ReturnType<typeof withApiServices>;

/** The Elysia instance type every file under `routes/install` receives. */
export type InstallerApp = ReturnType<typeof withInstallerServices>;

export { withApiServices, withInstallerServices };
