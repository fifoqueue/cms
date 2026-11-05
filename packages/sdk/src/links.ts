/**
 * The link options an author sets besides an address: open in a new tab and `rel` tokens.
 * Shared by content documents (`@cms/content/link` re-exports it with the link mark), theme
 * blocks and menus. Pure and browser-safe.
 */
import { z } from 'zod';
import { Errors } from '#sdk/errors';

/** The `rel` tokens an author may choose, in the order they are stored and rendered. */
export const LINK_RELS = ['nofollow', 'sponsored', 'ugc'] as const;

export type LinkRel = (typeof LINK_RELS)[number];

/** What an author sets on a link besides its address. */
export interface LinkSettings {
  newTab: boolean;
  rel: LinkRel[];
}

/** True only for a `_blank` target (any case, surrounding space ignored). */
export const opensNewTab = (target: unknown) =>
  typeof target === 'string' && target.trim().toLowerCase() === '_blank';

/**
 * The allowed tokens of a `rel` value (space-separated text or a token list) in `LINK_RELS`
 * order; any other token and duplicates are dropped.
 */
export const linkRels = (value: unknown): LinkRel[] => {
  const tokens = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.toLowerCase().split(/\s+/)
      : [];

  return LINK_RELS.filter((rel) => tokens.includes(rel));
};

/** A stored `rel` attribute: the allowed tokens joined by spaces, or null when there are none. */
export const linkRelValue = (value: unknown): string | null =>
  linkRels(value).join(' ') || null;

/** Rendered `target`/`rel`: a new tab always adds `noopener noreferrer`; nothing else is added. */
export const linkHtmlAttributes = ({
  newTab,
  rel,
}: LinkSettings): { target?: string; rel?: string } => {
  const tokens = [...(newTab ? ['noopener', 'noreferrer'] : []), ...rel];

  return {
    ...(newTab && { target: '_blank' }),
    ...(tokens.length && { rel: tokens.join(' ') }),
  };
};

const TOKEN = `(?:${LINK_RELS.join('|')})`;

/** `rel` text holding only allowed tokens, separated by single spaces. */
export const LINK_REL = new RegExp(`^${TOKEN}(?: ${TOKEN})*$`);

/** A stored `rel` of allowed tokens, normalized to `LINK_RELS` order; `''` for none. */
export const linkRelSchema = z
  .string()
  .max(64)
  .refine(
    (value) => value === '' || LINK_REL.test(value),
    Errors.LinkRelInvalid,
  )
  .default('')
  .transform((value) => linkRels(value).join(' '));
