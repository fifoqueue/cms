import type {
  OidcSessionBinding,
  VerifiedOidcIdentity,
} from '#api/domain/auth/sso-ports';
import type { SecretBox } from '#api/domain/ports';

/** All OIDC issuers project verified claims and seal credentials before session persistence. */
export const sealOidcSession = (
  identity: VerifiedOidcIdentity,
  providerId: string,
  secrets: SecretBox,
): OidcSessionBinding => ({
  issuer: identity.issuer,
  subject: identity.subject,
  ...(identity.sid !== undefined ? { sid: identity.sid } : {}),
  logout: {
    providerId,
    clientId: identity.clientId,
    sealedIdToken: secrets.seal(identity.idToken),
  },
});
