/** ASCII slug from a title. Returns '' when nothing usable remains (e.g. non-Latin titles). */
export const slugify = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 180)
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
