/**
 * Every error message the SDK throws and every message the API can put in a response body; see
 * `Errors` in the API for the rule. Texts are fixed so readers' catalogs can key on them: values
 * a message leaves out travel as `issues[].params` (named in the comment).
 */
export const Errors = {
  EmbedPattern: 'Enter a valid regular expression.',
  EmbedAllow: 'Choose only supported iframe permissions, without origin lists.',
  EmbedSource: 'Use an HTTPS template with a fixed origin.',
  EmbedPlaceholder:
    'Template placeholders must name capture groups in the URL pattern.',
  EmbedDuplicate: 'Another embed provider already uses this ID.',
  MediaStorageProbeCleanup: 'The connection test file could not be removed.',
  MediaStorageLocation:
    'Existing S3 storage location cannot be changed; migrate stored assets first',
  MediaStorageSecret:
    'Enter the S3 secret access key for this endpoint and account',
  MediaDriverInvalid: 'Invalid media storage driver key',
  MediaStorageBusy: 'The media storage is busy; try the upload again',
  MediaStorageProbeAuth:
    'Could not connect to the storage: authentication or permission denied',
  MediaStorageProbeBucket: 'Could not connect to the storage: bucket not found',
  MediaStorageProbeNetwork: 'Could not connect to the storage: network failure',
  MediaStorageProbeTls: 'Could not connect to the storage: TLS failure',
  MediaStorageProbeRejected:
    'Could not connect to the storage: provider rejected the request',
  MediaStorageFieldRequired: 'This storage field is required',
  InvalidCredentials: 'Invalid email or password',
  /** A second factor (code, passkey, plugin factor) did not verify. */
  SecondFactorFailed: 'Verification failed. Try again.',
  InvalidInput: 'Invalid input',
  RequestBodyNotJson: 'Request body must be JSON',
  RequestBodyTooLarge: 'Request body is too large',
  Internal: 'Internal server error',
  AuthenticationRequired: 'Authentication required',
  Forbidden: 'You do not have permission to do this',
  TooManyAttempts: 'Too many attempts. Please wait a while and try again.',
  CaptchaRequired: 'Please confirm that you are not a robot.',
  CaptchaInvalid: 'The robot check failed. Please try again.',
  PasswordResetLimit:
    'Too many password reset emails were sent. Try again later.',
  PasswordTokenInvalid:
    'This link is invalid or has expired. Ask for a new one.',
  CurrentPasswordWrong: 'The current password is not correct',
  EmailDisabled: 'Set up and enable email delivery first',
  SiteUrlRequired: 'Set the public site address in the SEO settings first',
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
  PluginIdReserved: 'The plugin id "core" is reserved for the CMS',
  CaptchaProviderUnknown: 'Choose a registered captcha provider',
  NotJsonSerializable: 'Value is not JSON-serializable',
  InvalidDate: 'Invalid date',
  UnknownPermalinkToken: 'Unknown permalink token',
  PermalinkPathTooLong: 'Path is too long',
  PermalinkPathNotCanonical:
    'Path must be a canonical percent-encoded path without empty, "." or ".." segments',
  PermalinkPathReserved: 'Path is reserved',
  InvalidResponse: 'The CMS returned an invalid response',
  PermalinkBuiltinsRequired:
    'Templates for posts, articles and pages are required',
  MenuLinkInvalid: 'Use a web address (https://…) or a path on this site (/…)',
  MenuTargetMissing: 'Choose what the menu item links to',
  LoginPathInvalid:
    'Use an available site path such as /login, without a query or reserved route',
  FieldOptionsRequired: 'Add at least one choice',
  FieldValuesInvalid: 'Field values must be plain data',
  CommentUrlInvalid: 'Use a web address starting with https:// or http://',
  CommentDefaultNameRequired:
    'Enter a default commenter name when the name field is disabled.',
  SearchHostInvalid: 'Use an address such as http://127.0.0.1:7700',
  SearchPrefixInvalid: 'Use 1–40 lowercase letters, digits or underscores',
  SearchHostRequired: 'Enter the Meilisearch address to turn search on',
  SsoIssuerInvalid: 'Use the provider address, such as https://id.example.com',
  SsoScopesOpenid: 'Scopes must include openid',
  SsoIssuerRequired:
    'Enter the provider address and client ID to turn on single sign-on',
  SsoProviderIdInvalid:
    'Use 1–32 lowercase letters, digits or hyphens, starting and ending with a letter or digit',
  SsoProviderIdDuplicate: 'Another provider already uses this ID',
  SsoClaimTokenRequired: 'Open the link from your email again',
  SignInDuplicate: 'Listed more than once',
  SignInMethodRequired: 'Allow at least one way to sign in',
  SignInUnknown: 'Choose a registered sign-in method or second factor.',
  SignInLastFactor: 'Keep at least one second factor required by your role.',
  SignInFactorRequired:
    'Allow an enrollable second factor before requiring two-step verification.',
  RecentSignInRequired:
    'Sign in again before adding credentials to your account.',
  RecoveryRecentSignIn: 'Sign in again before generating recovery codes.',
  SignInExpired: 'This sign-in request is no longer valid. Start again.',
  SignInStepRequired: 'Continue signing in using the step-based sign-in flow.',
  SignInAccessRequired:
    'Keep at least one available sign-in method that your account can use.',
  PasswordLoginDisabled:
    'Password sign-in is disabled. Choose another sign-in method.',
  SsoProviderRequired:
    'Keep an enabled single sign-on provider or another usable sign-in method.',
  SsoAccessRequired:
    'Keep a provider linked or assigned to your account, or another usable sign-in method.',
  SsoLastAccess: 'You cannot remove your last usable sign-in method.',
  EmailServerRequired: 'Enter the mail server to send email over SMTP',
  EmailSenderRequired: 'Enter the sender address to enable email',
  EmailSecretRequired: 'Enter an API secret to enable HTTP email delivery',
  EmailProviderFieldRequired: 'Required by this mail provider',
  EmailRegionInvalid: 'Choose a region this mail provider offers',
  EmailUrlInvalid: 'Use an https:// address',
  EmailHeaderInvalid: 'Enter a header name such as Authorization',
  EmailTemplateInvalid:
    'Enter JSON; placeholders such as {{to}} stand for text values',
  EgressHostInvalid: 'Enter one host name or IP address',
  EgressAddressInvalid: 'Enter an IP address or CIDR range',
  BlocksNotList: 'Must be a list of blocks',
  BlocksTooDeep: 'Blocks are nested too deeply',
  BlocksTooMany: 'Too many blocks',
  BlockInvalid: 'Must be a block',
  BlockPropertyUnknown: 'Unknown property',
  BlockUnknown: 'Unknown block',
  /** `params`: `parents` (block names joined by " or "). */
  BlockParent: 'Must be inside another block',
  /** `params`: `parent`. */
  BlockNotAllowedInside: 'Not allowed inside this block',
  BlockAttrsInvalid: 'Must be an object',
  BlockAttrUnknown: 'Unknown attribute',
  BlockAttrRequired: 'Required',
  BlockNoChildren: 'This block has no children',
  BlockAttrText: 'Must be text',
  /** `params`: `max` (characters). */
  BlockAttrTooLong: 'Too many characters',
  BlockAttrFormat: 'Invalid format',
  BlockAttrColor: 'Must be a palette color',
  /** `params`: `min`, `max`. */
  BlockAttrNumber: 'Must be a whole number in the allowed range',
  BlockAttrBoolean: 'Must be true or false',
  /** `params`: `options` (joined by ", "). */
  BlockAttrChoice: 'Must be one of the allowed options',
  ThemePaletteDuplicate: 'Palette slugs must be unique',
  /** `params`: `role`. */
  ThemePaletteRole: 'The palette needs every color role',
  ThemeFontUnknown: 'Not one of the theme font families',
  FontUrlInvalid: 'Use an https:// address without spaces, quotes or brackets',
  FontFileInvalid:
    'Use an https:// or media library (/media/…) address of a .woff2, .woff, .ttf or .otf file',
  FontFamilyInvalid:
    'Use letters, numbers, spaces, dashes and underscores for the family name',
  FontSourceRequired: 'Add either a stylesheet address or font files',
  FontDuplicate: 'Font slugs and family names must be unique',
  ThemeAlternatePalette:
    'The alternate palette needs exactly the palette slugs, and color scheme options need it',
  TaxonomyFilterPair: 'Choose both a taxonomy and a term.',
  ThemeQueriesLimit: 'A theme can contain at most 32 independent post lists.',
  ThemeIndexRequired: 'A theme needs templates/index.json',

  // Messages the API sends in response bodies (errors, field issues, status fields).
  PrivacyPolicyInvalid:
    'Choose a published, unprotected page for the privacy policy',
  PrivacyConfirmationInvalid:
    'This confirmation link is invalid, expired, or already used',
  PrivacyRequestMissing: 'Privacy request not found',
  PrivacyNotConfirmed: 'The person must confirm this request first',
  PrivacyJobsBusy:
    'A message involving this person is being sent. Try again after it finishes',
  PrivacyJobsUnscoped:
    'Older comment notifications have no subject reference. Let them finish or expire before completing this request',
  PrivacyJobsUnreadable:
    'A queued message cannot be read. Repair or remove it before erasing personal data',
  JobFailed: 'Job delivery failed',
  CommentEmailRequired: 'Enter an email address.',
  PatternNotFound: 'Pattern not found',
  PatternLimit: 'A site can keep at most 500 patterns',
  UserNotFound: 'User not found',
  SessionNotFound: 'Session not found',
  PasswordRequired:
    'Enter a password, or set up email delivery to send an invitation',
  LastAdministrator: 'The site needs at least one administrator',
  UserDeleteSelf: 'You cannot delete your own account',
  ReassignTargetInvalid: 'Choose another existing user to receive the content',
  RouteNotFound: 'Route not found',
  InstallRequired: 'Finish the installation on the website first.',
  PluginRouteFailed: 'The plugin failed to handle this request',
  SetupCompleted: 'Setup has already been completed',
  EmailRegistered: 'Email is already registered',
  EmailChangeRestricted:
    'Contact an administrator to change your email address.',
  ContentNotFound: 'Content not found',
  ContentAutosavePending:
    'You have unsaved changes to this entry in the editor. Open it to save or discard them first.',
  ContentChanged:
    'This entry was changed since you opened it. Reload the page and try again.',
  SlugConflict: 'Slug is already in use',
  /** `params`: `slug`. */
  SlugInUse: 'This slug is already in use',
  UnknownTerms: 'Unknown terms',
  MediaNotFound: 'Media not found',
  ImageCropInvalid: 'The crop must fit inside the image.',
  RegistrationClosed: 'Registration is closed.',
  ContentParentInvalid: 'Choose a parent page outside this page’s descendants.',
  RoleUnknown: 'This role does not exist.',
  RoleBuiltin: 'Built-in roles cannot be changed.',
  MediaEmpty: 'The file is empty',
  MediaResyncFailed:
    'Storage resync failed or exceeded the 5000-object limit; no objects were deleted',
  /** `params`: `maxBytes`. */
  MediaTooLarge: 'The file is too large',
  MediaStorageLow: 'The server does not have enough free storage for this file',
  /** `params`: `limit` (files per hour). */
  MediaUploadRate:
    'Too many files were uploaded this hour. Please wait and try again.',
  MediaTypeUnsupported:
    'This file type is not supported. Upload JPEG, PNG, GIF, WebP, AVIF, PDF, MP3, WAV, Ogg, MP4 or WebM. Safe SVG files are accepted when SVG uploads are enabled.',
  MediaUploadRefused: 'This upload was refused.',
  /** `params`: `count` (entries). */
  MediaInUse:
    'The file is used by entries; delete it anyway to remove it from them',
  ContentTypeUnknown: 'Choose an existing content type',
  ContentTypeReserved: 'This key is used by the system; choose another',
  ContentTypeExists: 'A content type with this key exists',
  ContentTypeNotFound: 'Content type not found',
  ContentTypeInUse: 'Entries of this type exist; delete or change them first',
  CommentLoginRequired: 'You must be logged in to post a comment',
  CommentNotFound: 'Comment not found',
  CommentsClosed: 'Comments are closed for this entry',
  CommentReplyInvalid: 'The comment you are replying to is not available',
  CommentUnsubscribeInvalid: 'This unsubscribe link is invalid or has expired.',
  CommentPushEndpointInvalid:
    'Notifications from this browser’s push service are not supported.',
  CommentPushTokenInvalid:
    'This notification request has expired. Post the comment again to turn on notifications.',
  AvatarNotFound: 'Avatar not found',
  SearchNotConfigured: 'Enter the Meilisearch address first',
  SearchUnavailable: 'Meilisearch did not answer',
  SearchTaskFailed: 'A Meilisearch task failed',
  /** `params` (search status `lastErrorParams`): `status`, the HTTP status. */
  SearchRequestFailed: 'Meilisearch answered with an error',
  SearchSyncFailed: 'Search indexing failed. Check the server log for details.',
  /** Outbound calls that got no answer: categories only, never the remote side's words. */
  OutboundTimeout: 'The server did not answer in time',
  OutboundTlsFailed: 'The TLS certificate of the server could not be verified',
  OutboundNetworkFailed: 'The server could not be reached',
  OutboundUrlInvalid: 'The outbound address is invalid',
  OutboundHostUnresolved: 'The outbound host could not be resolved',
  OutboundAddressBlocked: 'The outbound address is not permitted',
  OutboundRedirectBlocked: 'The outbound redirect is not permitted',
  WebhookNotFound: 'Webhook not found',
  WebhookInvalidJob: 'Invalid webhook delivery job',
  /** The status itself is the webhook's `lastStatus`. */
  WebhookStatus: 'The receiver answered with an error status',
  WebhookDeliveryFailed:
    'The delivery failed. Check the server log for details.',
  /** A site-health `detail` note of a plugin check that threw or timed out; `params`: `check`. */
  HealthCheckFailed: 'The check failed',
  /** A site-health `detail` note of a recently failed job; `params`: `kind`. */
  HealthJobFailed: 'A background job failed',
  /** `params` of the skipped item: `type`, `status`. */
  ImportItemUnsupported:
    'Not imported: this item type or status is not supported',
  ImportInvalid: 'The file is not a WordPress export (WXR)',
  ImportContentLimit: 'This entry exceeds the import content limit',
  ImportDownloadDeferred:
    'Download limit reached. Re-import to download the remaining files into the media library; entries already imported are not updated.',
  ImportAuthorsLimit:
    'Import at most 1000 authors and create at most 100 accounts at a time',
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
  RevisionAutosaveDelete: 'Autosaves cannot be deleted as saved revisions',
  PreviewInvalid: 'This preview link is invalid or has expired',
  ContentPasswordWrong: 'The password is not correct',
  UnknownCategory: 'Unknown category',
  UnknownTag: 'Unknown tag',
  /** `params`: `detail` (the document checker's wording). */
  InvalidDocument: 'The document is not valid',
  PathConflict: 'Path is already in use',
  /** `params`: `path`. */
  PathInUse: 'This path is already in use',
  InvalidPermalink: 'Invalid permalink',
  /** `params`: `title`. */
  PermalinkTitleUnusable: 'The title cannot be used in a URL',
  /** `params`: `reason` (a `PermalinkPath*` message), `path`, `title`. */
  PermalinkPathInvalid: 'This address cannot be used for the entry',
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
  /** `params`: `file` (path inside the archive). */
  ThemeArchiveFile:
    'The archive contains a file that is not a valid theme file',
  ThemeArchiveMissing: 'The archive has no theme.json',
  ThemeTemplateNotFound: 'Template not found',
  ThemePartNotFound: 'Template part not found',
  /** `params`: `slug`. */
  ThemeColorUnknown: 'Not one of the theme palette colors',
  PluginNotFound: 'Plugin not found',
  PluginBundleEmpty: 'Plugin bundle is empty',
  PluginBundleInvalid: 'The plugin bundle is not valid',
  PluginBundleUnloadable: 'Plugin bundle could not be loaded; install it again',
  PluginBundleImport: 'Could not import plugin bundle',
  PluginExportMissing: 'Bundle has no `plugin` export',
  PluginActivateInvalid: '`plugin.activate` must be a function',
  PluginDeactivateInvalid: '`plugin.deactivate` must be a function',
  /** `params`: `id`. */
  PluginIdInvalid: 'Invalid plugin id',
  /** A plugin's `error`; `errorParams`: `range`, `version` (this site's). */
  PluginRequiresCms: 'This plugin needs another CMS version',
  /** A plugin's `error`; `errorParams`: `id`, `range`. */
  PluginRequiresPlugin: 'This plugin needs another plugin to be active',
  /** A plugin's `error` when activation threw. */
  PluginFailed: 'Plugin failed. Check server logs for details.',
  PluginNoUpdateUrl: 'This plugin does not name an update address',
  PluginUpdateUnavailable: 'The update address did not answer with a version',
  PluginPageNotFound: 'This plugin page is not available',
  PluginPageFailed:
    'The plugin could not show this page. Check server logs for details.',
  /** `params`: `title`. */
  PluginBlockAttrsInvalid: 'The settings of a plugin block are not valid',
  /**
   * A test send that failed; `params`: `reason` (`EMAIL_FAILURE_REASONS`) and, for HTTP
   * providers, `status`. The server's own answer stays in the server log.
   */
  EmailSendFailed:
    'The mail server refused the message. Check the server log for details.',
  ApiTokenNotFound: 'Token not found',
  InstallKeyInvalid: 'Check the installation key shown in the server console.',
  InstallBusy: 'Installation is in progress. Please try again in a moment.',
  InstallDatabaseConfigured: 'The database connection is already set up.',
  InstallDatabaseRequired: 'Connect the database first.',
  InstallCompleted: 'Installation has already been completed.',
  InstallApplyFailed:
    'The settings could not be applied. Check the database connection and that the server can write to its data folder.',
  InstallDatabaseUnreachable:
    'Cannot connect to the database. Check the address, account and database name, and the access rights.',
  InstallMigrationFailed:
    'Preparing the tables failed. Check that the database account may create tables, and the migration state. Existing data is not reset.',
  SiteImageInvalid: 'Choose an image from the media library.',
  ThemeScreenshotInvalid:
    'The theme screenshot must be a PNG or WebP image of at most 512 KB.',
} as const;
