/** The longest stored user agent (`comments.author_user_agent`). */
export const USER_AGENT_MAX = 255;

/**
 * A browser user agent fit to store: control characters removed, trimmed and cut to
 * `USER_AGENT_MAX` characters (never mid-surrogate). Null when nothing is left.
 */
export const cleanUserAgent = (value: string): string | null =>
  value
    .replace(/\p{Cc}/gu, '')
    .trim()
    .slice(0, USER_AGENT_MAX)
    .replace(/[\uD800-\uDBFF]$/, '') || null;
