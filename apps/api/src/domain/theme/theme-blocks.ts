import type { BlockInput } from '@cms/sdk';

/** A block as a built-in theme writes it; `children` is left out for blocks without any. */
export const block = (
  name: string,
  attrs: Record<string, unknown> = {},
  children?: BlockInput[],
): BlockInput => (children ? { name, attrs, children } : { name, attrs });

export const part = (slug: string) => block('template-part', { slug });

/**
 * The app's bundled Inter Variable face is for the admin only: public stacks name `Inter`, which
 * applies once an administrator adds it as a site font, and fall back to system faces.
 */
export const SANS = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
export const SERIF =
  '"Iowan Old Style", "Palatino Linotype", Palatino, "Noto Serif KR", Georgia, serif';
