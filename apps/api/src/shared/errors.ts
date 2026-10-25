import { ISSUE_PARAMS_LIMITS } from '@cms/sdk';
import type { IssueParams } from '@cms/sdk';
import { Errors as SdkErrors } from '@cms/sdk/errors';

export type ErrorCode =
  | 'invalid_input'
  | 'unauthorized'
  | 'sign_in_expired'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'payload_too_large'
  | 'captcha_required'
  | 'destination_blocked';

/** An expected failure that maps to a client error. Anything else is a bug. */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly issues?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

/**
 * Server-only messages: boot configuration, job internals, storage invariants and errors thrown
 * into plugin code. They reach logs only (a response says `Internal`, a plugin's `PluginFailed`,
 * a job's `JobFailed`), so they may carry details and need no reader translation.
 */
export const ServerErrors = {
  JobKindUnknown: (kind: string) => `No handler for job kind "${kind}"`,
  JobPayloadInvalid: 'The queued job payload is not valid',
  JobPayloadUnreadable:
    'The queued job is encrypted with a different site secret key',
  WebhookSecretUnreadable:
    'The webhook secret cannot be read; replace it in the admin area',
  EmailHttpFailed: (status: number, excerpt: string) =>
    `Email API returned HTTP ${status}: ${excerpt}`,
  EmailNetworkFailed: 'Email API request failed or timed out',
  EmailTemplateInvalid: 'The custom email template is not valid JSON',
  EmailInvalidJob: 'The queued message is not valid',
  PushKeyUnreadable:
    'The stored VAPID private key cannot be read with the site secret key',
  PushSubjectMissing:
    'Browser push needs an https site address or an administrator email',
  PushFailed: (status: number) => `Push service answered HTTP ${status}`,
  ContentPathMissing: 'Content has no current path',
  MediaKeyInvalid: 'Invalid media key',
  MediaDriverDuplicate: 'The core media storage driver is already registered',
  MediaStorageOperation:
    'The media storage operation failed; cleanup will be retried',
  MediaProcessorMissing: 'No core media processor is registered',
  PluginInactive: 'Plugin is not active',
  PluginBundleNameInvalid: (entry: string) => `Invalid bundle name "${entry}"`,
  PluginStorageKeyInvalid: (key: string) => `Invalid storage key "${key}"`,
  PluginRouteMethodUnsupported: (method: string) =>
    `Unsupported method "${method}"`,
  PluginRouteAccessUnknown: (access: string) => `Unknown access "${access}"`,
  PluginRoutePathInvalid: (path: string) =>
    `Route path "${path}" must start with "/"`,
  PluginSlotUnknown: (slot: string) => `Unknown slot "${slot}"`,
  PluginPageKeyInvalid: (key: string) =>
    `Admin page key "${key}" must be kebab-case, at most 64 characters`,
  PluginTaskNameInvalid: (name: string) =>
    `Task name "${name}" must be kebab-case, at most 64 characters`,
  PluginWidgetKeyInvalid: (key: string) =>
    `Widget key "${key}" must be kebab-case`,
  PluginTimedOut: (timeoutMs: number) => `Timed out after ${timeoutMs}ms`,
  PluginBlockInvalid: (key: string) =>
    `Invalid plugin block "${key}": use a kebab-case key, a title and valid attributes`,
  SignInStateTooLarge: 'Sign-in state exceeds 8 KB',
  SignInRegistrationInvalid: 'Invalid or duplicate authentication registration',
  ConfigNotJsonObject: 'must be a JSON object',
  ConfigNotJsonArray: 'must be a JSON array',
  ConfigSetTogether: (keys: readonly string[]) =>
    `${keys.join(', ')} must be set together`,
  ConfigPendingLimitTooHigh: 'must not exceed OIDC_MAX_PENDING_REQUESTS',
  ConfigStartLimitTooHigh: 'must not exceed OIDC_STARTS_PER_MINUTE',
  ConfigClientSecretRequired: (method: string) => `required for ${method}`,
  ConfigInvalid: (problems: readonly string[]) =>
    `Invalid configuration:\n  ${problems.join('\n  ')}`,
  InstallConfigUnreadable:
    'The settings file cannot be read. Check its file permissions.',
  InstallConfigCorrupt:
    'The settings file is corrupt. Restore the previous settings.',
} as const;

