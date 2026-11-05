import type { OidcSessionBinding } from '#api/domain/auth/sso-ports';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

interface BindingRow {
  oidcIssuer: Uint8Array | null;
  oidcSubject: Uint8Array | null;
  oidcSid: Uint8Array | null;
}

export const encodeOidcBinding = <
  T extends { oidc?: OidcSessionBinding | null },
>({
  oidc,
  ...row
}: T) => ({
  ...row,
  oidcIssuer: oidc ? encoder.encode(oidc.issuer) : null,
  oidcSubject: oidc ? encoder.encode(oidc.subject) : null,
  oidcSid: oidc?.sid !== undefined ? encoder.encode(oidc.sid) : null,
});

export const decodeOidcBinding = <T extends BindingRow>({
  oidcIssuer,
  oidcSubject,
  oidcSid,
  ...row
}: T) => ({
  ...row,
  oidc:
    oidcIssuer !== null && oidcSubject !== null
      ? {
          issuer: decoder.decode(oidcIssuer),
          subject: decoder.decode(oidcSubject),
          ...(oidcSid !== null ? { sid: decoder.decode(oidcSid) } : {}),
        }
      : null,
});
