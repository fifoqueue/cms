// English administration and theme copy. Every other language implements the same `Messages` shape.
import {
  apiErrorText,
  type ApiErrorCatalog,
  type ApiErrorKey,
  type ApiErrorParams,
  megabytes,
  type WebErrorCatalog,
  type WebErrorKey,
} from '#lib/i18n/api-errors.js';
import { templateLabels } from '#lib/i18n/template-label.js';

/** Comment form fields a visitor can have remembered. */
export type CommenterField = 'name' | 'email' | 'website';

/** Why a test send failed, by `EmailSendFailed`'s `reason` (SDK `EMAIL_FAILURE_REASONS`). */
const emailFailure = (reason: unknown) => {
  switch (reason) {
    case 'auth':
      return 'The mail server did not accept the user name, password or API key.';
    case 'timeout':
      return 'The mail server did not answer in time.';
    case 'tls':
      return 'The TLS certificate of the mail server could not be verified.';
    case 'network':
      return 'The mail server could not be reached. Check its address and port.';
    default:
      return 'The mail server refused the message. Check the server log for details.';
  }
};

/** Text for every SDK error, by its `Errors` key; read through `en.apiError`. */
export const apiErrors: ApiErrorCatalog = {
  EmbedPattern: 'Enter a valid regular expression starting with ^.',
  EmbedAllow: 'Choose only supported iframe permissions, without origin lists.',
  EmbedSource: 'Use an HTTPS template with a fixed origin.',
  EmbedPlaceholder:
    'Template placeholders must name capture groups in the URL pattern.',
  EmbedDuplicate: 'Another embed provider already uses this ID.',
  MediaStorageProbeCleanup: ({ bucket, key }) =>
    bucket === undefined || key === undefined
      ? 'The connection test file could not be removed. Delete the leftover test file from the storage yourself.'
      : `The connection test file could not be removed. Delete ${bucket}/${key} from the storage yourself.`,
  MediaStorageLocation:
    'The endpoint, bucket and prefix of a saved S3 storage cannot be changed. Move the stored files first.',
  MediaStorageSecret:
    'Enter the secret access key for this endpoint and account.',
  MediaDriverInvalid: 'This storage is not available. Choose another storage.',
  MediaStorageBusy: 'The storage is busy. Wait a moment and upload again.',
  MediaStorageProbeAuth:
    'Could not connect to the storage. Check the access keys and their permissions.',
  MediaStorageProbeBucket:
    'Could not connect to the storage. Check the bucket name and access to the bucket.',
  MediaStorageProbeNetwork:
    'Could not reach the storage. Check the endpoint address and the network.',
  MediaStorageProbeTls:
    'Could not connect to the storage securely. Check the endpoint’s HTTPS certificate.',
  MediaStorageProbeRejected:
    'The storage service rejected the request. Check the region and the path-style setting.',
  MediaStorageFieldRequired: 'This field is required.',
  InvalidCredentials: 'Invalid email or password.',
  SecondFactorFailed: 'Verification failed. Try again.',
  InvalidInput: 'Invalid input',
  RequestBodyNotJson: 'Request body must be JSON',
  RequestBodyTooLarge: 'Request body is too large',
  Internal: 'Internal server error',
  AuthenticationRequired: 'Sign in to continue.',
  Forbidden: 'You do not have permission to do this',
  TooManyAttempts: 'Too many attempts. Please wait a while and try again.',
  CaptchaRequired: 'Please confirm that you are not a robot.',
  CaptchaInvalid: 'The robot check failed. Please try again.',
  PasswordResetLimit:
    'Too many password reset emails were sent. Try again later.',
  PasswordTokenInvalid:
    'This link is invalid or has expired. Ask for a new one.',
  CurrentPasswordWrong: 'The current password is not correct.',
  EmailDisabled: 'Set up and enable email delivery first',
  SiteUrlRequired: 'Set the public site address in the SEO settings first',
  SsoNotFound: 'Single sign-on not found',
  SsoRateLimited:
    'Too many sign-in attempts. Please wait a minute and try again.',
  SsoPendingLimit:
    'Too many sign-in requests are in progress. Please try again in a few minutes.',
  SsoRequestExpired: 'The sign-in request has expired. Please try again.',
  SsoLinkSignInRequired:
    'For your security, sign in again before linking single sign-on.',
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
  SsoIssuerInvalid: 'Use the provider address, such as https://id.example.com.',
  SsoScopesOpenid: 'Scopes must include openid.',
  SsoIssuerRequired:
    'Enter the provider address and client ID to turn this provider on.',
  SsoProviderIdInvalid:
    'Use 1–32 lowercase letters, digits or hyphens, starting and ending with a letter or digit.',
  SsoProviderIdDuplicate: 'Another provider already uses this ID.',
  SsoClaimTokenRequired: 'Open the link from your email again.',
  SignInDuplicate: 'Listed more than once.',
  SignInMethodRequired: 'Allow at least one way to sign in.',
  SignInUnknown: 'Choose a registered sign-in method or second step.',
  SignInLastFactor:
    'Your role requires two-step verification, so keep at least one way to do it.',
  SignInFactorRequired:
    'Allow a second factor users can set up before requiring two-step verification.',
  RecentSignInRequired:
    'For your security, sign in again before adding a way to sign in to your account.',
  RecoveryRecentSignIn:
    'For your security, sign in again before generating recovery codes.',
  SignInExpired: 'This sign-in request is no longer valid. Start again.',
  SignInStepRequired: 'Continue signing in using the step-based sign-in flow.',
  SignInAccessRequired:
    'Keep at least one allowed sign-in method that your own account can use.',
  PasswordLoginDisabled:
    'Password sign-in is turned off. Use single sign-on or a recovery code.',
  SsoProviderRequired:
    'Turn on at least one provider before turning off password sign-in.',
  SsoAccessRequired:
    'Link your account to an enabled provider (or have one assigned) before turning off password sign-in.',
  SsoLastAccess:
    'This is your last way to sign in with single sign-on while password sign-in is off, so it cannot be removed.',
  EmailServerRequired: 'Enter the mail server to send email over SMTP.',
  EmailSenderRequired: 'Enter the sender address to turn on email.',
  EmailSecretRequired: 'Enter the secret to send email through this service.',
  EmailProviderFieldRequired: 'This mail service needs this field.',
  EmailRegionInvalid: 'Choose a region this mail service offers.',
  EmailUrlInvalid: 'Use an https:// address.',
  EmailHeaderInvalid: 'Enter a header name such as Authorization.',
  EmailTemplateInvalid:
    'Enter valid JSON; placeholders such as {{to}} stand for text values.',
  EgressHostInvalid: 'Enter one host name or IP address',
  EgressAddressInvalid: 'Enter an IP address or CIDR range',
  BlocksNotList: 'Must be a list of blocks',
  BlocksTooDeep: 'Blocks are nested too deeply',
  BlocksTooMany: 'Too many blocks',
  BlockInvalid: 'Must be a block',
  BlockPropertyUnknown: 'Unknown property',
  BlockUnknown: 'Unknown block',
  BlockParent: ({ parents }) =>
    parents === undefined
      ? 'Must be inside another block'
      : `Must be inside ${parents}`,
  BlockNotAllowedInside: ({ parent }) =>
    parent === undefined
      ? 'Not allowed inside this block'
      : `Not allowed inside ${parent}`,
  BlockAttrsInvalid: 'Must be an object',
  BlockAttrUnknown: 'Unknown attribute',
  BlockAttrRequired: 'Required',
  BlockNoChildren: 'This block has no children',
  BlockAttrText: 'Must be text',
  BlockAttrTooLong: ({ max }) =>
    max === undefined ? 'Too many characters' : `At most ${max} characters`,
  BlockAttrFormat: 'Invalid format',
  BlockAttrColor: 'Must be a palette color',
  BlockAttrNumber: ({ min, max }) =>
    min === undefined || max === undefined
      ? 'Must be a whole number in the allowed range'
      : `Must be a whole number from ${min} to ${max}`,
  BlockAttrBoolean: 'Must be true or false',
  BlockAttrChoice: ({ options }) =>
    options === undefined
      ? 'Must be one of the allowed options'
      : `Must be one of ${options}`,
  ThemePaletteDuplicate: 'Palette slugs must be unique',
  ThemePaletteRole: ({ role }) =>
    role === undefined
      ? 'The palette needs every color role'
      : `The palette needs "${role}"`,
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
  SlugInUse: ({ slug }) =>
    slug === undefined
      ? 'This slug is already in use'
      : `The slug “${slug}” is already in use`,
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
  MediaTooLarge: ({ maxBytes }) =>
    maxBytes === undefined
      ? 'The file is too large'
      : `The file is too large. Upload a file of at most ${megabytes(maxBytes)}.`,
  MediaStorageLow: 'The server does not have enough free storage for this file',
  MediaUploadRate: ({ limit }) =>
    limit === undefined
      ? 'Too many files were uploaded this hour. Please wait and try again.'
      : `At most ${limit} files can be uploaded per hour. Please wait and try again.`,
  MediaTypeUnsupported:
    'This file type is not supported. Upload JPEG, PNG, GIF, WebP, AVIF, PDF, MP3, WAV, Ogg, MP4 or WebM. Safe SVG files are accepted when SVG uploads are enabled.',
  MediaUploadRefused: 'This upload was refused.',
  MediaInUse: ({ count }) =>
    count === undefined
      ? 'The file is used by entries; delete it anyway to remove it from them'
      : `The file is used by ${count} ${Number(count) === 1 ? 'entry' : 'entries'}; delete it anyway to remove it from them`,
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
  SearchRequestFailed: ({ status }) =>
    status === undefined
      ? 'Meilisearch answered with an error'
      : `Meilisearch answered with an error (HTTP ${status})`,
  SearchSyncFailed: 'Search indexing failed. Check the server log for details.',
  OutboundTimeout: 'The server did not answer in time',
  OutboundTlsFailed: 'The TLS certificate of the server could not be verified',
  OutboundNetworkFailed: 'The server could not be reached',
  OutboundUrlInvalid: 'The outbound address is invalid',
  OutboundHostUnresolved: 'The outbound host could not be resolved',
  OutboundAddressBlocked: 'The outbound address is not permitted',
  OutboundRedirectBlocked: 'The outbound redirect is not permitted',
  WebhookNotFound: 'Webhook not found',
  WebhookInvalidJob: 'Invalid webhook delivery job',
  WebhookStatus: 'The receiver answered with an error status',
  WebhookDeliveryFailed:
    'The delivery failed. Check the server log for details.',
  HealthCheckFailed: ({ check }) =>
    check === undefined ? 'The check failed' : `The check ${check} failed`,
  HealthJobFailed: ({ kind }) =>
    kind === undefined
      ? 'A background job failed'
      : `A background job (${kind}) failed`,
  ImportItemUnsupported: ({ type, status }) =>
    type === undefined
      ? 'Not imported: this item type or status is not supported'
      : `Not imported: ${type}${status === undefined ? '' : ` (${status})`} is not supported`,
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
  InvalidDocument: ({ detail }) =>
    detail === undefined
      ? 'The document is not valid'
      : `The document is not valid: ${detail}`,
  PathConflict: 'Path is already in use',
  PathInUse: ({ path }) =>
    path === undefined
      ? 'This path is already in use'
      : `The path ${path} is already in use`,
  InvalidPermalink: 'Invalid permalink',
  PermalinkTitleUnusable: ({ title }) =>
    title === undefined
      ? 'The title cannot be used in a URL'
      : `The title “${title}” cannot be used in a URL`,
  PermalinkPathInvalid: ({ reason, path }) =>
    `${path === undefined ? 'This address' : `The address ${path}`} cannot be used for the entry${reason === undefined ? '' : `: ${reason}`}`,
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
  ThemeArchiveFile: ({ file }) =>
    file === undefined
      ? 'The archive contains a file that is not a valid theme file'
      : `${file} in the archive is not a valid theme file`,
  ThemeArchiveMissing: 'The archive has no theme.json',
  ThemeTemplateNotFound: 'Template not found',
  ThemePartNotFound: 'Template part not found',
  ThemeColorUnknown: ({ slug }) =>
    slug === undefined
      ? 'Not one of the theme palette colors'
      : `“${slug}” is not one of the theme palette colors`,
  PluginNotFound: 'Plugin not found',
  PluginBundleEmpty: 'Plugin bundle is empty',
  PluginBundleInvalid: 'The plugin bundle is not valid',
  PluginBundleUnloadable: 'Plugin bundle could not be loaded; install it again',
  PluginBundleImport: 'Could not import plugin bundle',
  PluginExportMissing: 'Bundle has no `plugin` export',
  PluginActivateInvalid: '`plugin.activate` must be a function',
  PluginDeactivateInvalid: '`plugin.deactivate` must be a function',
  PluginIdInvalid: ({ id }) =>
    id === undefined ? 'Invalid plugin id' : `Invalid plugin id “${id}”`,
  PluginRequiresCms: ({ range, version }) =>
    range === undefined
      ? 'This plugin needs another CMS version'
      : `This plugin needs CMS ${range}${version === undefined ? '' : `; this site runs ${version}`}`,
  PluginRequiresPlugin: ({ id, range }) =>
    id === undefined
      ? 'This plugin needs another plugin to be active'
      : `This plugin needs the plugin ${id}${range === undefined ? '' : ` ${range}`} to be active`,
  PluginFailed: 'Plugin failed. Check server logs for details.',
  PluginNoUpdateUrl: 'This plugin does not name an update address',
  PluginUpdateUnavailable: 'The update address did not answer with a version',
  PluginPageNotFound: 'This plugin page is not available',
  PluginPageFailed:
    'The plugin could not show this page. Check server logs for details.',
  PluginBlockAttrsInvalid: ({ title }) =>
    title === undefined
      ? 'The settings of a plugin block are not valid'
      : `The settings of the plugin block “${title}” are not valid`,
  EmailSendFailed: ({ reason, status }) =>
    `${emailFailure(reason)}${status === undefined ? '' : ` (HTTP ${status})`}`,
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
};

