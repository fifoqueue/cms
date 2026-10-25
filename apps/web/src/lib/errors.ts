/**
 * Every error message the web server itself sends or throws (`#lib/server/errors.js` re-exports
 * it); see `Errors` in the API for the rule. Messages that mean the same as an SDK message use the
 * SDK one instead. Texts are fixed so the screens' catalogs (`webErrors`) can key on them; values
 * a message leaves out travel as `issues[].params` on an issue with an empty path.
 */
export const Errors = {
  NotFound: 'Not found',
  Forbidden: 'You do not have permission to view this page',
  InvalidContentPath: 'Invalid content path',
  /** Thrown into the server log only. */
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
  /** `params`: `limit`. */
  BulkTooMany: 'Too many items are selected; nothing was changed.',
  PluginActivationFailed: 'The plugin could not be activated.',
  ReassignToDeleted:
    'Choose someone who is not being deleted to receive the content.',
  PasswordOrInvite: 'Enter a password or send an invitation.',
  ModerationInvalid: 'This comment action is not valid.',
  /** An upload that never reached the server. */
  UploadNetwork: 'Network error',
} as const;