/**
 * Every error message the API throws. Code throws `Errors.<Name>` (or calls a server-only one
 * with details) instead of writing message text at the throw site; ESLint rejects literal
 * messages. A message that can reach a response body (error, field issue, status field) is the
 * SDK's fixed text, so readers' catalogs can key on it; its values travel as `issues[].params`.
 */
export const Errors = {
  PrivacyPolicyInvalid: SdkErrors.PrivacyPolicyInvalid,
  PrivacyConfirmationInvalid: SdkErrors.PrivacyConfirmationInvalid,
  PrivacyRequestMissing: SdkErrors.PrivacyRequestMissing,
  PrivacyNotConfirmed: SdkErrors.PrivacyNotConfirmed,
  PrivacyJobsBusy: SdkErrors.PrivacyJobsBusy,
  PrivacyJobsUnscoped: SdkErrors.PrivacyJobsUnscoped,
  PrivacyJobsUnreadable: SdkErrors.PrivacyJobsUnreadable,
  JobFailed: SdkErrors.JobFailed,
  CommentEmailRequired: SdkErrors.CommentEmailRequired,
  AuthenticationRequired: SdkErrors.AuthenticationRequired,
  Forbidden: SdkErrors.Forbidden,
  PatternNotFound: SdkErrors.PatternNotFound,
  PatternLimit: SdkErrors.PatternLimit,
  TooManyAttempts: SdkErrors.TooManyAttempts,
  CaptchaRequired: SdkErrors.CaptchaRequired,
  CaptchaInvalid: SdkErrors.CaptchaInvalid,
  UserNotFound: SdkErrors.UserNotFound,
  SessionNotFound: SdkErrors.SessionNotFound,
  PasswordResetLimit: SdkErrors.PasswordResetLimit,
  PasswordRequired: SdkErrors.PasswordRequired,
  LastAdministrator: SdkErrors.LastAdministrator,
  UserDeleteSelf: SdkErrors.UserDeleteSelf,
  ReassignTargetInvalid: SdkErrors.ReassignTargetInvalid,
  RouteNotFound: SdkErrors.RouteNotFound,
  Internal: SdkErrors.Internal,
  InstallRequired: SdkErrors.InstallRequired,
  PluginRouteFailed: SdkErrors.PluginRouteFailed,
  InvalidInput: SdkErrors.InvalidInput,
  RequestBodyNotJson: SdkErrors.RequestBodyNotJson,
  RequestBodyTooLarge: SdkErrors.RequestBodyTooLarge,
  InvalidCredentials: SdkErrors.InvalidCredentials,
  SecondFactorFailed: SdkErrors.SecondFactorFailed,
  SetupCompleted: SdkErrors.SetupCompleted,
  EmailRegistered: SdkErrors.EmailRegistered,
  EmailChangeRestricted: SdkErrors.EmailChangeRestricted,
  ContentNotFound: SdkErrors.ContentNotFound,
  ContentAutosavePending: SdkErrors.ContentAutosavePending,
  ContentChanged: SdkErrors.ContentChanged,
  SlugConflict: SdkErrors.SlugConflict,
  SlugInUse: SdkErrors.SlugInUse,
  UnknownTerms: SdkErrors.UnknownTerms,
  MediaNotFound: SdkErrors.MediaNotFound,
  ImageCropInvalid: SdkErrors.ImageCropInvalid,
  RegistrationClosed: SdkErrors.RegistrationClosed,
  ContentParentInvalid: SdkErrors.ContentParentInvalid,
  RoleUnknown: SdkErrors.RoleUnknown,
  RoleBuiltin: SdkErrors.RoleBuiltin,
  MediaEmpty: SdkErrors.MediaEmpty,
  MediaDriverInvalid: SdkErrors.MediaDriverInvalid,
  MediaStorageProbeAuth: SdkErrors.MediaStorageProbeAuth,
  MediaStorageProbeBucket: SdkErrors.MediaStorageProbeBucket,
  MediaStorageProbeNetwork: SdkErrors.MediaStorageProbeNetwork,
  MediaStorageProbeTls: SdkErrors.MediaStorageProbeTls,
  MediaStorageProbeRejected: SdkErrors.MediaStorageProbeRejected,
  MediaStorageProbeCleanup: SdkErrors.MediaStorageProbeCleanup,
  MediaStorageFieldRequired: SdkErrors.MediaStorageFieldRequired,
  MediaResyncFailed: SdkErrors.MediaResyncFailed,
  MediaStorageLocation: SdkErrors.MediaStorageLocation,
  MediaStorageSecret: SdkErrors.MediaStorageSecret,
  MediaTooLarge: SdkErrors.MediaTooLarge,
  MediaStorageLow: SdkErrors.MediaStorageLow,
  MediaStorageBusy: SdkErrors.MediaStorageBusy,
  MediaUploadRate: SdkErrors.MediaUploadRate,
  MediaTypeUnsupported: SdkErrors.MediaTypeUnsupported,
  MediaUploadRefused: SdkErrors.MediaUploadRefused,
  MediaInUse: SdkErrors.MediaInUse,
  ContentTypeUnknown: SdkErrors.ContentTypeUnknown,
  ContentTypeReserved: SdkErrors.ContentTypeReserved,
  ContentTypeExists: SdkErrors.ContentTypeExists,
  ContentTypeNotFound: SdkErrors.ContentTypeNotFound,
  ContentTypeInUse: SdkErrors.ContentTypeInUse,
  CommentLoginRequired: SdkErrors.CommentLoginRequired,
  CommentNotFound: SdkErrors.CommentNotFound,
  CommentsClosed: SdkErrors.CommentsClosed,
  CommentReplyInvalid: SdkErrors.CommentReplyInvalid,
  CommentUnsubscribeInvalid: SdkErrors.CommentUnsubscribeInvalid,
  CommentPushEndpointInvalid: SdkErrors.CommentPushEndpointInvalid,
  CommentPushTokenInvalid: SdkErrors.CommentPushTokenInvalid,
  AvatarNotFound: SdkErrors.AvatarNotFound,
  SearchNotConfigured: SdkErrors.SearchNotConfigured,
  SearchUnavailable: SdkErrors.SearchUnavailable,
  SearchTaskFailed: SdkErrors.SearchTaskFailed,
  SearchRequestFailed: SdkErrors.SearchRequestFailed,
  SearchSyncFailed: SdkErrors.SearchSyncFailed,
  OutboundTimeout: SdkErrors.OutboundTimeout,
  OutboundTlsFailed: SdkErrors.OutboundTlsFailed,
  OutboundNetworkFailed: SdkErrors.OutboundNetworkFailed,
  OutboundUrlInvalid: SdkErrors.OutboundUrlInvalid,
  OutboundHostUnresolved: SdkErrors.OutboundHostUnresolved,
  OutboundAddressBlocked: SdkErrors.OutboundAddressBlocked,
  OutboundRedirectBlocked: SdkErrors.OutboundRedirectBlocked,
  EgressAddressInvalid: SdkErrors.EgressAddressInvalid,
  WebhookNotFound: SdkErrors.WebhookNotFound,
  WebhookInvalidJob: SdkErrors.WebhookInvalidJob,
  WebhookStatus: SdkErrors.WebhookStatus,
  WebhookDeliveryFailed: SdkErrors.WebhookDeliveryFailed,
  HealthCheckFailed: SdkErrors.HealthCheckFailed,
  HealthJobFailed: SdkErrors.HealthJobFailed,
  ImportItemUnsupported: SdkErrors.ImportItemUnsupported,
  ImportInvalid: SdkErrors.ImportInvalid,
  ImportContentLimit: SdkErrors.ImportContentLimit,
  ImportDownloadDeferred: SdkErrors.ImportDownloadDeferred,
  ImportAuthorsLimit: SdkErrors.ImportAuthorsLimit,
  SsoSecretRequired: SdkErrors.SsoSecretRequired,
  SsoSiteUrlRequired: SdkErrors.SsoSiteUrlRequired,
  WidgetTypeUnknown: SdkErrors.WidgetTypeUnknown,
  FieldExists: SdkErrors.FieldExists,
  FieldNotFound: SdkErrors.FieldNotFound,
  FieldRequired: SdkErrors.FieldRequired,
  ScheduleDateRequired: SdkErrors.ScheduleDateRequired,
  RevisionNotFound: SdkErrors.RevisionNotFound,
  RevisionAutosaveDelete: SdkErrors.RevisionAutosaveDelete,
  PreviewInvalid: SdkErrors.PreviewInvalid,
  ContentPasswordWrong: SdkErrors.ContentPasswordWrong,
  UnknownCategory: SdkErrors.UnknownCategory,
  UnknownTag: SdkErrors.UnknownTag,
  InvalidDocument: SdkErrors.InvalidDocument,
  PathConflict: SdkErrors.PathConflict,
  PathInUse: SdkErrors.PathInUse,
  InvalidPermalink: SdkErrors.InvalidPermalink,
  PermalinkTitleUnusable: SdkErrors.PermalinkTitleUnusable,
  PermalinkPathInvalid: SdkErrors.PermalinkPathInvalid,
  TaxonomyNotFound: SdkErrors.TaxonomyNotFound,
  TermNotFound: SdkErrors.TermNotFound,
  TermParentNotCategory: SdkErrors.TermParentNotCategory,
  TermParentCycle: SdkErrors.TermParentCycle,
  TermParentNotFound: SdkErrors.TermParentNotFound,
  TermParentOtherTaxonomy: SdkErrors.TermParentOtherTaxonomy,
  ThemeNotFound: SdkErrors.ThemeNotFound,
  ThemeBuiltinReplace: SdkErrors.ThemeBuiltinReplace,
  ThemeBuiltinRemove: SdkErrors.ThemeBuiltinRemove,
  ThemeActiveRemove: SdkErrors.ThemeActiveRemove,
  ThemeArchiveTooLarge: SdkErrors.ThemeArchiveTooLarge,
  ThemeArchiveInvalid: SdkErrors.ThemeArchiveInvalid,
  ThemeArchiveFile: SdkErrors.ThemeArchiveFile,
  ThemeArchiveMissing: SdkErrors.ThemeArchiveMissing,
  ThemeTemplateNotFound: SdkErrors.ThemeTemplateNotFound,
  ThemePartNotFound: SdkErrors.ThemePartNotFound,
  ThemeFontUnknown: SdkErrors.ThemeFontUnknown,
  ThemeColorUnknown: SdkErrors.ThemeColorUnknown,
  PluginNotFound: SdkErrors.PluginNotFound,
  PluginBundleEmpty: SdkErrors.PluginBundleEmpty,
  PluginBundleInvalid: SdkErrors.PluginBundleInvalid,
  PluginBundleUnloadable: SdkErrors.PluginBundleUnloadable,
  PluginFailed: SdkErrors.PluginFailed,
  PluginBundleImport: SdkErrors.PluginBundleImport,
  PluginExportMissing: SdkErrors.PluginExportMissing,
  SignInExpired: SdkErrors.SignInExpired,
  PluginActivateInvalid: SdkErrors.PluginActivateInvalid,
  PluginDeactivateInvalid: SdkErrors.PluginDeactivateInvalid,
  PluginIdInvalid: SdkErrors.PluginIdInvalid,
  PluginRequiresCms: SdkErrors.PluginRequiresCms,
  PluginRequiresPlugin: SdkErrors.PluginRequiresPlugin,
  PluginNoUpdateUrl: SdkErrors.PluginNoUpdateUrl,
  PluginUpdateUnavailable: SdkErrors.PluginUpdateUnavailable,
  PluginPageNotFound: SdkErrors.PluginPageNotFound,
  PluginPageFailed: SdkErrors.PluginPageFailed,
  SsoNotFound: SdkErrors.SsoNotFound,
  PasswordLoginDisabled: SdkErrors.PasswordLoginDisabled,
  SsoProviderRequired: SdkErrors.SsoProviderRequired,
  SsoAccessRequired: SdkErrors.SsoAccessRequired,
  SsoLastAccess: SdkErrors.SsoLastAccess,
  SsoRateLimited: SdkErrors.SsoRateLimited,
  SsoPendingLimit: SdkErrors.SsoPendingLimit,
  SsoRequestExpired: SdkErrors.SsoRequestExpired,
  SsoLinkSignInRequired: SdkErrors.SsoLinkSignInRequired,
  SsoAccountUnusable: SdkErrors.SsoAccountUnusable,
  SsoAccountAssigned: SdkErrors.SsoAccountAssigned,
  SsoAccountNotLinked: SdkErrors.SsoAccountNotLinked,
  SsoAccountUnlinked: SdkErrors.SsoAccountUnlinked,
  SsoFailed: SdkErrors.SsoFailed,
  SsoAccountLinkedElsewhere: SdkErrors.SsoAccountLinkedElsewhere,
  EmailDisabled: SdkErrors.EmailDisabled,
  EmailSecretRequired: SdkErrors.EmailSecretRequired,
  EmailSendFailed: SdkErrors.EmailSendFailed,
  SiteUrlRequired: SdkErrors.SiteUrlRequired,
  PasswordTokenInvalid: SdkErrors.PasswordTokenInvalid,
  CurrentPasswordWrong: SdkErrors.CurrentPasswordWrong,
  ApiTokenNotFound: SdkErrors.ApiTokenNotFound,
  InstallKeyInvalid: SdkErrors.InstallKeyInvalid,
  InstallBusy: SdkErrors.InstallBusy,
  InstallDatabaseConfigured: SdkErrors.InstallDatabaseConfigured,
  InstallDatabaseRequired: SdkErrors.InstallDatabaseRequired,
  InstallCompleted: SdkErrors.InstallCompleted,
  InstallApplyFailed: SdkErrors.InstallApplyFailed,
  InstallDatabaseUnreachable: SdkErrors.InstallDatabaseUnreachable,
  InstallMigrationFailed: SdkErrors.InstallMigrationFailed,
  PluginBlockAttrsInvalid: SdkErrors.PluginBlockAttrsInvalid,
  SiteImageInvalid: SdkErrors.SiteImageInvalid,
  ThemeScreenshotInvalid: SdkErrors.ThemeScreenshotInvalid,
  ...ServerErrors,
} as const;

