import {
  ClientSecretBasic,
  ClientSecretPost,
  None,
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  customFetch,
  discovery,
  enableNonRepudiationChecks,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from 'openid-client';
import type { ClientAuth, Configuration, CustomFetch } from 'openid-client';
import type {
  OidcAuthorizationRequest,
  OidcChecks,
  OidcProvider,
  VerifiedIdentity,
} from '#api/domain/auth/sso-ports';
import { messageOf, unauthorized, Errors } from '#api/shared/errors';
import type { Logger } from '#api/shared/logger';
import { publicFetch } from '#api/infra/egress-policy';

export type OidcClientAuthMethod =
  'client_secret_basic' | 'client_secret_post' | 'none';

export interface OidcClientSettings {
  /** HTTPS issuer identifier; discovery must report exactly this issuer. */
  issuer: string;
  clientId: string;
  clientSecret?: string;
  authMethod: OidcClientAuthMethod;
  /** Registered redirect URI without query or fragment. */
  redirectUri: string;
  scope: string;
  /** Outbound HTTP; the global fetch when omitted. */
  fetch?: CustomFetch;
}

const clientAuth = ({
  authMethod,
  clientSecret,
}: OidcClientSettings): ClientAuth => {
  switch (authMethod) {
    case 'client_secret_basic':
      return ClientSecretBasic(clientSecret);
    case 'client_secret_post':
      return ClientSecretPost(clientSecret);
    case 'none':
      return None();
  }
};

/** OpenID Connect relying party on `openid-client` (certified implementation). */
export class OpenIdClientProvider implements OidcProvider {
  private configuration: Promise<Configuration> | undefined;

  constructor(
    private readonly settings: OidcClientSettings,
    private readonly logger: Logger,
  ) {}

  async authorize(): Promise<OidcAuthorizationRequest> {
    const config = await this.discover();
    const codeVerifier = randomPKCECodeVerifier();
    const state = randomState();
    const nonce = randomNonce();

    const url = buildAuthorizationUrl(config, {
      redirect_uri: this.settings.redirectUri,
      scope: this.settings.scope,
      code_challenge: await calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    });

    return { url: url.href, state, nonce, codeVerifier };
  }

  async verify(query: string, checks: OidcChecks): Promise<VerifiedIdentity> {
    const config = await this.discover();

    // The token request's redirect_uri is derived from this URL, so it is always the configured one.
    const callback = new URL(this.settings.redirectUri);
    callback.search = query;

    try {
      const tokens = await authorizationCodeGrant(config, callback, {
        pkceCodeVerifier: checks.codeVerifier,
        expectedState: checks.state,
        expectedNonce: checks.nonce,
        idTokenExpected: true,
      });
      const claims = tokens.claims()!;

      return { issuer: claims.iss, subject: claims.sub };
    } catch (error) {
      const cause =
        error instanceof Error && error.cause instanceof Error
          ? ` (${error.cause.message})`
          : '';

      this.logger.warn(`Single sign-on rejected: ${messageOf(error)}${cause}`);
      throw unauthorized(Errors.SsoFailed);
    }
  }

  /**
   * Discovers once; a failed discovery is retried on the next request. The reason (such as an
   * issuer that differs from the discovered one) stays in the server log.
   */
  private discover() {
    const fetcher: CustomFetch =
      this.settings.fetch ??
      ((url, options) => publicFetch(url, options as unknown as RequestInit));
    this.configuration ??= discovery(
      new URL(this.settings.issuer),
      this.settings.clientId,
      undefined,
      clientAuth(this.settings),
      {
        execute: [enableNonRepudiationChecks],
        [customFetch]: fetcher,
      },
    ).catch((error: unknown) => {
      this.configuration = undefined;
      this.logger.warn(
        `Single sign-on discovery failed for ${this.settings.issuer}: ${messageOf(error)}`,
      );
      throw unauthorized(Errors.SsoFailed);
    });

    return this.configuration;
  }
}
