/** Every error message the SDK throws; see `Errors` in the API for the rule. */
export const Errors = {
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
  UnknownPermalinkToken: (token: string) => `Unknown token %${token}%`,
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
  BlockParent: (parents: string) => `Must be inside ${parents}`,
  BlockNotAllowedInside: (parent: string) => `Not allowed inside ${parent}`,
  BlockAttrsInvalid: 'Must be an object',
  BlockAttrUnknown: 'Unknown attribute',
  BlockAttrRequired: 'Required',
  BlockNoChildren: 'This block has no children',
  BlockAttrText: 'Must be text',
  BlockAttrTooLong: (max: number) => `At most ${max} characters`,
  BlockAttrFormat: 'Invalid format',
  BlockAttrColor: 'Must be a palette color',
  BlockAttrNumber: (min: number, max: number) =>
    `Must be a whole number from ${min} to ${max}`,
  BlockAttrBoolean: 'Must be true or false',
  BlockAttrChoice: (options: string) => `Must be one of ${options}`,
  BlockIssue: (path: string, message: string) => `${path}: ${message}`,
  ThemePaletteDuplicate: 'Palette slugs must be unique',
  ThemePaletteRole: (role: string) => `The palette needs "${role}"`,
  ThemeFontUnknown: 'Not one of the theme font families',
  TaxonomyFilterPair: 'Choose both a taxonomy and a term.',
  ThemeQueriesLimit: 'A theme can contain at most 32 independent post lists.',
  ThemeIndexRequired: 'A theme needs templates/index.json',
} as const;
