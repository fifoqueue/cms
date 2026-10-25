import { sameIssuer } from '#api/domain/auth/sso-issuer';
import { migrateSignInPolicy } from '#api/domain/auth/sign-in-settings';
import {
  adminSsoSettingsSchema,
  ssoSettingsInputSchema,
  ssoSettingsSchema,
  SSO_ENVIRONMENT_PROVIDER,
} from '@cms/sdk';
import type {
  AdminSsoSettings,
  SsoSettings,
  SsoProvider,
  UserProfile,
} from '@cms/sdk';
import type { OidcProvider } from '#api/domain/auth/sso-ports';
import type { SsoSetup, SsoProviderSetup } from '#api/domain/auth/sso-service';
import type { SecretBox } from '#api/domain/ports';
import type { SettingsRepository } from '#api/domain/site/site-service';
import type {
  SsoAccessTransactions,
  SsoAccessContext,
} from '#api/domain/auth/sso-ports';
import { invalidInput, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

const KEY = 'sso';

/** Where providers send users back; the web app serves it. */
export const SSO_CALLBACK_PATH = '/admin/sso/callback';

interface Stored {
  settings: SsoSettings;
  /** Sealed client secret; empty when none. */
  secrets: Record<string, string>;
}

export interface OidcClient {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  authMethod: SsoProvider['authMethod'];
  redirectUri: string;
  scope: string;
}

/**
 * Single sign-on settings from the admin area. A configuration in the server environment, when
 * present, takes precedence and the stored settings are kept but unused.
 */
export class SsoSettingsService {
  private cached = new Map<string, { key: string; provider: OidcProvider }>();

  constructor(
    private readonly deps: {
      settings: SettingsRepository;
      secrets: SecretBox;
      siteUrl: () => Promise<string>;
      /** Builds a provider client; discovery happens on first use. */
      connect: (client: OidcClient) => OidcProvider;
      checkIssuer?: (issuer: string) => Promise<void>;
      /** The environment's setup, or `null` to use the stored settings. */
      environment: SsoProviderSetup | null;
      environmentRedirectUri?: string;
      otherMethod: (
        actor: UserProfile,
        store: SettingsRepository,
      ) => Promise<boolean>;
      access: SsoAccessTransactions;
    },
  ) {}

  async getAdmin(): Promise<AdminSsoSettings> {
    const { settings, secrets } = await this.stored();
    const siteUrl = await this.deps.siteUrl();
    return adminSsoSettingsSchema.parse({
      ...settings,
      providers: settings.providers.map((provider) => ({
        ...provider,
        clientSecretConfigured:
          Object.hasOwn(secrets, provider.id) && !!secrets[provider.id],
      })),
      redirectUri:
        this.deps.environmentRedirectUri ??
        (siteUrl ? `${siteUrl}${SSO_CALLBACK_PATH}` : ''),
      environmentProvider: this.deps.environment
        ? { id: SSO_ENVIRONMENT_PROVIDER, name: this.deps.environment.name }
        : null,
    });
  }

  async update(input: unknown, actor: UserProfile): Promise<AdminSsoSettings> {
    const inputSettings = parseInput(ssoSettingsInputSchema, input);
    for (const provider of inputSettings.providers) {
      if (!provider.enabled) continue;
      if (!(await this.deps.siteUrl()))
        throw invalidInput(Errors.SsoSiteUrlRequired);
      await this.deps.checkIssuer?.(provider.issuer);
    }
    await this.deps.access.run((context) => this.save(input, actor, context));
    return this.getAdmin();
  }

  private async save(
    input: unknown,
    actor: UserProfile,
    context: SsoAccessContext,
  ) {
    await migrateSignInPolicy(context.settings);
    const parsed = parseInput(ssoSettingsInputSchema, input);
    const settings = ssoSettingsSchema.parse(parsed);
    const current = await this.stored(context.settings);
    const secrets: Record<string, string> = {};
    for (const [index, provider] of parsed.providers.entries()) {
      const { clientSecret } = provider;
      const secret =
        clientSecret === undefined
          ? current.settings.providers.some(
              (stored) =>
                stored.id === provider.id &&
                sameIssuer(stored.issuer, provider.issuer),
            ) && Object.hasOwn(current.secrets, provider.id)
            ? current.secrets[provider.id]!
            : ''
          : clientSecret
            ? this.deps.secrets.seal(clientSecret)
            : '';
      secrets[provider.id] = secret;
      if (provider.enabled) {
        if (provider.authMethod !== 'none' && !secret)
          throw invalidInput(Errors.SsoSecretRequired, [
            {
              path: `providers.${index}.clientSecret`,
              message: Errors.SsoSecretRequired,
            },
          ]);
      }
    }
    if (!(await this.deps.otherMethod(actor, context.settings))) {
      const effective = this.deps.environment
        ? [this.deps.environment]
        : settings.providers
            .filter((p) => p.enabled)
            .map((p) => ({
              issuer: p.issuer,
              subjects: new Map(Object.entries(p.allowedSubjects)),
            }));
      const fail = (message: string) =>
        invalidInput(message, [{ path: 'providers', message }]);
      if (!effective.length) throw fail(Errors.SsoProviderRequired);
      const identities = await context.identities.findByUser(actor.id);
      if (
        !effective.some(
          (p) =>
            identities.some((i) => sameIssuer(i.issuer, p.issuer)) ||
            [...p.subjects.values()].includes(actor.email.toLowerCase()),
        )
      )
        throw fail(Errors.SsoAccessRequired);
    }
    await context.settings.set(KEY, {
      settings,
      secrets,
    } satisfies Stored);
  }

  /** What sign-in uses right now. The provider client is reused while its settings stay the same. */
  async setup(store = this.deps.settings): Promise<SsoSetup> {
    const { settings: stored, secrets } = await this.stored(store);
    if (this.deps.environment) return { providers: [this.deps.environment] };
    const siteUrl = await this.deps.siteUrl();
    const providers: SsoProviderSetup[] = [];
    for (const settings of stored.providers) {
      if (
        !settings.enabled ||
        !settings.issuer ||
        !settings.clientId ||
        !siteUrl
      )
        continue;
      const clientSecret = Object.hasOwn(secrets, settings.id)
        ? secrets[settings.id]
        : '';
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
      if (this.cached.get(settings.id)?.key !== key)
        this.cached.set(settings.id, {
          key,
          provider: this.deps.connect(client),
        });
      providers.push({
        id: settings.id,
        issuer: settings.issuer,
        provider: this.cached.get(settings.id)!.provider,
        name: settings.name,
        subjects: new Map(Object.entries(settings.allowedSubjects)),
      });
    }
    for (const id of this.cached.keys())
      if (!providers.some((p) => p.id === id)) this.cached.delete(id);
    return { providers };
  }

  /** Policy-only reads use the lock's connection; no discovery, network or other pooled reads. */
  async policy(store: SettingsRepository) {
    const { settings } = await this.stored(store);
    return {
      providers: this.deps.environment
        ? [this.deps.environment]
        : settings.providers
            .filter((p) => p.enabled && p.issuer && p.clientId)
            .map((p) => ({
              id: p.id,
              issuer: p.issuer,
              subjects: new Map(Object.entries(p.allowedSubjects)),
            })),
    };
  }

  private async stored(store = this.deps.settings): Promise<Stored> {
    const raw = (await store.get(KEY)) as
      (Partial<Stored> & { clientSecret?: string }) | undefined;
    const legacy = raw?.settings && 'enabled' in raw.settings;
    const parsed = ssoSettingsSchema.safeParse(
      legacy
        ? {
            providers: [{ ...raw.settings, id: 'default' }],
          }
        : raw?.settings,
    );
    return {
      settings: parsed.success ? parsed.data : ssoSettingsSchema.parse({}),
      secrets: legacy
        ? {
            default:
              typeof raw?.clientSecret === 'string' ? raw.clientSecret : '',
          }
        : (raw?.secrets ?? {}),
    };
  }
}