/** Text for every web server error, by its `Errors` key in `#lib/errors.js`. */
export const webErrors: WebErrorCatalog = {
  NotFound: 'Not found',
  Forbidden: 'You do not have permission to view this page',
  InvalidContentPath: 'Invalid content path',
  SitemapIndexTooLarge: 'The sitemap index would exceed the sitemap limit',
  FormInvalid: 'Please fix the fields below',
  PermalinkPatternsInvalid: 'Please fix the permalink patterns',
  PasswordMismatch: 'Passwords do not match.',
  SignInRedirectInvalid: 'The sign-in method returned an invalid address.',
  ProfileNumberInvalid: 'Enter a number.',
  PluginBundleRequired: 'Choose a plugin bundle (.js)',
  ImportFileRequired: 'Choose a WordPress export file (.xml)',
  ThemeFileRequired: 'Choose a theme archive (.zip)',
  BlocksInvalid: 'The blocks could not be read',
  TemplateNameInvalid: 'Use lowercase letters, numbers and dashes for the slug',
  ThemeItemReadOnly:
    'A plugin provides this. Choose Customize before saving your changes.',
  BulkItemFailed: 'This item could not be changed. Try again later.',
  BulkItemInvalid: 'This selection is not valid.',
  BulkTooMany: ({ limit }) =>
    limit === undefined
      ? 'Too many items are selected; nothing was changed.'
      : `Select at most ${limit} items at a time; nothing was changed.`,
  PluginActivationFailed: 'The plugin could not be activated.',
  ReassignToDeleted:
    'Choose someone who is not being deleted to receive the content.',
  PasswordOrInvite: 'Enter a password or send an invitation.',
  ModerationInvalid: 'This comment action is not valid.',
  UploadNetwork: 'The file could not be sent. Check your connection.',
};

