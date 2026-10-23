/** Unicode address segments, including combining marks; identifiers keep KEBAB_CASE. Pure and browser-safe. */
export const CONTENT_SLUG =
  /^[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:-[\p{L}\p{N}][\p{L}\p{N}\p{M}]*)*$/u;
