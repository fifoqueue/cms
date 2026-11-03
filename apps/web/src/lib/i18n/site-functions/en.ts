import type { CommenterField } from '#lib/i18n/en.js';
import type { ApiErrorParams } from '#lib/i18n/api-errors.js';

export const siteFunctions = {
  bulkTooMany: ({ limit }: ApiErrorParams) =>
    limit === undefined
      ? 'Too many items are selected; nothing was changed.'
      : `Select at most ${limit} items at a time; nothing was changed.`,
  signInWith: (provider: string) => `Sign in with ${provider}`,
  authorArchive: (name: string) => `Posts by ${name}`,
  commentOn: (author: string) => `${author} on`,
  commentCount: (count: number) =>
    count === 0
      ? 'No comments yet'
      : count === 1
        ? '1 comment'
        : `${count} comments`,
  commentReplyTo: (name: string) => `Reply to ${name}`,
  themePreviewing: (name: string) =>
    `Previewing the ${name} theme. Visitors still see the active theme.`,
  themeSearchTitle: (query: string) => `Search: ${query}`,
  themeSearchResults: (query: string) => `Search results for “${query}”`,
  themeResults: (count: number) =>
    count === 1 ? '1 result' : `${count} results`,
  themePaged: (title: string, page: number) => `${title} – Page ${page}`,
  themePostCount: (count: number) =>
    count === 1 ? '1 post' : `${count} posts`,
  adminBarHowdy: (name: string) => `Hello, ${name}`,
  oembedEmbedded: (site: string) => `Embedded from ${site}`,
  themeFeedTitle: (site: string, name: string) => `${site} » ${name} feed`,
  themeAuthorPosts: (name: string) => `View all posts by ${name}`,
  commentSignedIn: (name: string) => `Logged in as ${name}.`,
  commentRemember: (fields: CommenterField[]) =>
    `Save my ${new Intl.ListFormat('en', { type: 'conjunction' }).format(
      fields,
    )} in a cookie in this browser for one year to fill in my next comment.`,
  commentLinkLeaveAsk: (address: string) =>
    `This link from a comment leads to another site: ${address}`,
  commentBulkSelected: (count: number) => `${count} selected`,
  commentBulkAsk: (count: number) =>
    `Apply this action to ${count} selected ${count === 1 ? 'comment' : 'comments'}?`,
  commentBulkDeleteAsk: (count: number) =>
    `Delete ${count} selected ${count === 1 ? 'comment' : 'comments'} permanently? Their replies move up a level. This cannot be undone.`,
  commentSelect: (name: string) => `Select the comment by ${name}`,
  commentModerationFor: (name: string) => `Moderate the comment by ${name}`,
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
  themeLightboxPosition: (current: number, total: number) =>
    `${current} / ${total}`,
  themeFootnoteRef: (label: number | string) => `Footnote ${label}`,
  themeFootnoteBack: (label: number | string) => `Back to reference ${label}`,
  themeFootnoteJump: (label: number | string) =>
    `Go to footnote ${label} in the list`,
  commentsApproved: (count: number) =>
    count === 1 ? 'Comment approved.' : `${count} comments approved.`,
  commentsUnapproved: (count: number) =>
    count === 1 ? 'Comment unapproved.' : `${count} comments unapproved.`,
  commentsTrashed: (count: number) =>
    count === 1
      ? 'Comment moved to the Trash.'
      : `${count} comments moved to the Trash.`,
  commentsDeleted: (count: number) =>
    count === 1
      ? 'Comment deleted permanently.'
      : `${count} comments deleted permanently.`,
};
