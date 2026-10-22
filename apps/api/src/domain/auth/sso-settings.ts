import {
  adminSsoSettingsSchema,
  ssoSettingsInputSchema,
  ssoSettingsSchema,
} from '@cms/sdk';
import type { AdminSsoSettings, SsoSettings } from '@cms/sdk';
import type { OidcProvider } from '#api/domain/auth/sso-ports';
import type { SsoSetup } from '#api/domain/auth/sso-service';
import type { SecretBox } from '#api/domain/ports';
import type { SettingsRepository } from '#api/domain/site/site-service';
import { invalidInput, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

const KEY = 'sso';

/** Where providers send users back; the web app serves it. */
export const SSO_CALLBACK_PATH = '/admin/sso/callback';

interface Stored {
  settings: SsoSettings;
  /** Sealed client secret; empty when none. */
  clientSecret: string;
}

export interface OidcClient {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  authMethod: SsoSettings['authMethod'];
  redirectUri: string;
  scope: string;
}

/**
 * Single sign-on settings from the admin area. A configuration in the server environment, when
 * present, takes precedence and the stored settings are kept but unused.
 */
export class SsoSettingsService {
  private cached: { key: string; provider: OidcProvider } | null = null;

  constructor(
    private readonly deps: {
      settings: SettingsRepository;
      secrets: SecretBox;
      siteUrl: () => Promise<string>;
      /** Builds a provider client; discovery happens on first use. */
      connect: (client: OidcClient) => OidcProvider;
      /** The environment's setup, or `null` to use the stored settings. */
      environment: SsoSetup | null;
    },
  ) {}

  async getAdmin(): Promise<AdminSsoSettings> {
    const { settings, clientSecret } = await this.stored();
    const siteUrl = await this.deps.siteUrl();
    return adminSsoSettingsSchema.parse({
      ...settings,
      clientSecretConfigured: !!clientSecret,
      redirectUri: siteUrl ? `${siteUrl}${SSO_CALLBACK_PATH}` : '',
      managedByEnvironment: !!this.deps.environment,
    });
  }

  async update(input: unknown): Promise<AdminSsoSettings> {
    const { clientSecret, ...settings } = parseInput(
      ssoSettingsInputSchema,
      input,
    );
    const current = await this.stored();
    const secret =
      clientSecret === undefined
        ? current.clientSecret
        : clientSecret
          ? this.deps.secrets.seal(clientSecret)
          : '';
    if (settings.enabled) {
      if (settings.authMethod !== 'none' && !secret)
        throw invalidInput(Errors.SsoSecretRequired, [
          { path: 'clientSecret', message: Errors.SsoSecretRequired },
        ]);
      if (!(await this.deps.siteUrl()))
        throw invalidInput(Errors.SsoSiteUrlRequired);
    }
    await this.deps.settings.set(KEY, {
      settings,
      clientSecret: secret,
    } satisfies Stored);
    return this.getAdmin();
  }

  /** What sign-in uses right now. The provider client is reused while its settings stay the same. */
  async setup(): Promise<SsoSetup> {
    if (this.deps.environment) return this.deps.environment;
    const { settings, clientSecret } = await this.stored();
    const subjects = new Map(Object.entries(settings.allowedSubjects));
    const siteUrl = await this.deps.siteUrl();
    if (!settings.enabled || !settings.issuer || !settings.clientId || !siteUrl)
      return { provider: null, name: settings.name, subjects };
    const client: OidcClient = {
      issuer: settings.issuer,
      clientId: settings.clientId,
      clientSecret: clientSecret
        ? (this.deps.secrets.open(clientSecret) ?? undefined)
        : undefined,
      authMethod: settings.authMethod,
      redirectUri: `${siteUrl}${SSO_CALLBACK_PATH}`,
      scope: settings.scopes,
    };
    const key = JSON.stringify(client);
    if (this.cached?.key !== key)
      this.cached = { key, provider: this.deps.connect(client) };
    return { provider: this.cached.provider, name: settings.name, subjects };
  }

  private async stored(): Promise<Stored> {
    const raw = (await this.deps.settings.get(KEY)) as
      Partial<Stored> | undefined;
    const parsed = ssoSettingsSchema.safeParse(raw?.settings);
    return {
      settings: parsed.success ? parsed.data : ssoSettingsSchema.parse({}),
      clientSecret:
        typeof raw?.clientSecret === 'string' ? raw.clientSecret : '',
    };
  }
}
