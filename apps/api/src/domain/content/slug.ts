/** ASCII slug from a title. Returns '' when nothing usable remains (e.g. non-Latin titles). */
export const slugify = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 180)
    .replace(/^-+|-+$/g, '');
