import { Elysia } from 'elysia';
import type { AuthService } from '../domain/auth/auth-service';
import type { SsoService } from '../domain/auth/sso-service';
import type { ContentService } from '../domain/content/content-service';
import type { PublicContentService } from '../domain/content/public-content';
import type { InstallationService } from '../domain/installation/installation-service';
import type { SiteService } from '../domain/site/site-service';
import type { PluginHost } from '../plugin-runtime/plugin-host';
import type { SlotService } from '../plugin-runtime/slot-service';
import type { PluginGateway } from './plugin-gateway';
import type { SsoClientResolver } from './sso-client';

/**
 * Everything the CMS routes may use. `createApiApp` registers each entry as an Elysia decorator,
 * so route files under `routes/api` read them from the handler context (`({ site }) => ...`).
 */
export type ApiServices = {
  auth: AuthService;
  sso: SsoService;
  ssoClients: SsoClientResolver;
  site: SiteService;
  adminContent: ContentService;
  publicContent: PublicContentService;
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
