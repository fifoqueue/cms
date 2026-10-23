/** Unicode slug from a title. Returns '' when no letters or digits remain. */
export const slugify = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
    .replace(/(^|-)[\p{M}]+/gu, '$1')
    .slice(0, 180)
    .replace(/[\uD800-\uDBFF]$/, '')
    .replace(/^-+|-+$/g, '');

/** `base`, else `base-2` … `base-20`, else `base-<fallback>`: the first one not `taken`, checked in one read. */
export const uniqueSlug = async (
  base: string,
  taken: (candidates: string[]) => Promise<Set<string>>,
  fallback: () => string,
): Promise<string> => {
  const candidates = Array.from({ length: 20 }, (_, index) =>
    index === 0 ? base : `${base}-${index + 1}`,
  );
  const used = await taken(candidates);
  return candidates.find((slug) => !used.has(slug)) ?? `${base}-${fallback()}`;
};
