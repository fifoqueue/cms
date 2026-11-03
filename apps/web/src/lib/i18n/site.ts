import type { Messages } from '#lib/i18n/messages.js';
import type { siteFunctions } from '#lib/i18n/site-functions/en.js';
import { provideCatalog } from '#lib/i18n/context.js';
import { languageOf } from '#lib/i18n/locale.js';
import type { ApiErrorKey, WebErrorKey } from '#lib/i18n/api-errors.js';

/** Includes the shared form labels used by public sign-in and comment forms. */
export const SITE_STRINGS = [
  'adminBar',
  'adminBarCustomize',
  'adminBarEdit',
  'adminBarEditCategory',
  'adminBarEditTag',
  'adminBarEditTerm',
  'adminBarNew',
  'apply',
  'backToSignIn',
  'bulkActions',
  'byAuthor',
  'cancel',
  'categoriesLabel',
  'clientIp',
  'clientUserAgent',
  'close',
  'commentApprove',
  'commentAwaitingModeration',
  'commentBody',
  'commentBulkManage',
  'commentByAuthor',
  'commentDeleteAsk',
  'commentEmail',
  'commentEmailNotify',
  'commentEmailPrivate',
  'commentLeave',
  'commentLinkLeave',
  'commentLinkOpen',
  'commentLoginRequired',
  'commentName',
  'commentNoticeApproved',
  'commentNoticeUnapproved',
  'commentNoticeTrash',
  'commentNoticeDeleted',
  'commentPosted',
  'commentRefreshFailed',
  'commentRepliesLimited',
  'commentReply',
  'commentSpam',
  'commentStatusPending',
  'commentSubmit',
  'commentSubmitFailed',
  'commentSubmitting',
  'commentUnapprove',
  'commentUnsubscribeButton',
  'commentUnsubscribeConfirm',
  'commentUnsubscribeTitle',
  'commentUnsubscribedEmail',
  'commentUnsubscribedPush',
  'commentWebsite',
  'commentsClosed',
  'contentCodeCopied',
  'contentCodeCopiedNotice',
  'contentCodeCopy',
  'contentCodeCopyFailed',
  'contentTocDefaultTitle',
  'copied',
  'copyFailed',
  'deletePermanently',
  'destinationBlocked',
  'dismiss',
  'email',
  'errorCaptchaRequired',
  'errorConflict',
  'errorFieldInvalid',
  'errorForbidden',
  'errorGeneric',
  'errorInvalidInput',
  'errorNotFound',
  'errorPageBack',
  'errorPageForbidden',
  'errorPageForbiddenHelp',
  'errorPageHome',
  'errorPageNotFoundHelp',
  'errorPageOther',
  'errorPageServer',
  'errorPageServerHelp',
  'errorRateLimited',
  'errorTooLarge',
  'errorUnauthorized',
  'footerNavigation',
  'forgotPassword',
  'moderationRefreshFailed',
  'moveToTrash',
  'navAccount',
  'newer',
  'noPosts',
  'notifications',
  'older',
  'or',
  'pagination',
  'passkeyCreate',
  'passkeyCreateHelp',
  'passkeyFailed',
  'passkeyNeedsScripts',
  'passkeyUnsupported',
  'passkeyUse',
  'passkeyUseHelp',
  'password',
  'primaryNavigation',
  'privacyCommentFeed',
  'privacyPolicy',
  'protectedHelp',
  'protectedTitle',
  'recoveryCode',
  'recoveryCodeHelp',
  'recoverySignIn',
  'registerTitle',
  'search',
  'searchPlaceholder',
  'selectAll',
  'signIn',
  'signInCancel',
  'signInContinue',
  'signInCopyCode',
  'signInEnrollChoose',
  'signInFactorChoose',
  'signInFactorRecoveryCode',
  'signInFactorTotp',
  'signInFieldEmail',
  'signInFieldNewPassword',
  'signInFieldPassword',
  'signInFieldRecoveryCode',
  'signInFieldTotpCode',
  'signInMethodPasskey',
  'signInMethodPassword',
  'signInMethodSso',
  'signInNoMethods',
  'signInQrCode',
  'signInSetupDone',
  'signInTitle',
  'signOut',
  'ssoBackToAccount',
  'ssoBackToSignIn',
  'ssoClaimRetry',
  'ssoRequestExpired',
  'stickyLabel',
  'themeArticles',
  'themeBackToTop',
  'themeCalloutDismiss',
  'themeCategory',
  'themeContentTypes',
  'themeFootnotes',
  'themeHome',
  'themeLightboxClose',
  'themeLightboxNext',
  'themeLightboxOpen',
  'themeLightboxPrevious',
  'themeLightboxTitle',
  'themeMenu',
  'themeMenuClose',
  'themeNextPost',
  'themeNotFound',
  'themeNotFoundHelp',
  'themePages',
  'themePostNavigation',
  'themePosts',
  'themePreviewExit',
  'themePreviousPost',
  'themeReadMore',
  'themeSchemeDark',
  'themeSchemeLight',
  'themeSearch',
  'themeSearchClose',
  'themeSearchEmpty',
  'themeSearchPanel',
  'themeSearchPrompt',
  'themeSignIn',
  'themeSkipToContent',
  'themeSocialEmail',
  'themeSocialWebsite',
  'themeTag',
  'themeTags',
  'themeTocClose',
  'themeTocShow',
  'themeWrittenBy',
  'unlock',
  'updatedOn',
] as const satisfies readonly {
  [K in keyof Messages]: Messages[K] extends string ? K : never;
}[keyof Messages][];

export type SiteFunctions = typeof siteFunctions;
export type SiteStrings = Pick<Messages, (typeof SITE_STRINGS)[number]>;
export type SiteMessages = SiteStrings &
  Omit<SiteFunctions, 'bulkTooMany'> &
  Pick<Messages, 'apiError' | 'webError'>;

export interface SiteCatalog {
  language: string;
  strings: SiteStrings;
  apiErrors: Partial<Record<ApiErrorKey, string>>;
  webErrors: Partial<Record<WebErrorKey, string>>;
}

/** Universal load runs before SSR and hydration, awaiting only the selected locale's code. */
export const loadSiteMessages = async (
  catalog: SiteCatalog,
): Promise<SiteMessages> => {
  const { siteFunctions } =
    languageOf(catalog.language) === 'ko'
      ? await import('#lib/i18n/site-functions/ko.js')
      : await import('#lib/i18n/site-functions/en.js');
  return {
    ...catalog.strings,
    ...siteFunctions,
    apiError: (key) => catalog.apiErrors[key] ?? catalog.strings.errorGeneric,
    webError: (key, params = {}) =>
      key === 'BulkTooMany'
        ? siteFunctions.bulkTooMany(params)
        : (catalog.webErrors[key] ?? catalog.strings.errorGeneric),
  };
};

export const provideSiteI18n = (
  language: () => string,
  messages: () => SiteMessages,
) =>
  provideCatalog({
    get m() {
      return messages();
    },
    get language() {
      return languageOf(language());
    },
  });