export const invalidInput = (message: string, issues?: unknown) =>
  new DomainError('invalid_input', message, issues);
export const unauthorized = (message: string = Errors.AuthenticationRequired) =>
  new DomainError('unauthorized', message);
export const expiredSignIn = () =>
  new DomainError('sign_in_expired', Errors.SignInExpired);
export const notFound = (message: string) =>
  new DomainError('not_found', message);
export const conflict = (message: string, issues?: unknown) =>
  new DomainError('conflict', message, issues);
export const forbidden = (message: string = Errors.Forbidden) =>
  new DomainError('forbidden', message);
/** Too many attempts; the client may retry later. */
export const rateLimited = (message: string, issues?: unknown) =>
  new DomainError('rate_limited', message, issues);
export const payloadTooLarge = (message: string) =>
  new DomainError('payload_too_large', message);
export const destinationBlocked = (
  message: string = Errors.OutboundAddressBlocked,
) => new DomainError('destination_blocked', message);
/** The attempt needs a solved captcha first (or the one sent was not valid). */
export const captchaRequired = (message: string = Errors.CaptchaRequired) =>
  new DomainError('captcha_required', message);

/**
 * `params` within `ISSUE_PARAMS_LIMITS`, for every place that sends them (issues, import skips,
 * plugin errors): the first 8 string or finite-number values under keys of at most 40
 * characters, strings cut to 500. `undefined` when none remain.
 */
