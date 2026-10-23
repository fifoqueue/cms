export type ErrorCode =
  | 'invalid_input'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'payload_too_large'
  | 'captcha_required';

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
 * Every error message the API throws. Code throws `Errors.<Name>` (or calls it with details)
 * instead of writing message text at the throw site; ESLint rejects literal messages.
 */
export const Errors = {
  PrivacyPolicyInvalid:
    'Choose a published, unprotected page for the privacy policy',
  PrivacyConfirmationInvalid:
    'This confirmation link is invalid, expired, or already used',
  PrivacyRequestMissing: 'Privacy request not found',
  PrivacyNotConfirmed: 'The person must confirm this request first',
  PrivacyJobsBusy:
    'A message involving this person is being sent. Try again after it finishes',
  PrivacyJobsUnreadable:
    'A queued message cannot be read. Repair or remove it before erasing personal data',
  JobFailed: 'Job delivery failed',

  AuthenticationRequired: 'Authentication required',
  Forbidden: 'You do not have permission to do this',
  TooManyAttempts: 'Too many attempts. Please wait a while and try again.',
  CaptchaRequired: 'Please confirm that you are not a robot.',
  CaptchaInvalid: 'The robot check failed. Please try again.',
  UserNotFound: 'User not found',
  PasswordRequired:
    'Enter a password, or set up email delivery to send an invitation',
  LastAdministrator: 'The site needs at least one administrator',
  UserDeleteSelf: 'You cannot delete your own account',
  ReassignTargetInvalid: 'Choose another existing user to receive the content',
  RouteNotFound: 'Route not found',
  Internal: 'Internal server error',
  InstallRequired: '먼저 웹사이트에서 설치를 완료해 주세요.',
  PluginRouteFailed: 'The plugin failed to handle this request',
  InvalidInput: 'Invalid input',
  RequestBodyNotJson: 'Request body must be JSON',
  RequestBodyTooLarge: 'Request body is too large',
  InvalidCredentials: 'Invalid email or password',
  SetupCompleted: 'Setup has already been completed',
  EmailRegistered: 'Email is already registered',
  EmailChangeRestricted:
    'Contact an administrator to change your email address.',

  ContentNotFound: 'Content not found',
  ContentChanged:
    'This entry was changed since you opened it. Reload the page and try again.',
  ContentPathMissing: 'Content has no current path',
  SlugConflict: 'Slug is already in use',
  SlugInUse: (slug: string) => `Slug "${slug}" is already in use`,
  UnknownTerms: 'Unknown terms',
  MediaNotFound: 'Media not found',
  ImageCropInvalid: 'The crop must fit inside the image.',
  RegistrationClosed: 'Registration is closed.',
  ContentParentInvalid: 'Choose a parent page outside this page’s descendants.',
  RoleUnknown: 'This role does not exist.',
  RoleBuiltin: 'Built-in roles cannot be changed.',
  MediaEmpty: 'The file is empty',
  MediaKeyInvalid: 'Invalid media key',
  MediaTooLarge: (bytes: number) =>
    `The file is too large (at most ${Math.floor(bytes / 1024 / 1024)} MB)`,
  MediaTypeUnsupported:
    'This file type is not supported. Upload JPEG, PNG, GIF, WebP, AVIF, PDF, MP4 or WebM.',
  MediaInUse: (count: number) =>
    `The file is used by ${count} ${count === 1 ? 'entry' : 'entries'}; delete it anyway to remove it from them`,
  ContentTypeUnknown: 'Choose an existing content type',
  ContentTypeReserved: 'This key is used by the system; choose another',
  ContentTypeExists: 'A content type with this key exists',
  ContentTypeNotFound: 'Content type not found',
  ContentTypeInUse: 'Entries of this type exist; delete or change them first',
  CommentLoginRequired: 'You must be logged in to post a comment',
  CommentNotFound: 'Comment not found',
  CommentsClosed: 'Comments are closed for this entry',
  CommentReplyInvalid: 'The comment you are replying to is not available',
  SearchNotConfigured: 'Enter the Meilisearch address first',
  SearchUnavailable: (detail: string) =>
    `Meilisearch did not answer: ${detail}`,
  SearchTaskFailed: (detail: string) => `Meilisearch task failed: ${detail}`,
  WebhookNotFound: 'Webhook not found',
  WebhookInvalidJob: 'Invalid webhook delivery job',
  WebhookSecretUnreadable:
    'The webhook secret cannot be read; replace it in the admin area',
  WebhookStatus: (status: number) => `The receiver answered HTTP ${status}`,
  ImportItemUnsupported: (type: string, status: string) =>
    `Not imported: ${type} (${status})`,
  ImportInvalid: 'The file is not a WordPress export (WXR)',
  SsoSecretRequired:
    'Enter the client secret, or choose no client authentication',
  SsoSiteUrlRequired:
    'Set the public site address in SEO settings first; the provider sends users back there',
  WidgetTypeUnknown: 'This widget type is not available',
  FieldExists: 'A field with this key exists',
  FieldNotFound: 'Field not found',
  FieldRequired: 'This field is required',
  ScheduleDateRequired: 'Choose when to publish the entry',
  RevisionNotFound: 'Revision not found',
  PreviewInvalid: 'This preview link is invalid or has expired',
  ContentPasswordWrong: 'The password is not correct',
  UnknownCategory: 'Unknown category',
  UnknownTag: 'Unknown tag',
  InvalidDocument: (detail: string) => `Invalid document: ${detail}`,
  PathConflict: 'Path is already in use',
  PathInUse: (path: string) => `Path ${path} is already in use`,
  InvalidPermalink: 'Invalid permalink',
  PermalinkTitleUnusable: (title: string) =>
    `"${title}" cannot be used in a URL`,
  PermalinkPathInvalid: (issue: string, path: string, title: string) =>
    `${issue}: ${path} ("${title}")`,

  TaxonomyNotFound: 'Taxonomy not found',
  TermNotFound: 'Term not found',
  TermParentNotCategory: 'Only categories can have a parent',
  TermParentCycle:
    'A category cannot be nested under itself or its descendants',
  TermParentNotFound: 'Parent term not found',
  TermParentOtherTaxonomy: 'Parent term belongs to another taxonomy',

  ThemeNotFound: 'Theme not found',
  ThemeBuiltinReplace: 'Built-in themes cannot be replaced',
  ThemeBuiltinRemove: 'Built-in themes cannot be removed',
  ThemeActiveRemove: 'The active theme cannot be removed',
  ThemeArchiveTooLarge: 'Theme archives can be at most 2 MB',
  ThemeArchiveInvalid: 'Upload a .zip theme archive',
  ThemeArchiveFile: (path: string) => `${path} is not a valid theme file`,
  ThemeArchiveMissing: 'The archive has no theme.json',
  ThemeTemplateNotFound: 'Template not found',
  ThemePartNotFound: 'Template part not found',
  ThemeFontUnknown: 'Not one of the theme font families',
  ThemeColorUnknown: (slug: string) => `${slug} is not a palette color`,

  PluginNotFound: 'Plugin not found',
  PluginInactive: 'Plugin is not active',
  PluginBundleEmpty: 'Plugin bundle is empty',
  PluginBundleTooLarge: 'Plugin bundle is too large',
  PluginBundleInvalid: (detail: string) => `Invalid plugin bundle: ${detail}`,
  PluginBundleUnloadable: 'Plugin bundle could not be loaded; install it again',
  PluginBundleImport: 'Could not import plugin bundle',
  PluginExportMissing: 'Bundle has no `plugin` export',
  PluginActivateInvalid: '`plugin.activate` must be a function',
  PluginDeactivateInvalid: '`plugin.deactivate` must be a function',
  PluginBundleNameInvalid: (entry: string) => `Invalid bundle name "${entry}"`,
  PluginIdInvalid: (id: string) => `Invalid plugin id "${id}"`,
  PluginStorageKeyInvalid: (key: string) => `Invalid storage key "${key}"`,
  PluginRouteMethodUnsupported: (method: string) =>
    `Unsupported method "${method}"`,
  PluginRouteAccessUnknown: (access: string) => `Unknown access "${access}"`,
  PluginRoutePathInvalid: (path: string) =>
    `Route path "${path}" must start with "/"`,
  PluginSlotUnknown: (slot: string) => `Unknown slot "${slot}"`,
  PluginRequiresCms: (range: string, version: string) =>
    `Needs CMS ${range}; this site runs ${version}`,
  PluginRequiresPlugin: (id: string, range: string) =>
    `Needs the plugin "${id}" ${range}, active`,
  PluginNoUpdateUrl: 'This plugin does not name an update address',
  PluginUpdateUnavailable: 'The update address did not answer with a version',
  PluginPageKeyInvalid: (key: string) =>
    `Admin page key "${key}" must be kebab-case, at most 64 characters`,
  PluginPageNotFound: 'This plugin page is not available',
  PluginPageFailed:
    'The plugin could not show this page. Check server logs for details.',
  PluginTaskNameInvalid: (name: string) =>
    `Task name "${name}" must be kebab-case, at most 64 characters`,
  PluginWidgetKeyInvalid: (key: string) =>
    `Widget key "${key}" must be kebab-case`,
  PluginTimedOut: (timeoutMs: number) => `Timed out after ${timeoutMs}ms`,

  SsoNotFound: 'Single sign-on not found',
  SsoRateLimited:
    'Too many sign-in attempts. Please wait a minute and try again.',
  SsoPendingLimit:
    'Too many sign-in requests are in progress. Please try again in a few minutes.',
  SsoRequestExpired: 'The sign-in request has expired. Please try again.',
  SsoLinkSignInRequired: 'Sign in again before linking single sign-on.',
  SsoAccountUnusable: 'This single sign-on account cannot be used here.',
  SsoAccountAssigned: 'This account is assigned by the server configuration.',
  SsoAccountNotLinked:
    'This single sign-on account is not linked to an administrator.',
  SsoAccountUnlinked:
    'This single sign-on account is no longer linked. Please try again.',
  SsoFailed: 'Single sign-on failed. Please try again.',
  SsoAccountLinkedElsewhere:
    'This single sign-on account is already linked to another administrator.',

  EmailDisabled: 'Set up and enable email delivery first',
  EmailSendFailed: (detail: string) =>
    `The mail server refused the message: ${detail}`,
  EmailInvalidJob: 'The queued message is not valid',
  SiteUrlRequired: 'Set the public site address in the SEO settings first',
  PasswordTokenInvalid:
    'This link is invalid or has expired. Ask for a new one.',
  CurrentPasswordWrong: 'The current password is not correct',
  ApiTokenNotFound: 'Token not found',
  JobKindUnknown: (kind: string) => `No handler for job kind "${kind}"`,
  ConfigNotJsonObject: 'must be a JSON object',
  ConfigSetTogether: (keys: readonly string[]) =>
    `${keys.join(', ')} must be set together`,
  ConfigPendingLimitTooHigh: 'must not exceed OIDC_MAX_PENDING_REQUESTS',
  ConfigStartLimitTooHigh: 'must not exceed OIDC_STARTS_PER_MINUTE',
  ConfigClientSecretRequired: (method: string) => `required for ${method}`,
  ConfigInvalid: (problems: readonly string[]) =>
    `Invalid configuration:\n  ${problems.join('\n  ')}`,
  InstallKeyInvalid: '서버 콘솔의 설치 키를 확인해 주세요.',
  InstallBusy: '설치가 진행 중입니다. 잠시 후 다시 시도해 주세요.',
  InstallDatabaseConfigured: '데이터베이스 연결은 이미 설정되었습니다.',
  InstallDatabaseRequired: '먼저 데이터베이스를 연결해 주세요.',
  InstallCompleted: '설치가 이미 완료되었습니다.',
  InstallApplyFailed:
    '설정을 적용하지 못했습니다. DB 연결과 서버의 data 폴더 쓰기 권한을 확인해 주세요.',
  InstallDatabaseUnreachable:
    '데이터베이스에 연결할 수 없습니다. 주소·계정·데이터베이스 이름과 접근 권한을 확인해 주세요.',
  InstallMigrationFailed:
    '테이블 준비에 실패했습니다. DB 계정의 테이블 생성 권한과 마이그레이션 상태를 확인해 주세요. 기존 데이터는 초기화하지 않습니다.',
  InstallConfigUnreadable:
    '설정 파일을 읽을 수 없습니다. 파일 접근 권한을 확인해 주세요.',
  InstallConfigCorrupt:
    '설정 파일이 손상되었습니다. 기존 설정을 복구해 주세요.',
} as const;

export const invalidInput = (message: string, issues?: unknown) =>
  new DomainError('invalid_input', message, issues);
export const unauthorized = (message: string = Errors.AuthenticationRequired) =>
  new DomainError('unauthorized', message);
export const notFound = (message: string) =>
  new DomainError('not_found', message);
export const conflict = (message: string) =>
  new DomainError('conflict', message);
export const forbidden = (message: string = Errors.Forbidden) =>
  new DomainError('forbidden', message);
/** Too many attempts; the client may retry later. */
export const rateLimited = (message: string) =>
  new DomainError('rate_limited', message);
export const payloadTooLarge = (message: string) =>
  new DomainError('payload_too_large', message);
/** The attempt needs a solved captcha first (or the one sent was not valid). */
export const captchaRequired = (message: string = Errors.CaptchaRequired) =>
  new DomainError('captcha_required', message);

export const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
