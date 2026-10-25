# Sign-in

상위 문서: [AGENTS.md](../../AGENTS.md)

Extensible sign-in methods, second factors, Settings → Sign-in. Details may still change while the engine is finished.

## Model

Sign-in is a registry of methods and second factors shared by core and plugins (`context.auth.signInMethod/secondFactor`, ids `plugin:<id>:<key>`).

- Core methods: `password`, `passkey`, `sso`.
- Core second factors: `totp`, `passkey`, `recovery-code`. TOTP is never a primary method.
- A passkey sign-in with user verification satisfies the second-factor requirement. Plugins may still demand more via `user.secondFactorRequired`.

The composition root registers password, UV-enforcing passkey and SSO methods, plus passkey, TOTP and recovery-code factors through the shared registry. Password setup atomically consumes its token with the credential update and revokes other credentials through the existing reset transaction. SSO setup atomically claims an identity and consumes all of the user's reset/invite tokens; it refuses replacing an existing issuer link. A UV passkey starts `user.secondFactorRequired` with `required: false` and `method: 'passkey'`; a plugin can request another factor. Without that request, `user.signedIn` records `secondFactor: 'passkey'`.

Legacy `/auth/login` delegates to the password engine method. It returns a session only when no further step is needed; otherwise it returns 409 with `Continue signing in using the step-based sign-in flow.` Forgot-password and legacy password-reset requests use the effective sign-in policy. When password is disabled, reset/invite email copy asks users to set up their sign-in (English/Korean), retaining the same invitation page.

Methods may declare separate `setup.fields`; omitted setup fields inherit the primary fields. Password setup declares only a new-password field (`autocomplete: new-password`), since the token identifies the user; the existing core reset schema has no confirmation field. Public `info.setup` carries these fields independently from `info.methods`. WebAuthn options are normalized to JSON before validation, removing undefined generator properties for both get/create ceremonies. Visitor-facing authentication, SSO and protection messages are shared in `@cms/sdk/errors` for localization.

## Settings → Sign-in

`GET/PUT /api/v1/admin/sign-in` (`settings.manage`) holds the allowed methods in login order, the allowed second factors, and the roles that require a second factor.

- Unknown ids that are not already stored are refused.
- The acting admin must keep at least one allowed and ready method they can use.
- If every allowed method is unavailable at runtime, core falls back to password and logs a warning.
- `CMS_ALLOW_PASSWORD_LOGIN` always keeps password allowed.
- A required role must have at least one allowed factor that supports enrollment. Settings saves reject an empty/non-enrollable selection at `requireSecondFactor`, the role requirement control. If an allowed plugin factor disappears at runtime, core adds TOTP enrollment to the effective factors and warns, without rewriting stored policy.

## Step-based flow

- `GET /api/v1/auth/sign-in` lists allowed methods.
- `POST /api/v1/auth/sign-in/:method` starts a sign-in.
- `POST /api/v1/auth/sign-in/setup/:method` sets up a method with an invitation/reset token, consumed once.
- `POST /api/v1/auth/sign-in/continue` and `POST /api/v1/auth/sign-in/factor` continue a step or choose a factor.

Steps are `session | done | redirect | webauthn | fields | secondFactor | enroll`. Pending handles are single-use and client-bound, and rotate on each step without extending the 10-minute expiry. They reuse `OIDC_MAX_PENDING_REQUESTS` / `OIDC_MAX_PENDING_PER_CLIENT`. Authentication responses are private and non-cacheable.

Redirect DTOs require an HTTP(S) URL and ISO datetime expiry. Flow/stage and account owner are held in the server transaction, not trusted from client cookies or submitted fields; account enrollment cannot be turned into a login or completed by another user.

Passkey invitation/reset setup only verifies and prepares a credential before returning its core-only commit operation. The commit inserts the credential, consumes the user-bound live token and revokes sibling reset/invite tokens in one transaction; concurrent losing attempts and duplicate credentials leave no new credential behind. Usernameless primary assertions require a discoverable credential; account-bound second factors can use non-discoverable keys.

Credential enrollment, SSO account linking, and recovery-code generation require a live interactive session issued within ten minutes. API tokens (`cms_pat_`) cannot authorize these operations. Enrollment/link continuations remain bound to their starting user. SSO start limits use the server-proved normalized client key, grouping IPv6 addresses by /64; unproved clients share a bucket.

`user.secondFactorRequired` is monotonic: plugins may change false to true, but a false result after a role or earlier plugin requires another factor is ignored and warned. A UV passkey has already satisfied core policy, so its initial value remains false; a plugin can still demand more, and later plugins cannot withdraw that demand.

Privacy erasure removes passkeys, TOTP secrets, recovery codes and user-bound pending sign-ins in the same transaction as anonymization. Export sections `passkeys`, `totp` and `recoveryCodes` contain only credential ids, factor ids, labels and creation dates—never keys, secrets, recovery hashes or pending state.

An unsuccessful `continue` releases its reservation and leaves the same handle valid until expiry. Each field attempt still runs login protection. Only one attempt can reserve a handle at once; the row continues to occupy its admission slot, and successful rotation atomically replaces it within that slot. A crashed worker's reservation cannot be replayed and expires with the transaction. Apply `20261113000000_sign_in_reservations` (after passkey discoverability) before deploying this engine. It also adds the private identity binding: unlinking an SSO identity cascades pending sign-ins and sessions.