export const issueParams = (
  params: Readonly<Record<string, unknown>>,
): IssueParams | undefined => {
  const kept = Object.entries(params)
    .filter(
      (entry): entry is [string, string | number] =>
        entry[0].length <= ISSUE_PARAMS_LIMITS.key &&
        (typeof entry[1] === 'string' ||
          (typeof entry[1] === 'number' && Number.isFinite(entry[1]))),
    )
    .slice(0, ISSUE_PARAMS_LIMITS.keys)
    .map(([key, value]) => [
      key,
      typeof value === 'string'
        ? value.slice(0, ISSUE_PARAMS_LIMITS.value)
        : value,
    ]);
  return kept.length ? Object.fromEntries(kept) : undefined;
};

/**
 * A one-issue list carrying the values a catalog `message` leaves out. `path` names the field;
 * `''` means the refusal itself. Params are bounded by `issueParams`.
 */
export const withParams = (
  message: string,
  params: Readonly<Record<string, string | number | undefined>>,
  path = '',
) => {
  const bounded = issueParams(params);
  return [{ path, message, ...(bounded && { params: bounded }) }];
};

/** The bounded params of a refusal's first issue: the values its catalog message leaves out. */
export const paramsOf = (error: DomainError): IssueParams | undefined => {
  const first: unknown = Array.isArray(error.issues)
    ? error.issues[0]
    : undefined;
  const params =
    first && typeof first === 'object' && 'params' in first
      ? first.params
      : undefined;
  return params && typeof params === 'object'
    ? issueParams(params as Record<string, unknown>)
    : undefined;
};

export const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
