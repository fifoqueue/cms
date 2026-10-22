// Pure display helpers safe for browser bundles: no runtime schemas, no imports.

/** Shared by the live metadata and editorial previews. */
export const formatSeoTitle = (
  title: string,
  siteTitle: string,
  template: string,
) =>
  template.replace(/\{(title|site)\}/g, (_, key: string) =>
    key === 'title' ? title : siteTitle,
  );
