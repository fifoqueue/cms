/** Cookie holding one list's Screen Options; readable by the server, written by the browser. */
export const SCREEN_COOKIE = (screen: string) => `cms_screen_${screen}`;

/** Columns of the content list the viewer may hide. */
export const CONTENT_COLUMNS = [
  'author',
  'categories',
  'tags',
  'comments',
  'status',
  'date',
] as const;

/** Details of the comments list the viewer may hide. */
export const COMMENT_COLUMNS = ['email', 'response'] as const;