SSO method options are the enabled providers. Its OIDC checks and provider id stay in server-kept state, and its verified identity binding survives second-factor steps until session issuance. Operator-assigned subjects have no identity binding. Managed SSO providers retain `<site>/admin/sso/callback` for login, claim and account linking, matching existing IdP registrations and the admin display; an environment provider keeps `OIDC_REDIRECT_URI`. Plugin redirect methods still receive `<site>/admin/sign-in/callback` as `callbackUrl`. Both web callbacks use the same continuation logic. Old SSO start/callback endpoints now serve authenticated account linking only; login/claim attempts there return 409 and must use the engine.

SSO outputs no longer contain `passwordLogin` or `passwordLoginForced`. SSO input accepts optional `passwordLogin` for one release but ignores it. Existing stored `passwordLogin: false` migrates to `signIn.methods: ['sso']` before provider saves remove the obsolete field; password forcing is exposed only by Settings → Sign-in.

Core registrations use a composition-root-only registration path, not an owner-name check. Core methods/factors are validated but have no plugin timeout/isolation; their errors propagate. Plugin registrations remain isolated and time-limited. User-directory lookups expose role capabilities only; per-user grants run after verification, when sessions are issued/authenticated. Recovery also defers per-user capability resolution until its code is consumed.

`continue` and `chooseFactor` return **410** with code `sign_in_expired` and SDK message `This sign-in request is no longer valid. Start again.` for expired, used, unknown, or client-mismatched handles. Discard the pending cookie and restart; a rejected credential remains 401 `unauthorized` instead.

## Web

- The login page and the invitation/reset page (`/admin/password?token=…`) render `methods`/`setup` generically, in order: a method with `fields` is a form, one with `options` a button per option, any other one button. Plugin ids are never special-cased. "Forgot password" shows only while `passwordReset`; otherwise the forgot-password page asks for a sign-in link from an administrator. Break-glass recovery-code sign-in stays a secondary entry.
- Labels of core method, factor and field ids (`CORE_SIGN_IN_METHODS`, `CORE_SECOND_FACTORS`, fields by owner) come from the web catalog (`#lib/sign-in-labels.js`); plugin labels are shown as provided.
- One httpOnly pending cookie (`#lib/server/sso-cookie.js`) holds the handle, flow (`login`/`setup`/`enroll`/`link`), return path and the step to show; page data gets a projected step view, never the handle. The cookie is AES-256-GCM sealed (key from the frontend secret via HKDF, cookie name bound in; anything that fails to open is no pending step), `enroll`/`link` steps carry the starting user's id and only that user continues them, and sign-out clears it. Declared fields post as `field.<name>`. `redirect` steps leave with a 303; `/admin/sign-in/callback` and `/admin/sso/callback` (registered at providers) continue with the query. Other steps render on `/admin/sign-in` (enrollment inside Account → Two-step verification). QR codes are drawn on the server; WebAuthn uses `@simplewebauthn/browser` and is the only step that needs scripts. Only a 410 (`sign_in_expired`) from `continue`/`chooseFactor` forgets the step so the flow starts over; other refusals stay on the step.
- Settings → Sign-in (`/admin/settings/sign-in`) orders and toggles methods without scripts (move buttons post back unsaved), keeps stored ids of inactive plugins until removed, and labels plugin entries with their source.

## Account factors

- `GET /api/v1/auth/factors` lists the user's factors.
- `POST /api/v1/auth/factors/:factor/enroll` enrolls one. A continuation requires the initiating user's session and ends with `done`, without issuing a new session.
- `DELETE /api/v1/auth/factors/:factor/:credential` removes one. Removing the last factor required by the role is refused (serialized).

## Passkeys and TOTP

Only discoverable passkeys count as usable for passwordless sign-in. Passkeys registered before this release are treated as not discoverable; re-register them to rely on them. TOTP secrets are sealed; a successful verification atomically re-seals with the current key while consuming the time step. For key rotation, see [operations](../operations.md).

Passkey registration exclusion lists and account-bound assertion allowlists contain at most sixteen credentials, keeping maximum-sized credential ids below the 32 KiB auth-step budget. Discoverable primary sign-in uses an empty allowlist and is not restricted to those sixteen keys.

## Hooks

Actions `user.signedIn`, `user.signInFailed`, `user.secondFactorChanged`; filters `user.signInAllowed` (deny-only) and `user.secondFactorRequired`. See [extension points](../plugins/extension-points.md#sign-in).

## Recovery

Break-glass `POST /api/v1/auth/recovery` (`settings.manage` holders only) and recovery codes (`/api/v1/auth/recovery-codes`). See [SSO](sso.md).

Generating codes requires an interactive session created within the last ten minutes; `cms_pat_` API tokens are refused. Failure to send a notification does not withhold generated codes or a successful recovery session. Password reset/change and administrator sign-out-everywhere revoke recovery codes.

관련 문서: [SSO](sso.md), [라우트 표](../api/routes.md), [확장 지점](../plugins/extension-points.md#sign-in).