export const en = {
  embedsTitle: 'Embeds',
  embedsHelp:
    'Providers are tried in order before plugin providers. Unmatched URLs remain links.',
  embedsEnabled: 'Enabled',
  embedsId: 'Provider ID',
  embedsLabel: 'Label',
  embedsPattern: 'URL pattern',
  embedsSource: 'HTTPS iframe template',
  embedsFrameTitle: 'Iframe title',
  embedsAllow: 'Iframe permissions (allow)',
  embedsSizing: 'Sizing',
  embedsRatio: 'Aspect ratio',
  embedsHeight: 'Height (px)',
  embedsHeightPath: 'Height message JSON Pointer (optional)',
  embedsRestore: 'Restore defaults',
  embedsAdd: 'Add provider',
  embedsUp: 'Move up',
  embedsDown: 'Move down',
  embedsTemplateHelp:
    'Start URL patterns with ^. Use RE2 syntax and named captures such as (?<id>[a-z]+), with {id} or {id|urlencode}. Matching runs in linear time; backreferences and lookarounds are not supported. URLs over 2048 characters are not matched. The HTTPS origin must be fixed.',
  // Navigation
  navDashboard: 'Dashboard',
  navContent: 'Content',
  navMedia: 'Media',
  navComments: 'Comments',
  navCategories: 'Categories',
  navTags: 'Tags',
  navMenus: 'Menus',
  navWidgets: 'Widgets',
  navAppearance: 'Appearance',
  navFields: 'Content types & fields',
  navPlugins: 'Plugins',
  navUsers: 'Users',
  navSeo: 'SEO',
  navSettings: 'Settings',
  navSecurity: 'Security',
  navSearch: 'Search',
  navTools: 'Tools',
  navAccount: 'Account',
  viewSite: 'View site',
  signOut: 'Sign out',

  // Shared actions and states
  save: 'Save',
  saved: 'Saved',
  cancel: 'Cancel',
  delete: 'Delete',
  deleted: 'Deleted',
  edit: 'Edit',
  add: 'Add',
  create: 'Create',
  created: 'Created',
  update: 'Update',
  remove: 'Remove',
  confirmDelete: 'Delete this permanently?',
  none: 'None',
  name: 'Name',
  email: 'Email',
  slug: 'Slug',
  role: 'Role',
  bio: 'Biography',
  password: 'Password',
  language: 'Language',
  siteDefault: 'Site default',
  actions: 'Actions',
  forbidden: 'You do not have permission to view this page.',

  // Roles
  roleAdministrator: 'Administrator',
  roleEditor: 'Editor',
  roleAuthor: 'Author',
  membershipTitle: 'Membership',
  membershipEnable: 'Allow public registration',
  membershipHelp:
    'New members receive an email to set their password and join as subscribers. Configure email delivery first.',
  rolesTitle: 'Custom roles',
  rolesSelect: 'Role to edit',
  rolesNew: 'Create role',
  rolesKey: 'Role key',
  rolesPermissions: 'Permissions',
  rolesExtraPermissions: 'Other permissions roles hold',
  rolesPluginPermissions: (plugin: string) => `Plugin: ${plugin}`,
  rolesFromPlugin: (name: string, plugin: string) =>
    `${name} (plugin: ${plugin})`,
  registerTitle: 'Create an account',
  registerHelp:
    'Enter your name and email. Check your inbox to choose a password.',
  registrationClosed: 'Registration is currently closed.',
  capabilityLabel: (key: string) =>
    (
      ({
        'content.create': 'Create own drafts',
        'content.publish': 'Publish own content',
        'content.readPrivate': 'Read private content',
        'content.editOthers': 'Edit others’ content',
        'taxonomy.manage': 'Manage taxonomy',
        'media.upload': 'Upload media',
        'media.manage': 'Manage all media',
        'comments.moderate': 'Moderate comments',
        'appearance.manage': 'Manage appearance',
        'fields.manage': 'Manage content fields',
        'users.manage': 'Manage users',
        'settings.manage': 'Manage settings',
        'egress.manage': 'Manage outbound connections',
        'plugins.manage': 'Manage plugins',
        'tools.manage': 'Manage tools',
      }) as Record<string, string>
    )[key] ?? key,
  roleSubscriber: 'Subscriber',
  roleContributor: 'Contributor',

  // Users
  usersTitle: 'Users',
  usersAdd: 'Add user',
  usersEntries: 'Entries',
  usersJoined: 'Joined',
  usersPasswordHelp: 'Leave empty to email an invitation to choose a password.',
  usersDeleteTitle: (name: string) => `Delete ${name}`,
  usersReassign: 'Give their content to',
  usersDeleteContent: 'Delete their content',
  usersEmpty: 'No users yet.',
  usersYou: 'You',

  // Account
  accountTitle: 'Account',
  profileTitle: 'Profile',
  profileSlugHelp: 'Used in the address of your author page.',

  // Sign-in and password recovery
  signInTitle: 'Sign in',
  signIn: 'Sign in',
  signInWith: (provider: string) => `Sign in with ${provider}`,
  or: 'or',
  forgotPassword: 'Forgot your password?',
  forgotTitle: 'Reset your password',
  forgotHelp:
    'Enter the email address of your account. If it exists, we will send a link to choose a new password.',
  forgotSend: 'Send link',
  forgotSent:
    'If that address has an account, a link is on its way. Check your inbox.',
  backToSignIn: 'Back to sign in',
  newPassword: 'New password',
  captchaHelp: 'Complete the check above to continue.',

  // Password and application passwords
  passwordChangeTitle: 'Change password',
  currentPassword: 'Current password',
  passwordChanged: 'Password changed. Your other sessions were signed out.',
  tokensTitle: 'Application passwords',
  tokensHelp:
    'Tokens let integrations use the API as you. Treat them like passwords.',
  tokenName: 'Name',
  tokenExpires: 'Expires after (days)',
  tokenNever: 'Never',
  tokenCreate: 'Create token',
  tokenCreated: 'Copy this token now. It will not be shown again.',
  tokenLastUsed: 'Last used',
  tokenRevoke: 'Revoke',
  tokensEmpty: 'No application passwords yet.',

  // Settings sections
  settingsGeneral: 'General',
  settingsSecurity: 'Security',
  settingsEmail: 'Email',
  siteTitle: 'Title',
  siteDescription: 'Description',
  siteLocale: 'Locale',

  // Security settings
  captchaTitle: 'Robot check',
  captchaProvider: 'Provider',
  captchaNone: 'None',
  captchaSiteKey: 'Site key',
  captchaSecretKey: 'Secret key',
  secretKeep: 'Leave empty to keep the saved secret.',
  secretSaved: 'Saved',
  secretRemove: 'Remove the saved secret',
  captchaMinimumScore: 'Minimum score (reCAPTCHA v3)',
  captchaWhen: 'When to ask',
  captchaAlways: 'Every time',
  captchaLimited: 'After too many attempts',
  captchaNever: 'Never',
  actionLogin: 'Sign-in',
  actionPasswordReset: 'Password reset',
  actionComment: 'Comments',
  actionContentUnlock: 'Protected content',
  limitsTitle: 'Rate limits',
  limitsHelp:
    'Limits per visitor apply only when the web server is set up to identify visitors.',
  ruleLoginClient: 'Sign-in, per visitor',
  ruleLoginAccount: 'Sign-in, per account',
  rulePasswordResetClient: 'Password reset, per visitor',
  rulePasswordResetAccount: 'Password reset, per account',
  ruleCommentClient: 'Comments, per visitor',
  ruleContentUnlockClient: 'Protected content, per visitor',
  ruleEnabled: 'On',
  ruleMax: 'Attempts',
  ruleWindow: 'Within (seconds)',
  ruleBlock: 'Then wait (seconds)',
  ruleEnforcement: 'Over the limit',
  enforcementBlock: 'Block',
  enforcementCaptcha: 'Ask for the robot check',

  // Email settings
  emailTitle: 'Outgoing email',
  emailEnabled: 'Send email',
  emailHost: 'Mail server',
  emailPort: 'Port',
  emailSecurity: 'Encryption',
  emailUsername: 'User name',
  emailPassword: 'Password',
  emailFromName: 'Sender name',
  emailFromEmail: 'Sender address',
  emailTest: 'Send a test message',
  emailTestTo: 'Recipient',
  emailTestSent: 'Test message sent.',
  emailSender: 'Sender',
  emailTransport: 'Send through',
  emailTransportSmtp: 'SMTP server',
  emailTransportHttp: 'HTTP mail API',
  emailPluginTransportHelp: (label: string) =>
    `Mail is sent through ${label}, provided by a plugin.`,
  emailPluginTransportMissing:
    'The selected mail plugin is no longer available, so mail cannot be sent. Choose another way to send and save.',
  emailFieldRequired: (label: string) => `${label} (required)`,
  emailProvider: 'Mail service',
  emailProviderCustom: 'Custom JSON endpoint',
  emailRegion: 'Region',
  emailAwsRegion: 'AWS region',
  emailRegionUs: 'United States (US)',
  emailRegionEu: 'Europe (EU)',
  emailRegionDefault: 'Service default',
  emailSecretReenter:
    'The service, key ID, address or header changed, so enter the secret again.',
  emailDomain: 'Sending domain',
  emailApiKey: 'API key',
  emailAccessKeyId: 'Access key ID',
  emailSecretAccessKey: 'Secret access key',
  emailSecretKey: 'Secret key',
  emailServerToken: 'Server API token',
  emailSecretValue: 'Secret value',
  emailEndpoint: 'Endpoint address (https)',
  emailAuthHeader: 'Header for the secret',
  emailAuthHeaderHelp:
    'The secret value is sent as this header, unchanged (for example "Bearer …" for Authorization). Leave empty to send no header.',
  emailBodyTemplate: 'JSON body',
  emailBodyTemplateHelp: (placeholders: string) =>
    `Put each placeholder alone where a JSON value goes, without quotes, as in "to": {{to}}; it becomes an escaped text value. Available: ${placeholders}.`,

  // Content list and editor
  contentTitle: 'Content',
  contentNew: 'New',
  contentNewTitle: 'New content',
  contentEditTitle: (type: string) => `Edit ${type}`,
  allTypes: 'All types',
  anyStatus: 'All',
  trashView: 'Trash',
  statusDraft: 'Draft',
  statusPending: 'Pending review',
  statusScheduled: 'Scheduled',
  statusPublished: 'Published',
  statusPrivate: 'Private',
  typePost: 'Post',
  typeArticle: 'Article',
  typePage: 'Page',
  searchContent: 'Search content',
  allCategories: 'All categories',
  allTags: 'All tags',
  filter: 'Filter',
  clear: 'Clear',
  columnTitle: 'Title',
  columnAuthor: 'Author',
  columnCategories: 'Categories',
  columnTags: 'Tags',
  columnType: 'Type',
  columnStatus: 'Status',
  columnDate: 'Date',
  noContent: 'No content yet.',
  noMatches: 'No content matches these filters.',
  emptyTrash: 'The trash is empty.',
  previous: '← Previous',
  next: 'Next →',
  pageOf: (page: number, last: number) => `Page ${page} of ${last}`,
  selectAll: 'Select all',
  selectItem: (title: string) => `Select ${title}`,
  bulkActions: 'Bulk actions',
  apply: 'Apply',
  moveToTrash: 'Move to trash',
  restore: 'Restore',
  deletePermanently: 'Delete permanently',
  movedToTrash: 'Moved to the trash.',
  restored: 'Restored.',
  sticky: 'Sticky',
  protectedBadge: 'Password',
  contentInactiveType: 'Inactive type',
  trashedOn: (date: string) => `Trashed ${date}`,
  // Editor
  fieldTitle: 'Title',
  fieldSlug: 'Slug',
  slugPlaceholder: 'generated from title',
  fieldType: 'Type',
  fieldExcerpt: 'Excerpt',
  excerptHelp: 'Leave empty to use the beginning of the body.',
  fieldBody: 'Body',
  noCategories: 'No categories yet.',
  noTags: 'No tags yet.',
  publishTitle: 'Publish',
  fieldStatus: 'Status',
  fieldPublishAt: 'Publish on',
  publishAtHelp:
    'For scheduled entries, the future date to publish. Otherwise changes the date of the entry.',
  fieldAuthor: 'Author',
  fieldSticky: 'Stick to the top of the front page',
  fieldTocOverride: 'Automatic table of contents',
  tocOverrideDefault: 'Use site default',
  tocOverrideAlways: 'Always',
  tocOverrideNever: 'Never',
  tocOverrideHelp:
    'A table of contents block placed in the body always takes precedence.',
  fieldPassword: 'Password protection',
  passwordHelp: 'Visitors must enter it to read the body.',
  passwordSet: 'A password is set. Enter a new one to change it.',
  passwordRemove: 'Remove the password',
  indexingOff: 'Search indexing is off for the whole site in SEO settings.',
  view: 'View',
  preview: 'Preview',
  revisionsTitle: 'Revisions',
  revisionAutosave: 'Autosave',
  revisionCompare: 'Compare',
  revisionRestore: 'Restore this version',
  revisionRestored: 'The version was restored.',
  revisionsEmpty: 'No revisions yet.',
  revisionCurrent: 'Current',
  revisionDelete: 'Delete this revision',
  revisionDeleteConfirm: (date: string) =>
    `Permanently delete the saved revision from ${date}? The current entry and autosaves are kept.`,
  revisionDeleted:
    'The saved revision was deleted. The current entry and autosaves are kept.',
  revisionDeleteFailed:
    'Could not delete the revision. Try again; it may already have been deleted.',
  revisionSelected: 'Selected version',
  autosaveNewer:
    'There is an autosave of this entry that is newer than the version below.',
  autosaveLoad: 'Load the autosave',
  autosaveSaved: (time: string) => `Draft saved at ${time}`,
  autosaveFailed:
    'Could not save a draft. Your changes are still in the editor.',

  // Public theme
  byAuthor: 'By',
  updatedOn: 'Updated',
  stickyLabel: 'Featured',
  protectedTitle: 'This content is password protected.',
  protectedHelp: 'Enter the password to read it.',
  unlock: 'Read',
  authorArchive: (name: string) => `Posts by ${name}`,
  noPosts: 'Nothing has been published yet.',
  previewNotice:
    'Preview: this is how the entry will look. It is not public yet.',
  newer: '← Newer',
  older: 'Older →',
  pagination: 'Pagination',

  // Media
  mediaTitle: 'Media',
  mediaUpload: 'Upload',
  mediaAllowSvg: 'Allow SVG uploads',
  mediaUploading: 'Uploading…',
  mediaUploaded: (count: number) =>
    `${count} ${count === 1 ? 'file' : 'files'} uploaded`,
  mediaUploadFailed: (name: string, reason: string) => `${name}: ${reason}`,
  mediaAllKinds: 'All media',
  mediaAudio: 'Audio',
  mediaEditImage: 'Edit image',
  mediaEditCopyHelp:
    'Save a new copy. The original and existing posts stay unchanged.',
  mediaCrop: 'Crop',
  mediaRotate: 'Rotate',
  mediaFlipHorizontal: 'Flip horizontally',
  mediaFlipVertical: 'Flip vertically',
  mediaSaveCopy: 'Save edited copy',
  mediaCropField: (key: string) =>
    ({ left: 'X', top: 'Y', width: 'Width', height: 'Height' })[key] ?? key,
  customTaxonomies: 'Custom taxonomies',
  manageTerms: 'Manage terms',
  taxonomyKey: 'Taxonomy key',
  taxonomyHierarchy: 'Allow parent terms',
  addTaxonomy: 'Add taxonomy',
  parentPage: 'Parent page',
  mediaImages: 'Images',
  mediaDocuments: 'Documents',
  mediaVideos: 'Videos',
  mediaSearch: 'Search media',
  mediaEmpty: 'No media yet.',
  mediaAlt: 'Alternative text',
  mediaAltHelp: 'Describes the image for people who cannot see it.',
  mediaCaption: 'Caption',
  mediaUrl: 'Address',
  mediaSize: 'Size',
  mediaDimensions: 'Dimensions',
  mediaUploadedBy: 'Uploaded by',
  mediaUsed: (count: number) =>
    count ? `Used by ${count} entries or patterns` : 'Not used yet',
  mediaDeleteUsed: 'Delete even though entries or patterns use it',
  mediaChoose: 'Choose from library',
  mediaRemoveFeatured: 'Remove',
  featuredImage: 'Featured image',
  featuredNone: 'No featured image',
  insertImage: 'Image',
  insertTable: 'Table',
  insertEmbed: 'Embed',
  embedUrl: 'Address of a video or post (YouTube, Vimeo, X, Instagram …)',
  insert: 'Insert',
  tableAddRow: 'Add row',
  tableAddColumn: 'Add column',
  tableDeleteRow: 'Delete row',
  tableDeleteColumn: 'Delete column',
  tableDelete: 'Delete table',
  close: 'Close',
  loadMore: 'Load more',

  // Content types and fields
  fieldsTitle: 'Content types & fields',
  typesTitle: 'Content types',
  typeKey: 'Key',
  typeKeyHelp: 'Lowercase letters, digits and hyphens. It cannot change later.',
  typeName: 'Name',
  typePluralName: 'Plural name',
  typeDescription: 'Description',
  typeArchive: 'Publish an archive page',
  typeSearchable: 'Include in search and feeds',
  typeSupports: 'Editor offers',
  supportsCategories: 'Categories',
  supportsTags: 'Tags',
  supportsComments: 'Comments',
  supportsFeaturedImage: 'Featured image',
  builtin: 'Built-in',
  typeAdd: 'Add content type',
  customFieldsTitle: 'Custom fields',
  fieldKey: 'Key',
  fieldKeyHelp:
    'Lowercase letters, digits and underscores, starting with a letter.',
  fieldLabel: 'Label',
  fieldTypeLabel: 'Kind',
  fieldOptions: 'Choices (one per line)',
  fieldRequired: 'Required',
  fieldPublic: 'Shown on the site',
  fieldHelp: 'Help text',
  fieldTypes: 'Content types',
  fieldAdd: 'Add field',
  fieldsEmpty: 'No custom fields yet.',
  fieldKindText: 'Text',
  fieldKindTextarea: 'Long text',
  fieldKindNumber: 'Number',
  fieldKindBoolean: 'Yes / no',
  fieldKindDate: 'Date',
  fieldKindUrl: 'Web address',
  fieldKindSelect: 'Choice',
  fieldKindImage: 'Image',
  customFields: 'Fields',
  noChoice: '—',

  // Public theme: navigation and widgets
  search: 'Search',
  searchPlaceholder: 'Search…',
  commentOn: (author: string) => `${author} on`,
  sidebar: 'Sidebar',
  primaryNavigation: 'Main',
  footerNavigation: 'Footer',
  categoriesLabel: 'Categories',

  // Settings: reading
  settingsReading: 'Reading',
  readingFrontPage: 'Your homepage displays',
  readingLatestPosts: 'Your latest posts',
  readingStaticPage: 'A static page',
  readingHomePage: 'Homepage',
  readingPostsPage: 'Posts page',
  readingPostsPerPage: 'Posts per page',
  readingFeedItems: 'Items in the feed',
  readingDateFormat: 'Date format',
  readingTimeZone: 'Time zone',
  dateFormatLong: 'March 14, 2026',
  dateFormatMedium: 'Mar 14, 2026',
  dateFormatShort: '3/14/26',

  // Appearance: menus and widgets
  appearanceThemes: 'Themes',
  appearanceMenus: 'Menus',
  appearanceWidgets: 'Widgets',
  moveUp: 'Move up',
  moveDown: 'Move down',
  menuSelect: 'Menu to edit',
  menuNew: 'New menu name',
  menuCreate: 'Create menu',
  menuName: 'Menu name',
  menuDelete: 'Delete menu',
  menuLabel: 'Navigation label',
  menuUrl: 'URL',
  menuNewTab: 'New tab',
  menuIndent: 'Make sub-item',
  menuOutdent: 'Move out of sub-items',
  menuEmpty: 'This menu has no items yet.',
  menuAddItem: 'Add menu item',
  menuItemKind: 'Link to',
  menuKindContent: 'Page or post',
  menuKindTerm: 'Category or tag',
  menuKindArchive: 'Content type archive',
  menuKindCustom: 'Custom link',
  menuHome: 'Home',
  menuMissing: '(not published)',
  menuPluginItem: (type: string, id: string) => `${type}: ${id}`,
  menuPluginTypes: 'From plugins',
  menuPluginType: (label: string, plugin: string) => `${label} (${plugin})`,
  menuFindObject: (label: string) => `Find ${label}`,
  menuObjectsFailed: 'Could not load the choices',
  menuLocations: 'Menu locations',

  // Appearance: widgets
  widgetRecentPosts: 'Recent posts',
  widgetText: 'Text',
  widgetMenu: 'Navigation menu',
  widgetArchives: 'Archives',
  widgetRecentComments: 'Recent comments',
  widgetFooter: 'Footer',
  widgetAdd: 'Add a widget',
  widgetType: 'Widget',
  widgetArea: 'Area',
  widgetTitle: 'Title',
  widgetCount: 'Number of items',
  widgetFlat: 'Show as a flat list',
  widgetEmpty: 'No widgets in this area.',

  // Public theme: comments
  commentCount: (count: number) =>
    count === 0
      ? 'No comments yet'
      : count === 1
        ? '1 comment'
        : `${count} comments`,
  commentAwaitingModeration: 'Thanks! Your comment is waiting for review.',
  commentRepliesLimited: 'More replies exist. View another page to continue.',
  commentByAuthor: 'Author',
  commentReply: 'Reply',
  commentReplyTo: (name: string) => `Reply to ${name}`,
  commentLeave: 'Leave a comment',
  commentName: 'Name',
  commentEmail: 'Email',
  commentWebsite: 'Website (optional)',
  commentBody: 'Comment',
  commentEmailPrivate: 'Your email address will not be published.',
  commentSubmit: 'Post comment',
  commentSubmitting: 'Posting…',
  commentPosted: 'Your comment has been posted.',
  commentSubmitFailed:
    'Your comment could not be sent. Your draft is still here. Try again.',
  commentRefreshFailed:
    'Your comment was received. Refresh to see the latest comments.',
  commentsClosed: 'Comments are closed.',

  // Comments: moderation and discussion
  fieldAllowComments: 'Allow comments',
  commentPending: 'Pending',
  commentApproved: 'Approved',
  commentSpam: 'Spam',
  commentSearch: 'Search comments',
  clientIp: 'IP address',
  clientUserAgent: 'Browser',
  commentApprove: 'Approve',
  commentUnapprove: 'Unapprove',
  commentMarkSpam: 'Spam',
  commentNone: 'No comments found.',
  commentReplied: 'Reply posted',
  settingsDiscussion: 'Discussion',
  discussionEnabled: 'Allow people to comment on new and existing entries',
  discussionModeration: 'Before a comment appears',
  discussionManual: 'It must be approved manually',
  discussionKnown: 'Its author must have an earlier approved comment',
  discussionAuto: 'Nothing; publish at once',
  discussionCloseAfter: 'Close comments on entries older than (days, 0 never)',
  discussionThreadDepth: 'Reply levels',
  discussionPageSize: 'Top-level comments per page',
  discussionMaxLinks: 'Hold comments with more links than',
  discussionHoldWords: 'Hold comments containing (one word or phrase per line)',
  discussionBlockWords: 'Mark as spam when containing (one per line)',
  discussionNotifyModerators:
    'Email moderators about comments waiting for review',
  discussionNotifyAuthors: 'Email authors about new comments on their entries',
  discussionNotifyCommenters:
    'Email commenters about replies to their comments',
  discussionNotifyCommentersNoEmail:
    'Email delivery is not set up, so these emails are not sent yet.',
  discussionPushNotifications:
    'Send browser push notifications to entry authors and commenters',

  // Comment notifications
  commentEmailNotify: 'We will email this address when someone replies.',
  commentUnsubscribeTitle: 'Turn off notifications',
  commentUnsubscribeConfirm:
    'Press the button to stop notifications about replies.',
  commentUnsubscribeButton: 'Turn off notifications',
  commentUnsubscribedEmail: 'We will no longer send you email notifications.',
  commentUnsubscribedPush: 'Browser notifications are turned off.',
  pushTitle: 'Browser notifications',
  pushOn: 'This device receives notifications about comments.',
  pushOff: 'This device does not receive browser notifications.',
  pushDisable: 'Turn off on this device',
  pushDisabled: 'Browser notifications are off on this device.',
  pushDisableFailed: 'Notifications could not be turned off. Try again.',

  // Settings: search
  settingsSearch: 'Search',
  searchStatus: 'Search status',
  searchEngineIndex: 'Meilisearch',
  searchEngineDatabase: 'Database',
  searchStateDisabled: 'Meilisearch is off; the database answers searches.',
  searchStateBuilding:
    'Building the index; the database answers searches until it is complete.',
  searchStateSyncing:
    'Applying recent changes; the database answers searches meanwhile.',
  searchStateReady: 'The index is up to date and answers searches.',
  searchStateFailing:
    'Meilisearch is not answering; the database answers searches.',
  searchPending: 'Changes waiting',
  searchDocuments: 'Entries in the index',
  searchLastSync: 'Last update',
  searchTest: 'Test connection',
  searchReindex: 'Rebuild index',
  searchReindexQueued: 'The index will be rebuilt in the background.',
  searchEnabled: 'Use Meilisearch for site search',
  searchHost: 'Meilisearch address',
  searchIndexPrefix: 'Index name prefix',
  searchApiKey: 'API key',
  searchRemoveApiKey: 'Remove the saved key',
  searchFallbackHelp:
    'Searches use the database whenever Meilisearch is off, unreachable or still catching up, so results always match what is published.',

  // Plugins: pages and updates
  saveSettings: 'Save settings',
  pluginPageFailed: 'The plugin could not show this page.',
  pluginCheckUpdate: 'Check for update',
  pluginUpdateAvailable: (version: string) =>
    `Version ${version} is available.`,
  pluginUpToDate: 'This plugin is up to date.',
  pluginDownload: 'Download',

  // Tools: webhooks
  toolsWebhooks: 'Webhooks',
  webhookUrl: 'Payload URL (https)',
  webhookEvents: 'Events',
  webhookEnabled: 'Active',
  webhookAdd: 'Add webhook',
  webhookPing: 'Send test',
  webhookRotate: 'New secret',
  webhookSecretShown: 'Copy the signing secret now; it is not shown again.',
  webhookSecretHelp:
    'Receivers check the X-CMS-Signature header (t=…,v1=HMAC-SHA256 of “t.body”) with this secret.',
  webhookPingQueued: 'Test delivery queued.',

  // Dashboard
  dashboard: 'Dashboard',
  atAGlance: 'At a glance',
  dashboardDrafts: (count: number) => `${count} drafts`,
  dashboardPending: (count: number) => `${count} waiting for review`,
  dashboardScheduled: (count: number) => `${count} scheduled`,
  dashboardComments: (count: number) => `${count} comments waiting`,
  dashboardWaitingComments: 'Comments waiting for review',
  quickDraft: 'Quick draft',
  quickDraftBody: 'What is on your mind?',
  saveDraft: 'Save draft',
  draftSaved: 'Draft saved',
  yourDrafts: 'Your recent drafts',

  // Tools: site health
  toolsHealth: 'Site health',
  healthCritical: 'Critical',
  healthRecommended: 'Recommended',
  healthGood: 'Good',
  healthSiteUrl: 'Public site address',
  healthSiteUrlFix:
    'Set the site address in SEO settings so links in feeds, sitemaps and emails work.',
  healthEmail: 'Email delivery',
  healthEmailFix:
    'Turn on email in Settings → Email for password resets, invitations and comment notices.',
  healthSearch: 'Search index',
  healthSearchFix:
    'Searches use the database until the index is ready. Check Settings → Search.',
  healthScheduler: 'Background tasks',
  healthSchedulerFix:
    'Scheduled publishing, emails and cleanups depend on these tasks. Check the server logs.',
  healthJobs: 'Failed deliveries',
  healthJobsFix:
    'Some emails or webhooks could not be delivered in the last day.',
  healthPlugins: 'Plugins',
  healthPluginsFix: 'These plugins failed. Open Plugins to see why.',
  healthVisitorProof: 'Per-visitor rate limits',
  healthVisitorProofFix:
    'Set the same CMS_FRONTEND_SECRET on the API and web servers so limits count each visitor separately.',
  healthInfo: 'System',
  healthRuntime: 'Runtime',
  healthDatabase: 'Database',

  // Appearance: theme preview
  themePreview: 'Preview',
  themePreviewing: (name: string) =>
    `Previewing the ${name} theme. Visitors still see the active theme.`,
  themePreviewExit: 'End preview',

  // Tools: import and export
  toolsTransfer: 'Import & export',
  exportTitle: 'Export',
  exportHelp:
    'Download every entry, category, tag, author and comment as a WordPress export file (WXR). WordPress and this CMS can import it. Entry passwords are not included.',
  exportDownload: 'Download export file',
  importTitle: 'Import from WordPress',
  importHelp:
    'Choose a file from WordPress Tools → Export. Entries whose address is taken are skipped; authors are matched by email, otherwise you become the author. Copying attachments is optional and checked by default. Files that cannot be copied keep their original addresses.',
  importStart: 'Import',
  importRunning: 'Importing…',
  importDone: 'Import finished',
  importSummary: (entries: number, terms: number, comments: number) =>
    `Imported ${entries} entries, ${terms} categories and tags, and ${comments} comments.`,
  importSkipped: (count: number) => `${count} items were not imported`,

  // Public theme: titles
  themeHome: 'Home',
  themePosts: 'Posts',
  themeArticles: 'Articles',
  themeSearch: 'Search',
  themeSearchTitle: (query: string) => `Search: ${query}`,
  themeSearchResults: (query: string) => `Search results for “${query}”`,
  themeResults: (count: number) =>
    count === 1 ? '1 result' : `${count} results`,
  themeSearchEmpty: 'Nothing matched your search. Try different words.',
  themeSearchPrompt: 'Enter words to search the site.',
  themeCategory: 'Category',
  themeTag: 'Tag',
  themeTags: 'Tags',
  themePaged: (title: string, page: number) => `${title} – Page ${page}`,
  themeContentTypes: 'Content types',
  themeNotFound: 'Page not found',
  errorPageNotFoundHelp:
    'Check the address, or start again from the home page.',
  errorPageForbidden: 'You can’t open this page',
  errorPageForbiddenHelp: 'Your account doesn’t have permission for this page.',
  errorPageServer: 'Something went wrong',
  errorPageServerHelp:
    'Please try again in a moment. If it keeps happening, let the site administrator know.',
  errorPageOther: 'This request couldn’t be completed',
  errorPageHome: 'Go home',
  errorPageDashboard: 'Go to the dashboard',
  errorPageBack: 'Go back',

  // Public theme: archives
  themePostCount: (count: number) =>
    count === 1 ? '1 post' : `${count} posts`,
  // Admin: SEO settings
  seoIntro: 'How search engines, social networks and AI tools see the site.',
  seoSetup: 'Setup',
  seoSetupHelp: 'Based on the saved settings.',
  seoSiteUrl: 'Site URL',
  seoSiteUrlMissing:
    'Not set: canonical links and sitemap URLs are not published.',
  seoIndexing: 'Search indexing',
  seoIndexingOn: 'Search engines may index the site.',
  seoIndexingOff: 'The whole site asks search engines not to index it.',
  seoDefaultImage: 'Default sharing image',
  seoDefaultImageWithAlt: 'Set, with a description.',
  seoDefaultImageWithoutAlt: 'Set, without a description.',
  seoDefaultImageMissing: 'Not set: pages without their own image share none.',
  seoIdentity: 'Site identity',
  seoIdentityMissing: 'No organization or person named.',
  seoVerificationCodes: 'Verification codes',
  seoCodesConfigured: (count: number) => `${count} configured`,
  seoCodesNone: 'None configured.',
  seoSitemap: 'Sitemap',
  seoPublished: 'Published.',
  seoNeedsSiteUrl: 'Not published until the site URL is set.',
  seoNeedsIndexing: 'Not published while search indexing is off.',
  seoAiSearch: 'AI search',
  seoAiIndexingOff: 'Asked to stay away while search indexing is off.',
  seoAiSearchAllowed: 'AI search crawlers are allowed.',
  seoAiSearchBlocked: 'AI search crawlers are asked to stay away.',
  seoAiTraining: 'AI training',
  seoAiTrainingAllowed: 'AI training crawlers are allowed.',
  seoAiTrainingBlocked: 'AI training crawlers are asked to stay away.',
  seoTurnedOff: 'Turned off.',
  seoFeed: 'Feed',
  seoExampleTitle: 'Example post title',
  seoIdentityTitle: 'Site identity and titles',
  seoSiteUrlHelp:
    'The public origin only, without a path. Required for canonical links, sitemaps and absolute sharing URLs.',
  seoTitleTemplate: 'Title template',
  seoTitleTemplateHelp: (example: string) =>
    `Use {title} (required) and {site}. Example: “${example}”`,
  seoHomeTitle: 'Home page title',
  seoShownAs: (title: string) => `Shown as “${title}”.`,
  seoHomeDescription: 'Home page description',
  seoEntityType: 'The site represents',
  seoOrganization: 'An organization',
  seoPerson: 'A person',
  seoLogoUrl: 'Logo URL',
  seoTwitterHandle: 'X (Twitter) handle',
  seoProfiles: 'Profiles',
  seoProfilesHelp:
    'One URL per line, up to 20: official profiles of this organization or person.',
  seoDefaultImageHelp: 'Used when a page has no image of its own.',
  seoImageUrl: 'Image URL',
  seoImageAlt: 'Image description (alt text)',
  seoSearchEngines: 'Search engines',
  seoIndexingToggle: 'Let search engines index the site',
  seoIndexingToggleHelp:
    'Off asks every search engine to leave the whole site out of results.',
  seoIndexCategories: 'Index category archives',
  seoIndexTags: 'Index tag archives',
  seoMaxSnippet: 'Max snippet length',
  seoMaxSnippetHelp: 'Characters; -1 for no limit.',
  seoImagePreviews: 'Image previews',
  seoPreviewLarge: 'Large',
  seoPreviewStandard: 'Standard',
  seoMaxVideoPreview: 'Max video preview',
  seoMaxVideoPreviewHelp: 'Seconds; -1 for no limit.',
  seoVerification: 'Webmaster verification',
  seoVerificationHelp:
    'Paste only the content value of the verification meta tag. These codes are public by design.',
  seoAiTools: 'AI tools',
  seoAiToolsHelp:
    'Search answers and model training are separate choices. Crawlers that ignore robots.txt are not stopped by these settings.',
  seoAllowAiSearch: 'Allow AI search crawlers',
  seoAllowAiSearchHelp:
    'Lets AI assistants find and cite pages when answering questions.',
  seoAllowAiTraining: 'Allow AI training crawlers',
  seoAllowAiTrainingHelp: 'Lets crawlers collect pages to train AI models.',
  seoLlmsToggle: 'Publish llms.txt',
  seoLlmsToggleHelp: 'A plain-text guide to the site for AI tools.',
  seoLlmsIntro: 'llms.txt introduction',
  seoSave: 'Save SEO settings',
  permalinksTitle: 'Permalinks',
  permalinksHelp:
    'The address pattern of each content type. Changing one moves existing entries; their old addresses keep redirecting.',
  permalinkPreset: 'Address preset',
  permalinkCustom: 'Custom structure',
  permalinkPostName: 'Post name',
  permalinkDayName: 'Day and name',
  permalinkMonthName: 'Month and name',
  permalinkId: 'Content ID',
  permalinkCategoryName: 'Category and name',
  permalinkPageHierarchy: 'Page hierarchy',
  archiveBasesTitle: 'Archive addresses',
  archiveBasesHelp:
    'Choose category and tag prefixes, such as /topics and /labels. Previous addresses redirect automatically. Existing content addresses cannot be replaced.',
  permalinkTokens: 'Tokens:',
  permalinkDates:
    'Dates use the first publication date (UTC), or the creation date for drafts.',
  permalinkExample: (title: string) =>
    `Example (“${title}”, published 22 Oct 2026):`,
  permalinkDateOnly:
    'Entries published on the same day would share this address, and a save that causes a collision is refused. Add %slug% or %id%, or use a different pattern.',
  permalinkSameTitle:
    'Entries with the same title would share an address; %slug% or %id% keeps them apart.',
  permalinksSave: 'Save permalinks',

  // Admin: SEO editor
  seoUntitled: 'Untitled',
  seoLengthEmpty: 'Empty',
  seoLengthShort: 'Shorter than usual',
  seoLengthGood: 'Within the usual range',
  seoLengthLong: 'May be cut off in results',
  seoInSearchTitle: 'In the search title',
  seoInMetaDescription: 'In the meta description',
  seoNoDescriptionYet: 'No description yet.',
  seoInBody: 'In the body text',
  seoInDescription: 'In the description',
  seoTimes: (count: number) => `${count} ${count === 1 ? 'time' : 'times'}`,
  seoInSlug: 'In the slug',
  seoSlugOnSave: 'The slug is generated on save.',
  seoSlugNotComparable:
    'Not comparable: the keyword has no Latin letters or digits.',
  seoCheckMissing: (label: string) => `${label}: missing`,
  seoSearchPreview: 'Search result preview',
  seoNoDescription: 'No description: search engines choose text from the page.',
  seoPageNoIndex: 'This page asks search engines not to index it.',
  seoNoImage: 'No image',
  seoUsingDefaultImage: 'Using the default sharing image from SEO settings.',
  seoFocusKeyword: 'Focus keyword',
  seoFocusKeywordHelp: 'The phrase you want this page to be found for.',
  seoReadingStats: (words: number, minutes: number, perSentence: number) =>
    `${words} words · about ${minutes} min read · ${perSentence} words per sentence on average`,
  seoTitle: 'SEO title',
  seoUsesTitle: 'Uses the title',
  seoMetaDescription: 'Meta description',
  seoUsesExcerpt: 'Uses the excerpt',
  seoUsesDescription: 'Uses the description',
  seoNoIndex: 'Hide from search results (noindex)',
  seoNoFollow: 'Don’t follow links (nofollow)',
  seoCanonicalUrl: 'Canonical URL',
  seoCanonicalUrlHelp:
    'Only when this page duplicates another URL. Leave empty to use this page’s own address.',
  seoSocialTitle: 'Social title',
  seoUsesSeoTitle: 'Uses the SEO title',
  seoSocialDescription: 'Social description',
  seoUsesMetaDescription: 'Uses the meta description',
  seoImageAltMissing: 'Describe the image for people who cannot see it.',
  seoSchemaType: 'Schema type',
  seoSchemaAuto: 'Automatic',
  seoAuthorName: 'Public author name',
  seoAuthorUrl: 'Author URL',
  // Admin: categories and tags
  termCategory: 'category',
  termTag: 'tag',
  categoriesHelp:
    'Categories group content into broad topics and can be nested.',
  tagsHelp: 'Tags describe specific details of your content.',
  termEdit: (label: string) => `Edit ${label}`,
  termAddNew: (label: string) => `Add new ${label}`,
  termAdd: (label: string) => `Add ${label}`,
  termSlugPlaceholder: 'generated from name',
  termParent: 'Parent category',
  termDescription: 'Description',
  termNoIndex: (label: string) =>
    `SEO settings ask search engines not to index ${label} archives.`,
  termCount: 'Count',
  termCountLabel: (count: number, name: string) =>
    `${count} content items in ${name}`,
  termDeleteConfirm: (name: string) =>
    `Delete “${name}”? It will be removed from all content.`,
  editItem: (name: string) => `Edit ${name}`,
  deleteItem: (name: string) => `Delete ${name}`,

  // Admin: general settings
  settingsSite: 'Site',

  // Admin: appearance
  themeActive: 'Active',
  themeShown: 'Shown on your site now.',
  themeActivate: 'Activate',
  themesEmpty: 'No themes installed.',
  themeUpload: 'Upload a theme',
  themeFile: 'Theme file',
  themeRemoveConfirm: (name: string) => `Remove the theme “${name}”?`,
  themeInstalled: 'Theme installed',
  themeActivated: 'Theme activated',
  themeRemoved: 'Theme removed',
  themeColors: 'Colors',

  // Admin: plugins
  pluginsInstall: 'Install or upgrade',
  pluginsInstallHelp:
    'Upload a plugin bundle (a single ES module). Uploading a plugin with an existing id upgrades it in place.',
  pluginEnable: 'Enable',
  pluginDisable: 'Disable',
  pluginRemoveConfirm: 'Remove this plugin and delete its settings and data?',
  pluginsEmpty: 'No plugins installed.',
  pluginInstalled: 'Plugin installed',
  pluginEnabled: 'Plugin enabled',
  pluginDisabled: 'Plugin disabled',
  pluginRemoved: 'Plugin removed',

  // Admin: setup
  setupTitle: 'Install site',
  setupHeading: 'Start your new site',
  setupStepDatabase: '1 / 2 · Database connection',
  setupStepSite: '2 / 2 · Site and administrator',
  setupKey: 'Installation key',
  setupKeyHelp:
    'Enter the installation key shown in the console where the API server runs. The key changes when the server restarts.',
  setupKeyRestarted: 'Restarted the server? Enter a new installation key',
  setupNewKey: 'New installation key',
  setupDatabaseHelp: 'Enter the connection details of the database to use.',
  setupHost: 'Database host',
  setupDatabase: 'Database name',
  setupUsername: 'Database user',
  setupPassword: 'Database password',
  setupReady:
    'The database is ready. You can change the site details in the admin settings after installation.',
  setupSiteTitle: 'Site title',
  setupSiteDescription: 'Site description',
  setupSiteLanguage: 'Site language',
  setupAdminName: 'Administrator name',
  setupAdminEmail: 'Administrator email',
  setupAdminPassword: 'Administrator password',
  setupConfirmPassword: 'Confirm password',
  setupApplying: 'Applying settings…',
  setupComplete: 'Finish and get started',
  setupConnect: 'Check connection and prepare tables',
  setupPending: 'Installing. Please wait.',

  // Admin: term notices
  categoryAdded: 'Category added',
  tagAdded: 'Tag added',

  // Settings: page caching and single sign-on
  readingCacheSeconds: 'Page caching (seconds)',
  readingCacheHelp:
    'How long a CDN or proxy may serve public pages to visitors who are not signed in. 0 turns it off.',
  settingsSso: 'Single sign-on',
  ssoName: 'Button label',
  ssoIssuer: 'Provider address (issuer)',
  ssoClientId: 'Client ID',
  ssoClientSecret: 'Client secret',
  ssoAuthMethod: 'Client authentication',
  ssoAuthNone: 'None (public client)',
  ssoScopes: 'Scopes',
  ssoRedirectUri: 'Redirect URI to register at the provider',
  ssoRedirectMissing: 'Set the public site address in SEO settings first.',
  ssoAllowedSubjects:
    'Accounts allowed without linking (one “subject = email” per line)',

  // Admin menu and color mode
  navAllContent: 'All content',
  navAddNew: 'Add new',
  navEditor: 'Editor',
  navAllUsers: 'All users',
  navMenu: 'Menu',
  adminSearchOpen: 'Search screens',
  adminSearchTitle: 'Go to a screen',
  adminSearchHint:
    'Type a screen or menu name. Use the arrow keys to choose and Enter to open.',
  adminSearchPlaceholder: 'Search menus and settings…',
  adminSearchEmpty: 'No screen matches.',
  colorMode: 'Color mode',
  colorModeLight: 'Light',
  colorModeDark: 'Dark',
  colorModeSystem: 'System',

  // Public theme: blocks and toolbar
  themeReadMore: 'Continue reading',
  themeMenu: 'Menu',
  themeMenuClose: 'Close menu',
  themeSchemeLight: 'Switch to light mode',
  themeSchemeDark: 'Switch to dark mode',
  themeSearchPanel: 'What are you looking for?',
  themeSearchClose: 'Close search',
  themeNotFoundHelp:
    'The page you are looking for does not exist or has moved. Try searching instead.',
  adminBar: 'Toolbar',
  adminBarCustomize: 'Edit site',
  adminBarNew: 'New',
  adminBarEdit: 'Edit',
  adminBarHowdy: (name: string) => `Hello, ${name}`,

  // Admin: block themes and site editor
  blockName: (key: string) =>
    (
      ({
        group: 'Group',
        columns: 'Columns',
        column: 'Column',
        'template-part': 'Template part',
        'site-title': 'Site title',
        'privacy-policy-link': 'Privacy Policy link',
        'site-tagline': 'Site tagline',
        navigation: 'Navigation',
        search: 'Search',
        'widget-area': 'Widget area',
        'post-title': 'Title',
        'post-meta': 'Date and author',
        'post-content': 'Content',
        'post-excerpt': 'Excerpt',
        'post-featured-image': 'Featured image',
        'post-terms': 'Categories or tags',
        'post-fields': 'Custom fields',
        comments: 'Comments',
        breadcrumbs: 'Breadcrumbs',
        query: 'Query loop',
        'post-template': 'Post template',
        'query-no-results': 'No results',
        'query-pagination': 'Pagination',
        'query-title': 'Archive title',
        'content-type-nav': 'Content type tabs',
        'scheme-toggle': 'Light/dark toggle',
        heading: 'Heading',
        paragraph: 'Paragraph',
        separator: 'Separator',
        spacer: 'Spacer',
        copyright: 'Copyright',
        'site-logo': 'Site logo',
        'post-navigation': 'Previous and next',
        buttons: 'Buttons',
        button: 'Button',
        'social-links': 'Social links',
        'social-link': 'Social link',
        'latest-posts': 'Latest posts',
        categories: 'Categories list',
        'tag-cloud': 'Tag cloud',
        archives: 'Archives',
        loginout: 'Log in/out',
        image: 'Image',
        cover: 'Cover',
        'media-text': 'Media & text',
        'post-author': 'Author',
        'read-more': 'Read more',
        'page-list': 'Page list',
        'latest-comments': 'Latest comments',
        calendar: 'Calendar',
      }) as Record<string, string>
    )[key] ?? key,
  blockAttr: (key: string) =>
    (
      ({
        inherit: 'Use current page posts',
        type: 'Content type',
        category: 'Category slug',
        tag: 'Tag slug',
        author: 'Author slug',
        count: 'Number of posts',
        tagName: 'HTML element',
        layout: 'Layout',
        width: 'Width',
        justify: 'Justification',
        align: 'Alignment',
        wrap: 'Wrap items',
        columns: 'Columns',
        gap: 'Spacing',
        padding: 'Padding',
        background: 'Background',
        textColor: 'Text color',
        border: 'Border',
        sticky: 'Stick to the top',
        className: 'Style class',
        stackOnMobile: 'Stack on small screens',
        slug: 'Part',
        level: 'Heading level',
        link: 'Link',
        size: 'Size',
        location: 'Menu location',
        orientation: 'Orientation',
        overlay: 'Menu button on small screens',
        showLabel: 'Show label',
        area: 'Widget area',
        showDate: 'Date',
        showAuthor: 'Author',
        showComments: 'Comment count',
        showUpdated: 'Updated date',
        showSticky: 'Sticky badge',
        commentIcon: 'Comment icon and count',
        panel: 'Open in a panel',
        excerptLength: 'Excerpt length in words (0 = all)',
        moreLink: '“Continue reading” link',
        aspect: 'Aspect ratio',
        rounded: 'Rounded corners',
        taxonomy: 'Taxonomy',
        divider: 'Dividers',
        showDescription: 'Description',
        showCount: 'Count',
        text: 'Text',
        muted: 'Muted color',
        showTitle: 'Title',
        url: 'Address',
        style: 'Style',
        newTab: 'Open in a new tab',
        service: 'Service',
        label: 'Label',
        months: 'Number of months',
        src: 'Image',
        alt: 'Alternative text',
        caption: 'Caption',
        overlayColor: 'Overlay color',
        dim: 'Overlay opacity (%)',
        minHeight: 'Minimum height',
        mediaPosition: 'Image position',
        mediaWidth: 'Image width (%)',
        showAvatar: 'Avatar',
        showBio: 'Biography',
        comments: 'Number of comments',
      }) as Record<string, string>
    )[key] ?? key,
  blockOption: (key: string) =>
    (
      ({
        div: 'Division',
        header: 'Header',
        main: 'Main',
        footer: 'Footer',
        section: 'Section',
        aside: 'Aside',
        nav: 'Navigation',
        constrained: 'Centered',
        flex: 'Row',
        grid: 'Grid',
        stack: 'Stack',
        content: 'Content width',
        wide: 'Wide',
        full: 'Full width',
        start: 'Start',
        center: 'Center',
        end: 'End',
        between: 'Space between',
        stretch: 'Stretch',
        none: 'None',
        small: 'Small',
        medium: 'Medium',
        large: 'Large',
        xlarge: 'Extra large',
        top: 'Top',
        bottom: 'Bottom',
        both: 'Top and bottom',
        box: 'Box',
        primary: 'Primary',
        horizontal: 'Horizontal',
        vertical: 'Vertical',
        sidebar: 'Sidebar',
        columns: 'Columns',
        list: 'List',
        auto: 'Original',
        standard: '4:3',
        square: 'Square',
        category: 'Categories',
        tag: 'Tags',
        left: 'Left',
        right: 'Right',
        tight: 'Tight',
        normal: 'Normal',
        relaxed: 'Relaxed',
        fill: 'Fill',
        outline: 'Outline',
        link: 'Website',
        email: 'Email',
        rss: 'RSS',
        facebook: 'Facebook',
        x: 'X',
        instagram: 'Instagram',
        threads: 'Threads',
        bluesky: 'Bluesky',
        mastodon: 'Mastodon',
        youtube: 'YouTube',
        tiktok: 'TikTok',
        linkedin: 'LinkedIn',
        github: 'GitHub',
      }) as Record<string, string>
    )[key] ?? key,
  templateLabel: templateLabels({
    index: 'Index (fallback for every page)',
    home: 'Blog home',
    'front-page': 'Front page',
    singular: 'Entries and pages',
    single: 'Single entries',
    page: 'Pages',
    archive: 'Archives',
    category: 'Category archives',
    tag: 'Tag archives',
    author: 'Author archives',
    date: 'Date archives',
    search: 'Search results',
    '404': 'Page not found',
  }),
  editorIntro:
    'Change the theme’s templates, template parts and global styles. Your changes are kept beside the theme, so you can reset any of them to the theme’s own design.',
  editorTheme: 'Theme',
  editorTemplates: 'Templates',
  editorParts: 'Template parts',
  editorStyles: 'Styles',
  editorCustomized: 'Changed',
  editorAdded: 'Added',
  editorFromPlugin: (plugin: string) => `Plugin: ${plugin}`,
  editorPluginReadOnly:
    'A plugin provides this, so it cannot be edited. Choose Customize to make your own copy, which replaces the plugin’s version.',
  editorCustomize: 'Customize',
  editorAddTemplate: 'Add template',
  editorTemplateKind: 'Template',
  editorTemplateSlug: 'Only for (slug, optional)',
  editorReset: 'Reset to theme',
  editorDelete: 'Delete template',
  editorResetConfirm: 'Discard your changes to this item?',
  editorAddBlock: 'Add block',
  editorAddInside: 'Add inside',
  editorRemoveBlock: 'Remove block',
  editorPatternName: 'Pattern name (lowercase letters and dashes)',
  editorAddPattern: 'Create reusable pattern',
  editorPatternHelp:
    'Insert this pattern using a Template part block. Changes apply everywhere it is used.',
  editorLivePreview: 'Live preview',
  editorMobilePreview: 'Mobile width',
  editorNoBlocks: 'No blocks yet.',
  editorBlockSettings: 'Block settings',
  editorFontFamily: 'Body font',
  editorHeadingFont: 'Heading font',
  editorSameAsBody: 'Same as body',
  editorFonts: 'Site fonts',
  editorFontsHelp:
    'Add font families from a stylesheet address (such as Google Fonts) or from font files. They appear in the font menus above, and a theme font list that names the family uses it automatically.',
  editorFontsEmpty: 'No site fonts yet.',
  editorFontFamilyName: 'Family name',
  editorFontFallback: 'Fallback fonts',
  editorFontSource: 'Source',
  editorFontStylesheet: 'Stylesheet address',
  editorFontFile: 'Font file',
  editorFontStylesheetUrl: 'Stylesheet address (https)',
  editorFontFileUrl: 'Font file address (https or media library)',
  editorFontWeight: 'Weight',
  editorFontStyle: 'Style',
  editorFontNormal: 'Normal',
  editorFontItalic: 'Italic',
  editorFontDisplay: 'Display',
  editorFontAdd: 'Add font',
  editorFontRemove: 'Remove',
  editorFontSize: 'Font size',
  editorLineHeight: 'Line height',
  editorRadius: 'Corner radius',
  editorColorDefault: 'Theme default',
  editorTypography: 'Typography',
  editorUnsaved: 'You have unsaved changes.',
  themeUploadHelp:
    'Upload a block theme as a .zip file with theme.json, templates/*.json, parts/*.json and an optional style.css. Uploading a theme with the same id upgrades it and keeps your changes.',
  themeCustomize: 'Customize',
  themeTemplateCount: (count: number) =>
    count === 1 ? '1 template' : `${count} templates`,
  themeByAuthor: (name: string) => `By ${name}`,

  // Admin: SEO box tabs
  seoTabSearch: 'Search',
  seoTabSocial: 'Social',
  seoTabAdvanced: 'Advanced',

  // editor-media
  unsavedLeave: 'You have unsaved changes. Leave this page?',
  sessionExpiredTitle: 'Your session has expired',
  sessionExpiredHelp:
    'Your changes are still on this page. Sign in again in the new tab, then come back and save.',
  signInAgain: 'Sign in again',
  backupFound:
    'The backup of this entry in your browser is different from the version below.',
  backupRestore: 'Restore the backup',
  dismiss: 'Dismiss',
  saveAsPending: 'Save as pending',
  publish: 'Publish',
  schedule: 'Schedule',
  submitForReview: 'Submit for review',
  switchToDraft: 'Switch to draft',
  visibility: 'Visibility',
  visibilityPublic: 'Public',
  visibilityPassword: 'Password protected',
  visibilityPrivate: 'Private',
  entryPublished: 'Published.',
  entryScheduled: 'Scheduled.',
  entrySubmitted: 'Submitted for review.',
  entryUpdated: 'Updated.',
  entryDraftSaved: 'Draft saved.',
  entryLive: 'Your entry is live.',
  entryScheduledFor: (date: string) => `Scheduled for ${date}.`,
  permalink: 'Permalink',
  permalinkAfterSave: 'The address is set when you save.',
  ok: 'OK',
  wordCount: (count: number) => `Word count: ${count}`,
  saveShortcut: 'Ctrl+S or ⌘S saves.',
  addNewCategory: 'Add new category',
  newCategoryName: 'New category name',
  parentCategory: 'Parent category',
  tagInput: 'Add tags',
  tagInputHelp: 'Type a tag name and press Enter.',
  termCreateFailed: 'Could not add it. Please try again.',
  termUnknown: (name: string) => `There is no tag named “${name}”.`,
  removeTag: (name: string) => `Remove ${name}`,
  editorToolbar: 'Formatting',
  editorBold: 'Bold',
  editorItalic: 'Italic',
  editorStrike: 'Strikethrough',
  editorCode: 'Inline code',
  editorLink: 'Link',
  editorHeading: (level: number) => `Heading ${level}`,
  editorBulletList: 'Bulleted list',
  editorOrderedList: 'Numbered list',
  editorQuote: 'Quote',
  editorCodeBlock: 'Code block',
  editorImage: 'Image',
  editorTable: 'Table',
  editorUndo: 'Undo',
  editorRedo: 'Redo',
  editorHtml: 'Edit as HTML',
  editorHtmlNote: 'Markup the editor does not support is dropped.',
  editorImageSettings: 'Image settings',
  editorUploading: (count: number) =>
    count === 1 ? 'Uploading 1 file…' : `Uploading ${count} files…`,
  linkUrl: 'Link address',
  linkRemove: 'Remove link',
  imageSize: 'Size',
  sizeThumbnail: 'Thumbnail',
  sizeMedium: 'Medium',
  sizeLarge: 'Large',
  sizeFull: 'Full size',
  mediaDropHere: 'Drop files here to upload',
  mediaSelectFiles: 'Select files',
  mediaDetails: 'Attachment details',
  mediaSelect: 'Select',
  mediaCopyUrl: 'Copy URL',
  copied: 'Copied',
  mediaMime: 'File type',
  mediaUploadedOn: 'Uploaded on',
  saveFailed: 'Could not save. Your changes are still in the editor.',
  revisionRestoreConfirm:
    'Restore this version? Unsaved changes in the editor are lost.',
  entryConflict:
    'Someone else saved this entry after you opened it, so your changes were not saved. Copy your changes, reload the page, and apply them again.',
  previewInvalid: 'Enter a title before previewing.',
  mediaWrongKind: (name: string) =>
    `${name}: this kind of file cannot be used here.`,
  mediaAltLocal:
    'Used for this insertion only. You cannot change the library text of this file.',
  mediaAltNotSaved: (reason: string) =>
    `The alternative text could not be saved to the library (${reason}). Press the button again to use it here only.`,
  seoTabs: 'SEO settings',
  // site-theme
  contentPluginBlockInactive:
    'This block requires a plugin that is not active.',
  oembedEmbedded: (site: string) => `Embedded from ${site}`,
  importAuthors: 'Assign authors',
  importAuthorsHelp:
    'Authors are matched to existing users by email address or login. For authors without a match:',
  importDownloadAttachments: 'Download attachments',
  importDownloadHelp:
    'Up to 100 files are downloaded per import. Re-import to download the rest into the media library; entries already imported are not updated.',
  importAuthorMode: (mode: string) =>
    mode === 'author'
      ? 'Create a new user with the Author role'
      : mode === 'subscriber'
        ? 'Create a new user with the Subscriber role'
        : 'Assign their posts to me',
  importMoreSummary: (users: number, menus: number, redirects: number) =>
    `${users} users and ${menus} menus created; ${redirects} old addresses now redirect.`,
  importAttachments: (count: number) =>
    count === 1 ? '1 media file to upload' : `${count} media files to upload`,
  importAttachmentsHelp:
    'Downloaded files show their library address. Files that could not be copied keep their old address; see skipped items for details.',
  importFeatured: (count: number) =>
    count === 1
      ? 'featured image of 1 entry'
      : `featured image of ${count} entries`,
  adminBarEditCategory: 'Edit category',
  adminBarEditTag: 'Edit tag',
  adminBarEditTerm: 'Edit term',
  widgetImage: 'Image',
  widgetImageAlt: 'Alternative text',
  widgetImageLink: 'Link address',
  widgetTextHelp:
    'Use **bold**, *italic* and [link text](https://example.com). Leave a blank line between paragraphs.',
  editorListView: 'List View',
  editorSelectBlock:
    'Select a block in List View or in the preview to change its settings.',
  editorSearchBlocks: 'Search blocks',
  editorNoMatchingBlocks: 'No blocks found.',
  editorNoSettings: 'This block has no settings.',
  readingFeedContent: 'For each post in a feed, include',
  readingFeedFull: 'Full text',
  readingFeedExcerpt: 'Excerpt',
  themePostNavigation: 'Post navigation',
  themePreviousPost: 'Previous',
  themeNextPost: 'Next',
  themeSocialEmail: 'Email',
  themeSocialWebsite: 'Website',
  themeSignIn: 'Log in',
  themeSkipToContent: 'Skip to content',
  themeBackToTop: 'Back to top',
  themeWrittenBy: 'Written by',
  themeAuthorPosts: (name: string) => `View all posts by ${name}`,
  themeFeedTitle: (site: string, name: string) => `${site} » ${name} feed`,
  siteIcon: 'Site icon',
  siteIconHelp:
    'Shown in browser tabs and as the app icon on phones. Use a square image of at least 512 × 512 pixels.',
  siteLogo: 'Logo',
  siteLogoHelp: 'Shown by the Site logo block in your theme’s header.',
  siteImageNone: 'No image selected.',
  // admin-screens
  rowQuickEdit: 'Quick Edit',
  rowQuickEditOf: (title: string) => `Quick edit “${title}” inline`,
  rowTrash: 'Trash',
  contentMonth: 'Month',
  allAuthors: 'All authors',
  quickEditPasswordKept: 'Leave blank to keep the current password',
  navPosts: 'Posts',
  navPages: 'Pages',
  navArticles: 'Articles',
  navAllOf: (plural: string) => `All ${plural}`,
  navPluginsFailed: (count: number) =>
    count === 1 ? '1 plugin failed' : `${count} plugins failed`,
  dashboardApproved: (count: number) =>
    count === 1 ? '1 approved comment' : `${count} approved comments`,
  dashboardHealth: 'Site Health status',
  dashboardHealthGood: 'Good',
  dashboardHealthRecommended: 'Should be improved',
  dashboardHealthCritical: 'Needs attention',
  dashboardHealthCounts: (critical: number, recommended: number) =>
    `${critical} critical issues, ${recommended} recommended improvements`,
  dashboardActivity: 'Activity',
  dashboardPublishingSoon: 'Publishing soon',
  dashboardRecentlyPublished: 'Recently published',
  dashboardRecentComments: 'Recent comments',
  dashboardNoActivity: 'No activity yet.',
  ssoLinked: 'Linked',
  ssoNotLinked: 'Not linked',
  ssoProvider: 'Provider',
  ssoAccountId: 'Account ID',
  ssoLinkedOn: 'Linked on',
  ssoUnlink: 'Unlink',
  ssoUnlinkConfirm: 'Stop signing in with this single sign-on account?',
  ssoBackToAccount: 'Back to account',
  ssoBackToSignIn: 'Back to sign in',
  pluginStatusActive: 'Active',
  pluginStatusInactive: 'Inactive',
  pluginStatusFailed: 'Failed',
  menuFindContent: 'Search pages and posts',
  menuMostRecent: 'Most recent',
  menuSearchResults: 'Search results',
  menuNoResults: 'No results',
  // core-comments
  commentLoginRequired: 'Log in to leave a comment.',
  commentSignedIn: (name: string) => `Logged in as ${name}.`,
  commentRemember: (fields: CommenterField[]) =>
    `Save my ${new Intl.ListFormat('en', { type: 'conjunction' }).format(
      fields,
    )} in a cookie in this browser for one year to fill in my next comment.`,
  commentLinkLeave: 'Open external link?',
  commentLinkLeaveAsk: (address: string) =>
    `This link from a comment leads to another site: ${address}`,
  commentLinkOpen: 'Open link',
  discussionRequireLogin: 'Users must be registered and logged in to comment',
  discussionFields: 'Comment form fields',
  discussionShowName: 'Ask for a name',
  discussionShowEmail: 'Ask for an email address',
  discussionShowWebsite: 'Show the website field',
  discussionDefaultName: 'Default commenter name',
  discussionDefaultNameHelp:
    'Required when the name field is off. Signed-in comments use the profile name.',
  discussionAvatars: 'Show avatars',
  discussionAvatarDefault: 'Default avatar',
  avatarStyle: (style: string) =>
    (
      ({
        mp: 'Mystery person',
        identicon: 'Identicon',
        monsterid: 'MonsterID',
        wavatar: 'Wavatar',
        retro: 'Retro',
        robohash: 'Robohash',
        blank: 'Blank',
      }) as Record<string, string>
    )[style] ?? style,
  commentNotSpam: 'Not spam',
  commentInResponseTo: 'In response to',
  commentInReplyTo: (name: string) => `In reply to ${name}`,
  commentsForEntry: (title: string) => `Comments on: ${title}`,
  commentsAllEntries: 'All entries',
  commentStatusPending: 'Awaiting approval',
  commentBulkManage: 'Bulk manage',
  commentBulkSelected: (count: number) => `${count} selected`,
  commentBulkAsk: (count: number) =>
    `Apply this action to ${count} selected ${count === 1 ? 'comment' : 'comments'}?`,
  commentBulkDeleteAsk: (count: number) =>
    `Delete ${count} selected ${count === 1 ? 'comment' : 'comments'} permanently? Their replies move up a level. This cannot be undone.`,
  commentSelect: (name: string) => `Select the comment by ${name}`,
  commentModerationFor: (name: string) => `Moderate the comment by ${name}`,
  commentModerating: 'Working…',
  moderationRefreshFailed:
    'The change was saved, but the comments could not be refreshed. Reload the page to see the current list.',
  commentDeleteAsk:
    'Delete this comment permanently? Its replies move up a level. This cannot be undone.',
  // editor-media wave 2
  revisionsCompareTitle: (title: string) => `Compare revisions of “${title}”`,
  returnToEditor: 'Return to editor',
  revisionsCount: (count: number) => `Revisions: ${count}`,
  revisionsBrowse: 'Browse',
  contentOrigin: 'Created and edited from',
  contentOriginCreated: 'Created',
  contentOriginModified: 'Last modified',
  revisionFrom: 'From',
  revisionTo: 'To',
  revisionTimeline: 'Revision timeline',
  revisionsIdentical:
    'These two versions have the same title, excerpt and body.',
  revisionRestoreAsk:
    'Restore this version? The title, excerpt and body are replaced; the current text stays in the revisions.',
  diffRemoved: 'Removed',
  diffAdded: 'Added',
  // editor-media wave 3
  adminToolbar: 'Toolbar',
  topNew: 'New',
  newUser: 'User',
  commentsAwaiting: (count: number) =>
    count === 1
      ? '1 comment awaiting moderation'
      : `${count} comments awaiting moderation`,
  collapseMenu: 'Collapse menu',
  expandMenu: 'Expand menu',
  errorGeneric: 'Something went wrong. Please try again.',
  errorInvalidInput: 'Please check the highlighted values.',
  errorUnauthorized: 'Please sign in again.',
  errorForbidden: 'You are not allowed to do this.',
  errorNotFound: 'It no longer exists.',
  errorConflict:
    'This conflicts with something that already exists or was changed meanwhile.',
  errorRateLimited: 'Too many attempts. Please wait a moment and try again.',
  errorTooLarge: 'This is too large.',
  errorCaptchaRequired: 'Please complete the verification.',
  errorFieldInvalid: 'Please enter a valid value.',
  /** Text for an SDK error (`apiErrors`) with the values it reported. */
  apiError: (key: ApiErrorKey, params?: ApiErrorParams) =>
    apiErrorText(apiErrors[key], params),
  /** Text for a web server error (`webErrors`) with the values it reported. */
  webError: (key: WebErrorKey, params?: ApiErrorParams) =>
    apiErrorText(webErrors[key], params),
  entryTrashed: 'Moved to the Trash.',
  undo: 'Undo',
  viewOnSite: 'View on site',
  commentEmptySpam: 'Empty Spam',
  commentEmptyTrash: 'Empty Trash',
  commentNoticeApproved: 'Comment approved.',
  commentNoticeUnapproved: 'Comment unapproved.',
  commentNoticeSpam: 'Comment marked as spam.',
  commentNoticeTrash: 'Comment moved to the Trash.',
  commentNoticeDeleted: 'Comment deleted permanently.',
  commentNoticeEmptied: 'Emptied.',
  mediaGridView: 'Grid view',
  mediaListView: 'List view',
  mediaMonth: 'Uploaded in month',
  mediaUnattached: 'Unattached',
  mediaFile: 'File',
  mediaUsedColumn: 'Used in',
  mediaDeleted: (count: number) =>
    count === 1 ? '1 file deleted.' : `${count} files deleted.`,
  mediaKept: (count: number) =>
    count === 1
      ? '1 file was kept because it is in use or not yours.'
      : `${count} files were kept because they are in use or not yours.`,
  mediaCropHelp:
    'Drag the box or its corner. With the box focused, arrow keys move it and Shift with arrow keys resizes it.',
  mediaAspect: 'Aspect ratio',
  mediaAspectFree: 'Free',
  mediaAspectOriginal: 'Original',
  settingsDates: 'Date and time',
  weekStartsOn: 'Week starts on',
  settingsWriting: 'Writing',
  writingDefaultCategory: 'Default post category',
  writingDefaultStatus: 'Default status of new entries',
  writingToc: 'Automatic table of contents',
  writingTocHelp:
    'Adds a table of contents built from the headings of entries of the chosen types.',
  writingTocEnabled: 'Insert a table of contents automatically',
  writingTocTypes: 'Content types',
  writingTocPosition: 'Position',
  writingTocTop: 'Top of content',
  writingTocBefore: 'Before the first heading',
  writingTocTitle: 'Title',
  writingTocTitleHelp: 'Leave empty to use the default for the site language.',
  writingTocLevels: 'Heading levels',
  writingTocMinimum: 'Minimum headings per page',
  writingTocMinimumHelp:
    'Pages with fewer headings at the chosen levels get no table of contents.',
  writingTocCollapsible: 'Collapsible',
  writingTocOpen: 'Initially open',
  writingTocOpenHelp: 'Applies only when the table of contents is collapsible.',
  // core-content
  contentInsertBlock: 'Add block',
  contentSearchBlocks: 'Search blocks',
  contentNoBlocks: 'No matching blocks.',
  contentAddImage: 'Add image',
  contentCaption: 'Caption',
  contentAlignment: 'Alignment',
  contentLink: 'Link URL',
  contentNewTab: 'Open in a new tab',
  contentColumnCount: 'Columns',
  contentCropImages: 'Crop images to fill',
  contentStackMobile: 'Stack on mobile',
  contentHeadingLevel: 'Heading level',
  contentButtonStyle: 'Button style',
  contentButtonFill: 'Fill',
  contentButtonOutline: 'Outline',
  contentButtonLabel: 'Button',
  contentAddButton: 'Add button',
  contentDetailsSummary: 'Read more',
  contentDetailsOpen: 'Open by default',
  contentCitation: 'Citation',
  contentCalloutVariant: 'Style',
  contentCalloutVariantName: (variant: string) =>
    (
      ({
        primary: 'Primary',
        secondary: 'Secondary',
        success: 'Success',
        danger: 'Danger',
        warning: 'Warning',
        info: 'Info',
        light: 'Light',
        dark: 'Dark',
      }) as Record<string, string>
    )[variant] ?? variant,
  contentCalloutDismissible: 'Visitors can dismiss',
  contentSpacerHeight: 'Height (px)',
  contentHeaderRow: 'Toggle header row',
  contentFileLabel: 'File link text',
  contentDownload: 'Offer as a download',
  contentTocDefaultTitle: 'Contents',
  contentTocTitle: 'Title',
  contentTocLevels: 'Heading levels',
  contentTocLevel: (level: number) => `Heading ${level}`,
  contentTocMinHeadings: 'Minimum number of headings',
  contentTocExcluded: 'Exclude headings',
  contentTocPageHelp:
    'Only headings on this page are listed. Checked headings are excluded. Exclusions for removed or renamed headings are cleared when you change these settings.',
  contentTocCollapsible: 'Allow collapsing',
  contentTocOpen: 'Initially expanded',
  contentTocEmpty: 'No table of contents to display.',
  contentBlockSettings: (name: string) => `${name} settings`,
  contentCodeLanguage: 'Language (search; clear for plain text)',
  contentCodeTheme: 'Theme (search; clear for site default)',
  contentCodeLabel: 'Code label',
  contentCodeLineNumbers: 'Show line numbers',
  contentCodeStartLine: 'Starting line number',
  contentCodeHighlightLines: 'Highlighted rows (for example, 1, 3-5)',
  contentCodeCopyButton: 'Show copy button',
  contentCodeAuto: 'Site default (automatic light/dark)',
  contentCodeInvalid: 'Enter a valid value.',
  contentCodeCopy: 'Copy code',
  contentCodeCopied: 'Copied!',
  contentCodeCopyFailed: 'Could not copy. Select and copy the code manually.',
  contentBlockName: (type: string) =>
    (
      ({
        paragraph: 'Paragraph',
        heading: 'Heading',
        bulletList: 'List',
        orderedList: 'Numbered list',
        blockquote: 'Quote',
        image: 'Image',
        audio: 'Audio',
        video: 'Video',
        file: 'File',
        gallery: 'Gallery',
        columns: 'Columns',
        buttons: 'Buttons',
        button: 'Button',
        details: 'Details',
        pullquote: 'Pullquote',
        callout: 'Callout',
        tableOfContents: 'Table of contents',
        table: 'Table',
        horizontalRule: 'Separator',
        spacer: 'Spacer',
        codeBlock: 'Code',
        embed: 'Embed',
        footnote: 'Footnote',
        pluginBlock: 'Plugin block',
        more: 'More (teaser break)',
        pageBreak: 'Page break',
      }) as Record<string, string>
    )[type] ?? type,
  contentAlignmentName: (align: string) =>
    (
      ({
        left: 'Left',
        center: 'Center',
        right: 'Right',
        wide: 'Wide width',
        full: 'Full width',
        justify: 'Justify',
      }) as Record<string, string>
    )[align] ?? align,

  // admin-screens wave 2
  screenOptions: 'Screen Options',
  screenColumns: 'Columns',
  screenPerPage: 'Items per page',
  bulkEditTitle: 'Bulk Edit',
  bulkEditSelected: (count: number) =>
    count === 1 ? '1 item selected' : `${count} items selected`,
  bulkEditAddCategories: 'Add categories',
  bulkEditAddTags: 'Add tags',
  noChange: '— No change —',
  bulkCommentsOpen: 'Allow',
  bulkCommentsClosed: 'Do not allow',
  bulkSticky: 'Sticky',
  bulkNotSticky: 'Not sticky',
  bulkDone: (count: number) =>
    count === 1 ? '1 item updated' : `${count} items updated`,
  bulkFailed: (count: number) =>
    count === 1 ? '1 item failed' : `${count} items failed`,
  usersBulkDeleteConfirm: 'Delete the selected users?',
  usersChangeRole: 'Change role',
  usersChangeRoleTo: 'Change role to…',
  usersReassignTo: (name: string) => `Give their content to ${name}`,
  usersSearch: 'Search users',
  usersSendReset: 'Send password reset',
  usersResetSent: 'Password reset link sent.',
  usersInvite: 'Send the new user an invitation to choose their own password',
  pluginsDropHere: 'or drop a plugin file here',
  pluginsSearch: 'Search installed plugins',
  themeDetails: 'Theme details',
  themeDetailsOf: (name: string) => `Theme details: ${name}`,
  themeLivePreview: 'Live Preview',
  // editor-media wave 4
  themePages: 'Pages:',
  themeCalloutDismiss: 'Dismiss',
  themeTocShow: 'Show table of contents',
  themeTocClose: 'Close table of contents',
  themeFootnotes: 'Footnotes',
  themeFootnoteRef: (number: number) => `Footnote ${number}`,
  themeFootnoteBack: (number: number) => `Back to reference ${number}`,
  themeFootnoteJump: (number: number) => `Go to footnote ${number} in the list`,
  contentMoreBreak: '— More — (the text above is the teaser in lists)',
  contentPageBreak: '— Page break —',
  editorFootnote: 'Footnote',
  footnoteNumber: (number: number) => `Footnote ${number}`,
  footnoteLabel: (number: number, text: string) =>
    `Footnote ${number}: ${text}`,
  footnoteOpenHint:
    'Click, or select it with the arrow keys and press Enter, to edit',
  footnoteShortened: (number: number) =>
    `Footnote ${number} was longer than 2000 characters and was shortened to 2000.`,
  footnotePlaceholder: 'Footnote text',
  footnoteHint: 'Enter saves · Shift+Enter new line · Esc cancels',
  footnoteDelete: 'Delete',
  footnoteEmpty: 'Empty footnote',
  contentSyncedPattern: (title: string) =>
    title ? `Synced pattern: ${title}` : 'Synced pattern',
  patternsTitle: 'Patterns',
  patternsFromPlugins: 'Patterns from plugins',
  patternFromPlugin: (plugin: string) => `Plugin: ${plugin}`,
  patternCreate: 'Create pattern',
  patternCreateHelp:
    'Saves the selected blocks as a pattern you can insert into other entries.',
  patternSynced: 'Synced: editing the pattern updates every entry that uses it',
  patternSyncedShort: 'Synced',
  patternCreateFailed: 'The pattern could not be saved.',
  patternAdd: 'Add pattern',
  patternEdit: 'Edit pattern',
  patternNone:
    'No patterns yet. Select blocks in the editor and choose “Create pattern”.',
  patternDraftHelp: 'Draft patterns are not shown on the site.',
  patternUsage:
    'Synced patterns show their current published version in every entry that uses them.',

  // admin-screens wave 3
  columnModified: 'Last modified',
  usersEntriesOf: (name: string, count: number) =>
    count === 1 ? `1 entry by ${name}` : `${count} entries by ${name}`,
  rolesDelete: 'Delete role',
  rolesReassign: 'Give its users the role',
  rolesDeleteConfirm: (name: string) =>
    `Delete the role ${name}? Its users get the role you chose.`,
  usersAccountManagement: 'Account management',
  usersSignOutEverywhere: 'Log out everywhere',
  usersSignOutConfirm: (name: string) => `Sign ${name} out of every session?`,
  usersSignedOut: 'The user was signed out everywhere.',
  sessionsTitle: 'Sessions',
  sessionsHelp:
    'Where you are signed in. Sign out any session you do not recognize.',
  sessionStarted: (date: string) => `Signed in ${date}`,
  sessionExpires: (date: string) => `Expires ${date}`,
  sessionCurrent: 'This session',
  sessionRevoke: 'Sign out',
  sessionRevoked: 'The session was signed out.',
  dashboardBoxes: 'Boxes to show, in order',
  dashboardOptionsSaved: 'Dashboard options saved to your account.',
  dashboardSaveFailed:
    'Could not confirm the save. Your choices are still here. Try again.',
  moveUpItem: (name: string) => `Move ${name} up`,
  moveDownItem: (name: string) => `Move ${name} down`,
  pluginSettingsLink: 'Settings',
  pluginSettingsOf: (name: string) => `${name} settings`,
  pluginNoSettings: 'This plugin has no settings.',
  menuDeleteConfirm: (name: string) => `Delete the menu “${name}”?`,
  widgetMoveTo: (area: string) => `Move to ${area}`,
  widgetDropHere: 'Drop here to place the widget last',
  commentNoticePartlyEmptied:
    'Many comments were deleted, but some remain. Choose Empty again to continue.',

  // security-hardening
  settingsEgress: 'Outbound access',
  egressTitle: 'Private network destinations',
  egressDescription:
    'Allow only the internal services this site must contact. Metadata and reserved destinations stay blocked.',
  egressRules: 'Allowed destinations',
  egressHelp:
    'One per line: service host port address[,address]. Services: oidc, search, smtp, email-api (Email API), webhook, media-storage (Media storage). Addresses may use CIDR.',
  egressEnvironment: 'Server-defined destinations',
  egressEnvironmentHelp:
    'These read-only rules come from the server environment.',
  destinationBlocked:
    'This destination is blocked. Ask an administrator to allow its host, port, and IP address under Outbound access.',
  mediaAdmissionTitle: 'Media upload limits',
  mediaAdmissionHelp:
    'Limits apply across API processes. Use 0 to disable a limit.',
  mediaUploadsPerHour: 'Uploads per user per hour',
  mediaFreeSpaceMb: 'Reserved free storage (MB)',

  // core-privacy
  privacySettings: 'Privacy',
  privacyPolicy: 'Privacy Policy',
  privacyPolicyPage: 'Privacy policy page',
  privacyCommentCookies:
    'Offer a checkbox to save commenter details in this browser. Details are saved only with consent.',
  privacyExport: 'Export Personal Data',
  privacyErase: 'Erase Personal Data',
  privacyRequestHelp:
    'Send a confirmation request to the person’s email address. Export or erase data after they confirm.',
  privacySendRequest: 'Send request',
  privacySent: 'Confirmation email sent.',
  privacyConfirmed:
    'Request confirmed. The site administrator can now process it.',
  privacyErased: 'Personal data erased.',
  privacyDownload: 'Download personal data',
  privacyRetained:
    'Published content, uploaded files, and existing URLs remain. Review them separately if they contain personal information.',
  privacyNoRequests: 'No privacy requests.',
  privacyErasureReport: 'Erasure results',
  privacyEraserCore: (key: string) => `Site data (${key})`,
  privacyEraserPlugin: (plugin: string, key: string) =>
    `Plugin ${plugin} (${key})`,
  privacyEraserCounts: (erased: number, retained: number) =>
    `Erased ${erased}, retained ${retained}`,
  privacyEraserFailed:
    'Erasure failed. Remove this data manually or try again later.',
  privacyEraseConfirm:
    'Erase this person’s personal data and revoke their sign-in credentials? This cannot be undone.',
  privacyOpenLink: 'Open the confirmation link from your email.',
  privacyConfirmTitle: 'Confirm privacy request',
  privacyConfirmHelp:
    'Confirm that you requested the personal data export or erasure described in your email.',
  privacyConfirm: 'Confirm request',
  privacyRateRule: 'Privacy requests per visitor',
  privacyCommentFeed: 'Subscribe to comments',
  privacyMenuOrder: 'Page order',
  privacyMediaTitle: 'Title',
  privacyMediaDescription: 'Description',
  privacyStatus: (status: string) =>
    (
      ({
        pending: 'Awaiting confirmation',
        confirmed: 'Confirmed',
        completed: 'Completed',
      }) as Record<string, string>
    )[status] ?? status,
  skipToContent: 'Skip to main content',
  // pattern-followup
  patternLoadFailed: 'The pattern could not be loaded. Try selecting it again.',

  // auth-followup
  siteLoginPath: 'Public login path',
  siteLoginPathHelp:
    'Visitors and signed-out administrators use this address to reach the sign-in screen.',
  siteShowLogin: 'Show login links',
  siteShowLoginHelp:
    'When hidden, signed-out visitors see a not-found page when opening administrator screens.',

  // completion feedback (toasts)
  notifications: 'Notifications',
  commentsApproved: (count: number) =>
    count === 1 ? 'Comment approved.' : `${count} comments approved.`,
  commentsUnapproved: (count: number) =>
    count === 1 ? 'Comment unapproved.' : `${count} comments unapproved.`,
  commentsSpammed: (count: number) =>
    count === 1
      ? 'Comment marked as spam.'
      : `${count} comments marked as spam.`,
  commentsTrashed: (count: number) =>
    count === 1
      ? 'Comment moved to the Trash.'
      : `${count} comments moved to the Trash.`,
  commentsDeleted: (count: number) =>
    count === 1
      ? 'Comment deleted permanently.'
      : `${count} comments deleted permanently.`,
  mediaUploadedFile: (name: string) => `Uploaded ${name}.`,
  mediaEditedCopy: 'The edited image was saved as a new file.',
  // Media storage and resync
  settingsMediaStorage: 'Media storage',
  mediaStorageTitle: 'Where uploads are stored',
  mediaStorageDriver: 'Storage',
  mediaStorageLocal: 'This server',
  mediaStorageS3: 'S3-compatible storage',
  mediaStorageLocalHelp: "Files are stored on this server's disk.",
  mediaStorageSwitchNote:
    'Switching storage does not move files you have already uploaded. They keep working from the storage they were saved to; only new uploads go to the storage you choose.',
  mediaStorageS3Help:
    'Works with AWS S3, Cloudflare R2, Backblaze B2, Wasabi, MinIO and other S3-compatible services.',
  mediaStorageEndpoint: 'Endpoint',
  mediaStorageEndpointHelp:
    'For example: R2 https://<account-id>.r2.cloudflarestorage.com · AWS https://s3.ap-northeast-2.amazonaws.com · B2 https://s3.us-west-004.backblazeb2.com · Wasabi https://s3.ap-northeast-1.wasabisys.com · MinIO https://minio.example.com',
  mediaStorageRegion: 'Region',
  mediaStorageRegionHelp:
    'R2 uses auto and MinIO usually us-east-1. Otherwise enter the region the bucket was created in.',
  mediaStorageBucket: 'Bucket',
  mediaStorageAccessKeyId: 'Access key ID',
  mediaStorageSecretAccessKey: 'Secret access key',
  mediaStorageSecretReenter:
    'You changed the endpoint or access key ID, so enter the secret access key again.',
  mediaStoragePublicBaseUrl: 'Public base URL',
  mediaStoragePublicBaseUrlHelp:
    'Optional. The address of a CDN or custom domain that serves the bucket root publicly, such as https://cdn.example.com; the prefix is added for you. Make the bucket or CDN public in your storage service. Leave empty to serve files from this site’s address.',
  mediaStoragePrefix: 'Prefix',
  mediaStoragePrefixHelp:
    'Optional. The folder in the bucket for uploads, ending with a slash, such as media/.',
  mediaStorageForcePathStyle: 'Use path-style addresses',
  mediaStorageForcePathStyleHelp:
    'Turn on for MinIO and other services that put the bucket in the path (https://endpoint/bucket/file) instead of the host name (https://bucket.endpoint/file).',
  mediaStorageLocationFixed:
    'Once saved, the endpoint, bucket and prefix cannot be changed.',
  mediaStoragePluginHelp: (label: string) =>
    `Files are stored in ${label}, provided by a plugin.`,
  mediaStoragePluginMissing:
    'The selected storage plugin is no longer available, so files cannot be uploaded. Choose another storage and save.',
  mediaStorageTest: 'Check connection',
  mediaStorageTested: 'The storage is reachable.',
  mediaStorageEgressHint:
    'To use a storage on a private network, allow its host under Outbound access with the media-storage service.',
  mediaStorageSaveHelp:
    'Saving checks the connection first and saves nothing if it fails.',
  mediaResync: 'Resync with storage',
  mediaResyncHelp:
    'The list is shown from the information saved in the database. Use this only when it no longer matches the actual storage. Only the current storage is checked; no files are imported or deleted.',
  mediaResyncStarted: 'Resync started.',
  mediaResyncQueued: 'Waiting to start…',
  mediaResyncRunning: 'Checking the storage…',
  mediaResyncCompleted: (date: string) => `Last resynced ${date}.`,
  mediaResyncFailed: (date: string) =>
    `Resync failed (${date}). No files were deleted.`,
  mediaResyncScanned: 'Checked',
  mediaResyncRefreshed: 'Updated',
  mediaResyncMissing: 'Missing from storage',
  mediaResyncUntracked: 'Not in the library',
  mediaResyncCleanupAttention: (count: number) =>
    `Files that could not be cleaned up and need checking: ${count}.`,
  mediaMissing: 'Missing from storage',
  mediaMissingHelp: 'The last resync could not find this file in the storage.',
  mediaMissingSince: (date: string) =>
    `Not found in the storage on ${date}. Pages that show it may display a broken file.`,
  contentCodeCopiedNotice: 'Code copied to the clipboard.',
  // Single sign-on providers, linking and recovery codes
  ssoProvidersTitle: 'Identity providers',
  ssoProvidersHelp:
    'Each enabled provider gets its own sign-in button. Register the redirect URI below at every provider.',
  ssoCopyRedirectUri: 'Copy redirect URI',
  ssoProvidersEmpty: 'No providers yet.',
  ssoNewProvider: 'New provider',
  ssoNotSaved: 'Not saved',
  ssoProviderOn: 'On',
  ssoProviderOff: 'Off',
  ssoProviderHasIssues: 'Needs attention',
  ssoProviderEnabled: 'Show a sign-in button for this provider',
  ssoProviderId: 'Provider ID',
  ssoProviderIdHelp:
    'Lowercase letters, digits and hyphens. It cannot be changed after saving.',
  ssoProviderIdFixed: 'Saved provider IDs cannot be changed.',
  ssoAddProvider: 'Add provider',
  ssoRemoveProvider: 'Remove provider',
  ssoProvidersMax: (max: number) => `You can add up to ${max} providers.`,
  ssoEnvironmentProvider: (name: string) =>
    `Sign-in with ${name} is set up on the server and cannot be changed here. The providers below are kept but not used while it is.`,
  ssoLinkHelp:
    'Link an account at a provider to sign in to this account with it.',
  ssoLink: 'Link',
  ssoAssignedBadge: 'Assigned',
  ssoAssigned:
    'The site operator has assigned an account at this provider to you. It signs in without linking.',
  ssoOtherAccount: 'Other linked account',
  ssoProviderUnavailable: 'Provider not in use',
  ssoAccountLinked: 'Single sign-on account linked.',
  ssoAccountUnlinked: 'Single sign-on account unlinked.',
  ssoRequestExpired: 'The sign-in request has expired. Please try again.',
  ssoClaimRetry:
    'To try again, open the link from your email again or ask an administrator for a new one.',
  copyFailed: 'Could not copy. Select the text and copy it yourself.',
  recoverySignIn: 'Sign in with a recovery code',
  recoveryCode: 'Recovery code',
  recoveryCodeHelp: 'Each code works once.',
  recoveryCodesTitle: 'Recovery codes',
  recoveryCodesHelp:
    'If you cannot use your other ways to sign in or two-step verification, sign in with one of these codes. Each code works once.',
  recoveryCodesNone: 'You have no recovery codes yet.',
  recoveryCodesStatus: (remaining: number, created: string) =>
    `${remaining === 1 ? '1 code' : `${remaining} codes`} left · generated ${created}`,
  recoveryCodesGenerate: 'Generate recovery codes',
  recoveryCodesRegenerate: 'Generate new codes',
  recoveryCodesReplaceConfirm:
    'Generate new recovery codes? Your current codes stop working.',
  recoveryCodesRemove: 'Remove recovery codes',
  recoveryCodesRemoveConfirm:
    'Remove your recovery codes? They stop working immediately.',
  recoveryCodesShownOnce:
    'Save these codes somewhere safe now. They are shown only this once.',
  recoveryCodesCopy: 'Copy codes',
  recoveryCodesDownload: 'Download (.txt)',
  recoveryCodesGenerated: 'New recovery codes generated.',
  recoveryCodesRemoved: 'Recovery codes removed.',
  // Sign-in methods, steps and second factors
  signInNoMethods:
    'No way to sign in is available right now. Ask an administrator for help.',
  signInContinue: 'Continue',
  signInCancel: 'Start over',
  signInCopyCode: 'Copy',
  signInQrCode: 'QR code to scan with your authenticator app',
  signInFactorChoose: 'Confirm it’s you with one of these:',
  signInEnrollChoose:
    'Your role requires two-step verification. Choose one to set up now:',
  signInSetupTitle: 'Set up sign-in',
  signInSetupHelp: 'Choose how you want to sign in to your account.',
  signInSetupWith: (method: string) => `Set up ${method}`,
  signInSetupDone: 'Your account is set up. You can sign in now.',
  signInSetupExpired:
    'This setup has expired. Open the link from your email again.',
  signInSetupUnavailable:
    'Sign-in setup is unavailable right now. Try again in a moment.',
  signInSetupNone:
    'This link cannot set up a way to sign in. Ask an administrator for help.',
  passkeyUse: 'Use passkey',
  passkeyCreate: 'Create passkey',
  passkeyUseHelp: 'Use the passkey saved on this device or your phone.',
  passkeyCreateHelp: 'Your browser will ask where to save the new passkey.',
  passkeyNeedsScripts:
    'Passkeys need JavaScript. Turn it on in your browser, or choose another way to sign in.',
  passkeyUnsupported:
    'This browser does not support passkeys. Choose another way to sign in.',
  passkeyFailed:
    'The passkey was not used. Try again, or choose another way to sign in.',
  forgotClosed:
    'Passwords are not used to sign in to this site. Ask an administrator to send you a sign-in link.',
  usersSendSignInLink: 'Send sign-in setup link',
  factorsTitle: 'Two-step verification and passkeys',
  factorsHelp:
    'A second step after signing in keeps your account safe even if someone learns your password.',
  factorsRequired: 'Your role requires two-step verification.',
  factorsRequiredMissing:
    'Your role requires two-step verification. Set one up below, or you will be asked to the next time you sign in.',
  factorsNone: 'No second steps are available.',
  factorSetupTitle: 'Finish setting up',
  factorSetupCancel: 'Cancel',
  factorOn: 'On',
  factorOff: 'Not set up',
  factorSetUp: 'Set up',
  factorSetUpAgain: 'Set up again',
  factorAddAnother: 'Add another',
  factorRemove: 'Remove',
  factorRemoveConfirm: (label: string) =>
    `Remove ${label}? It stops working right away.`,
  factorAddedOn: (date: string) => `Added ${date}`,
  factorRecoveryCodesLink: 'Manage recovery codes',
  factorEnrolled: 'Two-step verification set up.',
  factorRemoved: 'Removed.',
  settingsSignIn: 'Sign-in',
  signInPasswordForced:
    'The server keeps password sign-in on for everyone, whatever these settings say.',
  signInMethodsTitle: 'Sign-in methods',
  signInMethodsHelp:
    'Allowed methods appear on the sign-in page in this order. Move them up or down to change it.',
  signInPasswordOff:
    'Password sign-in is off. Make sure you can sign in another way, and keep your recovery codes somewhere safe.',
  signInNotReady: 'Not ready',
  signInNotReadyHelp:
    'Finish setting this method up; until then it does not appear on the sign-in page.',
  signInSsoSettings: 'Single sign-on settings',
  signInMissingHelp:
    'The plugin that provides this is not active. Uncheck it and save to take it off the list.',
  signInSourceMissing: 'Unavailable',
  signInSourcePlugin: (plugin: string) => `Plugin: ${plugin}`,
  signInMoveUp: (method: string) => `Move ${method} up`,
  signInMoveDown: (method: string) => `Move ${method} down`,
  signInFactorsTitle: 'Second steps',
  signInFactorsHelp:
    'What users may use to confirm it’s them after signing in, and set up on their account page.',
  signInRequireTitle: 'Require two-step verification',
  signInRequireHelp:
    'Members of these roles must complete a second step. Anyone without one sets it up while signing in.',
  signInFieldNewPassword: 'New password',
  pluginFieldSource: (plugin: string) => `Plugin: ${plugin}`,
  profileFieldsTitle: 'Additional information',
  profileFieldsHelp:
    'Private details plugins ask for. They never appear on the public profile.',
  signInMethodPassword: 'Password',
  signInMethodPasskey: 'Passkey',
  signInMethodSso: 'Single sign-on',
  signInFactorTotp: 'Authenticator app',
  signInFactorRecoveryCode: 'Recovery code',
  signInFieldEmail: 'Email',
  signInFieldPassword: 'Password',
  signInFieldTotpCode: 'Authentication code',
  signInFieldRecoveryCode: 'Recovery code',
} as const;
